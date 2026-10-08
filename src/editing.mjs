import {TasksService,TaskError,identifier,patchBody,taskView} from './core.mjs';

import {canonical} from './approvals.mjs';

const fail=code=>{throw new TaskError(code);};

const listView=list=>({id:list.id,title:list.title,etag:list.etag,updated:list.updated});

function etag(current,expected){if(!current.etag||current.etag!==identifier(expected))fail('CONFLICT_READ_AGAIN');}

function editable(task){if(task.deleted||task.assignmentInfo)fail('UNSUPPORTED_TASK');}

function snapshot(tasks){return tasks.map(t=>({id:identifier(t.id),etag:identifier(t.etag)})).sort((a,b)=>a.id.localeCompare(b.id));}

function checkSnapshot(tasks,expected){

  if(!Array.isArray(expected)||canonical(snapshot(tasks))!==canonical(snapshot(expected)))fail('CONFLICT_READ_AGAIN');

}

function descendants(tasks,id){

  const ids=new Set([id]);let changed=true;

  while(changed){changed=false;for(const t of tasks)if(t.parent&&ids.has(t.parent)&&!ids.has(t.id)){ids.add(t.id);changed=true;}}

  return tasks.filter(t=>t.id!==id&&ids.has(t.id));

}

export class EditingService extends TasksService {

  constructor(api,options={}){super(api,options);this.authorizeAction=options.authorizeAction??(async()=>{fail('WRITES_DISABLED');});this.previews=options.previews;}

  async approved(method,input,operation){

    if(typeof input.requestId!=='string'||!/^\w[\w-]{15,79}$/.test(input.requestId))fail('REQUEST_ID_REQUIRED');
    if(this.api.canWrite===false)fail('READ_ONLY_GRANT');

    const claim=await this.authorizeAction(method,input);

    return this.locked('expanded-mutations',async()=>{const result=await operation(claim);await claim.finish?.(result);return{...result,requestId:input.requestId,requestRecorded:claim.wasClaimed?.()===true};});

  }

  async allTasks(tasklist){

    const tasks=[],seen=new Set();let pageToken,pages=0;

    do{

      const page=await this.api.listTasks({tasklist,maxResults:100,showCompleted:true,showHidden:true,showDeleted:false,showAssigned:true,...(pageToken?{pageToken}:{})});

      tasks.push(...(page.items??[]).filter(t=>!t.deleted));pageToken=page.nextPageToken;pages++;

      if(pageToken&&(seen.has(pageToken)||pages>=1000))fail('PAGINATION_INCOMPLETE');

      if(pageToken)seen.add(pageToken);

    }while(pageToken);

    if(new Set(tasks.map(t=>t.id)).size!==tasks.length)fail('PAGINATION_INCOMPLETE');

    return tasks;

  }

  async getRequestOutcome(input){if(!this.authorizeAction.outcome)fail('OUTCOME_UNAVAILABLE');return this.authorizeAction.outcome(input);}

  async getTasklist(input){return listView(await this.api.getTasklist(identifier(input.tasklistId)));}

  async listTasks(input){

    const result=await super.listTasks(input);

    return result;

  }

  async createTasklist(input){


    const body=patchBody({title:input.title},true);

    return this.approved('createTasklist',input,async claim=>{

      const matches=[],seen=new Set();let pageToken,pages=0;

      do{const page=await this.api.listTasklists({maxResults:100,...(pageToken?{pageToken}:{})});matches.push(...(page.items??[]).filter(t=>t.title===body.title));pageToken=page.nextPageToken;pages++;

        if(pageToken&&(seen.has(pageToken)||pages>=100))fail('PAGINATION_INCOMPLETE');if(pageToken)seen.add(pageToken);

      }while(pageToken);

      if(matches.length>1)fail('TASKLIST_AMBIGUOUS');

      if(matches.length===1)return {...listView(matches[0]),created:false};

      await claim();return {...listView(await this.api.insertTasklist(body)),created:true};

    });

  }

