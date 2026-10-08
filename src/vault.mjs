import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const executable = fileURLToPath(new URL('../tools/vault-helper.exe', import.meta.url));
export const vaultPath = fileURLToPath(new URL('../.private/google-oauth.dpapi', import.meta.url));
export function vault(mode, value) {
  return vaultAt(mode,value,vaultPath);
}
export function vaultAt(mode, value, targetPath) {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [mode,targetPath], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 65536) child.kill(); });
    child.stderr.resume();
    child.on('error', () => reject(new Error('VAULT_OPERATION_FAILED')));
    child.on('close', code => {
      if (code !== 0) return reject(new Error('VAULT_OPERATION_FAILED'));
      try { resolve(mode === 'load' ? JSON.parse(output) : undefined); } catch { reject(new Error('VAULT_OPERATION_FAILED')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(mode === 'save' ? JSON.stringify(value) : '');
  });
}
