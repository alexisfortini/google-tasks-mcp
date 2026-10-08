import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectText} from '../scripts/audit-share.mjs';
import {normalizeAccount} from '../src/account.mjs';
import {EditingService} from '../src/editing.mjs';
import {createServer} from '../src/tools.mjs';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {randomUUID} from 'node:crypto';

test('account pin validation rejects missing, malformed and control-character values',()=>{
  assert.equal(normalizeAccount('PERSONAL@EXAMPLE.COM'),'personal@example.com');
  for(const value of [null,undefined,'','missing-at','a@b\n','a@b\0.com'])assert.throws(()=>normalizeAccount(value),/ACCOUNT_CONFIGURATION_REQUIRED/);
});
test('share audit identifies real-shaped secret/personal data and permits synthetic fixtures',()=>{
  assert.deepEqual(inspectText('test/example.mjs',"const email='personal@example.com';const token='mock-refresh';"),[]);
  assert.ok(inspectText('.private/account.json','{}').includes('generated-or-private-path'));
  assert.ok(inspectText('source.mjs','ya29.'+'A'.repeat(30)).includes('google-access-token'));
  assert.ok(inspectText('source.mjs','someone'+'@'+'company.invalid-domain').includes('non-example-email'));
});
test('versioned write schemas require IDs, clear notes with empty strings, and expose no mutable legacy names',async()=>{
  const calls=[];const api={canWrite:true,getTask:async()=>({id:'t',etag:'e'}),patchTask:async(list,id,patch)=>{calls.push(patch);return{id,...patch};}};
  const authorizeAction=async()=>{const claim=async()=>{};claim.wasClaimed=()=>true;claim.finish=async()=>{};return claim;};
  const server=createServer(async()=>new EditingService(api,{authorizeAction}));const client=new Client({name:'connector-contract',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(b);await client.connect(a);const catalog=await client.listTools();const writes=catalog.tools.filter(t=>!t.annotations.readOnlyHint);
    assert.equal(writes.length,10);assert.ok(writes.every(t=>t.name.endsWith('_v2')&&t.inputSchema.required.includes('requestId')));assert.equal(catalog.tools.some(t=>t.name==='edit_task'),false);
    const missing=await client.callTool({name:'edit_task_v2',arguments:{tasklistId:'l',taskId:'t',expectedEtag:'e',patch:{notes:''}}});assert.equal(missing.isError,true);assert.deepEqual(calls,[]);
    const nullable=await client.callTool({name:'edit_task_v2',arguments:{requestId:randomUUID(),tasklistId:'l',taskId:'t',expectedEtag:'e',patch:{notes:null}}});assert.equal(nullable.isError,true);assert.deepEqual(calls,[]);
    const id=randomUUID();const cleared=await client.callTool({name:'edit_task_v2',arguments:{requestId:id,tasklistId:'l',taskId:'t',expectedEtag:'e',patch:{notes:'',due:null}}});assert.equal(cleared.structuredContent.requestId,id);assert.equal(cleared.structuredContent.requestRecorded,true);assert.deepEqual(calls,[{notes:'',due:null}]);
  }finally{await client.close();}
});
