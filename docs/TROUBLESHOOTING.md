# Troubleshooting

| Symptom | Check |
| --- | --- |
| ACCOUNT_CONFIGURATION_REQUIRED | Configure your own address or explicit account environment variable before enrollment/use. Empty/malformed values are rejected. |
| PERSONAL_ACCOUNT_REQUIRED / AUTHORIZATION_REQUIRED | The freshly verified account/subject or saved grant does not match the pin, or the grant expired/revoked. Do not borrow another connector's tokens. |
| READ_ONLY_GRANT | Full Tasks consent is absent. Enabling local capabilities alone cannot bypass read-only Google scope. |
| WRITES_DISABLED | Default restricted mode, disabled operation, absent capability file or mismatched account. |
| REQUEST_STORE_REQUIRED | Build Windows helpers and check the action-control directory owner-only ACL under the same desktop user. |
| REQUEST_ID_REQUIRED or client drops requestId | Do not proceed. Use the versioned `_v2` names and refresh/reconnect metadata. Missing IDs fail before mutation. |
| Notes clearing rejected as nullable | This version advertises string notes only; use notes:"". Date clearing uses due:null. Do not rely on a nullable-notes cached schema. |
| Connector catalog differs from argument validation | Restart server, Refresh the custom connection on ChatGPT web, confirm names/required fields, then start a new conversation. Catalog display alone does not prove the invocation validator refreshed. |
| Returned request ID missing/mismatched | Stop and inspect get_request_outcome and current Google state. Do not claim retry/idempotency transport was verified. |
| CONFLICT_READ_AGAIN | Re-read and review the requested patch; do not overwrite an intervening edit blindly. |
| CREATE_DUPLICATE_REVIEW_REQUIRED | A matching task or known matching creation exists. allowDuplicate is for explicit duplicate intent, never retry recovery. |
| REQUEST_ALREADY_ATTEMPTED_READ_OUTCOME / CREATION_OUTCOME_UNKNOWN_READ_FIRST | Read outcome/Google state. Keep the ID; never delete guards or change ID to blind-retry. Exceptional unresolved outcomes may require targeted local reconciliation. |
| FRESH_DESTRUCTIVE_PREVIEW_REQUIRED | Prepare again, show current affected items and obtain separate confirmation before execution. Tokens expire or are consumed once. |
| No tunnel in ChatGPT | Check account custom-MCP availability, correct organization/workspace association and Tunnels Read+Use. A local stdio client alone does not connect the cloud chat. |
| Doctor/health passes but tools fail | Keep the foreground client alive; verify actual discovery/read and schema behavior. Local readiness is not end-to-end proof. |

The library/mock suite verifies current schemas, required retry IDs, receipt behavior and empty-string clearing. It does not control proprietary connector caches. Versioned names prevent dependence on an old same-name schema, but each target cloud account still needs a fresh discovery and invocation test.
