# prompt-analytics: architecture

Local-first analytics over AI coding-assistant sessions (Claude Code,
GitHub Copilot Chat, Cursor, opencode, Google Antigravity). It is invoked
through the `analytics-dashboard` skill.

## Plan

- **Phase 0, research (done).** One subagent per source plus ML, motion
  and privacy. Results are in `sources.md` and `research.md`.
- **Phase 1, contracts (this file).** Unified schema, `SourceAdapter`
  protocol, and the dashboard data contract
  (`dashboard/src/data/contract.ts`).
- **Phase 2, parallel build** against those contracts:
  1. Adapters with fixtures.
  2. Core: privacy, store, scan, outcomes, CLI.
  3. Analytics, ML and insights.
  4. Dashboard frontend.
  5. Skill wiring and docs.
- **Phases 3 and 4, review and fix**, three or more iterations. Reviewers
  cover four areas: code, data correctness, privacy, and UX/performance.
  Scores go in `iterations.md`.

## Assumptions

- **A1.** The package lives inside agentkit as its own subproject,
  `packages/prompt-analytics/`. It has its own `pyproject.toml`
  (`requires-python >= 3.11` for `tomllib`) and runs through `uv`. Root
  agentkit stays py3.8 and dependency-free. The root `pytest tests/
  skills/` does not collect this package, and CI gets a separate job.
- **A2.** The skill source is `skills/analytics-dashboard/SKILL.md`, the
  repo convention. `scripts/build.py` emits it to `dist/claude/skills/...`
  and the other tools. The spec named `.claude/skills/`, but that is the
  install target, not the source.
- **A3.** The built dashboard ships inside the Python package
  (`prompt_analytics/web/`), so users need no Node. Node is only needed
  to rebuild it.
- **A4.** The data dir is `$AGENTKIT_DATA_DIR/prompt-analytics`, default
  `~/.agentkit/prompt-analytics/` (mode 0700). This reuses the
  session-insights convention.
- **A5.** Cost is reported, not guessed, when the source records it
  (opencode). Otherwise it is estimated from `pricing.toml` and flagged
  `cost_is_estimate`.
- **A6.** Session text is stored redacted by default
  (`store_text = "redacted"`). The dashboard export never contains raw
  text: only aggregates and re-redacted snippets of at most 160 chars.
- **A7.** "Session" is the unit of analysis. A subagent session is kept
  as its own row with `parent_session_id`, and is excluded from funnel
  and friction metrics to avoid double counting human intent.

## Module layout

```
packages/prompt-analytics/
  pyproject.toml              deps: polars, duckdb, scikit-learn, numpy
                              extras: embed (fastembed), fast (model2vec), viz (umap-learn),
                                      ml-full (sentence-transformers, bertopic), dev (pytest)
  src/prompt_analytics/
    cli.py                    `prompt-analytics [scan|analyze|serve|export|doctor|run]`
    config.py                 paths, TOML config (redaction, pricing, intents, thresholds)
    privacy.py                redact(), hmac_digest(), secure perms, network tripwire
    schema.py                 dataclasses for unified records + DuckDB DDL
    store.py                  DuckDB store: upsert by source file, watermarks, rules_version
    scan.py                   discover -> watermark check -> parse -> redact -> store
    outcomes.py               read-only `git log` for repos seen in session cwd
    pricing.py / pricing.toml model price table (USD per 1M tokens)
    adapters/
      base.py                 SourceAdapter protocol, SourceFile, Health, registry
      claude_code.py  copilot.py  cursor.py  opencode.py  antigravity.py
    analytics/
      metrics.py              usage, cadence, streaks, tokens/cost, TTR, loops, tool switching
      funnel.py               six-stage funnel, sliceable
    ml/
      embed.py                Embedder protocol: fastembed | model2vec | tfidf_svd
      topics.py               HDBSCAN/KMeans + c-TF-IDF labels + 2D projection
      intent.py               seed-centroid intent + regex priors
      friction.py             corrections, frustration, rephrase loops, abandoned, interrupts
      quality.py              prompt-quality score (4 sub-scores) + outcome validation
      anomaly.py              rolling median/MAD robust z
      whatworks.py            per-cluster effect sizes, bootstrap CI, BH-FDR
    insights.py               ranked, evidence-linked insights
    export.py                 build dashboard.json, export privacy gate
    server.py                 http.server on 127.0.0.1, Host check, CSP
    web/                      built dashboard (committed)
  dashboard/                  Vite + React + TS source -> builds into src/prompt_analytics/web/
  tests/                      fixtures/<source>/..., unit, golden, privacy leak tests
skills/analytics-dashboard/SKILL.md (+ scripts/run.py launcher)
```

## SourceAdapter contract (`adapters/base.py`)

