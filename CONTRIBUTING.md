# Contributing

Start from a clean clone and use the pinned lockfile. On Windows run the helper build, then the offline test suite. Pure/mock tests run on Linux; production vault/tunnel support remains Windows-only.

Keep Google account/client/grant and tunnel data local and ignored. Use example.com/test fixture accounts. Never add real task contents or production credentials to tests, CI variables, examples, logs, issues or commits. Run the full-history sharing audit before pushing.

Preserve the account pin, default read-only mode, requested-action consent boundary, separate destructive confirmation, fresh ETags and stable request-ID guards. Version changed mutation schemas rather than quietly relying on connector caches. Add contract tests for missing/rewritten fields and assert no mutation occurs on validation/conflict failure.

No real-account mutations run in CI. Live testing must use explicitly approved isolated lists and separately confirmed destruction. Avoid unrelated data changes. Do not change licensing without the owner's explicit choice.
