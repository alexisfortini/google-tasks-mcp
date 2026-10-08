import test from 'node:test';

import assert from 'node:assert/strict';

import { fileURLToPath } from 'node:url';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { createServer } from '../src/tools.mjs';

import { TasksService } from '../src/core.mjs';



test('real SDK initializes production stdio server and discovers exactly sixteen tools offline', { timeout: 30000 }, async () => {

  const client = new Client({ name: 'offline-sdk-check', version: '1.0.0' });

  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], stderr: 'pipe' });

  let stderr = '';

  transport.stderr?.on('data', chunk => { stderr += chunk; });

  try {

    await client.connect(transport);

    const result = await client.listTools();

    assert.deepEqual(result.tools.map(tool => tool.name).sort(), ['clear_completed_v2', 'complete_task_v2', 'create_task_v2', 'create_tasklist_v2', 'delete_task_v2', 'delete_tasklist_v2', 'edit_task_v2', 'get_request_outcome', 'get_task', 'get_tasklist', 'list_tasklists', 'list_tasks', 'move_task_v2', 'prepare_destructive_action', 'rename_tasklist_v2', 'reopen_task_v2']);

    assert.equal(result.tools.find(tool => tool.name === 'list_tasks').annotations.readOnlyHint, true);

    assert.equal(result.tools.find(tool => tool.name === 'create_task_v2').annotations.destructiveHint, true);

    const invalid = await client.callTool({ name: 'create_task_v2', arguments: { tasklistId: 'l', task: { title: 'test', deleted: true } } });

    assert.equal(invalid.isError, true);

    assert.equal(stderr, '');

  } finally { await client.close(); }

});



test('real SDK validates schemas and calls mocks; conflict survives transport', { timeout: 30000 }, async () => {

  const calls = [];

  const api = {

    listTasklists: async () => ({items:[{id:'l',title:'mock',etag:'list-v1'}]}),

    getTask: async () => { calls.push('get'); return {id:'t',title:'original',etag:'v1'}; },

    patchTask: async (list,id,body,etag) => { calls.push({body,etag}); return {id, ...body, etag:'v2'}; }

  };

  const service = new TasksService(api, { writePolicy: { tasklistId:'l', allowedTaskIds:['t'], expiresAt:new Date(Date.now()+60000).toISOString() } });

  const server = createServer(async () => service);

  const client = new Client({ name:'mock-sdk-check',version:'1.0.0' });

  const [clientSide,serverSide] = InMemoryTransport.createLinkedPair();

  try {

    await server.connect(serverSide);

    await client.connect(clientSide);

    const lists = await client.callTool({name:'list_tasklists',arguments:{}});

    assert.equal(lists.structuredContent.tasklists[0].title,'mock');

    const edit = await client.callTool({name:'edit_task_v2',arguments:{requestId:'offline-mock-request-001',tasklistId:'l',taskId:'t',expectedEtag:'v1',patch:{title:'approved mock'}}});

    assert.equal(edit.structuredContent.etag,'v2');

    assert.deepEqual(calls,['get',{body:{title:'approved mock'},etag:'v1'}]);

    const conflict = await client.callTool({name:'complete_task_v2',arguments:{requestId:'offline-mock-request-001',tasklistId:'l',taskId:'t',expectedEtag:'stale'}});

    assert.equal(conflict.isError,true);

    assert.equal(conflict.content[0].text,'CONFLICT_READ_AGAIN');

    const invalid = await client.callTool({name:'edit_task_v2',arguments:{requestId:'offline-mock-request-001',tasklistId:'l',taskId:'t',expectedEtag:'v1',patch:{deleted:true}}});

    assert.equal(invalid.isError,true);

    assert.equal(calls.length,3);

  } finally { await client.close(); await server.close(); }

});


test('real SDK runs direct cloud-style edit and preview-confirm-delete with no desktop permit', {timeout:30000}, async()=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');const {randomUUID}=await import('node:crypto');
  const {EditingService}=await import('../src/editing.mjs');const {directActions,destructivePreviews}=await import('../src/direct-actions.mjs');const {OPERATIONS}=await import('../src/approvals.mjs');
  const directory=await mkdtemp(join(tmpdir(),'tasks-sdk-direct-')),root=pathToFileURL(directory+'/');
  const client=new Client({name:'direct-cloud-style-offline',version:'1'});const [clientSide,serverSide]=InMemoryTransport.createLinkedPair();let task={id:'t',title:'old',etag:'v1'},deletes=0;
  try{
    await writeFile(new URL('action-policy.json',root),JSON.stringify({mode:'assistant-requested-actions',personalEmail:'personal@example.com',consentAuthority:'trusted-assistant-and-client',destructiveConfirmation:'fresh-preview-and-user-confirmation',enabledOperations:OPERATIONS}));
    const previews=destructivePreviews(),authorizeAction=directActions(root,{previews});
    const api={canWrite:true,getTask:async()=>({...task}),getTasklist:async()=>({id:'l',title:'Personal',etag:'list-v1'}),listTasks:async()=>({items:[{...task}]}),patchTask:async(list,id,patch,etag)=>{assert.equal(etag,task.etag);task={...task,...patch,etag:'v2'};return{...task};},deleteTask:async(list,id,etag)=>{assert.equal(etag,'v2');deletes++;}};
    const service=new EditingService(api,{authorizeAction,previews}),server=createServer(async()=>service);await server.connect(serverSide);await client.connect(clientSide);
    const edited=await client.callTool({name:'edit_task_v2',arguments:{requestId:randomUUID(),tasklistId:'l',taskId:'t',expectedEtag:'v1',patch:{title:'requested'}}});assert.equal(edited.structuredContent.title,'requested');
    const prepared=await client.callTool({name:'prepare_destructive_action',arguments:{action:'delete_task',tasklistId:'l',taskId:'t'}});assert.equal(prepared.structuredContent.summary.taskTitle,'requested');assert.equal(deletes,0);
    const args=prepared.structuredContent.arguments;
    const invalid=await client.callTool({name:'delete_task_v2',arguments:{...args,requestId:randomUUID()}});assert.equal(invalid.isError,true);assert.equal(deletes,0);
    const deleted=await client.callTool({name:'delete_task_v2',arguments:{...args,requestId:randomUUID(),confirmationToken:prepared.structuredContent.confirmationToken}});assert.equal(deleted.structuredContent.deleted,true);assert.equal(deletes,1);
    const reused=await client.callTool({name:'delete_task_v2',arguments:{...args,requestId:randomUUID(),confirmationToken:prepared.structuredContent.confirmationToken}});assert.equal(reused.isError,true);assert.equal(deletes,1);
  }finally{await client.close();await rm(directory,{recursive:true,force:true});}
});

