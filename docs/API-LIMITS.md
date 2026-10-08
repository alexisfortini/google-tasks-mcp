# API limits and semantics

Google Tasks API offers list/task CRUD, completion status and native task moves. This server uses narrow patches rather than replacement updates. Named lists can act as categories; native labels, colors, priorities and star settings are absent from current public task schema.

Due is a scheduled YYYY-MM-DD calendar day, not a deadline or time-of-day. The API cannot read or write the scheduled time. This server rejects timestamps rather than truncating them. Reminder and recurrence rule fields are unavailable. Native completion may have Google's own effects on a task previously made recurring in a first-party client; recurrence metadata is not exposed.

Subtask parent/position fields are readonly in resource bodies. Use insert/move query parameters. Google documents up to 2,000 subtasks per task; assigned/repeating tasks cannot be parents or subtasks, completed-hidden tasks cannot be nested and recurrent tasks cannot move across lists. Further server-side constraints remain authoritative; no unsupported behavior is emulated.

Deletion of assigned Docs/Chat Spaces tasks can delete their original assignment surfaces too, so this implementation blocks all assigned-task mutations and list deletion when an assigned task is present. Deleting a parent may affect descendants; preview and confirmation include the full currently visible descendant inventory. Clear completed hides tasks and does not delete them; the API has no direct unhide field write.

Concurrent external edits can occur between related reads and mutation. Fresh ETags, If-Match headers, serialized local writes, preview binding and inventories reduce risk but do not form a multi-resource transaction.

Official references: [current discovery](https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest), [Task resource](https://developers.google.com/tasks/reference/rest/v1/tasks), [move](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/move), [task deletion](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/delete), [list deletion](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/delete), [patch semantics](https://developers.google.com/workspace/tasks/performance).
