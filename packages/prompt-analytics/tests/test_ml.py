"""Unit tests for the ml modules on tiny hand-built inputs."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import polars as pl

from prompt_analytics.analytics import funnel
from prompt_analytics.ml import anomaly, friction, intent, quality, topics, whatworks


def test_intent_margin_and_floor():
    C = np.eye(2, dtype=np.float32)
    labels = ["bugfix", "docs"]
    z = np.zeros((1, 2), dtype=np.float32)
    E = np.array([[1.0, 0.0], [0.7, 0.68], [0.1, 0.1]], dtype=np.float32)
    out, score = intent.classify(E, C, np.zeros((3, 2), dtype=np.float32), labels, min_score=0.35, margin=0.1)
    assert out == ["bugfix", "other", "other"]  # clear win; thin margin; below floor
    out, _ = intent.classify(E[1:2], C, np.array([[0, 2]], dtype=np.float32), labels, 0.35, 0.03)
    assert out == ["docs"]  # regex prior breaks the tie
    assert intent.classify(np.zeros((0, 2), dtype=np.float32), C, z[:0], labels, 0.1, 0.1)[0] == []


def test_regex_hits_capped():
    spec = intent.load_intents()
    h = intent.regex_hits(["fix the bug, error, crash, traceback, exception"], spec)
    assert h.max() == 2 and h[0, spec.labels.index("bugfix")] == 2


def test_friction_cues():
    assert friction.lexical_flags("no, that's wrong") == (True, False)
    assert friction.lexical_flags("ugh, still not working!!") [1]
    assert friction.lexical_flags("please add a button") == (False, False)
    assert friction.lexical_flags(None) == (False, False)


def test_rephrase_same_session_only():
    t = ["fix the login bug in auth", "fix the login bug in auth please", "fix the login bug in auth", "write docs"]
    toks = [friction.tokens(x) for x in t]
    E = np.array([[1, 0], [0.99, 0.1], [1, 0], [0, 1]], dtype=np.float32)
    E /= np.linalg.norm(E, axis=1, keepdims=True)
    f = friction.rephrase_flags(E, np.array([0, 0, 1, 1]), toks, thr=0.8)
    assert f.tolist() == [False, True, False, False]  # row 2 is a new session: no look-back across sessions


def test_abandoned_and_friction_score():
    df = pl.DataFrame({"n_turns": [1, 6, 2, 0], "last_role": ["user", "assistant", "assistant", None], "last_ok": [False, True, True, False],
                       "has_work": [False, True, False, False], "has_applied": [False, True, False, False], "has_outcome": [False] * 4,
                       "intent": ["bugfix", "bugfix", "explain", None]})
    assert friction.abandoned(df).to_list() == [True, False, False, False]
    d = pl.DataFrame({"n_user": [4, 0], "corrections": [4, 0], "frustrations": [0, 0], "loops": [3, 0], "interrupts": [0, 0], "abandoned": [False, False]})
    s = friction.friction_score(d)["friction"].to_list()
    assert abs(s[0] - (0.30 + 0.25)) < 1e-9 and s[1] is None


def test_quality_subscores():
    good = "Fix the KeyError thrown by `load_user` in src/auth/login.py at line 42. It must not change the public API; the test should pass."
    vague = "fix it"
    sg, sv = quality.subscores(good), quality.subscores(vague)
    assert sg[0] == 1.0 and sg[2] >= 0.5 and sg[3] == 1.0
    assert sv[0] == 0.0 and sv[1] == 0.0 and sv[3] < 0.2
    assert quality.blend(sg) > quality.blend(sv)
    assert quality.subscores("```py\nx=1\n```")[1] == 1.0
    assert 0.0 <= quality.blend(sg) <= 100.0 and quality.blend(quality.subscores("")) == 0.0


def test_quality_validate_negative_when_good_means_fewer_followups():
    rng = np.random.default_rng(0)
    q = rng.random(60)
    it = np.round((1 - q) * 5)
    rho, n = quality.validate(q, it, np.array(["bugfix"] * 30 + ["feature"] * 30))
    assert rho is not None and rho < -0.8 and n == 60


def test_mad_anomaly_and_zero_mad_fallback():
    w = np.array([10, 11, 9, 10, 12, 10, 11.0])
    assert anomaly.robust_z(10.0, w) == 0.0
    assert anomaly.robust_z(40.0, w) > 3.5
    w0 = np.array([1.0, 1, 1, 1, 1, 1, 2])  # MAD == 0, mean AD > 0 -> fallback
    assert anomaly.robust_z(10.0, w0) > 3.5
    assert anomaly.robust_z(5.0, np.ones(7)) == 0.0  # flat window: no signal


def test_detect_needs_history_and_flags_spike():
    d0 = date(2026, 1, 1)
    dates = [d0 + timedelta(days=i) for i in range(20)]
    vals = [10.0, 11, 9, 10, 12, 10, 11, 10, 9, 11, 10, 10, 11, 9, 10, 12, 10, 11, 10, 90]
    rows = anomaly.detect(dates, vals)
    assert all(r["z"] is None for r in rows[:7])
    assert [r["date"] for r in anomaly.flagged(rows)] == [dates[-1]]


def test_bh_fdr_and_cliffs():
    assert whatworks.bh_fdr([0.001, 0.009, 0.2, 0.5]) == [True, True, False, False]
    assert whatworks.bh_fdr([0.5, 0.6]) == [False, False]
    assert whatworks.cliffs_delta(np.array([5.0, 6, 7]), np.array([1.0, 2, 3])) == 1.0
    assert whatworks.cliffs_delta(np.array([1.0, 2]), np.array([1.0, 2])) == 0.0
    lo, hi, p = whatworks.bootstrap_delta(np.arange(20.0) + 30, np.arange(20.0))
    assert lo > 0.9 and hi <= 1.0 and p < 0.01
    top, bot = whatworks.tercile_groups(np.array([1.0, 1, 1, 1]))
    assert not top.any() and not bot.any()


def test_ctfidf_labels_pick_distinct_terms():
    texts = ["deploy docker pipeline fails", "docker deploy workflow broken", "csv export orders pandas", "pandas csv cleaning orders"]
    lab = topics.ctfidf_labels(texts, np.array([0, 0, 1, 1]))
    assert "docker" in lab[0][:2] and "deploy" in lab[0][:3]
    assert "csv" in lab[1][:2] or "pandas" in lab[1][:2]
    assert not set(lab[0][:2]) & set(lab[1][:2])


def test_funnel_monotone():
    flags = ["has_intent", "has_prompt", "has_response", "iterating", "has_applied", "has_outcome"]
    rows = [dict.fromkeys(flags, True), {**dict.fromkeys(flags, True), "has_response": False}, {**dict.fromkeys(flags, False), "has_outcome": True}]
    df = pl.DataFrame(rows).with_columns(pl.lit("cursor").alias("source"))
    c = funnel.cumulative(df)
    assert c["reached_stage"].to_list() == [6, 2, 0]  # later flags never count without earlier ones
    got = funnel.counts(c, "source", ["cursor", "opencode"])
    assert got[0]["counts"] == [2, 2, 1, 1, 1, 1] and got[1]["counts"] == [0] * 6


def test_embed_lazy_fallback(tmp_path):
    from prompt_analytics.ml import embed

    emb, warns = embed.get_embedder("tfidf", tmp_path)
    assert emb is not None and isinstance(warns, list)
