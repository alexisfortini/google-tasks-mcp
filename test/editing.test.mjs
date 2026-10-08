import test from 'node:test';

import assert from 'node:assert/strict';

import {EditingService} from '../src/editing.mjs';

import {TaskError,safeError} from '../src/core.mjs';

const auth='mock-request-approval';

function fixture(overrides={}){

  const calls=[];const tasks=[{id:'t',title:'old',etag:'v1'},{id:'parent',etag:'p1'},{id:'previous',etag:'s1',parent:'parent'}];

  const api={canWrite:true,getTask:async(list,id)=>{calls.push(['get',list,id]);return {...tasks.find(t=>t.id===id)};},getTasklist:async list=>({id:list,title:'Example list',etag:'l1'}),listTasklists:async()=>({items:[]}),listTasks:async()=>({items:tasks}),insertTasklist:async body=>{calls.push(['insertList',body]);return{id:'new',...body};},patchTasklist:async(...args)=>{calls.push(['rename',...args]);return{id:args[0],...args[1]};},deleteTasklist:async(...args)=>{calls.push(['deleteList',...args]);},insertTask:async(...args)=>{calls.push(['insert',...args]);return{id:'new',...args[1]};},patchTask:async(...args)=>{calls.push(['patch',...args]);return{id:args[1],...args[2]};},moveTask:async(...args)=>{calls.push(['move',...args]);return{id:args[0].task};},deleteTask:async(...args)=>{calls.push(['delete',...args]);},...overrides};

  let claimed=false;const authorizeAction=async()=>async()=>{if(claimed)throw new TaskError('REQUEST_ALREADY_ATTEMPTED');claimed=true;calls.push(['claim']);};

  return {tasks,calls,api,service:new EditingService(api,{authorizeAction}),mutations:()=>calls.filter(c=>['insertList','rename','deleteList','insert','patch','move','delete'].includes(c[0]))};

}

const target={requestId:auth,tasklistId:'l',taskId:'t',expectedEtag:'v1'};

test('new operations fail closed without exact approval, even with a full grant',async()=>{

  const f=fixture();const s=new EditingService(f.api);

  await assert.rejects(s.renameTasklist({requestId:auth,tasklistId:'l',expectedEtag:'l1',title:'Other'}),/WRITES_DISABLED/);assert.deepEqual(f.calls,[]);

  await assert.rejects(new EditingService({...f.api,canWrite:false},{authorizeAction:async()=>{throw Error('must not authorize');}}).renameTasklist({...target,title:'Other'}),/READ_ONLY_GRANT/);

});

test('field patch clears only requested fields and rejects times or recurrence before reads',async()=>{

  const f=fixture();await f.service.editTask({...target,patch:{title:'',notes:null,due:null}});

  assert.deepEqual(f.mutations(),[['patch','l','t',{title:'',notes:null,due:null},'v1']]);assert.deepEqual(f.calls.map(c=>c[0]),['get','claim','patch']);

  for(const patch of [{due:'2026-10-08T15:00:00Z'},{reminder:'15:00'},{recurrence:'daily'},{category:'Work'},{parent:'p'}])await assert.rejects(fixture().service.editTask({...target,patch}));

});

test('rename is read-before-write and stale list ETag prevents mutation',async()=>{

  const f=fixture();await f.service.renameTasklist({requestId:auth,tasklistId:'l',expectedEtag:'l1',title:'Trips'});assert.deepEqual(f.mutations(),[['rename','l',{title:'Trips'},'l1']]);

  const stale=fixture();await assert.rejects(stale.service.renameTasklist({requestId:auth,tasklistId:'l',expectedEtag:'stale',title:'Trips'}),/CONFLICT_READ_AGAIN/);assert.deepEqual(stale.mutations(),[]);

});

test('approved list creation resolves existing list or inserts only once after checking pages',async()=>{

  const f=fixture();await f.service.createTasklist({requestId:auth,title:'Other'});await assert.rejects(f.service.createTasklist({requestId:auth,title:'Other'}),/REQUEST_ALREADY_ATTEMPTED/);assert.equal(f.mutations().length,1);

  const existing=fixture({listTasklists:async p=>p.pageToken?{items:[{id:'x',title:'Other'}]}:{nextPageToken:'next'}});assert.equal((await existing.service.createTasklist({requestId:auth,title:'Other'})).created,false);assert.deepEqual(existing.mutations(),[]);

});