  async renameTasklist(input){

    const list=identifier(input.tasklistId),body=patchBody({title:input.title},true);

    return this.approved('renameTasklist',input,async claim=>{

      const current=await this.api.getTasklist(list);etag(current,input.expectedEtag);

      await claim();return listView(await this.api.patchTasklist(list,body,current.etag));

    });

  }

  async deleteTasklist(input){

    const list=identifier(input.tasklistId);

    if(input.confirmDeletion!==true)fail('DELETION_CONFIRMATION_REQUIRED');

    return this.approved('deleteTasklist',input,async claim=>{

      const tasks=await this.allTasks(list);tasks.forEach(editable);checkSnapshot(tasks,input.expectedTasks);

      const current=await this.api.getTasklist(list);etag(current,input.expectedEtag);

      await claim();await this.api.deleteTasklist(list,current.etag);return {tasklistId:list,deleted:true,affectedTaskIds:tasks.map(t=>t.id)};

    });

  }

  async placement(input,list,movingId){

    const placement={};

    const parent=input.parentTaskId??null,previous=input.previousTaskId??null;

    if(parent){

      identifier(parent);if(parent===movingId)fail('INVALID_PARENT');

      const task=await this.api.getTask(list,parent);editable(task);etag(task,input.expectedParentEtag);

      if(task.hidden)fail('INVALID_PARENT');

      placement.parent=parent;

      // Reject cycles using the visible parent chain. Google enforces its additional recurrence/nesting limits.

      const seen=new Set([parent]);let next=task.parent;

      while(next){if(next===movingId||seen.has(next))fail('INVALID_PARENT');seen.add(next);if(seen.size>100)fail('INVALID_PARENT');const ancestor=await this.api.getTask(list,next);editable(ancestor);next=ancestor.parent;}

    }else if(input.expectedParentEtag!==undefined)fail('INVALID_PARENT');

    if(previous){

      identifier(previous);if(previous===movingId||previous===parent)fail('INVALID_PREVIOUS');

      const task=await this.api.getTask(list,previous);editable(task);etag(task,input.expectedPreviousEtag);

      if(task.hidden||(task.parent??null)!==parent)fail('INVALID_PREVIOUS');

      placement.previous=previous;

    }else if(input.expectedPreviousEtag!==undefined)fail('INVALID_PREVIOUS');

    return placement;

  }

  async createTask(input){


    const list=identifier(input.tasklistId),body=patchBody(input.task,true);

    return this.approved('createTask',input,async claim=>{

      await this.api.getTasklist(list);const placement=await this.placement(input,list);

      if(input.allowDuplicate!==true){

        const existing=(await this.allTasks(list)).filter(task=>task.title===body.title&&(task.notes||null)===(body.notes||null)&&(typeof task.due==='string'?task.due.slice(0,10):null)===(typeof body.due==='string'?body.due.slice(0,10):null)&&(task.parent??null)===(placement.parent??null));

        if(existing.length)fail('CREATE_DUPLICATE_REVIEW_REQUIRED');

      }

      await claim();return taskView(await this.api.insertTask(list,body,placement));

    });

  }

  async patchApproved(method,input,body){

    const list=identifier(input.tasklistId),id=identifier(input.taskId);

    return this.approved(method,input,async claim=>{

      if(method==='completeTask'||method==='reopenTask'){const tasks=await this.allTasks(list);const children=descendants(tasks,id);children.forEach(editable);checkSnapshot(children,input.expectedDescendants??[]);}

      const current=await this.api.getTask(list,id);editable(current);etag(current,input.expectedEtag);

      await claim();return taskView(await this.api.patchTask(list,id,body,current.etag));

    });

  }

  async editTask(input){return this.patchApproved('editTask',input,patchBody(input.patch));}

  async completeTask(input){return this.patchApproved('completeTask',input,{status:'completed'});}

  async reopenTask(input){return this.patchApproved('reopenTask',input,{status:'needsAction',completed:null});}

