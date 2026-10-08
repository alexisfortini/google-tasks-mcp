import {readFile,writeFile,rename,unlink} from 'node:fs/promises';

import {createHash,randomUUID} from 'node:crypto';

import {TaskError} from './core.mjs';

import {PERSONAL_EMAIL} from './identity.mjs';

import {canonical,OPERATIONS} from './approvals.mjs';

const fail=code=>{throw new TaskError(code);};

export const DESTRUCTIVE=['deleteTask','deleteTasklist','clearCompleted'];

export function requestPayload(input){return Object.fromEntries(Object.entries(input).filter(([key])=>!['requestId','confirmationToken'].includes(key)));}

export function fingerprint(method,input){return createHash('sha256').update(canonical({method,arguments:requestPayload(input)})).digest('hex');}

function requestId(input){if(typeof input.requestId!=='string'||!/^\w[\w-]{15,79}$/.test(input.requestId))fail('REQUEST_ID_REQUIRED');return input.requestId;}

export function validateAccess(config,method){

  if(config?.mode!=='assistant-requested-actions'||config.personalEmail!==PERSONAL_EMAIL||config.consentAuthority!=='trusted-assistant-and-client'||config.destructiveConfirmation!=='fresh-preview-and-user-confirmation'||!Array.isArray(config.enabledOperations)||config.enabledOperations.some(op=>!OPERATIONS.includes(op))||!config.enabledOperations.includes(method))fail('WRITES_DISABLED');

}

// A preview token binds reviewed current state. It is NOT proof of a human's consent.

export function destructivePreviews({now=()=>Date.now()}={}){

  const pending=new Map();

  return {

    issue(method,input,summary){

      if(!DESTRUCTIVE.includes(method))fail('INVALID_DESTRUCTIVE_ACTION');

      for(const [key,value] of pending)if(value.expires<=now())pending.delete(key);

      if(pending.size>=100)fail('TOO_MANY_PENDING_PREVIEWS');

      const token=randomUUID(),expires=now()+10*60000;

      pending.set(token,{method,digest:fingerprint(method,input),expires});

      return {action:method,arguments:requestPayload(input),summary,confirmationToken:token,expiresAt:new Date(expires).toISOString(),requiresSeparateUserConfirmation:true};

    },

    consume(method,input){

      const item=pending.get(input.confirmationToken);

      if(!item||item.expires<=now()||item.method!==method||item.digest!==fingerprint(method,input))fail('FRESH_DESTRUCTIVE_PREVIEW_REQUIRED');

      pending.delete(input.confirmationToken);

    }

  };

}

export function directActions(root,{verifyStore=async()=>{},previews}={}){

  async function check(method){

    await verifyStore();let config;

    try{config=JSON.parse(await readFile(new URL('action-policy.json',root),'utf8'));}catch{fail('WRITES_DISABLED');}

    validateAccess(config,method);

  }

  async function replace(target,record){

    const temp=new URL('ledger-'+randomUUID()+'.tmp',root);

    try{await writeFile(temp,JSON.stringify(record)+'\n',{flag:'wx'});await rename(temp,target);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}

  }

  const authorize=async(method,input)=>{

    await check(method);const id=requestId(input),digest=fingerprint(method,input);

    const attempt=new URL('attempt-'+id+'.json',root);

    // All mutations use persistent request IDs. A timed-out mutation must keep its ID.

    let claimed=false,record,creationTarget;

    const claim=async()=>{

      await check(method);

      if(DESTRUCTIVE.includes(method)){if(!previews)fail('FRESH_DESTRUCTIVE_PREVIEW_REQUIRED');previews.consume(method,input);}

      record={method,digest,status:'pending',claimedAt:new Date().toISOString(),tasklistId:input.tasklistId??null,taskId:input.taskId??null};

      try{await writeFile(attempt,JSON.stringify(record)+'\n',{flag:'wx'});}catch{fail('REQUEST_ALREADY_ATTEMPTED_READ_OUTCOME');}

      claimed=true;

      if(['createTask','createTasklist'].includes(method)){

        // Ignore retry identity and duplicate opt-in when identifying unresolved identical creations.

        const payload=method==='createTasklist'?{title:input.title}:{tasklistId:input.tasklistId,task:{title:input.task.title,notes:input.task.notes||null,due:input.task.due??null},parentTaskId:input.parentTaskId??null,previousTaskId:input.previousTaskId??null};

        const creationDigest=fingerprint(method,payload);creationTarget=new URL('creation-'+creationDigest+'.json',root);

        try{await writeFile(creationTarget,JSON.stringify({requestId:id,status:'pending'})+'\n',{flag:'wx'});}

        catch{

          let prior;try{prior=JSON.parse(await readFile(creationTarget,'utf8'));}catch{fail('CREATION_OUTCOME_UNKNOWN_READ_FIRST');}

          if(prior.status!=='succeeded')fail('CREATION_OUTCOME_UNKNOWN_READ_FIRST');

          // Existing successful task creation still needs explicit duplicate intent, not a fresh retry ID.

          if(method==='createTask'&&input.allowDuplicate!==true)fail('CREATE_DUPLICATE_REVIEW_REQUIRED');

          await replace(creationTarget,{requestId:id,status:'pending'});

        }

      }

    };

    claim.wasClaimed=()=>claimed;
    claim.finish=async result=>{

      if(!claimed)return;

      const identifiers={id:result?.id??null,taskId:result?.taskId??null,tasklistId:result?.tasklistId??input.tasklistId??null,etag:result?.etag??null};

      await replace(attempt,{...record,status:'succeeded',result:identifiers});

      if(creationTarget)await replace(creationTarget,{requestId:id,status:'succeeded',result:identifiers});

    };

    // Pending markers intentionally survive exceptions, crashes, and restart. Never auto-reset them.

    return claim;

  };

  authorize.outcome=async input=>{

    await verifyStore();const id=requestId(input);let record;

    try{record=JSON.parse(await readFile(new URL('attempt-'+id+'.json',root),'utf8'));}catch(error){if(error.code==='ENOENT')return{requestId:id,status:'not-observed'};fail('OUTCOME_UNAVAILABLE');}

    if(!OPERATIONS.includes(record.method)||!['pending','succeeded'].includes(record.status))fail('OUTCOME_UNAVAILABLE');

    return{requestId:id,method:record.method,status:record.status,claimedAt:record.claimedAt,tasklistId:record.tasklistId,taskId:record.taskId,...(record.result?{result:record.result}:{}),retrySafe:false};

  };

  authorize.check=check;

  return authorize;

}

