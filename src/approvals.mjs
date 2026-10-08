// Shared schema utilities. No tool or local issuer manufactures per-request human approval.
export const OPERATIONS=['createTasklist','renameTasklist','deleteTasklist','createTask','editTask','completeTask','reopenTask','moveTask','deleteTask','clearCompleted'];
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
