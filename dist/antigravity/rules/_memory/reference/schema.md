# Memory substrate — data model

Local SQLite database (default `~/.agentkit/memory.db`, override with
`AGENTKIT_MEMORY_DB` or `memory --db`). WAL mode, so readers never block
writers. No network, no server, no embeddings to host — full-text search
is FTS5 with BM25, which is the right trade for a personal substrate:
exact, explainable, zero dependencies.

## The three tables

| Table | Row means | Decays? | Identity |
|---|---|---|---|
| `episodes` | something happened | yes — recency-weighted in ranking, prunable by age | auto id |
| `facts` | something is true | no — versioned, never silently overwritten | `key` (unique among current) |
| `corrections` | something keeps going wrong + the fix | no — surfaced first, they're expensive to re-learn | auto id |

Each table has a companion FTS5 external-content table
(`episodes_fts`, `facts_fts`, `corrections_fts`) kept in sync by
insert/delete/update triggers, so the index can never drift from the
data. `facts` carries a partial unique index on `key WHERE
superseded = 0`: storing a fact whose key already exists marks the old
row superseded and inserts the new one. History is preserved, search
only sees the current version.

## Ranking

`memory search` queries each kind's FTS table separately (BM25 is not
comparable across tables), normalizes each kind's scores to [0,1],
then combines:

```
score = kind_weight * (0.7 * relevance + 0.3 * freshness)
```

- `kind_weight`: correction 1.0, fact 0.9, episode 0.75.
- `freshness`: episodes decay with a 90-day half-life
  (`0.5 + 0.5 * e^(-age/90)`); facts use confidence
  (`0.5 + 0.5 * confidence`); corrections are always 1.0.

The formula is deliberately legible — when a result surprises you,
`--json` shows the score and you can reason about why it ranked where
it did. Tune the constants at the top of `scripts/memory.py`; they're
all in one place.

## CLI surface

`store --kind episode|fact|correction`, `search`, `get`, `forget`,
`prune`, `stats`. Every command accepts `--json` for agent
consumption and `--db` to point at a different database. Exit 0 on
success, 2 on bad usage, 1 on "not found".

`prune` only touches episodes, only older than the cutoff, and is a
dry run unless `--yes` is passed — deletion should always be a
deliberate act. `forget` is the hard-delete path for privacy: a fact
by `--key`, anything else by id.
