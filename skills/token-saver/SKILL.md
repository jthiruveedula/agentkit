---
name: token-saver
description: Cut input-token burn for AI coding agents — search-before-read, targeted line ranges, diff-first workflows, batched tool calls, no re-reads, and terse output. Use when a session is burning too much context, when reads feel wasteful, or when a task involves many files/logs/shell output.
version: 0.1.0
allowed-tools: Bash, Read
---

# Token Saver

Input tokens are spent mostly on reads, not writes. This skill makes
reads surgical: locate first, read only what you need, never read the
same bytes twice, and keep outputs small. See
`reference/patterns.md` for before/after command examples and
`scripts/estimate.py` to size a file before you touch it.

## Procedure

1. **Size before you read.** Run `scripts/estimate.py` on candidate
   files. It reports lines/bytes/estimated tokens and a read strategy:

   ```
   python3 scripts/estimate.py src/app.py logs/server.log --budget 8000
   ```

   Pass `--json` for machine-readable output. With `--budget`, it
   warns when a full read would blow the budget. Default heuristic:
   tokens ≈ chars/4.

2. **Search before read.** Never full-file-read to *find* something.
   Locate with `rg`, then read only the matched ranges:

   ```
   rg -n "def handle_submit" src/
   sed -n '120,160p' src/app.py        # read only the match window
   ```

   For unknown codebases, start with structure, not content:
   `rg -n "^class |^def |^function "` beats reading three files.

3. **Head/tail + targeted ranges.** For logs: `head`/`tail` (errors
   live at the end, schemas at the start). For code: read imports
   and signatures first (`sed -n '1,40p'`), then bodies only where
   needed. When a read tool supports offset/limit, use it — never
   open a >400-line file whole.

4. **Diff-first.** Before reading both versions of a changed file,
   run `git diff --stat` then `git diff -- <file>`. The diff *is* the
   relevant content; reading the pre-image separately doubles cost.

5. **Batch independent calls.** Independent reads/searches go in one
   block. Never do sequential round-trips for things that don't
   depend on each other:

   ```
   # bad:  three round-trips
   read A -> read B -> read C
   # good: one block
   { read A; read B; read C; }
   ```

6. **Don't re-read.** Cache file contents in session notes or a
   memory file after first read. Re-read only after you (or a tool)
   edited the file. If a long output must be referenced again, save
   it to `/tmp` and `grep` the file instead of re-running the command.

7. **Compact outputs.** Request terse output from tools
   (`--quiet`, `--format=short`, `jq` to select fields, `| head -n`).
   Produce terse responses: short confirmations, no echo of tool
   output back to the user, no redundant summaries of what you just
   did.

## Rules

- **Locate, then read.** A grep that costs 50 tokens beats a read
  that costs 5,000. No exceptions for "just checking".
- **Budget before bulk.** Any read estimated >25% of remaining
  context gets a strategy change (range, grep, or summary), not a
  bigger read.
- **One read, one purpose.** If you're reading to find X, stop at X.
  Don't finish the file "in case".
- **Logs are tail-first.** `tail -n 100` before anything else; `wc -l`
  decides if the middle matters.
- **Output diet in responses.** Terse by default: confirm actions in
  one line, show only deltas, link files instead of pasting them.


## Token economy

- One-off need? Skip the skill entirely: `python3 scripts/estimate.py --budget <n> <files>` tells you whether the read fits.
- Don't read `reference/patterns.md` whole — jump to the one section matching your task.
- Batch independent searches/reads in one call; never sequential round-trips.
- This skill is the canonical read/search/output reference other skills point at — keep it tight, don't duplicate this section anywhere else.
