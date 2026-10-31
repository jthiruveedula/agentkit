---
description: Scaffolds a dbt model, Airflow DAG, Dagster asset, or PySpark job with medallion naming and a test stub. Use when asked to create a new pipeline, model, DAG, asset, or Spark job boilerplate.
---

# Pipeline Scaffold

Boilerplate only — transform logic is yours (or `pipeline-engineer`'s).

## Procedure

1. **Confirm the architecture decision first.** If this is a new pipeline
   (not adding to an existing one) and no ADR covers it, run
   `data-architect` first.

2. **Pick the kind and layer**, then scaffold:
   ```
   python3 _pipeline-scaffold/scripts/scaffold_pipeline.py --kind dbt --layer silver --name orders
   python3 _pipeline-scaffold/scripts/scaffold_pipeline.py --kind airflow --name daily_extract
   python3 _pipeline-scaffold/scripts/scaffold_pipeline.py --kind dagster --layer gold --name revenue_mart
   python3 _pipeline-scaffold/scripts/scaffold_pipeline.py --kind spark --name event_dedup
   ```
   `--out <dir>` targets a project root other than cwd. Re-running never
   clobbers a file you've since hand-edited — pass `--force` to overwrite
   deliberately.

3. **Fill in every `TODO`** — the scaffold is deliberately inert
   (`raise NotImplementedError` / a placeholder `select *`), never a
   fabricated transform that looks done but silently does nothing useful.

4. **dbt scaffolds ship with `unique`/`not_null` tests on a placeholder
   primary key** — rename `CHANGE_ME_primary_key` to the real column, and
   add the source-specific checks from `data-quality-standards` before
   calling the model done.

5. **Name things by medallion layer**, not by source system — `silver/orders`,
   not `silver/shopify_orders_cleaned`. The source system lives in the
   bronze layer's ingestion config, not the model name.

## Token economy

- Adding to an existing pipeline? Generate only the missing piece.
- Fill TODOs directly; don't regenerate the scaffold to "fix" logic.