test('create subtask passes parent and previous as query parameters with fresh anchor ETags',async()=>{

  const f=fixture();await f.service.createTask({requestId:auth,tasklistId:'l',task:{title:'child',notes:'details',due:'2026-10-09'},parentTaskId:'parent',expectedParentEtag:'p1',previousTaskId:'previous',expectedPreviousEtag:'s1'});

  assert.deepEqual(f.mutations(),[['insert','l',{title:'child',notes:'details',due:'2026-10-09T00:00:00.000Z'},{parent:'parent',previous:'previous'}]]);

  const stale=fixture();await assert.rejects(stale.service.createTask({requestId:auth,tasklistId:'l',task:{title:'child'},parentTaskId:'parent',expectedParentEtag:'stale'}),/CONFLICT_READ_AGAIN/);assert.deepEqual(stale.mutations(),[]);

});

test('native cross-list move and top-level first placement never emulate copy/delete',async()=>{

  const f=fixture();await f.service.moveTask({...target,destinationTasklistId:'other',expectedDestinationEtag:'l1',parentTaskId:null,previousTaskId:null,expectedDescendants:[]});

  assert.deepEqual(f.mutations(),[['move',{tasklist:'l',task:'t',destinationTasklist:'other'},'v1']]);

  const nested=fixture();await nested.service.moveTask({...target,expectedDestinationEtag:'l1',parentTaskId:'parent',expectedParentEtag:'p1',previousTaskId:'previous',expectedPreviousEtag:'s1',expectedDescendants:[]});

  assert.deepEqual(nested.mutations(),[['move',{tasklist:'l',task:'t',parent:'parent',previous:'previous'},'v1']]);

});

test('moving refuses stale anchors, wrong sibling parent, hidden anchors, cycles and unreviewed descendants',async()=>{

  for(const kind of ['stale','wrongSibling','hidden','cycle','descendant']){

    const f=fixture();const args={...target,expectedDestinationEtag:'l1',parentTaskId:'parent',expectedParentEtag:'p1',previousTaskId:'previous',expectedPreviousEtag:'s1',expectedDescendants:[]};

    if(kind==='stale')args.expectedPreviousEtag='old';if(kind==='wrongSibling')f.tasks[2].parent='other';if(kind==='hidden')f.tasks[1].hidden=true;if(kind==='cycle')f.tasks[1].parent='t';if(kind==='descendant')f.tasks.push({id:'child',etag:'c1',parent:'t'});

    await assert.rejects(f.service.moveTask(args));assert.deepEqual(f.mutations(),[]);

  }

});

test('reopen clears only completion and status; completing parent requires reviewed descendants',async()=>{

  const f=fixture();await f.service.reopenTask(target);assert.deepEqual(f.mutations(),[['patch','l','t',{status:'needsAction',completed:null},'v1']]);

  const parent=fixture();parent.tasks.push({id:'child',etag:'c1',parent:'t'});await assert.rejects(parent.service.completeTask(target),/CONFLICT_READ_AGAIN/);assert.deepEqual(parent.mutations(),[]);

  await parent.service.completeTask({...target,expectedDescendants:[{id:'child',etag:'c1'}]});assert.deepEqual(parent.mutations(),[['patch','l','t',{status:'completed'},'v1']]);

});

test('task deletion requires confirmation and exact descendants; rejects assignments without deleting their source',async()=>{

  const f=fixture();f.tasks.push({id:'child',etag:'c1',parent:'t'});

  await assert.rejects(f.service.deleteTask({...target,expectedDescendants:[]}),/DELETION_CONFIRMATION_REQUIRED/);

  await assert.rejects(f.service.deleteTask({...target,confirmDeletion:true,expectedDescendants:[]}),/CONFLICT_READ_AGAIN/);assert.deepEqual(f.mutations(),[]);

  await f.service.deleteTask({...target,confirmDeletion:true,expectedDescendants:[{id:'child',etag:'c1'}]});assert.deepEqual(f.mutations(),[['delete','l','t','v1']]);

  const assigned=fixture();assigned.tasks[0].assignmentInfo={surfaceType:'DOCUMENT'};await assert.rejects(assigned.service.deleteTask({...target,confirmDeletion:true,expectedDescendants:[]}),/UNSUPPORTED_TASK/);assert.deepEqual(assigned.mutations(),[]);

});

