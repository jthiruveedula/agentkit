"""Analysis tiers: forced via a monkeypatched capability probe on the synth DB."""

from __future__ import annotations

import json
import sys

import duckdb
import synth
from prompt_analytics import analyze, capabilities, export
from prompt_analytics.config import Config
from prompt_analytics.ml import embed

LIBS = {"numpy": "2", "scikit-learn": "1", "fastembed": None, "sentence-transformers": None, "torch": None}


def fake_probe(available):
    def probe(models_dir=None, requested=None):
        nxt = next((m for m in capabilities.MODES if m not in available), None)
        return {"libs": LIBS, "available": available, "model_cached": "deep" in available, "accel": "cpu",
                "upgrade": {"mode": nxt, "command": capabilities.UPGRADE[nxt]} if nxt else None}
    return probe


def run_tier(tmp_path, available, mode):
    cfg = Config(data_dir=tmp_path, embed_backend="tfidf")
    con = duckdb.connect()
    synth.make_db(con, 7, 400, tmp_path / ".tmp")
    rep = analyze.run(cfg, con, mode)
    return cfg, con, rep, export.build(con, cfg)


def check(d, mode, available):
    e = d["engine"]
    assert e["mode"] == mode and e["available"] == available and e["libs"] == LIBS and e["reason"] and set(e["methods"]) >= {"friction", "works", "funnel"}
    assert d["insights"] and all(i["claim"] for i in d["insights"])
    json.dumps(d, allow_nan=False)


def test_basic_without_sklearn(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "sklearn", None)
    monkeypatch.setattr(capabilities, "probe", fake_probe(["basic"]))
    cfg, con, rep, d = run_tier(tmp_path, ["basic"], "basic")
    check(d, "basic", ["basic"])
    assert rep.cluster_method == "intent" and d["galaxy"]["points"]["x"] == [] and d["galaxy"]["clusters"]
    assert d["engine"]["upgrade"]["mode"] == "ml"
    assert d["quality"]["validation"]["spearman"] is not None
    export.write(cfg, d, tmp_path / "out")  # privacy gate passes


def test_ml_tier(tmp_path, monkeypatch):
    monkeypatch.setattr(capabilities, "probe", fake_probe(["basic", "ml"]))
    _, _, rep, d = run_tier(tmp_path, ["basic", "ml"], "ml")
    check(d, "ml", ["basic", "ml"])
    assert d["galaxy"]["points"]["x"] and rep.backend.startswith("tfidf")


def test_deep_tier_near_dupes(tmp_path, monkeypatch):
    av = ["basic", "ml", "deep"]
    monkeypatch.setattr(capabilities, "probe", fake_probe(av))
    real = embed.get_embedder

    def fake(backend, models_dir=None):  # stands in for a cached pretrained model
        e, w = real("tfidf", models_dir)
        e.name = "fastembed:fake"
        return e, w

    monkeypatch.setattr(embed, "get_embedder", fake)
    _, _, rep, d = run_tier(tmp_path, av, "deep")
    check(d, "deep", av)
    assert d["engine"]["upgrade"] is None and "near-duplicates" in d["engine"]["methods"]["friction"]
    assert any(i["id"] == "works.dupes" for i in d["insights"])
    assert any(r["title"] == "Save repeated prompts" for r in d["recommendations"])


def test_unavailable_falls_back(tmp_path, monkeypatch):
    monkeypatch.setattr(capabilities, "probe", fake_probe(["basic", "ml"]))
    _, _, rep, d = run_tier(tmp_path, ["basic", "ml"], "deep")
    assert d["engine"]["mode"] == "ml" and d["engine"]["requested"] == "deep" and "not available" in d["engine"]["reason"]


def test_resolve_auto_picks_highest():
    for av, want in ((["basic"], "basic"), (["basic", "ml"], "ml"), (["basic", "ml", "deep"], "deep")):
        assert capabilities.resolve("auto", fake_probe(av)())[0] == want
    assert capabilities.resolve("basic", fake_probe(["basic", "ml"])())[0] == "basic"


def test_probe_never_imports_heavy_libs():
    before = {m for m in ("torch", "fastembed", "sentence_transformers") if m in sys.modules}
    capabilities.probe(None, "auto")
    assert {m for m in ("torch", "fastembed", "sentence_transformers") if m in sys.modules} == before
