---
name: memory
description: Durable local memory for agents — store and retrieve episodic observations, semantic facts, and correction records from a SQLite substrate instead of re-deriving them every session. Use when the user says "remember this", when you need a past decision, preference, or fix, before debugging (check known corrections first), or when memory-sync surfaces a pattern worth keeping.
allowed-tools: Bash, Read
version: 0.1.0
---

# Memory

A real substrate, not a procedure: three SQLite tables
(`episodes`, `facts`, `corrections`) with FTS5 full-text search and
BM25 ranking, in one stdlib-only script. Episodes fade with age, facts
are versioned by key, corrections surface first — because re-learning
a correction is the most expensive kind of forgetting.

The database lives at `~/.agentkit/memory.db` (override with
`AGENTKIT_MEMORY_DB` or `--db`). Local only: nothing is synced,
nothing leaves the machine. See `reference/schema.md` for the data
model and ranking formula, `reference/recipes.md` for usage patterns.

## Procedure

1. **Search before you ask.** If the substrate might know — a past
   decision, a preference, a known gotcha — search before asking
   the user or guessing:

   ```
   python3 scripts/memory.py search "<keywords>" --limit 5
   ```

   Add `--kind correction|fact|episode` to narrow, `--json` for
   machine-readable output with scores. If a **correction** matches
   the task, apply it before doing anything else.

2. **Store what should survive the session.** Three kinds:

   ```
   # durable truth, keyed canonically, versioned on re-store
   python3 scripts/memory.py store --kind fact --key user.timezone \
     --text "America/Chicago" --confidence 0.9

   # timestamped observation, fades with age, prunable
   python3 scripts/memory.py store --kind episode \
     --text "chose Postgres over SQLite; reason: concurrent writers" \
     --tags decision,postgres

   # recurring mistake pattern + the fix (memory-sync writes these)
   python3 scripts/memory.py store --kind correction \
     --pattern "assumed npm when repo uses pnpm" \
     --correction "check packageManager field before running npm" \
     --context "agentkit packaging"
   ```

   Store facts, not transcripts — one durable truth per key. Storing
   the same key twice supersedes the old value; history is kept, only
   the current version is searchable.

3. **Forget what's wrong or private.** Stale and incorrect memories
   pollute ranking; delete them instead of working around them:

   ```
   python3 scripts/memory.py forget fact --key user.timezone
   python3 scripts/memory.py forget episode 42
   ```

4. **Prune on a schedule, not by accident.** `prune` only deletes
   episodes older than the cutoff, is a dry run unless `--yes` is
   passed, and never touches facts or corrections:

   ```
   python3 scripts/memory.py prune --older-than 180d
   python3 scripts/memory.py stats
   ```

## Rules

- **Corrections beat facts.** When a correction and a fact disagree,
  the correction is newer knowledge about a failure mode. Trust it.
- **Never fabricate memories.** Store only what the user said, what
  you decided together, or what actually happened. An empty search
  result is an answer: say you don't remember.
- **memory-sync is the writer, this is the store.** `memory-sync`
  mines session history for repeated patterns; its durable output for
  recurring mistakes is a `correction` record here (plus the
  CLAUDE.md / skill fix it already writes).
- **Keep keys canonical.** `user.timezone`, not `timezone` in one
  place and `user.tz` in another. Check `search` before inventing a
  new key.


## Token economy

- Search with `--limit 5` and a `--kind` filter — never broad-scan all three tables.
- Never re-read rows you already fetched — cache them in session notes.
- Store canonical keys (`user.timezone`) so future lookups resolve in one cheap query.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
