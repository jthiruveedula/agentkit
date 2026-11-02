"""Golden dashboard.json on synth (tfidf backend). Regenerate with UPDATE_GOLDEN=1."""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

import duckdb
import pytest
import synth
from prompt_analytics import analyze, export
from prompt_analytics.config import Config

GOLDEN = Path(__file__).parent / "golden" / "dashboard.json"


def _cmp(a, b, path="$"):
    if isinstance(a, dict):
        assert isinstance(b, dict) and a.keys() == b.keys(), (
            f"{path}: keys {sorted(set(a) ^ set(b))}"
        )
        for k in a:
            if k != "generated_at":
                _cmp(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        assert isinstance(b, list) and len(a) == len(b), (
            f"{path}: len {len(a)} != {len(b)}"
        )
        for i, (x, y) in enumerate(zip(a, b)):
            _cmp(x, y, f"{path}[{i}]")
    elif isinstance(a, float) or isinstance(b, float):
        # export rounds to 6 dp; BLAS differences across OSes can flip the last digit
        assert math.isclose(a, b, rel_tol=1e-6, abs_tol=1.5e-6), f"{path}: {a} != {b}"
    else:
        assert a == b, f"{path}: {a!r} != {b!r}"


def _cpu_sensitive(d: dict) -> dict:
    """Split out cluster assignments. PCA + HDBSCAN land on different leaves when
    BLAS kernels differ (CI runner CPUs vary), so these are checked for shape only.
    Measured by adding 2e-6 noise to the PCA output: nothing else in the export moves."""
    d = json.loads(json.dumps(d))
    g = d.pop("galaxy")
    for rows in (d["sessions"], d["repeats"]):
        for r in rows:
            r.pop("cluster", None)
    return {
        "clusters": [sorted(c) for c in g["clusters"]],
        "points": {k: len(v) for k, v in g["points"].items()},
        "rest": d,
    }


def test_golden():
    cfg, con, _ = synth.build_analyzed(backend="tfidf")
    got = json.loads(export.serialize(export.build(con, cfg)))
    got["engine"] = {
        k: got["engine"][k] for k in ("mode", "requested", "methods")
    }  # libs/accel/reason are machine-specific
    if os.environ.get("UPDATE_GOLDEN") or not GOLDEN.exists():
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(got, indent=1, sort_keys=True) + "\n")
    a, b = _cpu_sensitive(got), _cpu_sensitive(json.loads(GOLDEN.read_text()))
    _cmp(a["rest"], b["rest"])
    assert a["points"] == b["points"]
    assert abs(len(a["clusters"]) - len(b["clusters"])) <= 3, "cluster count drifted"
    assert set(map(tuple, a["clusters"])) == set(map(tuple, b["clusters"]))


@pytest.mark.skipif(not os.environ.get("PA_PERF"), reason="slow: set PA_PERF=1")
def test_perf_50k_turns(tmp_path):
    cfg = Config(data_dir=tmp_path, embed_backend="tfidf")
    con = duckdb.connect()
    synth.make_db(con, n_sessions=15000, tmp_dir=tmp_path / ".tmp")
    n = con.execute("select count(*) from turns where role='user'").fetchall()[0][0]
    t = time.time()
    rep = analyze.run(cfg, con)
    dt = time.time() - t
    print(f"analyze: {n} user turns, {dt:.1f}s")
    assert dt < 60 and rep.n_prompts > 0
