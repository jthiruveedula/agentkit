"""Planted ground truth from tests/synth.py is recovered by the pipeline."""

from __future__ import annotations

from datetime import date

import synth
from prompt_analytics import export
from prompt_analytics.analytics import metrics as mx


def _data():
    cfg, con, _ = synth.build_analyzed()
    return con, export.build(con, cfg)


def test_streak_cost_spike_and_switches():
    _, d = _data()
    assert d["totals"]["longest_streak"] >= 14
    assert any(a["metric"] == "cost" and a["date"] == synth.SPIKE_DAY for a in d["anomalies"])
    sw = {(t["from"], t["to"]): t["count"] for t in d["tool_switch"]}
    assert sw[("claude_code", "cursor")] >= 12


def test_cursor_refactor_fastest():
    _, d = _data()
    ttr = {t["source"]: t["median_min"] for t in d["ttr"] if t["intent"] == "refactor"}
    assert ttr["cursor"] < 0.5 * min(v for k, v in ttr.items() if k != "cursor")


def test_loop_session_and_antigravity_and_subagent():
    con, d = _data()
    loops = con.execute("select loops from session_metrics where session_id='claude_code:loop01'").fetchall()[0][0]
    assert loops >= 4
    ag = next(r for r in d["funnel"]["by_source"] if r["source"] == "antigravity")
    assert ag["counts"] == [0] * 6  # metadata-only source never enters the funnel
    n_human = con.execute("select count(*) from sessions where not is_subagent").fetchall()[0][0]
    assert d["totals"]["sessions"] == n_human


def test_funnel_monotone_everywhere():
    _, d = _data()
    for sl in (d["funnel"]["by_source"], d["funnel"]["by_intent"]):
        for r in sl:
            assert all(a >= b for a, b in zip(r["counts"], r["counts"][1:]))


def test_vague_prompts_hurt():
    con, _ = _data()
    rho = con.execute("select corr(first_quality, n_user) from session_metrics where first_quality is not null").fetchall()[0][0]
    assert rho < 0


def test_streaks_unit():
    ds = [date(2026, 1, d) for d in (1, 2, 3, 5, 6)]
    assert mx.streaks(ds) == (5, 3, 2)
    assert mx.streaks([]) == (0, 0, 0)
    assert mx.week_start(date(2026, 3, 4)) == date(2026, 3, 2)


def test_demo_profile_covers_all_sources():
    cfg, con, _ = synth.build_analyzed(profile="demo")
    d = export.build(con, cfg)
    srcs = {"claude_code", "cursor", "copilot", "opencode", "antigravity"}
    assert {s["source"] for s in d["by_source"] if s["sessions"] > 0} == srcs
    assert all(r["counts"][0] > 0 for r in d["funnel"]["by_source"])
    assert {r["source"] for r in d["friction"]["rates"]} == srcs
    assert {s["status"] for s in d["sources"]} == {"ok"}
    assert len({(t["from"], t["to"]) for t in d["tool_switch"]}) == 20
    assert {q["source"] for q in d["quality"]["by_source"]} == srcs
