import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {policyStore} from '../src/policy.mjs';
import {TasksService} from '../src/core.mjs';

test('fresh policy reads observe renewal and bindings; stale bindings fail closed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tasks-policy-'));
  try {
    const target=pathToFileURL(join(dir,'write-policy.json'));const store=policyStore(target);
    assert.equal(await store.read(),null);
    const old={expiresAt:'2000-01-01',completeCreatedTask:true,allowedCompletionTaskIds:[]};
    await writeFile(target,JSON.stringify(old));const renewed={...old,expiresAt:new Date(Date.now()+60000).toISOString()};
    await writeFile(target,JSON.stringify(renewed));assert.deepEqual(await store.read(),renewed);
    await assert.rejects(store.bind(old,'tasklistId','travel'),/POLICY_CHANGED/);
    await store.bind(renewed,'tasklistId','travel');const bound=await store.read();
    await store.bind(bound,'allowedCompletionTaskIds',['returned-hotel']);
    assert.deepEqual((await store.read()).allowedCompletionTaskIds,['returned-hotel']);
    await assert.rejects(store.bind(bound,'allowedCompletionTaskIds',['other']),/POLICY_CHANGED/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('returned hotel ID permits completion only, rejects edits/other IDs, and preserves ETag conflict check',async()=>{
  const calls=[];const policy={tasklistId:'travel',expiresAt:new Date(Date.now()+60000).toISOString(),createTitle:'Call example hotel',createExactBody:{title:'Call example hotel'},completeCreatedTask:true,allowedTaskIds:[],allowedCompletionTaskIds:[]};
  const api={canWrite:true,getTasklist:async()=>({id:'travel'}),insertTask:async()=>({id:'returned-hotel',title:policy.createTitle}),getTask:async()=>({id:'returned-hotel',etag:'fresh'}),patchTask:async(list,id,patch,etag)=>{calls.push({list,id,patch,etag});return{id,...patch};}};
  const service=new TasksService(api,{writePolicy:policy,claimCreate:async()=>true,bindCompletionTaskId:async(p,id)=>{assert.equal(p,policy);assert.equal(id,'returned-hotel');}});
  await assert.rejects(service.completeTask({tasklistId:'travel',taskId:'returned-hotel',expectedEtag:'fresh'}),/TASK_NOT_APPROVED/);
  await service.createTask({tasklistId:'travel',task:{title:policy.createTitle}});
  await assert.rejects(service.editTask({tasklistId:'travel',taskId:'returned-hotel',expectedEtag:'fresh',patch:{title:'Other'}}),/TASK_NOT_APPROVED/);
  await assert.rejects(service.completeTask({tasklistId:'travel',taskId:'other',expectedEtag:'fresh'}),/TASK_NOT_APPROVED/);
  await assert.rejects(service.completeTask({tasklistId:'travel',taskId:'returned-hotel',expectedEtag:'stale'}),/CONFLICT_READ_AGAIN/);
  assert.deepEqual(calls,[]);
  await service.completeTask({tasklistId:'travel',taskId:'returned-hotel',expectedEtag:'fresh'});
  assert.deepEqual(calls,[{list:'travel',id:'returned-hotel',patch:{status:'completed'},etag:'fresh'}]);
});

test('completion binding failure returns unknown outcome and grants no completion',async()=>{
  const policy={tasklistId:'travel',expiresAt:new Date(Date.now()+60000).toISOString(),createTitle:'hotel',completeCreatedTask:true,allowedTaskIds:[],allowedCompletionTaskIds:[]};
  const service=new TasksService({getTasklist:async()=>({}),insertTask:async()=>({id:'created'})},{writePolicy:policy,claimCreate:async()=>true,bindCompletionTaskId:async()=>{throw new Error('POLICY_CHANGED');}});
  await assert.rejects(service.createTask({tasklistId:'travel',task:{title:'hotel'}}),/POLICY_CHANGED/);
  await assert.rejects(service.completeTask({tasklistId:'travel',taskId:'created',expectedEtag:'fresh'}),/TASK_NOT_APPROVED/);
});