test('list deletion reads assigned/hidden/completed tasks and requires exact full inventory',async()=>{

  const f=fixture();const args={requestId:auth,tasklistId:'l',expectedEtag:'l1',confirmDeletion:true,expectedTasks:f.tasks.map(({id,etag})=>({id,etag}))};

  await f.service.deleteTasklist(args);assert.deepEqual(f.mutations(),[['deleteList','l','l1']]);

  const assigned=fixture();assigned.tasks[2].assignmentInfo={};await assert.rejects(assigned.service.deleteTasklist(args),/UNSUPPORTED_TASK/);assert.deepEqual(assigned.mutations(),[]);

  const changed=fixture();changed.tasks.push({id:'new-child',etag:'new'});await assert.rejects(changed.service.deleteTasklist(args),/CONFLICT_READ_AGAIN/);

});

test('unknown native move outcome consumes the claim and refuses blind retry',async()=>{

  const f=fixture({moveTask:async()=>{throw Error('mock timeout secret text');}});const args={...target,expectedDestinationEtag:'l1',parentTaskId:null,previousTaskId:null,expectedDescendants:[]};

  await assert.rejects(f.service.moveTask(args),e=>safeError(e,true)==='WRITE_OUTCOME_UNKNOWN_DO_NOT_RETRY');await assert.rejects(f.service.moveTask(args),/REQUEST_ALREADY_ATTEMPTED/);

});

test('missing or stripped requestId fails closed even with a legacy write policy',async()=>{
  const f=fixture();const s=new EditingService(f.api,{writePolicy:{tasklistId:'l',expiresAt:new Date(Date.now()+60000).toISOString(),allowedTaskIds:['t'],allowedCompletionTaskIds:['t']}});
  await assert.rejects(s.completeTask({tasklistId:'l',taskId:'t',expectedEtag:'v1'}),/REQUEST_ID_REQUIRED/);assert.deepEqual(f.mutations(),[]);
});



test('clear completed faithfully hides rather than deletes and requires exact completed inventory',async()=>{

  const f=fixture({clearCompleted:async(...args)=>{f.calls.push(['clear',...args]);}});

  f.tasks[0].status='completed';

  const input={requestId:auth,tasklistId:'l',expectedEtag:'l1',confirmHideCompleted:true,expectedCompletedTasks:[{id:'t',etag:'v1'}]};

  await assert.rejects(f.service.clearCompleted({...input,confirmHideCompleted:false}),/HIDING_CONFIRMATION_REQUIRED/);

  await assert.rejects(f.service.clearCompleted({...input,expectedCompletedTasks:[]}),/CONFLICT_READ_AGAIN/);

  const result=await f.service.clearCompleted(input);assert.deepEqual(result,{tasklistId:'l',hiddenCompletedTaskIds:['t'],deleted:false,requestId:auth,requestRecorded:false});assert.deepEqual(f.calls.filter(c=>['clear','delete'].includes(c[0])),[['clear','l','l1']]);

});


test('existing identical task blocks accidental duplicate; explicit duplicate intent still passes native creation',async()=>{
  const f=fixture();await assert.rejects(f.service.createTask({requestId:auth,tasklistId:'l',task:{title:'old'}}),/CREATE_DUPLICATE_REVIEW_REQUIRED/);assert.deepEqual(f.mutations(),[]);
  await f.service.createTask({requestId:auth,tasklistId:'l',task:{title:'old'},allowDuplicate:true});assert.equal(f.mutations().length,1);
});
test('destructive preparation returns reviewed titles/IDs and fresh ETags without mutation',async()=>{
  const f=fixture();f.tasks.push({id:'child',title:'child title',etag:'c1',parent:'t'});let captured;
  const authorizeAction=async()=>async()=>{};authorizeAction.check=async method=>{assert.equal(method,'deleteTask');};
  const service=new EditingService(f.api,{authorizeAction,previews:{issue:(method,args,summary)=>{captured={method,args,summary};return{confirmationToken:'nonsecret-test-preview',arguments:args};}}});
  const prepared=await service.prepareDestructive({action:'delete_task',tasklistId:'l',taskId:'t'});
  assert.deepEqual(prepared.arguments,{tasklistId:'l',taskId:'t',expectedEtag:'v1',expectedDescendants:[{id:'child',etag:'c1'}],confirmDeletion:true});
  assert.equal(captured.summary.taskTitle,'old');assert.equal(captured.summary.affectedTasks[1].title,'child title');assert.deepEqual(f.mutations(),[]);
});

