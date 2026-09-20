# Keep vs. drop

A checkpoint is a resumption kit, not a log. Keep what lets the next
session act without re-reading history; drop everything else.

| Keep | Example | Drop | Example |
|---|---|---|---|
| Decisions + reasons | "Chose Postgres over SQLite — concurrent writers" | Full transcripts | 40 turns of exploratory questions |
| File paths + identifiers | `skills/memory/scripts/memory.py`, PR #42, key `user.timezone` | Dead-end explorations | "Tried X, reverted, tried Y" with no lesson |
| Error signatures | `sqlite3.OperationalError: no such table: episodes` | Raw tool output | Pasting whole test output; keep the one failing line |
| Current state (done / in flight) | "Auth wired, tests green; deploy script half-written" | Repeated confirmations | "User agreed" noted 3 times in 3 ways |
| Open threads + next action | "Blocker: needs API key → ask user" | Resolved threads | Anything already done and superseded |
| Canonical memory keys touched | `proj.agentkit.checkpoint` — refreshed after refactor | Stale keys | Old checkpoint versions, replaced facts |
| Constraints handed down | "Do not cancel subscriptions without approval" | Speculation | "Might need to scale later" with no decision |

## Tests

- Every claim survives deletion of the transcript: if you can only
  resume by re-reading history, the checkpoint failed.
- If a line doesn't change what the next session does, delete it.
- Reasons outrank decisions: a decision without its reason is trivia.
- Prefer pointers over content: link the file, quote the error, cite
  the key — never inline the whole thing.
