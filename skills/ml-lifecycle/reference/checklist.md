# ML lifecycle checklist

## Leakage

- [ ] No feature computed using information from after the prediction time
- [ ] Target not encoded in any feature (IDs, post-outcome status fields)
- [ ] Scalers/encoders/imputers fit on train only (use a Pipeline)
- [ ] No duplicate or near-duplicate rows across train/test
- [ ] Target encoding done out-of-fold
- [ ] Suspiciously high metric investigated before celebrated

## Split strategy

| Data | Split |
|---|---|
| Temporal (events, transactions, forecasts) | Time-based; test = most recent window |
| Repeated entities (user, patient, store) | GroupKFold by entity |
| Rare positive class | Stratified; report PR-AUC, not accuracy |
| Small data | Repeated CV; report mean ± std |

## Experiment logging minimum

params · data version/hash · code commit · metrics (overall + slices) ·
artifact (model + feature schema) · run notes (why this run).

## Deploy

- [ ] Same feature code for train and serve (feature store or shared module)
- [ ] Input schema validated at the serving boundary
- [ ] Model registered with version, metrics, data version, owner
- [ ] Rollback path: previous model version one command away
- [ ] Shadow or canary before full traffic for real-time models

## Monitor

- [ ] Input feature drift (PSI/KS) on top features
- [ ] Prediction distribution drift
- [ ] Delayed-label performance by slice
- [ ] Alert thresholds + named owner + retrain trigger
