// Prepare code only. Running this requires separate user approval for the persistent Google grant.

import http from 'node:http';

import { randomBytes } from 'node:crypto';

import { spawn } from 'node:child_process';

import { readFile } from 'node:fs/promises';

import path from 'node:path';

import { OAuth2Client } from 'google-auth-library';

import { PERSONAL_EMAIL, enrollmentProfile } from './identity.mjs';

import { finishEnrollment, safeEnrollmentDiagnostic } from './enrollment-flow.mjs';

import { vault } from './vault.mjs';

let currentStage = 'arguments';

const stage = value => { currentStage = value; };

async function enroll() {

  if (!PERSONAL_EMAIL) throw new Error('ACCOUNT_CONFIGURATION_REQUIRED');
  const enrollment = enrollmentProfile(process.argv.slice(2));

  stage('client_file');

  const input = JSON.parse(await readFile(enrollment.clientPath, 'utf8'));

  stage('client_type');

  if (!input.installed?.client_id || !input.installed?.client_secret) throw new Error('DESKTOP_CLIENT_REQUIRED');

  const client = input.installed;

  const state = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');

  const server = http.createServer();

  stage('loopback');

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

  const redirectUri = 'http://127.0.0.1:' + server.address().port + '/oauth/callback';

  const auth = new OAuth2Client(client.client_id, client.client_secret, redirectUri);

  const pkce = await auth.generateCodeVerifierAsync();

  const url = auth.generateAuthUrl({ access_type: 'offline', scope: enrollment.scopes, state, nonce, prompt: 'consent select_account', login_hint: PERSONAL_EMAIL, code_challenge: pkce.codeChallenge, code_challenge_method: 'S256', include_granted_scopes: false });

  try {

    stage('browser_consent');

    const code = await new Promise((resolve, reject) => {

      const timer = setTimeout(() => reject(new Error('OAUTH_TIMEOUT')), 180000);

      server.on('request', (request, response) => {

        const callback = new URL(request.url, redirectUri);

        if (request.method !== 'GET' || callback.pathname !== '/oauth/callback' || callback.searchParams.get('state') !== state) {

          response.writeHead(400, { 'Cache-Control': 'no-store' }); response.end('Invalid authorization response.'); return;

        }

        clearTimeout(timer);

        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });

        response.end('Return to the desktop. Account verification is still in progress.');

        if (callback.searchParams.has('error') || !callback.searchParams.get('code')) reject(new Error('OAUTH_DENIED'));

        else resolve(callback.searchParams.get('code'));

      });

      // Use a fixed Windows shell executable; the OAuth URL remains data, not shell code.

      const opener = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' });

      opener.on('error', () => { clearTimeout(timer); reject(new Error('BROWSER_OPEN_FAILED')); });

    });

    stage('token_exchange');

    const { tokens } = await auth.getToken({ code, codeVerifier: pkce.codeVerifier, redirect_uri: redirectUri });

    await finishEnrollment({auth,tokens,client,nonce,requiredAccess:enrollment.requiredAccess,save:value => vault('save',value),stage});

    process.stdout.write(enrollment.requiredAccess === 'read' ? 'Personal read-only Google authorization stored securely. Writes are blocked.\n' : 'Personal Google authorization stored securely. Writes remain disabled until capability configuration is explicitly enabled.\n');

  } finally { server.closeAllConnections(); server.close(); }

}

enroll().catch(error => { process.stderr.write(safeEnrollmentDiagnostic(currentStage,error) + '\n'); process.exitCode = 1; });

