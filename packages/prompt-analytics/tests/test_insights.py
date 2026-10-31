from __future__ import annotations

import synth
from prompt_analytics import export, insights

CH = insights.CHAPTERS


def _d(profile="default"):
    cfg, con, _ = synth.build_analyzed(profile=profile)
    return export.build(con, cfg)


def test_every_chapter_has_headline_and_ranks_are_contiguous():
    d = _d()
    for ch in CH:
        r = [i["rank"] for i in d["insights"] if i["chapter"] == ch]
        assert r and r == list(range(1, len(r) + 1))


def test_claims_short_second_person_and_evidence():
    for prof in ("default", "demo"):
        for i in _d(prof)["insights"]:
            assert len(i["claim"].split()) <= 12, i["claim"]
            assert i["evidence"]["n"] > 0 and i["evidence"]["method"]
            assert i["drill"]["chapter"] == i["chapter"]
    claims = [i["claim"] for i in _d()["insights"]]
    assert any("Your " in c or "your " in c for c in claims)


def test_per_chapter_cap_and_summary_set():
    d = _d()
    for ch in CH[:-1]:
        assert sum(i["chapter"] == ch for i in d["insights"]) <= insights.MAX_PER_CHAPTER
    summ = [i for i in d["insights"] if i["chapter"] == "recommend" and i["metric"].startswith("summary:")]
    assert len(summ) == 5


def test_no_causal_wording():
    bad = ("because", "causes", "caused", "due to", "leads to")
    for i in _d()["insights"]:
        assert not any(b in i["claim"].lower() for b in bad)


def test_exposure_insights_ordered_and_recs_rank_first():
    d = _d()
    fr = [i["claim"] for i in d["insights"] if i["chapter"] == "friction"][:3]
    assert fr[0].startswith("Health") and fr[1].startswith("Credential") and fr[2].startswith("Personal")
    assert all(len(c.split()) <= 12 for c in fr)
    titles = [r["title"] for r in d["recommendations"]]
    assert titles[:3] == ["Keep patient data out of prompts", "Stop pasting credentials into prompts", "Use fake data instead of real personal data"]
    ids = {i["id"] for i in d["insights"]}
    assert all(r["evidence_insight"] in ids for r in d["recommendations"])


def test_suppressed_below_min_support():
    import polars as pl

    sm = pl.DataFrame({"session_id": ["a"], "source": ["cursor"], "intent": ["bugfix"], "n_user": [1], "ttr_s": [60.0], "has_applied": [True],
                       "loops": [0], "friction": [0.0], "corrections": [0], "first_quality": [0.5]})
    assert insights._tool_vs_tool(sm) == [] and insights._friction_hotspots(sm) == [] and insights._specific_prompts(sm) == []
    assert insights._months(sm, pl.DataFrame({"session_id": ["a"], "date": [None], "cost": [0.0]}, schema={"session_id": pl.Utf8, "date": pl.Date, "cost": pl.Float64})) == []


def test_months_unpriced_month_no_div_zero():
    import datetime as dt

    import polars as pl

    ids = [f"s{i}" for i in range(20)]
    sm = pl.DataFrame({"session_id": ids, "n_user": [1] * 20, "has_applied": [True] * 20})
    sess = pl.DataFrame({"session_id": ids, "date": [dt.date(2026, 9, 1)] * 10 + [dt.date(2026, 10, 1)] * 10,
                         "cost": [0.0] * 10 + [1.0] * 10})  # September unpriced (e.g. copilot only)
    assert not any(c["id"].startswith("footprint.") for c in insights._months(sm, sess))
