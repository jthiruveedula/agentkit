---
description: Write short summarization checkpoints (goal, decisions+reasons, state, open threads, memory keys) to survive context pressure. Use when a session is long, before compaction or risky multi-step runs, at task boundaries, or before handoff.
applyTo: **
---

# Context Compressor

Checkpoints are resumption kits, not logs. A good one lets the next
session act without re-reading history. The blank template lives in
`_context-compressor/reference/template.md`; `_context-compressor/scripts/checkpoint.py render` prints it and
`_context-compressor/scripts/checkpoint.py lint <file>` enforces it.

## Procedure

1. Render the blank: `python3 _context-compressor/scripts/checkpoint.py render > checkpoint.md`.
2. Fill each section from current state (see anatomy below); cite paths, don't paste content.
3. Lint: `python3 _context-compressor/scripts/checkpoint.py lint checkpoint.md`; fix and repeat until clean (max 3 attempts, then report what still fails).
4. Save under `proj.<name>.checkpoint`, replacing the previous one.

## When to checkpoint

- Before compaction (while you still have full context, not at the warning).
- Before a risky multi-step run (migrations, refactors, bulk edits).
- At task boundaries.
- Before handing off (see Handoff format).

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
checkpoint failed. See `_context-compressor/reference/keep-drop.md` for the table.

## Compaction hygiene

- Write it **before** context gets tight, not when the warning fires.
- Use **stable canonical keys**: `proj.<name>.checkpoint`. One
  checkpoint per workstream.
- **Supersede, don't append.** Rewriting one checkpoint replaces the
  old one; appending versions makes every future read pay for history.
- Lint it: `python3 _context-compressor/scripts/checkpoint.py lint checkpoint.md`.
  Limit 60 lines; aim for 40.

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
