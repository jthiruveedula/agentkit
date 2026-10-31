---
description: Run an ML project from framing and leakage-safe splits through tracking, evaluation, registry, serving and drift monitoring. Use when training or evaluating a model, setting up MLflow/W&B, deploying a model, or when performance dropped.
---

# ML Lifecycle

Most ML failures are data failures: leakage, bad splits, or a metric that
doesn't match the business goal. Guard those first, tune last.

## Procedure

1. **Frame the problem.** Name the decision the model drives, the metric
   that reflects it (and its cost asymmetry), and the non-ML baseline to
   beat (rule, heuristic, last-value). No baseline → nothing to compare.

2. **Split without leakage.** Time-based split for anything temporal;
   group split when entities repeat (users, patients, stores). Fit
   scalers/encoders/feature stats on train only. Check
   `_ml-lifecycle/reference/checklist.md#leakage` before trusting any number.

3. **Baseline, then iterate.** Simple model (linear/GBM) first, logged.
   Each experiment logs params, data version, code commit, and metrics to
   the project's tracker (MLflow/W&B — reuse what exists).

4. **Evaluate for the real decision.** Slice metrics by key segments,
   calibration if probabilities are consumed, and error analysis on the
   worst slice. A single aggregate number is not an evaluation.

5. **Ship reproducibly.** Register the model with its data version,
   feature schema, and metrics; serving uses the same feature code as
   training (no train/serve skew). Batch scoring before real-time unless
   latency needs it.
   Verify: re-run training and serving on a sample and check predictions match; if they differ, fix the feature code and re-run until they match (max 3 attempts, then report what still fails).

6. **Monitor.** Input drift, prediction drift, and — when labels arrive —
   performance by slice, with an alert threshold and a retrain trigger.

7. **Hand off** implementation to the `ml-engineer` subagent; pipeline
   plumbing (feature tables, schedules) to `pipeline-engineer`; data
   checks to `data-quality-engineer`.

## Reference

- `_ml-lifecycle/reference/checklist.md` — leakage traps, split strategy table,
  experiment-logging minimum, deploy and monitoring checklist.

## Token economy

- Inspect data with `df.shape`, `dtypes`, `describe()`, small `head()`; never print full frames or logs.
- Summarize runs as a metrics table; open one run only to compare.
