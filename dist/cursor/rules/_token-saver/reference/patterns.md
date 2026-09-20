# Token-Saver Patterns

Before/after for each technique. "Before" is the token-wasteful
habit; "after" is the replacement.

## 1. Search before read

Before:
```
# read entire 900-line file to find one function
cat src/handlers.py | less
```

After:
```
rg -n "def handle_submit" src/handlers.py
# handlers.py:214:def handle_submit(request):
sed -n '200,250p' src/handlers.py
```

Structure-first variant (unknown codebase):
```
rg -n "^(class|def|function|export)" src/ | head -40
```

## 2. Head/tail + targeted line ranges

Before:
```
cat logs/server.log          # 12,000 lines into context
cat src/models.py            # 700 lines, you needed 2 functions
```

After:
```
wc -l logs/server.log        # decide if the middle matters
tail -n 100 logs/server.log # errors live at the end
sed -n '1,40p' src/models.py # imports + top-level signatures first
rg -n "def save" src/models.py
sed -n '330,380p' src/models.py
```

Range-picking rule of thumb:
- **Code:** signatures/imports first (`1..40`), bodies after a
  match, never the whole file above 400 lines.
- **Logs:** `tail` first, then `grep -n ERROR` for windows, then read
  those line numbers.
- **Configs/data:** `head` for schema, `jq`/`yq` to select keys,
  never pretty-printed full dumps.

## 3. Diff-first workflows

Before:
```
git show HEAD:src/app.py > /tmp/old.py
# read old.py fully, then read src/app.py fully, compare mentally
```

After:
```
git diff --stat               # what's actually touched
git diff -- src/app.py        # the diff IS the relevant content
```

Only read the full file if the diff is unreadable (rename, huge
refactor) — and then read only the new side.

## 4. Batch independent tool calls

Before: three sequential round-trips, each waiting on the last.
```
read src/a.py
read src/b.py
read src/c.py
```

After: one block, one round-trip.
```
# issue all independent calls together; the harness runs them in parallel
read src/a.py & read src/b.py & read src/c.py
```

Rule: if call B doesn't need the *result* of call A, they belong in
the same block. Chain only true dependencies.

## 5. Don't re-read

Before:
```
grep -n "TODO" src/*.py      # run 1: find files
grep -n "TODO" src/a.py      # run 2: same content, re-scanned
cat src/a.py                 # run 3: read what you already matched
```

After:
```
grep -rn "TODO" src/ > /tmp/todos.txt   # scan once, save
grep "a.py" /tmp/todos.txt              # re-query the saved output
```

Cache rules:
- Save first-read contents to session notes or a memory file.
- Re-read a file only after an edit touched it.
- Redirect long command output to a file; `grep` the file instead
  of re-running the command.

## 6. Compact output formatting

Before:
```
kubectl get pods -o yaml        # 2,000 lines
docker ps                       # full table with 12 columns
```

After:
```
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase --no-headers
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s api/users | jq '.[].email'
pytest -q 2>&1 | tail -n 20     # failures live at the end
```

Ask tools for terse output: `--quiet`, `--format=short`,
field selection, `| head`/`| tail`. Never paste a full dump to
"show" it — link the file instead.

## 7. Output diet (responses)

| Instead of | Write |
|---|---|
| "I've successfully read the file src/app.py and here are its contents..." | `app.py:214 — found it` |
| Pasting 80 lines of tool output back | One-line result + path to saved output |
| "Summary of what I did: 1... 2... 3..." | `Done: fixed retry backoff in net.py:88` |
| Repeating the user's request before answering | Just answer |

Terse by default; expand only when the user asks for detail.
