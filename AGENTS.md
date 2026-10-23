# Madar shared working directory

Use this existing checkout for Madar development and GitHub Desktop:
`/Users/abeer/Documents/GitHub/madar`

The old Codex staging folder is preserved for recovery, not active development.
Keep native account, portal, survey and database behavior unchanged unless requested.
Never stage runtime config, secrets, logs, uploaded files or user data.
Never force push, delete user work, or deploy to hosting during GitHub publishing.
After implementation, report review-ready changes. Commit and push only when the user explicitly chooses to publish.
Run `scripts/github-publish.py` with the bundled Python for a read-only check.
The manual launcher `رفع مدار إلى GitHub.command` performs checks and asks for confirmation before commit and push.
If GitHub has new commits or branches diverge, stop; preserve working changes and resolve with the user before integrating.
