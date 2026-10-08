import {readFileSync} from 'node:fs';
import {TaskError} from './core.mjs';
export function normalizeAccount(value){
  if(typeof value!=='string'||value.length>254||!/^\S+@\S+\.\S+$/.test(value)||/[\r\n\x00]/.test(value))throw new TaskError('ACCOUNT_CONFIGURATION_REQUIRED');
  return value.toLowerCase();
}
export function configuredAccount(){
  const explicit=process.env.GOOGLE_TASKS_ACCOUNT_EMAIL;
  if(explicit!==undefined)return normalizeAccount(explicit);
  try{return normalizeAccount(JSON.parse(readFileSync(new URL('../.private/account.json',import.meta.url),'utf8')).personalEmail);}
  catch(error){if(error.code==='ENOENT')return null;throw new TaskError('ACCOUNT_CONFIGURATION_REQUIRED');}
}
