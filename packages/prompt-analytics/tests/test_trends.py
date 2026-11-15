"""Weekly trend insights over a mock dataset with a planted shift and a planted cost-per-change spike."""

from __future__ import annotations

from datetime import date, timedelta

import polars as pl

from prompt_analytics import insights


def _frames(rates: list[float], costs: list[float]):
    s, m = [], []
    for w, (r, c) in enumerate(zip(rates, costs)):
        for i in range(10):
            sid = f"s{w}_{i}"
            s.append(
                {
                    "session_id": sid,
                    "date": date(2026, 1, 5) + timedelta(weeks=w),
                    "cost": c / 10,
                    "is_subagent": False,
                }
            )
            m.append({"session_id": sid, "has_applied": i < round(r * 10)})
    return pl.DataFrame(m), pl.DataFrame(s)


def test_shift_and_spike_in_plain_words():
    rates = [0.3, 0.3, 0.4, 0.3, 0.3, 0.4, 0.3, 0.3] + [
        0.7,
        0.8,
        0.7,
        0.7,
        0.8,
        0.7,
        0.7,
        0.8,
    ]
    costs = [20.0] * 7 + [21.0] * 8 + [200.0]
    out = insights._trends(*_frames(rates, costs))
    ids = {c["id"].split(".")[1] for c in out}
    assert ids == {"shift", "anomaly"}
    shift = next(c for c in out if c["id"] == "time.shift.applied")
    assert "rose" in shift["claim"] and "Mar" in shift["claim"]


def test_quiet_series_yields_nothing():
    assert insights._trends(*_frames([0.5] * 16, [30.0] * 16)) == []
