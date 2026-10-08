import test from 'node:test';
import assert from 'node:assert/strict';
import { TasksService, dueDate, safeError } from '../src/core.mjs';
function fixture(overrides = {}) {
  const calls = [];
  const api = {
    listTasklists: async p => { calls.push(['lists',p]); return { items: [], nextPageToken: 'next' }; },
    listTasks: async p => { calls.push(['tasks',p]); return { items: [{ id: 't', title: 'read', etag: 'v1', deleted: false, selfLink: 'omitted' }, { id: 'deleted', deleted: true }] }; },
    getTasklist: async id => { calls.push(['list',id]); return { id }; },
    getTask: async (list,id) => { calls.push(['get',list,id]); return { id, title: 'old', notes: 'preserve', etag: 'v1' }; },
    insertTask: async (list,body) => { calls.push(['insert',list,body]); return { id: 'new', ...body }; },
    patchTask: async (list,id,body,etag) => { calls.push(['patch',list,id,body,etag]); return { id, ...body, etag:'v2' }; },
    ...overrides
  };
  const writePolicy = { tasklistId:'l', expiresAt: new Date(Date.now()+60000).toISOString(), allowedTaskIds:['t'], createTitle:'test', grantId:'test-grant' };
  return { api, calls, writePolicy, service: new TasksService(api, { writePolicy, claimCreate: async () => true }) };
}
test('date-only validation rejects impossible dates and timestamps', () => {
  assert.equal(dueDate('2028-02-29'),'2028-02-29T00:00:00.000Z');
  assert.equal(dueDate(null),null);
  for (const value of ['2027-02-29','2026-04-31','2026-10-06T10:00:00Z','2026-1-01']) assert.throws(() => dueDate(value));
});
test('bounded reads preserve pagination, omit deleted tasks and links', async () => {
  const {service,calls} = fixture();
  assert.equal((await service.listTasklists()).nextPageToken,'next');
  assert.deepEqual((await service.listTasks({tasklistId:'l'})).tasks,[{id:'t',title:'read',etag:'v1'}]);
  assert.equal(calls[1][1].showDeleted,false);
  await assert.rejects(service.listTasklists({maxResults:101}), /INVALID_PAGE_SIZE/);
});
test('writes default disabled and expired or other-list grants reject', async () => {
  const {api,writePolicy} = fixture();
  for (const policy of [null,{...writePolicy,tasklistId:'other'},{...writePolicy,expiresAt:'2000-01-01'}]) {
    await assert.rejects(new TasksService(api,{writePolicy:policy}).createTask({tasklistId:'l',task:{title:'test'}}),/WRITES_DISABLED/);
  }
});
test('edit sends only requested fields after read with If-Match ETag', async () => {
  const {service,calls} = fixture();
  await service.editTask({tasklistId:'l',taskId:'t',expectedEtag:'v1',patch:{title:'new'}});
  assert.deepEqual(calls,[['get','l','t'],['patch','l','t',{title:'new'},'v1']]);
});
test('completion patches status only', async () => {
  const {service,calls} = fixture();
  await service.completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v1'});
  assert.deepEqual(calls[1][3],{status:'completed'});
});
test('stale ETag prevents patch entirely', async () => {
  const {service,calls} = fixture();
  await assert.rejects(service.completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v0'}),/CONFLICT_READ_AGAIN/);
  assert.equal(calls.length,1);
});
test('assigned tasks and unapproved task IDs fail closed', async () => {
  const {service,calls} = fixture({getTask:async () => ({etag:'v1',assignmentInfo:{}})});
  await assert.rejects(service.completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v1'}),/UNSUPPORTED_TASK/);
  await assert.rejects(service.completeTask({tasklistId:'l',taskId:'other',expectedEtag:'v1'}),/TASK_NOT_APPROVED/);
  assert.equal(calls.length,0);
});
test('unsupported or empty patches never reach Google', async () => {
  const {service,calls} = fixture();
  for (const patch of [{deleted:true},{status:'completed'},{},{notes:'a'.repeat(8193)}]) assert.throws(() => service.editTask({tasklistId:'l',taskId:'t',expectedEtag:'v1',patch}));
  assert.equal(calls.length,0);
});
test('create verifies destination, uses date-only due and requires single-use claim', async () => {
  const {service,calls,api,writePolicy} = fixture();
  await service.createTask({tasklistId:'l',task:{title:'test',due:'2026-10-06'}});
  assert.deepEqual(calls,[['list','l'],['insert','l',{title:'test',due:'2026-10-06T00:00:00.000Z'}]]);
  await assert.rejects(new TasksService(api,{writePolicy}).createTask({tasklistId:'l',task:{title:'test'}}),/CREATE_ALREADY_ATTEMPTED/);
  await assert.rejects(service.createTask({tasklistId:'l',task:{title:'unapproved'}}),/CREATE_NOT_APPROVED/);
});
test('errors redact Google request details and uncertain writes forbid retries', () => {
  assert.equal(safeError({message:'SECRET',response:{status:412,data:'TOKEN'}},true),'CONFLICT_READ_AGAIN');
  assert.equal(safeError(new Error('SECRET'),true),'WRITE_OUTCOME_UNKNOWN_DO_NOT_RETRY');
  assert.equal(safeError({response:{status:401}}),'AUTHORIZATION_REQUIRED');
});
test('same task concurrent writes serialize without dropping the read', async () => {
  let etag='v1';
  const {service} = fixture({getTask:async () => ({etag}),patchTask:async () => { etag='v2'; return {id:'t',etag}; }});
  const input={tasklistId:'l',taskId:'t',expectedEtag:'v1'};
  const results=await Promise.allSettled([service.completeTask(input),service.completeTask(input)]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].reason.code,'CONFLICT_READ_AGAIN');
});
