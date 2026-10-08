# Tools

Readonly tools: list_tasklists, get_tasklist, list_tasks, get_task, prepare_destructive_action, get_request_outcome.

Versioned mutation tools: create_tasklist_v2, rename_tasklist_v2, delete_tasklist_v2, create_task_v2, edit_task_v2, complete_task_v2, reopen_task_v2, move_task_v2, delete_task_v2, clear_completed_v2. No mutable legacy aliases are advertised.

All mutation inputs require requestId. Targeted edits require an expectedEtag from a fresh read. Field patches accept title, notes and due only; clear notes with an empty string and clear date with due:null. No null-notes transport field is advertised. Do not inject unsupported reminder/time/category fields.

Create supports parentTaskId/previousTaskId and corresponding anchor ETags. Move requires explicit parentTaskId and previousTaskId: null means top-level and first-sibling respectively. It binds destination list ETag and reviewed descendants. allowDuplicate:true is only for an explicitly requested matching new task, never a blind retry.

For task/list deletion or hiding completed tasks, preview action tags are delete_task, delete_tasklist and clear_completed (without the version suffix). Preview returns fresh ETags, exact inventories and a ten-minute token. Show the affected items and get separate user confirmation before calling the `_v2` mutation. The token binds preview state; it does not attest human consent. Assigned tasks are refused. clear_completed hides completed tasks; it does not delete them.

Successful mutations return their stable requestId and requestRecorded:true after journal persistence. Resolving a preexisting list performs no mutation and may return requestRecorded:false. A rejected/uncertain call must not be retried with a new ID. Consult get_request_outcome, fresh Google state and the conflict/recovery guidance.