```python
class SourceAdapter(Protocol):
    name: str                                   # "claude_code" | "copilot" | ...
    def discover(self) -> list[SourceFile]: ... # cheap: paths + size + mtime, never content
    def parse(self, f: SourceFile) -> ParsedBatch: ...  # raw, unredacted records for one file
    def health(self) -> Health: ...             # ok | degraded | missing | unsupported + messages
```

- `SourceFile(source, path, size, mtime_ns, key)`. `key` identifies the
  unit of incrementality: a file path, or `db#composerId` for SQLite
  sources where one DB holds many sessions.
- `ParsedBatch` holds `sessions`, `turns`, `tool_calls`, `code_edits`,
  and `warnings`.
- Adapters never redact and never write. `scan.py` redacts before
  storing.
- An adapter raising on one file results in a warning and a skip, never a
  crashed run.
- Watermark: `(source, key) -> (size, mtime_ns, content_hmac)`.
  - Unchanged size and mtime: skip.
  - Changed: re-hash. If the hash differs, delete that key's rows and
    re-insert. Per-key replacement is idempotent.
  - SQLite sources (a single huge DB) emit one key per session, with a
    per-session `updated_at` as the change marker.

## Unified schema (DuckDB, `analytics.duckdb`)

All ids are strings namespaced as `<source>:<native id>`. Timestamps are
UTC `TIMESTAMP`. Text columns hold redacted text, or NULL when
`store_text = "none"`.

| table | columns |
|---|---|
| `projects` | project_id (hmac of abs path), name (basename), root (home replaced by `~`), repo (bool) |
| `sessions` | session_id, source, source_key, project_id, title, started_at, ended_at, is_subagent, parent_session_id, mode, model, n_user_turns, n_assistant_turns, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write, cost_usd, cost_is_estimate, tokens_estimated |
| `turns` | turn_id, session_id, idx, role (user/assistant), ts, text, text_len, model, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write, latency_ms, status (ok/error/cancelled/interrupted), is_interrupt |
| `tool_calls` | call_id, session_id, turn_id, name, ts, duration_ms, status (ok/error/denied/pending), is_edit |
| `code_edits` | edit_id, session_id, turn_id, file (repo-relative, redacted), lines_added, lines_removed, state (applied/accepted/rejected/pending/unknown), ts |
| `outcomes` | outcome_id (hmac of sha), project_id, session_id (linked or NULL), ts, kind (commit/pr), files_changed, insertions, deletions |
| `watermarks` | source, source_key, size, mtime_ns, content_hmac, parsed_at, rules_version |
| `source_health` | source, status, sessions_found, warnings (json), checked_at, versions_seen |

Derived tables are written by `analyze`:

| table | columns |
|---|---|
| `prompt_features` | turn_id, intent, intent_score, quality, q_specificity, q_context, q_constraints, q_length, is_correction, is_frustration, is_rephrase, cluster_id, x, y |
| `session_metrics` | session_id, ttr_s, friction, abandoned, loops, reached_stage |
| `clusters` | cluster_id, label, size, exemplar |
| `daily` | date, source, sessions, prompts, tokens, cost, anomaly_z |
| `embeddings_cache` | text_hmac, backend, vec |
| `insights` | rank, id, chapter, claim, metric, value, delta, evidence (json), drill (json) |

Outcome linking: a commit is linked to the latest session in the same
project that started at most 4h before the commit and ended at most 2h
before it. Both windows are configurable.

## Funnel (per non-subagent session)

| Stage | Session counts as reaching it when |
|---|---|
| 1 Intent | It has a user prompt with a classified intent |
| 2 Prompt | It has a substantive prompt (not a slash command or noise) |
| 3 Response | At least one assistant turn has status ok |
| 4 Iterate | It is not abandoned; loops are counted but do not drop the session |
| 5 Code applied | At least one edit with state applied or accepted |
| 6 Outcome | A commit or PR is linked |

The funnel is sliceable by source, project, intent and month. The
dashboard Sankey uses `source -> stage` flows plus drop-off.

## Dashboard data contract

`export.py` writes one `dashboard.json`, typed by
`dashboard/src/data/contract.ts`. It is inlined into `index.html` as
`<script type="application/json" id="pa-data">` so a static export works
over `file://`. It contains aggregates only, plus the redacted exemplar
snippets of at most 160 chars, and passes the export privacy gate.

## Insight engine

Each insight is `{claim (<=12 words), metric, value, delta, evidence:
{n, ci, method}, drill: {chapter, filter}}`. Candidates come from
templated comparisons:
- tool vs tool per intent: TTR, loops, applied-rate
- quality sub-score effects per cluster (`whatworks`)
- friction hotspots
- cost anomalies
- streaks

Candidates are ranked by `|effect| * log(n)`, with a minimum support
threshold, and duplicates are removed per chapter. Chapter 6
recommendations map the top negative findings to concrete actions, for
example "add file refs to bugfix prompts".
