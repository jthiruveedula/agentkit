---
name: ml-lifecycle
description: Runs a classical/deep ML project through problem framing, leakage-safe data splits, baselines, experiment tracking, evaluation, model registry, serving, and drift monitoring. Use when the user is training or evaluating a model, setting up MLflow/W&B experiment tracking, building features, deploying a model to production, or asks why model performance dropped.
allowed-tools: Read, Edit, Write, Grep, Bash
version: 0.1.0
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
   `reference/checklist.md#leakage` before trusting any number.

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

6. **Monitor.** Input drift, prediction drift, and — when labels arrive —
   performance by slice, with an alert threshold and a retrain trigger.

7. **Hand off** implementation to the `ml-engineer` subagent; pipeline
   plumbing (feature tables, schedules) to `pipeline-engineer`; data
   checks to `data-quality-engineer`.

## Reference

- `reference/checklist.md` — leakage traps, split strategy table,
  experiment-logging minimum, deploy and monitoring checklist.

## Token economy

- Inspect data with `df.shape`, `df.dtypes`, `describe()` and small
  `head()` samples — never print full frames or training logs.
- Summarize experiment runs as a metrics table; open one run's details
  only when comparing.
- General read/search/output patterns live in the `token-saver` skill.
