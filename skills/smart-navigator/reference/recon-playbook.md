# Recon playbook

Six steps to map an unfamiliar repo in minutes. Do steps in order;
each step answers one question and tells you whether the next step is
needed.

## 1. Manifests first

Read the cheapest high-signal files: they name entry points, scripts,
and architecture. Top-level only, in this order.

```
cat package.json          # name, version, scripts, main, bin
cat pyproject.toml        # project name, scripts, deps
cat go.mod Cargo.toml     # module / package name
head -30 README.md        # what it claims to be
grep -E '^[A-Za-z0-9][^:=]*:' Makefile   # available targets
```

What you learn: the language, the project name, the commands that run
it (`npm run build`, `make test`), and the declared entry point
(`"main": "src/index.js"`). If README disagrees with the manifests,
trust the manifests.

## 2. Skeleton before flesh

Get the shape before any code: a 2-level tree with per-directory
file counts and sizes. Ignore build output and VCS noise.

```
python3 scripts/map.py .
```

What you learn: where the code actually lives. In a repo like this:

```
. (142 files, 890 KB)
|-- src/ (38 files, 640 KB)
|-- tests/ (24 files, 90 KB)
|-- skills/ (41 files, 120 KB)
|-- site/ (31 files, 38 KB)
`-- bin/ (8 files, 2 KB)
```

`src/` is 72% of the code by size — that's where understanding pays
off. `site/` is docs, `bin/` is thin shims. Don't read alphabetically;
read by weight.

## 3. Entry-point tracing

Take the entry points the map guessed and trace inward through
imports, one hop at a time. Never open every file.

```
# from step 1: package.json main = "src/cli.js"
rg -n '^(import|const .* = require|from .* import)' src/cli.js
```

What you learn: the call graph's spine. `cli.js` parses args, then
calls `commands/init.js`, which imports `lib/config.js`. You now know
the three files that matter for "how does the CLI start" without
reading the other 35 files in `src/`.

## 4. Symbol search before full reads

When you need a specific function, class, or route: search, don't
browse. Read only the matched hunks plus ~20 lines of context.

```
rg -n -C 20 'class RouteTable' src/
rg -n -C 20 'def handle_checkout' src/ | head -60
```

What you learn: where the symbol lives, who defines it, who calls it.
If a symbol has 40 call sites, read the definition and the 2-3 call
sites closest to your question — not all 40.

## 5. Stop conditions

Stop mapping when you can answer both:

1. **Where does X live?** — a path, not a guess.
2. **What calls it?** — the 1-2 callers above it, from the trace.

Depth belongs to the implementation step, not reconnaissance. If you
can't answer both yet, go back to step 4 with a narrower symbol — not
back to step 2.

## 6. Anti-patterns

- **Alphabetical full-directory reads.** Reading `src/` a-z is the
  slowest way to learn anything. Weight by step 2, then trace from
  step 3.
- **Reading generated code for understanding.** `dist/`, lockfiles,
  `node_modules/`, `__pycache__` describe the build, not the design.
  The map skips them; you should too.
- **Re-listing what the map already showed.** If `map.py` told you
  `tests/` has 24 files, don't run `ls tests/` to confirm. Move on.
