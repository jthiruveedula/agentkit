"""Six-stage funnel (architecture.md). A session reaches stage k only if it reached all earlier stages."""

from __future__ import annotations

from typing import Any

import polars as pl

STAGES = ["intent", "prompt", "response", "iterate", "applied", "outcome"]
_FLAGS = ["has_intent", "has_prompt", "has_response", "iterating", "has_applied", "has_outcome"]


def cumulative(df: pl.DataFrame) -> pl.DataFrame:
    """Adds cumulative boolean columns c1..c6 and ``reached_stage`` (0..6) from the raw stage flags."""
    out = df
    prev = pl.lit(True)
    cols = []
    for i, f in enumerate(_FLAGS, 1):
        prev = prev & pl.col(f).fill_null(False)
        cols.append(prev.alias(f"c{i}"))
    out = out.with_columns(cols)
    return out.with_columns(pl.sum_horizontal([pl.col(f"c{i}").cast(pl.Int64) for i in range(1, 7)]).alias("reached_stage"))


def counts(df: pl.DataFrame, by: str, keys: list[str]) -> list[dict[str, Any]]:
    """Per key, session counts at each stage, asserted monotone non-increasing."""
    rows = []
    for k in keys:
        g = df.filter(pl.col(by) == k)
        c = [int(g[f"c{i}"].sum() or 0) for i in range(1, 7)]
        assert all(a >= b for a, b in zip(c, c[1:])), f"funnel not monotone for {k}: {c}"
        rows.append({by: k, "counts": c})
    return rows
