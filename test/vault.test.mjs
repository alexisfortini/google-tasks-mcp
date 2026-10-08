import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {vaultAt} from '../src/vault.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('Windows helper persists encrypted synthetic data with restricted ACL and works without PowerShell scripts',{skip:process.platform!=='win32'},async()=>{
  const project=fileURLToPath(new URL('../',import.meta.url));
  const directory=await mkdtemp(path.join(project,'vault-test-'));
  const target=path.join(directory,'synthetic.dpapi');
  try {
    const first={synthetic:'NONSECRET_SYNTHETIC_FIRST'};
    await vaultAt('save',first,target);
    assert.deepEqual(await vaultAt('load',null,target),first);
    assert.equal((await readFile(target)).includes(Buffer.from(first.synthetic)),false);
    const second={synthetic:'NONSECRET_SYNTHETIC_SECOND'};
    await vaultAt('save',second,target);
    assert.deepEqual(await vaultAt('load',null,target),second);
    const command = "$acl=[IO.Directory]::GetAccessControl($env:AXS_VAULT_TEST_DIRECTORY); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])); if ($acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $sid.Value -and $rules[0].AccessControlType.ToString() -eq 'Allow' -and $rules[0].FileSystemRights.ToString() -eq 'FullControl') { 'RESTRICTED_ACL_PASS' } else { exit 1 }";
    const result=await promisify(execFile)('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:{...process.env,AXS_VAULT_TEST_DIRECTORY:directory}});
    assert.equal(result.stdout.trim(),'RESTRICTED_ACL_PASS');
  } finally {
    assert.equal(path.dirname(directory),path.resolve(project));
    await rm(directory,{recursive:true,force:true});
  }
});
