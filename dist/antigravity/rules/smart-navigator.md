---
description: Structure-first codebase reconnaissance — map an unfamiliar repo with manifests and a 2-level tree before reading any code, then trace entry points inward instead of reading file by file. Use when you land in an unknown codebase, need to find where something lives or what calls it, or are scoping before an implementation change.
trigger: model_decision
---

# Smart Navigator

Map first, read later. A repo's manifests and skeleton answer
"where does X live" and "what calls it" faster than reading code.
See `_smart-navigator/reference/recon-playbook.md` for the full protocol with a
worked example.

## Procedure

1. **Read manifests first.** Cheapest high-signal reads, top-level
   only — they name entry points, scripts, and architecture:

   ```
   cat package.json pyproject.toml go.mod Cargo.toml 2>/dev/null
   head -30 README.md
   ```

   Or let the map extract key fields for you (step 2).

2. **Skeleton before flesh.** Generate the map — 2-level tree,
   per-directory file counts and sizes, manifests, guessed entry
   points. Ignored: `node_modules`, `.git`, `dist`,
   `__pycache__`, `.venv`, `target`.

   ```
   python3 _smart-navigator/scripts/map.py .
   python3 _smart-navigator/scripts/map.py . --depth 3      # deeper when needed
   python3 _smart-navigator/scripts/map.py . --json          # machine-readable
   ```

   Read by weight: the directory holding most of the KB is where
   understanding pays off. Skip generated code and lockfiles.

3. **Trace entry points inward.** Take the map's entry-point
   guesses (files named `main.*`, `cli.*`, `index.*`, `bin/*`,
   plus manifest `main`/`bin` fields) and follow imports one hop
   at a time:

   ```
   rg -n '^(import|from .* import|const .* = require)' <entry>
   ```

   Repeat on the next hop. This builds the call spine without
   opening every file.

4. **Symbol search before full reads.** For a specific function,
   class, or route, search and read only the matched hunks plus
   ~20 lines of context:

   ```
   rg -n -C 20 '<symbol>' <weighted-dir>/
   ```

5. **Stop when both are answered.** Stop mapping when you can
   say: (1) where X lives — a path, not a guess; (2) what calls
   it — the 1-2 callers above it from the trace. Depth belongs to
   the implementation step, not reconnaissance.

## Rules

- **Never read a directory alphabetically.** Weight by the map,
  then trace from entry points.
- **Never read generated code for understanding.** `dist/`,
  lockfiles, `node_modules/`, `__pycache__` describe the build,
  not the design.
- **Never re-list what the map already showed.** The map is the
  source of truth for structure; don't `ls` to confirm it.


## Token economy

- Always run `_smart-navigator/scripts/map.py` before any read — 2-level tree and symbol search first.
- Read by weight: the biggest-KB directory wins; skip generated code and lockfiles.
- Honor the stop conditions: stop mapping once X's location and callers are known.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
