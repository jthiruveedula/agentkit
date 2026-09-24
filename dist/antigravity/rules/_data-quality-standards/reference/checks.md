# Data quality checks — what every pipeline should have

Not every check applies to every table. Apply the ones that are actually
meaningful for the data; a checklist run mechanically is worse than no
checklist — it trains people to ignore it.

## Schema-level (dbt tests / Great Expectations / Soda — pick one tool per project)

- **Primary key**: `unique` + `not_null` on the business key, every model.
- **Foreign keys**: `relationships` test to the referenced model where a
  join is expected to always resolve.
- **Accepted values**: `accepted_values` on any enum/status/category
  column — catches a silent new value from upstream before it breaks a
  dashboard filter.
- **Not-null on required business columns** — not just the primary key.
  A `NULL` order amount is usually a bug, not a valid state.

## Freshness

- Every source table gets a freshness check (`dbt source freshness` or
  equivalent) — warn at 2× expected load interval, error at 4×. A silent
  stale source is the most common "why is the dashboard wrong" root cause.

## Volume / row-count sanity

- Flag a run where row count moves >X% from the trailing average (X
  depends on the table — a daily-orders table swinging 50% day-to-day is
  normal for a small business, anomalous for a large one; calibrate per
  table, don't use one global threshold).
- Flag zero-row loads as an error, not a silent no-op, unless zero is a
  genuinely valid state (e.g. a holiday with no orders) — name that case
  explicitly if so.

## Idempotency & backfills

- Every pipeline should be safely re-runnable for the same partition/date
  without duplicating data — `MERGE`/`insert overwrite partition`, not
  blind `INSERT`.
- Backfilling N days should produce the same result as N daily runs.
  Verify this once when the pipeline is built, not just assume it.

## PII / sensitive data

- Name which columns are PII (email, name, address, precise location,
  anything regulated) in the model's `description`/docs — don't leave it
  implicit.
- PII columns get access-controlled at the warehouse/catalog level
  (column-level security or a separate restricted schema), not just
  "don't select those columns in the dashboard query."
- Never log full PII values in pipeline logs/error messages — log a
  hashed/truncated reference instead.

## Data contracts

Enforce a dbt contract (`contract: {enforced: true}`) once a model is
consumed by more than its own project — another team's models, a BI tool,
or an AI agent/semantic layer querying it directly. A contract locks the
column names, `data_type`s, and constraints (`not_null`, `unique`,
`primary_key`) so a silent schema change breaks the build instead of the
downstream consumer. Don't enforce it on models still internal to one
pipeline — it's friction with no payoff there.

Breaking changes (drop/rename/retype a contracted column) go through a
[versioned model](https://docs.getdbt.com/docs/collaborate/govern/model-versions)
instead of a silent edit, so old consumers keep working against the prior
version while new ones move to the latest.

```yaml
models:
  - name: dim_customer
    config:
      contract: {enforced: true}
    columns:
      - name: customer_id
        data_type: string
        constraints:
          - type: not_null
          - type: unique
          - type: primary_key
      - name: email
        data_type: string
        constraints:
          - type: not_null
```

## What goes in a PR that touches a pipeline

1. What schema/freshness/volume tests were added or updated.
2. Confirmation the change was tested against a backfill, not just the
   incremental path, if the change affects historical data.
3. Any new PII columns, flagged explicitly.
4. The ADR reference if this implements an already-decided architecture
   change (`docs/adr/NNNN-*.md`), or a note that no ADR was needed
   (small, reversible change).
