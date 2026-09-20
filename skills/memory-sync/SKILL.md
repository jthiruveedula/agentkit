---
name: memory-sync
description: Mines recent session history for recurring agent mistakes or friction, ranks the repeated patterns, and writes durable corrections (memory files, CLAUDE.md, or skill fixes) so the same issue doesn't cost time again. Use when the user asks to do a retro on recent sessions, find recurring agent errors, or "make agents faster/more productive" based on past work.
version: 0.1.0
allowed-tools: Bash, Read, Edit, Write, Grep
---

# Memory Sync

Turns "the agent keeps messing up X" into a written, durable fix instead
of a one-off correction that gets forgotten next session. This skill
doesn't replace your memory system or claude-mem's tools — it orchestrates
them toward one output: a short list of *repeated* patterns, each with a
committed fix.

## Procedure

1. **Gather raw incidents.** Pull recent session signal from whatever's
   available, in this order:
   - claude-mem tools if present: `timeline`, `smart_search` (keywords:
     "wrong", "mistake", "fix", "correct", "redo", "again"), `get_observations`
   - this repo's own `memory` skill substrate: search past corrections
     first (`../memory/scripts/memory.py search "<keywords>" --kind
     correction`) so a new incident can be linked to — or ruled out
     against — a known pattern instead of counted twice
   - failing that, ask the user to paste or describe recent friction —
     don't fabricate incidents that weren't reported.

   Write each distinct incident as one line: what happened, in the
   agent's own words where possible (`"guessed the wrong install flag for
   cursor"`, not `"issue #3"`).

2. **Rank repeated patterns**, don't eyeball a flat list:
   ```
   python3 scripts/rank_patterns.py incidents.txt
   ```
   Returns clusters of `count >= 2` with example lines and shared terms.
   A pattern that only happened once isn't a pattern yet — note it but
   don't write a fix for it; wait for it to recur.

3. **For each repeated pattern, write one durable fix** — pick the
   right target, don't default to "add a memory file" for everything:
   - **Recurring factual/preference correction** (wrong assumption about
     the user, a repo, a workflow) → a memory file under
     `type: feedback` per this environment's memory conventions (Why +
     How to apply, linked from `MEMORY.md`).
   - **Recurring behavioral drift** (over-asking, scope creep, wrong
     tone) → a note in the relevant `CLAUDE.md` / project instructions,
     not a one-off memory file.
   - **Recurring bug in *this repo's own* skill** (e.g. the classifier in
     `data-eng-router` keeps misrouting a platform) → fix the skill
     itself and add a golden test case that would have caught it — the
     fix belongs in code, not in prose.

   Whichever target you pick, also record the pattern in the `memory`
   substrate so future sessions surface it before repeating the
   mistake — corrections rank first in search by design:

   ```
   python3 ../memory/scripts/memory.py store --kind correction \
     --pattern "<the repeated mistake, in the agent's own words>" \
     --correction "<what to do instead>" \
     --context "<repo / workflow where it happened>"
   ```

   (Paths are relative to `skills/memory-sync/`; from the repo root use
   `skills/memory/scripts/memory.py`.)

4. **Cite evidence.** Every fix names the pattern's example lines/count
   and, where available, the session/date it came from — a fix with no
   evidence is a guess wearing a memory file's clothes.

5. **Report a short fast-track summary**, not an essay: N incidents
   gathered, N repeated patterns found, N fixes written and where. Skip
   patterns that only had 1 occurrence — list them as "watching" only.

## Reference

- `scripts/rank_patterns.py` — clusters incident lines by shared
  vocabulary (crude stemming, not real NLP — a triage tool, not a
  classifier). `--selftest` runs its built-in check.
