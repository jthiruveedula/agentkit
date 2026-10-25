---
name: smart-navigator
description: Structure-first repo recon: map manifests and a 2-level tree, then trace entry points instead of reading file by file. Use when in an unfamiliar codebase, finding where something lives or what calls it, or before scoping a change.
version: 0.1.0
allowed-tools: Bash, Read
---

# Smart Navigator

Map first, read later. A repo's manifests and skeleton answer
"where does X live" and "what calls it" faster than reading code.
See `reference/recon-playbook.md` for the full protocol with a
worked example.

## Procedure

1. **Map first.** `python3 scripts/map.py .` already extracts
   manifest key fields. If you still need a manifest, bound it:

   ```
   head -n 40 package.json    # likewise pyproject.toml, go.mod, Cargo.toml
   head -n 30 README.md
   ```

2. **Skeleton before flesh.** Run the map for a 2-level tree,
   per-directory file counts and sizes, manifests, guessed entry
   points. Ignored: `node_modules`, `.git`, `dist`,
   `__pycache__`, `.venv`, `target`.

   ```
   python3 scripts/map.py .
   python3 scripts/map.py . --depth 3      # deeper when needed
   python3 scripts/map.py . --json          # machine-readable
   ```

   Read by weight: the directory holding most of the KB is where
   understanding pays off. Skip generated code and lockfiles.

3. **Trace entry points inward.** Take the map's entry-point
   guesses (files named `main.*`, `cli.*`, `index.*`, `bin/*`,
   plus manifest `main`/`bin` fields) and follow imports one hop
   at a time:

   ```
   rg -n '^(import|from .* import|const .* = require)' <entry> | head -n 40
   ```

   Repeat on the next hop. This builds the call spine without
   opening every file.

4. **Symbol search before full reads.** For a specific function,
   class, or route, list hits first, then read only the one you need:

   ```
   rg -n -m 3 '<symbol>' <weighted-dir>/ | head -n 20
   sed -n '<start>,<end>p' <file>
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
