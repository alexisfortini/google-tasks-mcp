# Google Tasks Desktop MCP

A private Google Tasks MCP server for an always-on Windows desktop. Connect an assistant directly over stdio or through OpenAI Secure MCP Tunnel; routine reads and edits need no delegated desktop worker. Each operator configures their own Google account, OAuth client and private connection.

Version 0.4.0 exposes 16 tools, including task/list edits, subtasks, native moves, destructive previews and durable mutation receipts. It defaults to read-only access. **Windows is required for production credential storage**; pure/mock tests also run on Linux. This source snapshot has no open-source license selected yet; see [Licensing](#licensing).

## What it supports

| Capability | Behavior |
| --- | --- |
| Lists / categories | Read, create or resolve by exact name, rename, confirmed deletion. Categories are named lists, not native labels. |
| Task details | Create and edit title/notes. Empty notes/title clears text; due:null clears the scheduled day. |
| Dates | YYYY-MM-DD only. Google's due field represents the scheduled calendar day; it is not a time or deadline. |
| Completion | Complete or reopen with fresh ETags; reopening clears the completion timestamp. |
| Hierarchy | Create subtasks, move under a parent or back to top level, and reorder siblings. |
| Moving | Native cross-list move; never a copy/delete substitute. Google disallows recurring cross-list moves and repeating/assigned subtasks. |
| Destructive actions | Fresh preview of affected items, separate user confirmation, then guarded delete or hide completed tasks. |
| Recovery | Stable request IDs, durable journals, duplicate checks and get_request_outcome after a lost response. |

No scheduled times, reminders, recurrence settings, native tags/colors/priorities or arbitrary task fields are exposed by Google's API. Assigned Docs/Chat Spaces tasks are blocked for writes to avoid changing their original surfaces. Google enforces additional subtask limits. See [API limitations](docs/API-LIMITS.md).

## Install and configure

Requirements: Git, Node 22 or 24, pnpm 10.32.1, Windows x64 with the .NET Framework compiler for production. Dependencies are pinned in pnpm-lock.yaml. The repository contains source only; no credentials, binaries, installed modules or tunnel profile are bundled.

```powershell
pnpm install --frozen-lockfile
pnpm build:windows
pnpm configure --account-email you@example.com
pnpm test
```

Use your actual intended personal Google address in the configure command. It creates an ignored account pin and **restricted** capability configuration. It does not create a Google grant, change network settings, start a tunnel or install a service. An environment variable GOOGLE_TASKS_ACCOUNT_EMAIL can provide the same explicit pin; an absent/malformed pin fails closed before credentials are loaded.

### Authorize Google

Follow [Google OAuth setup](docs/GOOGLE-OAUTH.md) to create your own Desktop OAuth client, enable Tasks API and consent to read-only offline access. Keep downloaded client JSON in .private/client.json. Do not reuse someone else's credentials.

```powershell
node src/enroll.mjs --approved-google-grant .private/client.json
```

The browser selects the configured account. PKCE, state, nonce, verified email and stable Google subject checks bind the grant; refresh data is stored using Windows CurrentUser DPAPI and protected directory permissions. A Google read-only grant blocks all adapter writes. External Testing grants containing Tasks can expire after seven days.

### Enable requested edits, deliberately

This requires both a full Tasks Google grant and explicit local capability enablement. Google scope is account-wide; it cannot be limited to one category/list.

```powershell
node src/enroll.mjs --approved-google-grant .private/client.json --write-access
pnpm configure --account-email you@example.com --replace-account-confirmed --enable-requested-edits
```

Do this only when you approve ongoing editing of the pinned account. No task/list migration or test mutation runs automatically. You can revoke expanded edits by setting mode=restricted or removing operations in the ignored capability configuration.

**Consent trust boundary:** the trusted assistant/client performs only the user's explicit requests/approvals and obtains separate confirmation before deletion or bulk hiding. The server enforces account, capability, freshness, preview binding and retry controls; it cannot prove a human approved a request. A boolean, request ID or preview token is not human-consent evidence. Read [Security](SECURITY.md).

## Connect an assistant

A local stdio client can launch `node src/server.mjs`. A cloud ChatGPT connection needs a supported private tunnel route or another authenticated deployment; a local Codex entry alone does not connect a cloud chat.

[Secure tunnel setup](docs/TUNNEL.md) describes the private outbound route, masked runtime-key launcher and workspace requirements. It uses your own tunnel and key, has no public unauthenticated ingress and requires no paid middleware. OpenAI account/product permissions and pricing are separate from this project.

After changing server metadata: restart your server, refresh the connection on ChatGPT web, confirm the schema, then use a new conversation and re-test. Existing tool names can retain incompatible cached connector schemas. Versioned write names ending in `_v2`, required requestId and server receipts prevent a missing retry key from silently bypassing safeguards. See [Troubleshooting](docs/TROUBLESHOOTING.md). Versioned schema behavior is verified with the real SDK and mocks; cloud caching behavior still needs validation in each target account.

## Direct workflow

1. Read the current task/list ETags and relevant anchors.
2. Execute only the requested edit through a `_v2` tool, with one stable requestId per concrete action. Mutation results echo that ID and requestRecorded:true after durable journaling. Resolving an already-existing list performs no mutation and can return requestRecorded:false.
3. For deletion or bulk hiding, call prepare_destructive_action, show the concrete effect/items to the user, obtain separate confirmation, then send the returned arguments/token to the matching `_v2` tool.
4. On conflict, read fresh state and review the proposed change. On an uncertain result, keep the request ID, read get_request_outcome and Google state, and never blind-retry under a new ID.

Tool reference: [TOOLS.md](docs/TOOLS.md). Raw HTTP logging is disabled. Journals store digests and safe identifiers, not task text or credentials. They are not task migration/export files.

## Tests and sharing checks

```powershell
pnpm test
pnpm audit:share
```

Tests are offline and use a synthetic account and mocks; the Windows vault test stores only synthetic data. CI runs Windows/Linux with Node 22/24, no account credentials and read-only workflow permissions. Audit scans tracked files plus every reachable Git commit. Source review and pattern scanning help prevent accidental exposure, but are not a mathematical absence proof.

No real-account tests or destructive tests run in CI. A human operator may explicitly create isolated test lists for live validation and separately confirm their deletion/clearing. Preserve unrelated tasks.

### Validation status

The preceding v0.3 server was exercised through a real private cloud connection against isolated lists: list/task creation, list rename, note clearing with an empty string, scheduled-date clearing with null, subtask creation, completion/reopening, promotion/reordering and native cross-list movement preserving task identity passed with readbacks. The note-clearing request also had its exact request ID confirmed in the durable journal. Destructive operations have mock coverage; live deletion and bulk hiding are not yet confirmed. This does not establish cloud invocation compatibility for the new v0.4 tool names: those pass SDK/mock tests and require deployment, connection refresh and fresh-conversation validation.

## Licensing

The owner has not selected a license. package.json is marked UNLICENSED and no LICENSE grant is added on the owner's behalf. Choose and add a license before describing this project as open source or inviting unrestricted reuse. [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) explains the distinction. Dependency licenses are listed separately in [THIRD-PARTY.md](THIRD-PARTY.md).
