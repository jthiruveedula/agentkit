from __future__ import annotations

import json
import os
import stat

import duckdb
import pytest
import synth
from prompt_analytics import analyze, export, insights
from prompt_analytics.config import Config
from prompt_analytics.schema import DDL

KEYS = {"schema", "generated_at", "range", "engine", "sources", "totals", "by_source", "calendar", "hour_week", "cost_river", "anomalies", "ttr", "what_works_tested",
        "funnel", "tool_switch", "friction", "galaxy", "quality", "what_works", "sessions", "exposure", "insights", "recommendations"}


@pytest.fixture(scope="module")
def built():
    cfg, con, _ = synth.build_analyzed()
    return cfg, export.build(con, cfg)


def test_contract_shape(built):
    _, d = built
    assert set(d) == KEYS and d["schema"] == "1.0"
    g = d["galaxy"]
    assert len(g["points"]["x"]) <= 20000 and all(0 <= v <= 1 for v in g["points"]["x"] + g["points"]["y"])
    assert all(len(c["exemplar"] or "") <= 160 for c in g["clusters"])
    assert set(d["exposure"]) >= {"sessions", "share", "by_category", "by_kind", "weekly", "items"}


def test_exposure_items_and_exclusions(built):
    _, d = built
    ex = d["exposure"]
    items = ex["items"]
    assert len(items) <= 300 and [i["date"] for i in items] == sorted((i["date"] for i in items), reverse=True)
    st = [i["status"] for i in items]
    assert st.count("false_positive") == 1 and st.count("reviewed") == 1
    assert ex["sessions"] == 11  # 12 planted, false positive and the subagent one excluded
    assert {i["category"] for i in items} == {"phi", "secret", "pii"}
    assert all(i["kinds"] == sorted(i["kinds"]) and len(i["preview"]) <= 160 for i in items)
    assert any("⟦" in i["preview"] for i in items)
    ids = {r["id"] for r in d["sessions"]}
    assert all(i["session"] in ids for i in items)  # the UI groups the queue per session
    assert sum(c["sessions"] for c in ex["by_category"] if c["category"] == "phi") == 2


def test_empty_db_exposure_and_export(tmp_path):
    cfg = Config(data_dir=tmp_path, embed_backend="tfidf")
    con = duckdb.connect()
    con.execute(DDL)
    rep = analyze.run(cfg, con)
    assert rep.n_prompts == 0
    d = export.build(con, cfg)
    assert d["exposure"]["sessions"] == 0 and d["exposure"]["items"] == [] and d["exposure"]["by_category"] == []
    assert {i["chapter"] for i in d["insights"]} == set(insights.CHAPTERS)
    export.write(cfg, d, tmp_path / "out")


def test_write_gate_escape_and_perms(built, tmp_path):
    cfg, d = built
    d = json.loads(json.dumps(d))
    d["insights"][0]["claim"] = "a </script><script>b</script> <!-- c"
    out = export.write(cfg, d, tmp_path / "o")
    html = out.read_text()
    assert "</script><script>" not in html and "<!--" not in html.split('id="pa-data"')[1].split("</script>")[0]
    blob = html.split('id="pa-data">')[1].split("</script>")[0]
    assert json.loads(blob)["schema"] == "1.0"
    assert stat.S_IMODE(os.stat(out).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(tmp_path / "o" / "dashboard.json").st_mode) == 0o600


def test_gate_blocks_leak(built, tmp_path):
    cfg, d = built
    d = json.loads(json.dumps(d))
    d["insights"][0]["claim"] = "mail jane.doe@gmail.com key AKIAIOSFODNN7EXAMPLE"
    with pytest.raises(export.ExportBlocked) as e:
        export.write(cfg, d, tmp_path / "o")
    assert e.value.kinds
    assert not (tmp_path / "o" / "dashboard.json").exists()


def test_export_has_no_raw_session_text(built):
    _, d = built
    blob = json.dumps(d)
    assert "@" not in blob and "jane" not in blob  # only redaction placeholders survive


def test_sessions_rows(built):
    _, d = built
    rows, tot = d["sessions"], d["totals"]["sessions"]
    assert len(rows) == min(tot, export.MAX_SESSIONS) and len({r["id"] for r in rows}) == len(rows)
    assert [r["date"] for r in rows] == sorted((r["date"] for r in rows), reverse=True)
    keys = {"id", "source", "date", "project", "intent", "prompts", "tokens", "cost_usd", "reached_stage", "applied", "loops", "friction", "cluster", "title"}
    assert all(set(r) == keys and len(r["title"]) <= 160 and r["intent"] in export.INTENTS for r in rows)
    assert sum(r["prompts"] for r in rows) <= d["totals"]["prompts"] + 1 and all("@" not in r["title"] for r in rows)
    # unpriced sources get null cost, never 0
    by = {s["source"]: s["cost_usd"] for s in d["by_source"]}
    for r in rows:
        if by[r["source"]] == 0:
            assert r["cost_usd"] is None
