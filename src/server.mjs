import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {EditingService} from './editing.mjs';
import {directActions,destructivePreviews} from './direct-actions.mjs';
import {verifyRequestStore} from './request-store.mjs';
import {connectGoogle} from './google.mjs';
import {createServer} from './tools.mjs';
const locks=new Map(),previews=destructivePreviews();
const authorizeAction=directActions(new URL('../.private/action-control/',import.meta.url),{verifyStore:verifyRequestStore,previews});
let apiPromise;
async function service(){
  const api=await(apiPromise??=connectGoogle().catch(error=>{apiPromise=undefined;throw error;}));
  return new EditingService(api,{locks,authorizeAction,previews});
}
serveStdio(()=>createServer(service));
