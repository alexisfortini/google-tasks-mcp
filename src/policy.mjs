import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export function policyStore(target) {
  return {
    async read() {
      try { return JSON.parse(await readFile(target, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async bind(policy, field, value) {
      const current = JSON.parse(await readFile(target, 'utf8'));
      if (JSON.stringify(current) !== JSON.stringify(policy)) throw new Error('POLICY_CHANGED');
      if (field === 'tasklistId' && current.tasklistId && current.tasklistId !== value) throw new Error('POLICY_CHANGED');
      if (field === 'allowedCompletionTaskIds' && (current.completeCreatedTask !== true || !Array.isArray(value) || value.length !== 1 || (current[field]?.length && JSON.stringify(current[field]) !== JSON.stringify(value)))) throw new Error('POLICY_CHANGED');
      if (!['tasklistId', 'allowedCompletionTaskIds'].includes(field)) throw new Error('POLICY_CHANGED');
      const temporary = new URL('./write-policy-' + randomUUID() + '.tmp', target);
      try {
        await writeFile(temporary, JSON.stringify({...current, [field]: value}) + '\n', {flag:'wx'});
        await rename(temporary, target);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
  };
}
