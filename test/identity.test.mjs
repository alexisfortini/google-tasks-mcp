import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPersonal, verifyScopes, verifyEnrollmentScopes, enrollmentProfile, READ_SCOPES, WRITE_SCOPES } from '../src/identity.mjs';
test('only verified intended personal account is accepted', () => {
  verifyPersonal({email:'personal@example.com',email_verified:true,sub:'personal'});
  for (const claims of [{email:'other@example.com',email_verified:true,sub:'x'},{email:'work@example.com',email_verified:true,sub:'x'},{email:'personal@example.com',email_verified:false,sub:'x'},{email:'personal@example.com',email_verified:true}]) assert.throws(() => verifyPersonal(claims),/PERSONAL_ACCOUNT_REQUIRED/);
});
test('granted scopes must include Tasks, OpenID, and verified email alias', () => {
  verifyScopes('openid email https://www.googleapis.com/auth/tasks');
  verifyScopes('openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/tasks');
  assert.equal(verifyScopes('openid email https://www.googleapis.com/auth/tasks.readonly'),'read');
  assert.equal(verifyScopes('openid email https://www.googleapis.com/auth/tasks'),'write');
  assert.throws(() => verifyScopes('openid email https://www.googleapis.com/auth/tasks.readonly','write'),/GRANT_MISMATCH/);
  for (const scopes of ['', 'openid email', 'https://www.googleapis.com/auth/tasks.readonly openid']) assert.throws(() => verifyScopes(scopes),/GRANT_MISMATCH/);
});
test('first enrollment defaults read-only and broader scope requires an explicit option', () => {
  const first = enrollmentProfile(['--approved-google-grant','local.json']);
  assert.deepEqual(first.scopes,READ_SCOPES);
  assert.equal(first.requiredAccess,'read');
  const future = enrollmentProfile(['--approved-google-grant','local.json','--write-access']);
  assert.deepEqual(future.scopes,WRITE_SCOPES);
  assert.equal(future.requiredAccess,'write');
  assert.equal(verifyEnrollmentScopes(READ_SCOPES.join(' '),'read'),'read');
  assert.throws(()=>verifyEnrollmentScopes(WRITE_SCOPES.join(' '),'read'),/GRANT_MISMATCH/);
  assert.throws(()=>verifyEnrollmentScopes(READ_SCOPES.join(' '),'write'),/GRANT_MISMATCH/);
  for (const args of [[],['--approved-google-grant'],['--approved-google-grant','local.json','--typo'],['--approved-google-grant','local.json','--write-access','extra']]) assert.throws(()=>enrollmentProfile(args),/EXPLICIT_APPROVAL_REQUIRED/);
});
