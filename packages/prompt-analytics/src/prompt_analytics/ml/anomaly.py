"""Rolling robust z (median/MAD) over a trailing calendar window, shifted so a day never sees itself."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

K = 0.6745
Z_THRESHOLD = 3.5


def robust_z(x: float, window: np.ndarray) -> float:
    """0.6745*(x-median)/MAD; MAD==0 falls back to 1.4826*meanAD; a perfectly flat window gives 0
    (ponytail: no spike signal off a constant history, avoids false alarms on all-zero cost days)."""
    med = float(np.median(window))
    mad = float(np.median(np.abs(window - med)))
    if mad > 0:
        return K * (x - med) / mad
    mean_ad = float(np.mean(np.abs(window - med)))
    return (x - med) / (1.4826 * mean_ad) if mean_ad > 0 else 0.0


def detect(dates: list[date], values: list[float], window_days: int = 28, min_prior: int = 7) -> list[dict]:
    """Per active day: z (None until ``min_prior`` prior active days), trailing median and prior count."""
    order = sorted(range(len(dates)), key=lambda i: dates[i])
    ds = [dates[i] for i in order]
    vs = np.asarray([values[i] for i in order], dtype=float)
    out: list[dict] = []
    lo = 0
    for i, d in enumerate(ds):
        while ds[lo] < d - timedelta(days=window_days):
            lo += 1
        w = vs[lo:i]
        if len(w) >= min_prior:
            out.append({"date": d, "value": float(vs[i]), "z": robust_z(float(vs[i]), w), "median": float(np.median(w)), "n_prior": len(w)})
        else:
            out.append({"date": d, "value": float(vs[i]), "z": None, "median": None, "n_prior": len(w)})
    return out


def flagged(rows: list[dict], thr: float = Z_THRESHOLD) -> list[dict]:
    return [r for r in rows if r["z"] is not None and abs(r["z"]) >= thr]
