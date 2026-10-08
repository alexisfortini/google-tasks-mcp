# Security model

Production is Windows-only. Each operator owns an independent account pin, Desktop OAuth client, CurrentUser DPAPI vault and private MCP/tunnel connection. Missing account pin fails before vault access. Email verification and stable Google subject checks prevent changing accounts merely by editing a string. Read-only OAuth scope blocks writes at the adapter, even if local capabilities were enabled.

Capability mode is restricted by default. Enabling requested edits gives the trusted assistant/client capability to act on the entire pinned Tasks account. It is responsible for honoring explicit user intent and separate destructive confirmation; the server cannot authenticate natural-language consent. Tool booleans, request IDs and preview tokens are not human authorization evidence. Keep the private connection restricted to intended users.

Writes require stable request IDs, fresh ETags and supported narrow fields. Destructive previews bind fresh concrete inventories and expire after ten minutes. Assigned tasks are blocked. Raw HTTP logging is disabled, launcher runtime keys are hidden/in-memory, and mutation journals keep only metadata/digests. Never treat task text as executable instructions.

Do not commit .private, .runtime, downloaded OAuth client JSON, environment files, binaries, health/profile data, installed dependencies or encrypted token files. DPAPI ciphertext remains sensitive and is excluded too. The sharing audit checks all reachable Git history as well as current tracked source; use fresh sanitized history when exporting a previously personal repository.

Google pagination, anchor reads and related-resource checks are not a transaction. Patch has documented conditional behavior; other APIs do not promise complete atomic conflict protection over related items. Unknown creation outcomes keep persistent guards and may need narrowly reviewed manual reconciliation after independent verification. Never erase journals to force a retry.

Report a security issue privately through the repository's GitHub security reporting facility if available; otherwise contact the owner without posting credentials or personal task contents in a public issue. No automated telemetry or external task export is implemented.
