import { google } from 'googleapis';

import { OAuth2Client } from 'google-auth-library';

import { TaskError } from './core.mjs';

import { vault } from './vault.mjs';

import { PERSONAL_EMAIL, verifyPersonal, verifyScopes } from './identity.mjs';

export async function connectGoogle() {

  if (!PERSONAL_EMAIL) throw new TaskError('ACCOUNT_CONFIGURATION_REQUIRED');
  const saved = await vault('load');

  if (saved.email !== PERSONAL_EMAIL || !saved.tokens?.refresh_token || !saved.clientId || !saved.clientSecret || !saved.sub) throw new TaskError('AUTHORIZATION_REQUIRED');

  const tasksAccess = verifyScopes(saved.tokens.scope);

  const auth = new OAuth2Client(saved.clientId, saved.clientSecret);

  auth.setCredentials(saved.tokens);

  let persistence = Promise.resolve();

  let persistenceFailed = false;

  auth.on('tokens', tokens => {

    saved.tokens = { ...saved.tokens, ...tokens };

    persistence = persistence.then(() => vault('save', saved)).catch(() => { persistenceFailed = true; });

  });

  // Userinfo belongs to the freshly obtained access token, so a stored email cannot bypass restriction.

  const profile = await auth.request({ url: 'https://openidconnect.googleapis.com/v1/userinfo', retry: false, timeout: 15000 });

  verifyPersonal(profile.data);

  if (profile.data.sub !== saved.sub) throw new TaskError('PERSONAL_ACCOUNT_REQUIRED');

  const tasks = google.tasks({ version: 'v1', auth });

  async function beforeCall() {

    await persistence;

    if (persistenceFailed) throw new TaskError('AUTHORIZATION_REQUIRED');

  }

  return createTasksAdapter(tasks, { tasksAccess, beforeCall });

}

export function createTasksAdapter(tasks, { tasksAccess, beforeCall = async () => {} }) {

  if (!['read','write'].includes(tasksAccess)) throw new TaskError('AUTHORIZATION_REQUIRED');

  const requestOptions = { retry: false, timeout: 15000 };

  async function call(operation, write = false) {

    if (write && tasksAccess !== 'write') throw new TaskError('READ_ONLY_GRANT');

    await beforeCall();

    return (await operation()).data;

  }

  return {

    canWrite: tasksAccess === 'write',

    listTasklists: params => call(() => tasks.tasklists.list(params, requestOptions)),

    getTasklist: tasklist => call(() => tasks.tasklists.get({ tasklist }, requestOptions)),

    insertTasklist: requestBody => call(() => tasks.tasklists.insert({requestBody},requestOptions),true),

    listTasks: params => call(() => tasks.tasks.list(params, requestOptions)),

    getTask: (tasklist, task) => call(() => tasks.tasks.get({ tasklist, task }, requestOptions)),

    insertTask: (tasklist, requestBody, placement = {}) => call(() => tasks.tasks.insert({ tasklist, requestBody, ...placement }, requestOptions), true),

    patchTasklist: (tasklist, requestBody, etag) => call(() => tasks.tasklists.patch({tasklist, requestBody}, {...requestOptions, headers: {'If-Match': etag}}), true),

    deleteTasklist: (tasklist, etag) => call(() => tasks.tasklists.delete({tasklist}, {...requestOptions, headers: {'If-Match': etag}}), true),

    deleteTask: (tasklist, task, etag) => call(() => tasks.tasks.delete({tasklist, task}, {...requestOptions, headers: {'If-Match': etag}}), true),

    clearCompleted: (tasklist, etag) => call(() => tasks.tasks.clear({tasklist}, {...requestOptions, headers: {'If-Match': etag}}), true),

    moveTask: (params, etag) => call(() => tasks.tasks.move(params, {...requestOptions, headers: {'If-Match': etag}}), true),

    patchTask: (tasklist, task, requestBody, etag) => call(() => tasks.tasks.patch({ tasklist, task, requestBody }, { ...requestOptions, headers: { 'If-Match': etag } }), true)

  };

}

