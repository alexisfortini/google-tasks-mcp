import { TaskError } from './core.mjs';

import {configuredAccount} from './account.mjs';
export const PERSONAL_EMAIL = configuredAccount();

export const READ_SCOPES = ['openid','email','https://www.googleapis.com/auth/tasks.readonly'];

export const WRITE_SCOPES = ['openid','email','https://www.googleapis.com/auth/tasks'];

export const SCOPES = READ_SCOPES;

export function enrollmentProfile(args) {

  if (args[0] !== '--approved-google-grant' || !args[1] || args.length > 3 || (args[2] !== undefined && args[2] !== '--write-access')) throw new TaskError('EXPLICIT_APPROVAL_REQUIRED');

  const writeAccess = args[2] === '--write-access';

  return { clientPath: args[1], requiredAccess: writeAccess ? 'write' : 'read', scopes: writeAccess ? WRITE_SCOPES : READ_SCOPES };

}

export function verifyPersonal(claims) {

  if (!PERSONAL_EMAIL) throw new TaskError('ACCOUNT_CONFIGURATION_REQUIRED');
  if (typeof claims?.email !== 'string' || claims.email.toLowerCase() !== PERSONAL_EMAIL || claims?.email_verified !== true || typeof claims?.sub !== 'string' || !claims.sub) throw new TaskError('PERSONAL_ACCOUNT_REQUIRED');

}

export function verifyScopes(scopeText, requiredAccess = 'read') {

  const scopes = new Set((scopeText ?? '').trim().split(/\s+/));

  const access = scopes.has('https://www.googleapis.com/auth/tasks') ? 'write' : scopes.has('https://www.googleapis.com/auth/tasks.readonly') ? 'read' : null;

  if (!access || !scopes.has('openid') || !(scopes.has('email') || scopes.has('https://www.googleapis.com/auth/userinfo.email')) || !['read','write'].includes(requiredAccess) || (requiredAccess === 'write' && access !== 'write')) throw new TaskError('GRANT_MISMATCH');

  return access;

}

export function verifyEnrollmentScopes(scopeText, requiredAccess) {

  const access = verifyScopes(scopeText, requiredAccess);

  if (access !== requiredAccess) throw new TaskError('GRANT_MISMATCH');

  return access;

}

