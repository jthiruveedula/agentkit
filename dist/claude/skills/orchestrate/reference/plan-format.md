# Plan format (`.agentkit/plan.json`)

```json
{
  "goal": "Ship a churn model scoring pipeline",
  "tasks": [
    {"id": "adr", "owner": "data-platform-architect",
     "objective": "Choose batch vs streaming scoring; write ADR",
     "output": "docs/adr/NNNN-scoring.md path + 3-line decision", "deps": []},
    {"id": "features", "owner": "pipeline-engineer",
     "objective": "Build silver feature table per ADR",
     "output": "model path + test command", "deps": ["adr"]},
    {"id": "model", "owner": "ml-engineer",
     "objective": "Train baseline + GBM, time-split, log to MLflow",
     "output": "metrics table + run ids", "deps": ["features"]},
    {"id": "dq", "owner": "data-quality-engineer",
     "objective": "Freshness/PII checks on feature table",
     "output": "tests added + PII columns", "deps": ["features"]},
    {"id": "verify", "owner": "verifier",
     "objective": "Run all tests/lint on the branch",
     "output": "pass/fail + failing output", "deps": ["model", "dq"]}
  ]
}
```

Rules enforced by `scripts/plan_check.py`:
- `id` unique; `owner` must be a known roster agent (or `--owners` list).
- every `deps` entry must exist; no cycles.
- each wave (tasks whose deps are all satisfied) has at most `--max-parallel`
  tasks (default 5 — past that, coordination cost outweighs parallelism).
- `objective` and `output` must be non-empty.
