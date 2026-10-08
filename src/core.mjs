export class TaskError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new TaskError(code); };
export function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.length > 512 || /[\r\n\x00]/.test(value)) fail('INVALID_ID');
  return value;
}
export function dueDate(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('DATE_ONLY_REQUIRED');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) fail('INVALID_DATE');
  return value + 'T00:00:00.000Z';
}
export function patchBody(input, create = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_PATCH');
  if (Object.keys(input).some(k => !['title', 'notes', 'due'].includes(k))) fail('UNSUPPORTED_FIELD');
  const body = {};
  if ('title' in input) {
    if (typeof input.title !== 'string' || (create && !input.title.trim()) || input.title.length > 1024) fail('INVALID_TITLE');
    body.title = input.title;
  } else if (create) fail('INVALID_TITLE');
  if ('notes' in input) {
    if (input.notes !== null && (typeof input.notes !== 'string' || input.notes.length > 8192)) fail('INVALID_NOTES');
    body.notes = input.notes;
  }
  if ('due' in input) body.due = dueDate(input.due);
  if (!Object.keys(body).length) fail('EMPTY_PATCH');
  return body;
}
export function safeError(error, mutation = false) {
  if (error instanceof TaskError) return error.code;
  const status = error?.response?.status;
  if (status === 412) return 'CONFLICT_READ_AGAIN';
  if (status === 401 || status === 403) return 'AUTHORIZATION_REQUIRED';
  if (status === 404) return 'NOT_FOUND';
  return mutation ? 'WRITE_OUTCOME_UNKNOWN_DO_NOT_RETRY' : 'GOOGLE_REQUEST_FAILED';
}
function pageOptions(input, maximum) {
  const maxResults = input.maxResults ?? maximum;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maximum) fail('INVALID_PAGE_SIZE');
  if (input.pageToken !== undefined) identifier(input.pageToken);
  return { maxResults, ...(input.pageToken ? { pageToken: input.pageToken } : {}) };
}
export function taskView(task) {
  const allowed = ['id','title','notes','status','etag','updated','due','completed','parent','position','hidden','assignmentInfo','webViewLink'];
  return Object.fromEntries(allowed.filter(k => task[k] !== undefined).map(k => [k, task[k]]));
}
export class TasksService {
  constructor(api, { writePolicy = null, claimCreate = async () => false, claimTasklistCreate = async () => false, bindTasklistId = async () => {}, bindCompletionTaskId = async () => {}, locks = new Map() } = {}) { this.api = api; this.writePolicy = writePolicy; this.claimCreate = claimCreate; this.claimTasklistCreate = claimTasklistCreate; this.bindTasklistId = bindTasklistId; this.bindCompletionTaskId = bindCompletionTaskId; this.locks = locks; }
  async createTasklist(input) {
    return this.locked('tasklist-creation',async()=>{
      const title=input.title;
      const check=()=>{
        if(this.api.canWrite===false)fail('READ_ONLY_GRANT');
        if(!this.writePolicy || Date.parse(this.writePolicy.expiresAt)<=Date.now() || !Number.isFinite(Date.parse(this.writePolicy.expiresAt)))fail('WRITES_DISABLED');
        if(typeof title!=='string' || !title.trim() || title!==this.writePolicy.tasklistCreateTitle)fail('TASKLIST_CREATE_NOT_APPROVED');
      };
      check();
      const matches=[];const seen=new Set();let pageToken;let pages=0;
      do {
        const page=await this.api.listTasklists({maxResults:100,...(pageToken?{pageToken}:{})});
        matches.push(...(page.items??[]).filter(list=>list.title===title));
        pageToken=page.nextPageToken;pages++;
        if(pageToken && (seen.has(pageToken)||pages>=100))fail('PAGINATION_INCOMPLETE');
        if(pageToken)seen.add(pageToken);
      }while(pageToken);
      if(matches.length>1)fail('TASKLIST_AMBIGUOUS');
      check();
      let list=matches[0];
      if(!list){
        if(!await this.claimTasklistCreate(this.writePolicy))fail('TASKLIST_CREATE_ALREADY_ATTEMPTED');
        list=await this.api.insertTasklist({title});
      }
      const listId=identifier(list.id);
      await this.bindTasklistId(this.writePolicy,listId);
      this.writePolicy.tasklistId=listId;
      return {id:listId,title:list.title,created:matches.length===0};
    });
  }
  async listTasklists(input = {}) {
    const data = await this.api.listTasklists(pageOptions(input, 100));
    return { tasklists: (data.items ?? []).map(t => ({ id: t.id, title: t.title, etag: t.etag })), nextPageToken: data.nextPageToken ?? null };
  }
  async listTasks(input) {
    const data = await this.api.listTasks({ tasklist: identifier(input.tasklistId), ...pageOptions(input, 100), showCompleted: input.showCompleted === true, showHidden: input.showCompleted === true, showDeleted: false, ...(input.showAssigned===true?{showAssigned:true}:{}) });
    return { tasks: (data.items ?? []).filter(t => !t.deleted).map(taskView), nextPageToken: data.nextPageToken ?? null };
  }
  async getTask(input) { return taskView(await this.api.getTask(identifier(input.tasklistId), identifier(input.taskId))); }
  allowWrite(tasklist) {
    if (this.api.canWrite === false) fail('READ_ONLY_GRANT');
    const policy = this.writePolicy;
    if (!policy || policy.tasklistId !== tasklist || !Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= Date.now()) fail('WRITES_DISABLED');
  }
  async createTask(input) {
    const tasklist = identifier(input.tasklistId);
    this.allowWrite(tasklist);
    const body = patchBody(input.task, true);
    if (body.title !== this.writePolicy.createTitle) fail('CREATE_NOT_APPROVED');
    if(this.writePolicy.createExactBody && JSON.stringify(body)!==JSON.stringify(this.writePolicy.createExactBody))fail('CREATE_NOT_APPROVED');
    // Reads and verifies the destination immediately before insertion. No automatic retry.
    await this.api.getTasklist(tasklist);
    if (!await this.claimCreate(this.writePolicy)) fail('CREATE_ALREADY_ATTEMPTED');
    const created = await this.api.insertTask(tasklist, body);
    if (this.writePolicy.completeCreatedTask === true) {
      const taskId = identifier(created.id);
      await this.bindCompletionTaskId(this.writePolicy, taskId);
      this.writePolicy.allowedCompletionTaskIds = [taskId];
    }
    return taskView(created);
  }
  async locked(key, operation) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    this.locks.set(key, waiting);
    await previous;
    try { return await operation(); }
    finally { release(); if (this.locks.get(key) === waiting) this.locks.delete(key); }
  }
  async update(input, body, completion = false) {
    const tasklist = identifier(input.tasklistId), task = identifier(input.taskId), expected = identifier(input.expectedEtag);
    this.allowWrite(tasklist);
    const approved = completion && this.writePolicy.allowedCompletionTaskIds !== undefined ? this.writePolicy.allowedCompletionTaskIds : this.writePolicy.allowedTaskIds;
    if (!Array.isArray(approved) || !approved.includes(task)) fail('TASK_NOT_APPROVED');
    return this.locked(JSON.stringify([tasklist, task]), async () => {
      this.allowWrite(tasklist);
      const current = await this.api.getTask(tasklist, task);
      if (!current.etag || current.etag !== expected) fail('CONFLICT_READ_AGAIN');
      if (current.deleted || current.assignmentInfo) fail('UNSUPPORTED_TASK');
      return taskView(await this.api.patchTask(tasklist, task, body, current.etag));
    });
  }
  editTask(input) { return this.update(input, patchBody(input.patch)); }
  completeTask(input) { return this.update(input, { status: 'completed' }, true); }
}
