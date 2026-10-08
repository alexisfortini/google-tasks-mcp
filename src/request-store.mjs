import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {TaskError} from './core.mjs';
const run=promisify(execFile);
export async function verifyRequestStore(){
  try{
    const result=await run(fileURLToPath(new URL('../connection/request-store.exe',import.meta.url)),['--check'],{windowsHide:true,timeout:5000,maxBuffer:1024});
    if(result.stdout.trim()!=='REQUEST_STORE_CHECK_PASS')throw Error();
  }catch{throw new TaskError('REQUEST_STORE_REQUIRED');}
}
