---
name: context-compressor
description: Keep long agent sessions useful under context pressure via disciplined summarization checkpoints — goal, decisions with reasons, current state, open threads, memory keys touched, each under 40 lines. Use when a session is getting long, before compaction or a risky multi-step run, at task boundaries, or before handing work off to another agent.
version: 0.1.0
allowed-tools: Bash, Read
---

# Context Compressor

Checkpoints are resumption kits, not logs. A good one lets the next
session act without re-reading history. The blank template lives in
`reference/template.md`; `scripts/checkpoint.py render` prints it and
`scripts/checkpoint.py lint <file>` enforces it.

## When to checkpoint

- **Before compaction.** Write the checkpoint to the memory file while
  you still have full context — never wait for the warning.
- **Before a risky multi-step run.** Migrations, refactors, bulk edits:
  checkpoint so a bad step is recoverable from the note, not from
  archaeology.
- **At natural task boundaries.** One task done, next not started —
  the cheapest moment to write it down.
- **Before handing off.** Any brief to another agent/session starts as
  a compressed checkpoint (see Handoff format).

## Checkpoint anatomy

Target: **< 40 lines**. Required sections (`lint` enforces these):

- **Goal** — one line: the outcome this workstream is driving toward.
- **Decisions** — bullets, each with its *reason*.
- **State** — `Done:` list and `In flight:` list, artifacts cited.
- **Open threads** — unresolved items, each with a concrete `→ next:` action.
- **Memory keys touched** — canonical keys, what changed and why.

## Keep vs. drop

Keep: decisions + reasons, file paths, identifiers (PR numbers,
keys, order codes), error signatures, current state, open threads +
next actions, constraints handed down.
Drop: transcripts, dead-end explorations, raw tool output, repeated
confirmations, resolved threads, speculation.

The test: if you can only resume by re-reading the transcript, the
checkpoint failed. See `reference/keep-drop.md` for the table.

## Compaction hygiene

- Write it **before** context gets tight, not when the warning fires.
- Use **stable canonical keys**: `proj.<name>.checkpoint`. One
  checkpoint per workstream.
- **Supersede, don't append.** Rewriting one checkpoint replaces the
  old one; appending versions makes every future read pay for history.
- Lint it: `python3 scripts/checkpoint.py lint checkpoint.md`.
  Tolerance is 60 lines; aim for 40.

## Handoff format

Compress a checkpoint into a subagent brief by dropping everything but:

```
Goal: <one line>
Constraints: <hard limits — what NOT to do>
State: <done / in flight, artifact paths only>
Next: <the single action the subagent should take first>
```

No transcripts, no history, no speculation. The brief fits in a single
task message; the subagent re-derives the rest from the repo.


## Token economy

- Checkpoints stay under 40 lines; supersede old ones, never append versions.
- Run `python3 scripts/checkpoint.py lint` instead of eyeballing the length.
- Checkpoint at task boundaries, not at the compaction warning.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
