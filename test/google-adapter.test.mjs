import test from 'node:test';

import assert from 'node:assert/strict';

import { createTasksAdapter } from '../src/google.mjs';

import { TasksService } from '../src/core.mjs';

function fixture(tasksAccess) {

  const calls=[];

  const op=name=>async (params,options)=>{calls.push({name,params,options});return {data:{id:params.task ?? params.tasklist ?? 'l',etag:'v1',items:[]}};};

  const google={tasklists:{list:op('lists'),get:op('list')},tasks:{list:op('tasks'),get:op('get'),insert:op('insert'),patch:op('patch')}};

  const api=createTasksAdapter(google,{tasksAccess});

  return {api,calls};

}

test('read-only grant permits list/read APIs with bounded nonretrying requests',async()=>{

  const {api,calls}=fixture('read');

  const service=new TasksService(api);

  await service.listTasklists();

  await service.listTasks({tasklistId:'l'});

  await service.getTask({tasklistId:'l',taskId:'t'});

  assert.deepEqual(calls.map(c=>c.name),['lists','tasks','get']);

  assert.ok(calls.every(c=>c.options.retry===false));

  assert.equal(api.canWrite,false);

});

test('read-only blocks adapter writes and service writes even with a valid policy, before API calls',async()=>{

  const {api,calls}=fixture('read');

  await assert.rejects(api.insertTask('l',{title:'test'}),/READ_ONLY_GRANT/);

  await assert.rejects(api.patchTask('l','t',{status:'completed'},'v1'),/READ_ONLY_GRANT/);

  const service=new TasksService(api,{writePolicy:{tasklistId:'l',allowedTaskIds:['t'],createTitle:'test',expiresAt:new Date(Date.now()+60000).toISOString()},claimCreate:async()=>true});

  await assert.rejects(service.createTask({tasklistId:'l',task:{title:'test'}}),/READ_ONLY_GRANT/);

  await assert.rejects(service.editTask({tasklistId:'l',taskId:'t',expectedEtag:'v1',patch:{title:'test'}}),/READ_ONLY_GRANT/);

  await assert.rejects(service.completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v1'}),/READ_ONLY_GRANT/);

  assert.equal(calls.length,0);

});

test('future full grant still needs a bounded policy and preserves conditional patch headers',async()=>{

  const {api,calls}=fixture('write');

  await assert.rejects(new TasksService(api).completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v1'}),/WRITES_DISABLED/);

  assert.equal(calls.length,0);

  await api.patchTask('l','t',{status:'completed'},'v1');

  assert.deepEqual(calls[0].options.headers,{'If-Match':'v1'});

  assert.equal(calls[0].options.retry,false);

});



test('all new adapter mutations use native APIs, conditional headers and no automatic retries',async()=>{

  const calls=[];const op=name=>async(params,options)=>{calls.push({name,params,options});return{data:{id:'result'}};};

  const google={tasklists:{patch:op('rename'),delete:op('deleteList')},tasks:{move:op('move'),delete:op('delete'),insert:op('insert'),clear:op('clear')}};

  const read=createTasksAdapter(google,{tasksAccess:'read'});

  for(const run of [()=>read.patchTasklist('l',{title:'new'},'e'),()=>read.deleteTasklist('l','e'),()=>read.moveTask({tasklist:'l',task:'t'},'e'),()=>read.deleteTask('l','t','e'),()=>read.clearCompleted('l','e')])await assert.rejects(run(),/READ_ONLY_GRANT/);

  assert.deepEqual(calls,[]);

  const write=createTasksAdapter(google,{tasksAccess:'write'});

  await write.patchTasklist('l',{title:'new'},'e');await write.deleteTasklist('l','e');await write.moveTask({tasklist:'l',task:'t',destinationTasklist:'d',parent:'p'},'e');await write.deleteTask('l','t','e');await write.clearCompleted('l','e');

  assert.ok(calls.every(c=>c.options.retry===false&&c.options.timeout===15000&&c.options.headers['If-Match']==='e'));

  assert.deepEqual(calls[2].params,{tasklist:'l',task:'t',destinationTasklist:'d',parent:'p'});

  await write.insertTask('l',{title:'child'},{parent:'p',previous:'s'});assert.deepEqual(calls.at(-1).params,{tasklist:'l',requestBody:{title:'child'},parent:'p',previous:'s'});

});

