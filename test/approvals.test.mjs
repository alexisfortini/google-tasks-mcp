import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {OPERATIONS} from '../src/approvals.mjs';
import {directActions,validateAccess,destructivePreviews} from '../src/direct-actions.mjs';
const config={mode:'assistant-requested-actions',personalEmail:'personal@example.com',consentAuthority:'trusted-assistant-and-client',destructiveConfirmation:'fresh-preview-and-user-confirmation',enabledOperations:OPERATIONS};
const input=()=>({requestId:randomUUID(),tasklistId:'l',taskId:'t',expectedEtag:'e',patch:{notes:'requested'}});
async function fixture(run){const directory=await mkdtemp(join(tmpdir(),'tasks-direct-'));const root=pathToFileURL(directory+'/');try{await writeFile(new URL('action-policy.json',root),JSON.stringify(config));await run({root,authorize:directActions(root),policy:new URL('action-policy.json',root)});}finally{await rm(directory,{recursive:true,force:true});}}
test('persistent direct mode is explicit, account-pinned, operation-restricted and rejects wildcard or ambiguous consent authority',()=>{
  assert.doesNotThrow(()=>validateAccess(config,'editTask'));
  for(const changed of [{...config,mode:'restricted'},{...config,personalEmail:'work@example.com'},{...config,enabledOperations:['*']},{...config,consentAuthority:'boolean'},{...config,enabledOperations:[]}])assert.throws(()=>validateAccess(changed,'editTask'),/WRITES_DISABLED/);
});
test('direct edits need no locally written per-request permit; durable request ID binds one attempt and stores safe result metadata',async()=>fixture(async({root,authorize})=>{
  const args=input(),claim=await authorize('editTask',args);await claim();await claim.finish({id:'t',etag:'e2',notes:'PRIVATE TASK CONTENT'});
  await assert.rejects((await authorize('editTask',args))(),/REQUEST_ALREADY_ATTEMPTED_READ_OUTCOME/);
  await assert.rejects((await authorize('editTask',{...args,patch:{notes:'changed'}}))(),/REQUEST_ALREADY_ATTEMPTED_READ_OUTCOME/);
  const text=await readFile(new URL('attempt-'+args.requestId+'.json',root),'utf8');assert.equal(text.includes('PRIVATE TASK CONTENT'),false);assert.equal(text.includes('requested'),false);
  const outcome=await authorize.outcome(args);assert.equal(outcome.status,'succeeded');assert.deepEqual(outcome.result,{id:'t',taskId:null,tasklistId:'l',etag:'e2'});
}));
test('capability revocation is rechecked immediately before mutation',async()=>fixture(async({authorize,policy})=>{
  const claim=await authorize('editTask',input());await writeFile(policy,JSON.stringify({...config,enabledOperations:[]}));await assert.rejects(claim(),/WRITES_DISABLED/);
}));
test('unknown creation blocks identical payload with a different retry ID, including duplicate opt-in, across new authorizer instance',async()=>fixture(async({root,authorize})=>{
  const args={requestId:randomUUID(),tasklistId:'l',task:{title:'hotel'}};await(await authorize('createTask',args))();
  const restarted=directActions(root);await assert.rejects((await restarted('createTask',{...args,requestId:randomUUID(),allowDuplicate:true}))(),/CREATION_OUTCOME_UNKNOWN_READ_FIRST/);
  assert.equal((await restarted.outcome(args)).status,'pending');
}));
test('known successful identical creation needs explicit duplicate intent; a different task payload is independent',async()=>fixture(async({authorize})=>{
  const args={requestId:randomUUID(),tasklistId:'l',task:{title:'hotel'}},claim=await authorize('createTask',args);await claim();await claim.finish({id:'hotel1'});
  await assert.rejects((await authorize('createTask',{...args,requestId:randomUUID()}))(),/CREATE_DUPLICATE_REVIEW_REQUIRED/);
  const explicit=await authorize('createTask',{...args,requestId:randomUUID(),allowDuplicate:true});await explicit();await explicit.finish({id:'hotel2'});
  const different=await authorize('createTask',{requestId:randomUUID(),tasklistId:'l',task:{title:'other'}});await different();
}));
test('destructive preview binds exact fresh payload and operation, expires, and is single use; it is not consent evidence',()=>{
  let now=1000;const previews=destructivePreviews({now:()=>now});const args={tasklistId:'l',taskId:'t',expectedEtag:'e',expectedDescendants:[],confirmDeletion:true};
  const prepared=previews.issue('deleteTask',args,{affectedTasks:[{id:'t',title:'hotel'}]});assert.equal(prepared.requiresSeparateUserConfirmation,true);
  assert.throws(()=>previews.consume('deleteTask',{...args,expectedEtag:'changed',confirmationToken:prepared.confirmationToken}),/FRESH_DESTRUCTIVE_PREVIEW_REQUIRED/);
  assert.doesNotThrow(()=>previews.consume('deleteTask',{...args,requestId:randomUUID(),confirmationToken:prepared.confirmationToken}));
  assert.throws(()=>previews.consume('deleteTask',{...args,confirmationToken:prepared.confirmationToken}),/FRESH_DESTRUCTIVE_PREVIEW_REQUIRED/);
  const expired=previews.issue('deleteTask',args,{});now+=11*60000;assert.throws(()=>previews.consume('deleteTask',{...args,confirmationToken:expired.confirmationToken}),/FRESH_DESTRUCTIVE_PREVIEW_REQUIRED/);
});
test('destructive true boolean alone never bypasses a fresh server preview; no tool parameter can enable persistent capabilities',async()=>fixture(async({root})=>{
  const previews=destructivePreviews(),authorize=directActions(root,{previews}),args={requestId:randomUUID(),tasklistId:'l',taskId:'t',expectedEtag:'e',expectedDescendants:[],confirmDeletion:true};
  await assert.rejects((await authorize('deleteTask',args))(),/FRESH_DESTRUCTIVE_PREVIEW_REQUIRED/);
  const prepared=previews.issue('deleteTask',args,{});await(await authorize('deleteTask',{...args,confirmationToken:prepared.confirmationToken}))();
}));
test('missing/insecure store and unsafe request IDs fail closed',async()=>{
  const authorize=directActions(new URL('file:///C:/unused/'),{verifyStore:async()=>{throw Error('mock insecure store');}});await assert.rejects(authorize('editTask',input()),/mock insecure store/);
  await fixture(async({authorize})=>{await assert.rejects(authorize('editTask',{...input(),requestId:'../../outside'}),/REQUEST_ID_REQUIRED/);});
});

