import test from 'node:test';
import assert from 'node:assert/strict';
import {TasksService,safeError} from '../src/core.mjs';
function fixture(apiOverrides={},optionOverrides={}){
  const calls=[];const policy={grantId:'mock-grant',expiresAt:new Date(Date.now()+60000).toISOString(),tasklistCreateTitle:'Example list',createTitle:'Call example hotel',createExactBody:{title:'Call example hotel'},allowedTaskIds:[]};
  const api={canWrite:true,listTasklists:async()=>({items:[]}),insertTasklist:async body=>{calls.push(['insert',body]);return{id:'travel',...body};},getTasklist:async id=>({id,title:'Example list'}),insertTask:async(id,body)=>{calls.push(['task',id,body]);return{id:'task',...body};},...apiOverrides};
  const service=new TasksService(api,{writePolicy:policy,claimTasklistCreate:async()=>true,claimCreate:async()=>true,bindTasklistId:async(p,id)=>{calls.push(['bind',id]);},...optionOverrides});
  return{calls,policy,api,service};
}
test('list creation rejects readonly, expiry and unapproved title before API calls',async()=>{
  const f=fixture({canWrite:false});await assert.rejects(f.service.createTasklist({title:'Example list'}),/READ_ONLY_GRANT/);assert.deepEqual(f.calls,[]);
  const expired=fixture();expired.policy.expiresAt='2000-01-01';await assert.rejects(expired.service.createTasklist({title:'Example list'}),/WRITES_DISABLED/);
  await assert.rejects(fixture().service.createTasklist({title:'Other'}),/TASKLIST_CREATE_NOT_APPROVED/);
});
test('list creation reads every page and resolves existing Example list without insert',async()=>{
  const f=fixture({listTasklists:async params=>params.pageToken?{items:[{id:'existing',title:'Example list'}]}:{items:[],nextPageToken:'next'}});
  assert.deepEqual(await f.service.createTasklist({title:'Example list'}),{id:'existing',title:'Example list',created:false});assert.deepEqual(f.calls,[['bind','existing']]);
});
test('ambiguous names and repeated pagination refuse list creation',async()=>{
  const f=fixture({listTasklists:async()=>({items:[{id:'1',title:'Example list'},{id:'2',title:'Example list'}]})});await assert.rejects(f.service.createTasklist({title:'Example list'}),/TASKLIST_AMBIGUOUS/);assert.deepEqual(f.calls,[]);
  const loop=fixture({listTasklists:async()=>({items:[],nextPageToken:'same'})});await assert.rejects(loop.service.createTasklist({title:'Example list'}),/PAGINATION_INCOMPLETE/);
});
test('absent Example list consumes one claim and binds only returned ID',async()=>{
  let claimed=false;const f=fixture({}, {claimTasklistCreate:async()=>{if(claimed)return false;claimed=true;return true;}});
  assert.equal((await f.service.createTasklist({title:'Example list'})).created,true);assert.equal(f.policy.tasklistId,'travel');
  await assert.rejects(f.service.createTasklist({title:'Example list'}),/TASKLIST_CREATE_ALREADY_ATTEMPTED/);assert.equal(f.calls.filter(c=>c[0]==='insert').length,1);
});
test('unknown list insert outcome cannot consume another claim or automatically retry',async()=>{
  let claimed=false;const f=fixture({insertTasklist:async()=>{throw new Error('mock timeout sensitive text');}},{claimTasklistCreate:async()=>{if(claimed)return false;claimed=true;return true;}});
  await assert.rejects(f.service.createTasklist({title:'Example list'}),error=>safeError(error,true)==='WRITE_OUTCOME_UNKNOWN_DO_NOT_RETRY');
  await assert.rejects(f.service.createTasklist({title:'Example list'}),/TASKLIST_CREATE_ALREADY_ATTEMPTED/);
});
test('Example list ID binding failure blocks task creation; no other list is allowed',async()=>{
  const f=fixture({}, {bindTasklistId:async()=>{throw new Error('mock policy conflict');}});
  await assert.rejects(f.service.createTasklist({title:'Example list'}));await assert.rejects(f.service.createTask({tasklistId:'travel',task:{title:'Call example hotel'}}),/WRITES_DISABLED/);
});
test('only exact hotel title and no due/notes are authorized after Example list binding',async()=>{
  const f=fixture();await f.service.createTasklist({title:'Example list'});
  for(const task of [{title:'Other'},{title:'Call example hotel',due:'2026-10-08'},{title:'Call example hotel',notes:'extra'}])await assert.rejects(f.service.createTask({tasklistId:'travel',task}),/CREATE_NOT_APPROVED/);
  await assert.rejects(f.service.createTask({tasklistId:'other',task:{title:'Call example hotel'}}),/WRITES_DISABLED/);
  await f.service.createTask({tasklistId:'travel',task:{title:'Call example hotel'}});assert.deepEqual(f.calls.at(-1),['task','travel',{title:'Call example hotel'}]);
});
