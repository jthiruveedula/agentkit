"""Run the shipped insight builders (#134, #135) over MOCK frames -> release/data/insights.json.
Mock only: public video never shows real sessions."""

import json
import sys
from pathlib import Path
import numpy as np
import polars as pl

sys.path.insert(
    0, str(Path(__file__).resolve().parents[3] / "packages/prompt-analytics/tests")
)
from prompt_analytics import insights
from test_trends import _frames

rng = np.random.default_rng(7)
rates = [0.3, 0.3, 0.4, 0.3, 0.3, 0.4, 0.3, 0.3, 0.7, 0.8, 0.7, 0.7, 0.8, 0.7, 0.7, 0.8]
costs = [20.0] * 7 + [21.0] * 8 + [200.0]
m, s = _frames(rates, costs)
out = insights._trends(m, s)
wk = insights._weekly(m, s)
weekly = [
    {
        "week": w["week"].isoformat(),
        "rate": w["applied"] / w["n"],
        "cpc": w["cost"] / max(w["applied"], 1),
    }
    for w in wk
]

n = 400
loops = rng.choice([0, 1, 2, 3, 4], n, p=[0.45, 0.25, 0.15, 0.1, 0.05])
p_ok = np.array([0.78, 0.66, 0.52, 0.22, 0.18])[loops]
hours = rng.choice(
    24, n
)  # kept so the rng stream (and the retry-cliff numbers) stay as rendered
p_ok = np.clip(
    p_ok + np.where((hours >= 8) & (hours < 12), 0.12, 0) - np.where(hours < 4, 0.2, 0),
    0,
    1,
)
ok = rng.random(n) < p_ok
sm = pl.DataFrame(
    {
        "session_id": [f"x{i}" for i in range(n)],
        "n_user": [3] * n,
        "loops": loops,
        "has_applied": ok,
    }
)
out += insights._retry_cliff(sm)
# Prompt length + daypart: the same mock insights the dashboard shows (sample.dev.json), so the
# Manim segments match the dashboard curve cards in the close scene. Retry cliff has none there.
sample = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "packages/prompt-analytics/dashboard/src/data/sample.dev.json"
    ).read_text()
)
out += [
    i for i in sample["insights"] if i["id"] in ("works.prompt_length", "time.daypart")
]
dst = Path(__file__).parent / "data/insights.json"
dst.parent.mkdir(exist_ok=True)
dst.write_text(json.dumps({"insights": out, "weekly": weekly}, default=str, indent=1))
for c in out:
    print(c["id"], "|", c["claim"])
