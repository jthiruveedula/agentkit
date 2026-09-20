# Memory substrate — recipes

## Remembering things

User says "remember this", states a durable preference, or you make a
decision together:

```sh
python3 scripts/memory.py store --kind fact --key user.editor \
  --text "Cursor" --confidence 0.9
python3 scripts/memory.py store --kind episode \
  --text "chose Postgres over SQLite for the analytics DB; reason: concurrent writers" \
  --tags decision,postgres
```

A correction lands (user corrects you, or memory-sync finds a repeat
pattern):

```sh
python3 scripts/memory.py store --kind correction \
  --pattern "assumed the repo used npm when it uses pnpm" \
  --correction "check for pnpm-lock.yaml / packageManager field before running npm" \
  --context "agentkit packaging work"
```

## Recalling things

Before answering anything about past work, decisions, or preferences —
and before starting a debug session — search first:

```sh
python3 scripts/memory.py search "package manager" --limit 5
python3 scripts/memory.py search "deploy" --kind episode --json
```

Corrections surface first by design. If a correction matches the task
at hand, apply it before doing anything else — that's the whole point.

## Forgetting things

Wrong, stale, or private — delete it rather than letting it pollute
ranking:

```sh
python3 scripts/memory.py forget fact --key user.editor   # by key
python3 scripts/memory.py forget episode 42               # by id
```

Superseded fact versions are hidden from search automatically; `forget`
is for hard removal.

## Housekeeping

```sh
python3 scripts/memory.py stats
python3 scripts/memory.py prune --older-than 180d        # dry run
python3 scripts/memory.py prune --older-than 180d --yes  # delete
```

Prune only ever deletes episodes older than the cutoff. Facts and
corrections are curated by hand (`forget`) or superseded by newer
facts — never aged out silently.

## Agent guidance

- **Store facts, not transcripts.** One fact per durable truth, keyed
  canonically (`user.timezone`, `repo.agentkit.install`). If the same
  truth arrives twice, store it twice — versioning handles it.
- **Corrections beat facts.** When a correction and a fact disagree,
  the correction is newer knowledge about a failure mode. Trust it.
- **Search before asking.** If the substrate might know, a search is
  cheaper than a question. Only ask the user when search comes back
  empty.
- **The substrate is local.** Nothing leaves the machine. There is no
  sync, no cloud, no sharing — which is exactly why `forget` exists.
