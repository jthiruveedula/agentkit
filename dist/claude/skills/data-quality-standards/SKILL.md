---
name: data-quality-standards
description: Applies schema, freshness, volume, idempotency, and PII-handling checks to a data pipeline before it ships. Use when the user is writing tests for a dbt model/pipeline, reviewing a data pipeline PR, or asks "what checks should this have".
allowed-tools: Read, Edit, Grep
version: 0.1.0
---

# Data Quality Standards

The checklist for "is this pipeline actually done," applied selectively —
not every check fits every table, and a mechanically-run checklist trains
people to ignore it. Pick what's meaningful for the data at hand.

## Procedure

1. **Identify what kind of check applies** from
   `reference/checks.md` — schema (uniqueness, not-null, accepted
   values, relationships), freshness, volume sanity, idempotency, PII
   handling. Most pipelines need schema + freshness at minimum; volume
   and idempotency checks matter more as the pipeline gets load-bearing.

2. **Write the checks in the project's existing testing convention** —
   dbt tests (`schema.yml`) if the project uses dbt, Great
   Expectations/Soda if that's already in place. Don't introduce a new
   testing framework for one model.

3. **Flag PII explicitly** — name which columns are sensitive in the
   model's docs, don't leave it implicit. This is a hard requirement, not
   optional polish (see this repo's rule on never skipping security/
   trust-boundary work for speed).

4. **For a PR review**, check the "what goes in a PR" list at the bottom
   of `reference/checks.md` — tests present, backfill safety confirmed if
   historical data is touched, PII flagged, ADR referenced if this
   implements an architecture decision.

5. **For a model other teams, BI, or an AI agent/semantic layer consume
   directly**, check whether it needs a dbt contract — see "Data
   contracts" in `reference/checks.md`.

## Reference

- `reference/checks.md` — the full checklist: schema tests, freshness,
  volume sanity, idempotency/backfill safety, PII handling, PR checklist.

## Token economy

- Review the pipeline DIFF under review, not the whole warehouse —
  `git diff` first, then checks only for changed models/tables.
- Run only the checks relevant to what changed (new column → schema
  tests; new source → freshness/volume), never the full checklist blind.
- Reuse the project's existing testing convention; introducing a new
  framework for one model costs review cycles and context.
- General read/search/output patterns live in the `token-saver` skill —
  don't duplicate them here.
