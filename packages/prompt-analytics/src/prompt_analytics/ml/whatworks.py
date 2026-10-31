"""Per-cluster effect sizes: top vs bottom outcome tercile, Cliff's delta, bootstrap CI, BH-FDR."""

from __future__ import annotations

import numpy as np
import polars as pl

FEATURES = ["specificity", "context", "constraints", "length"]
COLS = {"specificity": "q_specificity", "context": "q_context", "constraints": "q_constraints", "length": "q_length"}


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    return float(((a[:, None] > b[None, :]).sum() - (a[:, None] < b[None, :]).sum()) / (len(a) * len(b)))


def bootstrap_delta(a: np.ndarray, b: np.ndarray, B: int = 1000, seed: int = 0) -> tuple[float, float, float]:
    """(ci_lo, ci_hi, two-sided bootstrap p) of Cliff's delta. Vectorised over resamples."""
    rng = np.random.default_rng(seed)
    A = a[rng.integers(0, len(a), (B, len(a)))]
    Bm = b[rng.integers(0, len(b), (B, len(b)))]
    d = ((A[:, :, None] > Bm[:, None, :]).sum((1, 2)) - (A[:, :, None] < Bm[:, None, :]).sum((1, 2))) / (len(a) * len(b))
    lo, hi = np.percentile(d, [2.5, 97.5])
    p = 2 * min((d <= 0).mean(), (d >= 0).mean())
    return float(lo), float(hi), float(max(p, 1.0 / (B + 1)))


def bh_fdr(p: list[float], q: float = 0.1) -> list[bool]:
    """Benjamini-Hochberg: reject the k smallest p-values where p_(k) <= q*k/m."""
    m = len(p)
    order = sorted(range(m), key=lambda i: p[i])
    kmax = 0
    for rank, i in enumerate(order, 1):
        if p[i] <= q * rank / m:
            kmax = rank
    keep = [False] * m
    for i in order[:kmax]:
        keep[i] = True
    return keep


def tercile_groups(score: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(top, bottom) masks by outcome tercile; both empty when ties make the terciles coincide."""
    hi, lo = np.quantile(score, [2 / 3, 1 / 3])
    if hi <= lo:
        return np.zeros(len(score), bool), np.zeros(len(score), bool)
    return score >= hi, score <= lo


def analyze(df: pl.DataFrame, min_cluster: int = 100, min_group: int = 30, min_abs: float = 0.2, q: float = 0.1,
            B: int = 1000, max_group: int = 100, stats: dict | None = None) -> list[dict]:
    """``df``: one row per prompt with cluster_id, outcome_score and the q_* columns. Returns significant
    effects only (|delta| >= min_abs, CI excludes 0, BH q); everything else is 'insufficient data'.
    direction 'helps' = the feature is higher in top-outcome prompts. ``stats["tested"]`` gets the number of tests run."""
    rng = np.random.default_rng(0)
    tests = []
    for cid in sorted(df.filter(pl.col("cluster_id") >= 0)["cluster_id"].unique().to_list()):
        g = df.filter((pl.col("cluster_id") == cid) & pl.col("outcome_score").is_not_null() & pl.col("q_specificity").is_not_null())
        if g.height < min_cluster:
            continue
        top, bot = tercile_groups(g["outcome_score"].to_numpy())
        if top.sum() < min_group or bot.sum() < min_group:
            continue
        for feat in FEATURES:
            v = g[COLS[feat]].to_numpy().astype(float)
            a, b = v[top], v[bot]
            if len(a) > max_group:
                a = a[np.sort(rng.choice(len(a), max_group, replace=False))]
            if len(b) > max_group:
                b = b[np.sort(rng.choice(len(b), max_group, replace=False))]
            d = cliffs_delta(a, b)
            lo, hi, p = bootstrap_delta(a, b, B=B, seed=int(cid) * 10 + FEATURES.index(feat))
            tests.append({"cluster": int(cid), "feature": feat, "effect": d, "ci": [lo, hi], "n": int(top.sum() + bot.sum()), "p": p})
    if stats is not None:
        stats["tested"] = len(tests)
    keep = bh_fdr([t["p"] for t in tests], q)
    out = [
        {k: t[k] for k in ("cluster", "feature", "effect", "ci", "n")} | {"direction": "helps" if t["effect"] > 0 else "hurts"}
        for t, k_ in zip(tests, keep)
        if k_ and abs(t["effect"]) >= min_abs and (t["ci"][0] > 0 or t["ci"][1] < 0)
    ]
    return sorted(out, key=lambda r: (-abs(r["effect"]), r["cluster"], r["feature"]))


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float, float]:
    """(rate, lo, hi) Wilson score interval."""
    if n == 0:
        return 0.0, 0.0, 1.0
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return p, max(0.0, c - h), min(1.0, c + h)


def rate_diffs(df: pl.DataFrame, min_cluster: int = 20, min_group: int = 8, min_abs: float = 0.1, stats: dict | None = None) -> list[dict]:
    """Basic tier (no sklearn): per group, applied-rate of sessions whose first prompt scores high (>=0.5) vs low on a
    quality axis. effect = rate difference, CI by Newcombe's method on Wilson bounds. ``df`` needs cluster_id,
    has_applied and q_* columns, one row per session. ponytail: no multiple-testing correction; the |d| and CI gates stand in."""
    out, tested = [], 0
    for cid in sorted(df.filter(pl.col("cluster_id") >= 0)["cluster_id"].unique().to_list()):
        g = df.filter((pl.col("cluster_id") == cid) & pl.col("q_specificity").is_not_null() & pl.col("has_applied").is_not_null())
        if g.height < min_cluster:
            continue
        y = g["has_applied"].to_numpy().astype(bool)
        for feat in FEATURES:
            hi = g[COLS[feat]].to_numpy().astype(float) >= 0.5
            if hi.sum() < min_group or (~hi).sum() < min_group:
                continue
            tested += 1
            p1, l1, u1 = wilson(int(y[hi].sum()), int(hi.sum()))
            p0, l0, u0 = wilson(int(y[~hi].sum()), int((~hi).sum()))
            d = p1 - p0
            lo, up = d - ((p1 - l1) ** 2 + (u0 - p0) ** 2) ** 0.5, d + ((u1 - p1) ** 2 + (p0 - l0) ** 2) ** 0.5
            if abs(d) >= min_abs and (lo > 0 or up < 0):
                out.append({"cluster": int(cid), "feature": feat, "effect": d, "ci": [lo, up], "n": g.height, "direction": "helps" if d > 0 else "hurts", "rate": True})
    if stats is not None:
        stats["tested"] = tested
    return sorted(out, key=lambda r: (-abs(r["effect"]), r["cluster"], r["feature"]))
