import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const root=resolve(import.meta.dirname,'..');
const compiler=join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!existsSync(compiler))throw Error('DOTNET_FRAMEWORK_COMPILER_REQUIRED');
mkdirSync(join(root,'tools'),{recursive:true});
for(const [source,target,extra] of [['src/VaultHelper.cs','tools/vault-helper.exe',['/reference:System.Security.dll']],['connection/RequestStore.cs','connection/request-store.exe',[]],['connection/ForegroundTunnel.cs','connection/foreground-tunnel.exe',[]]]){
  execFileSync(compiler,['/nologo','/target:exe','/out:'+join(root,target),...extra,join(root,source)],{cwd:root,stdio:'inherit',windowsHide:true});
}
console.log('WINDOWS_HELPERS_BUILT_NO_CONFIGURATION_OR_GRANT_CREATED');
