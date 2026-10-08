import { verifyPersonal, verifyEnrollmentScopes } from './identity.mjs';

const stages = new Set(['arguments','client_file','client_type','loopback','browser_consent','token_exchange','identity','scope','encrypted_storage']);

const codes = new Set(['ACCOUNT_CONFIGURATION_REQUIRED','EXPLICIT_APPROVAL_REQUIRED','DESKTOP_CLIENT_REQUIRED','OAUTH_TIMEOUT','OAUTH_DENIED','BROWSER_OPEN_FAILED','OFFLINE_GRANT_REQUIRED','PERSONAL_ACCOUNT_REQUIRED','GRANT_MISMATCH','VAULT_OPERATION_FAILED','ENOENT','EACCES','EADDRINUSE','invalid_grant','invalid_client','access_denied']);

export function safeEnrollmentDiagnostic(stage, error) {

  const candidate = [error?.code, error?.message, error?.response?.data?.error].find(value => typeof value === 'string' && codes.has(value));

  const code = candidate ?? (error instanceof SyntaxError ? 'INVALID_JSON' : 'FAILED');

  return `ENROLLMENT_FAILED stage=${stages.has(stage) ? stage : 'unknown'} code=${code}`;

}

export async function finishEnrollment({auth,tokens,client,nonce,requiredAccess,save,stage}) {

  stage('identity');

  if (!tokens.id_token || !tokens.refresh_token) throw new Error('OFFLINE_GRANT_REQUIRED');

  const ticket = await auth.verifyIdToken({idToken:tokens.id_token,audience:client.client_id});

  const claims = ticket.getPayload();

  try {

    verifyPersonal(claims);

    if (claims.nonce !== nonce) throw new Error('GRANT_MISMATCH');

    stage('scope');

    verifyEnrollmentScopes(tokens.scope,requiredAccess);

  } catch (error) {

    await auth.revokeToken(tokens.refresh_token).catch(() => {});

    throw error;

  }

  stage('encrypted_storage');

  await save({clientId:client.client_id,clientSecret:client.client_secret,email:claims.email.toLowerCase(),sub:claims.sub,tokens});

}

