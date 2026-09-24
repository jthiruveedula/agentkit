# Roster: need → owner

| Need | Owner | Notes |
|---|---|---|
| Facts, options, "where is X", web research | `researcher` | read-only, cites file:line / URL |
| Platform decision (warehouse, orchestrator, batch/stream) | `data-platform-architect` | writes ADR |
| Pipeline code (dbt, Airflow, Dagster, Spark) | `pipeline-engineer` | after ADR |
| Data tests, freshness, PII | `data-quality-engineer` | after pipeline |
| Model training/eval, RAG, LLM features, evals | `ml-engineer` | needs a named metric |
| General code change from a spec | `implementer` | scoped to named files |
| Missing tests for changed logic | `test-writer` | smallest failing test |
| Run tests/lint/types/schema checks | `verifier` | external evidence only |
| Correctness + scope review | `reviewer` | read-only |
| README/CHANGELOG/docs | `doc-writer` | never edits source |
