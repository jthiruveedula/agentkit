---
description: Apply schema, freshness, volume, idempotency and PII checks to a data pipeline before it ships. Use when writing tests for a dbt model/pipeline, reviewing a pipeline PR, or asked "what checks should this have".
---

# Data Quality Standards

Apply checks selectively; review only the diff (`git diff`), and only checks relevant to what changed. Never run the full checklist blind.

## Procedure

1. **Identify what kind of check applies** from
   `_data-quality-standards/reference/checks.md` — schema (uniqueness, not-null, accepted
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
   of `_data-quality-standards/reference/checks.md` — tests present, backfill safety confirmed if
   historical data is touched, PII flagged, ADR referenced if this
   implements an architecture decision.

5. **For a model other teams, BI, or an AI agent/semantic layer consume
   directly**, check whether it needs a dbt contract — see "Data
   contracts" in `_data-quality-standards/reference/checks.md`.

6. **Verify the checks run:** execute them (e.g. `dbt test --select <model>`); if any fail or error, fix and re-run until they pass.

## Reference

- `_data-quality-standards/reference/checks.md` — the full checklist: schema tests, freshness,
  volume sanity, idempotency/backfill safety, PII handling, PR checklist.
