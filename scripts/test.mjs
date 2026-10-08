import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const tests=readdirSync(resolve(root,'test')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'test/'+name);
// Synthetic account only. No actual account configuration or OAuth grant is used by tests.
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit',env:{...process.env,GOOGLE_TASKS_ACCOUNT_EMAIL:'personal@example.com'}});
process.exitCode=result.status??1;
