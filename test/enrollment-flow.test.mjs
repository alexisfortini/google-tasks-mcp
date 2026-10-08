import test from 'node:test';
import assert from 'node:assert/strict';
import {finishEnrollment,safeEnrollmentDiagnostic} from '../src/enrollment-flow.mjs';
import {READ_SCOPES,WRITE_SCOPES,PERSONAL_EMAIL} from '../src/identity.mjs';
function fixture() {
  const events=[]; const saved=[]; const revoked=[];
  const claims={email:PERSONAL_EMAIL,email_verified:true,sub:'mock-sub',nonce:'mock-nonce'};
  return {events,saved,revoked,claims,args:{
    auth:{verifyIdToken:async()=>({getPayload:()=>claims}),revokeToken:async value=>revoked.push(value)},
    tokens:{id_token:'mock-id',refresh_token:'mock-refresh',scope:READ_SCOPES.join(' ')},
    client:{client_id:'mock-client',client_secret:'mock-secret'},nonce:'mock-nonce',requiredAccess:'read',
    save:async value=>saved.push(value),stage:value=>events.push(value)
  }};
}
test('diagnostics emit only fixed stages and allowlisted codes, never arbitrary exception data',()=>{
  const secret='SECRET_TOKEN https://example.test/?code=PRIVATE';
  assert.equal(safeEnrollmentDiagnostic(secret,{message:secret,code:secret,response:{data:{error:secret}}}),'ENROLLMENT_FAILED stage=unknown code=FAILED');
  assert.equal(safeEnrollmentDiagnostic('token_exchange',{response:{data:{error:'invalid_client',error_description:secret}}}),'ENROLLMENT_FAILED stage=token_exchange code=invalid_client');
  assert.equal(safeEnrollmentDiagnostic('client_file',new SyntaxError(secret)),'ENROLLMENT_FAILED stage=client_file code=INVALID_JSON');
  assert.equal(safeEnrollmentDiagnostic('client_file',{code:'ENOENT',path:secret}),'ENROLLMENT_FAILED stage=client_file code=ENOENT');
});
test('mock read-only enrollment verifies identity and scope before protected save',async()=>{
  const f=fixture(); f.args.tokens.scope='  openid\t email\nhttps://www.googleapis.com/auth/tasks.readonly  ';
  await finishEnrollment(f.args);
  assert.deepEqual(f.events,['identity','scope','encrypted_storage']);
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].email,PERSONAL_EMAIL);assert.equal(f.revoked.length,0);
});
test('mock wrong-account and nonce failures revoke only new mock grant and never save',async()=>{
  for(const change of [{email:'wrong@example.test'},{nonce:'wrong'}]){
    const f=fixture();Object.assign(f.claims,change);
    await assert.rejects(finishEnrollment(f.args));assert.equal(f.saved.length,0);assert.deepEqual(f.revoked,['mock-refresh']);
  }
});
test('mock missing offline grant and unexpectedly broad scope cannot save',async()=>{
  const missing=fixture();delete missing.args.tokens.refresh_token;
  await assert.rejects(finishEnrollment(missing.args),/OFFLINE_GRANT_REQUIRED/);assert.equal(missing.saved.length,0);
  const broad=fixture();broad.args.tokens.scope=WRITE_SCOPES.join(' ');
  await assert.rejects(finishEnrollment(broad.args),/GRANT_MISMATCH/);assert.equal(broad.saved.length,0);assert.equal(broad.events.at(-1),'scope');
});
test('mock storage failure preserves safe stage without reporting exception details',async()=>{
  const f=fixture();f.args.save=async()=>{throw new Error('VAULT_OPERATION_FAILED');};
  await assert.rejects(finishEnrollment(f.args),error=>safeEnrollmentDiagnostic(f.events.at(-1),error)==='ENROLLMENT_FAILED stage=encrypted_storage code=VAULT_OPERATION_FAILED');
});
