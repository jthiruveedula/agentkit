"""Weekly level-shift detection: one split point, accepted only if a permutation test says the shift is not chance."""

from __future__ import annotations

import numpy as np

MIN_WEEKS = 8
MIN_SIDE = 3
PERMS = 500
ALPHA = 0.01


def _best_split(x: np.ndarray) -> tuple[int, float]:
    """(index where the new level starts, |mean after - mean before| / pooled sd) maximised over splits."""
    best, stat = -1, 0.0
    for k in range(MIN_SIDE, len(x) - MIN_SIDE + 1):
        a, b = x[:k], x[k:]
        sd = np.sqrt((a.var() * len(a) + b.var() * len(b)) / len(x)) or 1e-9
        s = abs(b.mean() - a.mean()) / sd
        if s > stat:
            best, stat = k, s
    return best, stat


def level_shift(values: list[float], seed: int = 0) -> dict | None:
    """Most likely single level shift in a weekly series, or None. Returns ``index``, ``before``, ``after``
    (segment means) and ``p`` (permutation p-value of the strongest split). A flat or short series gives None.
    ponytail: one change per series; recurse on the segments if two shifts ever matter."""
    x = np.asarray(values, dtype=float)
    if len(x) < MIN_WEEKS or float(x.std()) == 0.0:
        return None
    k, stat = _best_split(x)
    if k < 0:
        return None
    rng = np.random.default_rng(seed)
    hits = sum(_best_split(rng.permutation(x))[1] >= stat for _ in range(PERMS))
    p = (hits + 1) / (PERMS + 1)
    if p > ALPHA:
        return None
    return {
        "index": k,
        "before": float(x[:k].mean()),
        "after": float(x[k:].mean()),
        "p": p,
    }