  async moveTask(input){

    const list=identifier(input.tasklistId),id=identifier(input.taskId),destination=identifier(input.destinationTasklistId??list);

    if(input.parentTaskId===undefined||input.previousTaskId===undefined)fail('EXPLICIT_POSITION_REQUIRED');

    return this.approved('moveTask',input,async claim=>{

      const tasks=await this.allTasks(list),children=descendants(tasks,id);children.forEach(editable);checkSnapshot(children,input.expectedDescendants);

      if(children.some(t=>t.id===input.parentTaskId))fail('INVALID_PARENT');

      const targetList=await this.api.getTasklist(destination);etag(targetList,input.expectedDestinationEtag);

      const placement=await this.placement(input,destination,id);

      const current=await this.api.getTask(list,id);editable(current);etag(current,input.expectedEtag);

      if(current.hidden&&(placement.parent||placement.previous))fail('UNSUPPORTED_POSITION');

      await claim();const result=await this.api.moveTask({tasklist:list,task:id,...placement,...(destination!==list?{destinationTasklist:destination}:{})},current.etag);

      return {...taskView(result),tasklistId:destination};

    });

  }

  async prepareDestructive(input){

    const list=identifier(input.tasklistId),method={delete_task:'deleteTask',delete_tasklist:'deleteTasklist',clear_completed:'clearCompleted'}[input.action];

    if(!method||!this.previews||!this.authorizeAction.check)fail('WRITES_DISABLED');

    await this.authorizeAction.check(method);

    const all=await this.allTasks(list),currentList=await this.api.getTasklist(list);

    if(method==='deleteTask'){

      const id=identifier(input.taskId),current=await this.api.getTask(list,id);editable(current);

      const children=descendants(all,id);children.forEach(editable);

      return this.previews.issue(method,{tasklistId:list,taskId:id,expectedEtag:current.etag,expectedDescendants:snapshot(children),confirmDeletion:true},{taskTitle:current.title,listTitle:currentList.title,affectedTasks:[current,...children].map(taskView),effect:'Delete task and reviewed descendants; Google may delete descendants too.'});

    }

    if(input.taskId!==undefined)fail('INVALID_DESTRUCTIVE_ACTION');

    const affected=method==='clearCompleted'?all.filter(task=>task.status==='completed'):all;affected.forEach(editable);

    return this.previews.issue(method,{tasklistId:list,expectedEtag:currentList.etag,...(method==='clearCompleted'?{expectedCompletedTasks:snapshot(affected),confirmHideCompleted:true}:{expectedTasks:snapshot(affected),confirmDeletion:true})},{listTitle:currentList.title,affectedTasks:affected.map(taskView),effect:method==='clearCompleted'?'Hide completed tasks; does not delete them.':'Delete list and all reviewed tasks.'});

  }

  async clearCompleted(input){

    const list=identifier(input.tasklistId);

    if(input.confirmHideCompleted!==true)fail('HIDING_CONFIRMATION_REQUIRED');

    return this.approved('clearCompleted',input,async claim=>{

      const completed=(await this.allTasks(list)).filter(t=>t.status==='completed');completed.forEach(editable);checkSnapshot(completed,input.expectedCompletedTasks);

      const current=await this.api.getTasklist(list);etag(current,input.expectedEtag);

      await claim();await this.api.clearCompleted(list,current.etag);return {tasklistId:list,hiddenCompletedTaskIds:completed.map(t=>t.id),deleted:false};

    });

  }

  async deleteTask(input){

    const list=identifier(input.tasklistId),id=identifier(input.taskId);

    if(input.confirmDeletion!==true)fail('DELETION_CONFIRMATION_REQUIRED');

    return this.approved('deleteTask',input,async claim=>{

      const tasks=await this.allTasks(list),children=descendants(tasks,id);children.forEach(editable);checkSnapshot(children,input.expectedDescendants);

      const current=await this.api.getTask(list,id);editable(current);etag(current,input.expectedEtag);

      await claim();await this.api.deleteTask(list,id,current.etag);return {tasklistId:list,taskId:id,deleted:true,affectedTaskIds:[id,...children.map(t=>t.id)]};

    });

  }

}

