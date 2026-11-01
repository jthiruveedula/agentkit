"""Repeated prompts: thresholds, cap, redaction, determinism, and the schema 1.2 session features."""

from __future__ import annotations

import synth
from prompt_analytics import export, repeats as rp
from prompt_analytics.privacy import Redactor

ASK = "please run the linter and fix every warning in this file"


def rows(text, n_sessions, per=1, cid=-1):
    return [(f"s{i}", text, cid) for i in range(n_sessions) for _ in range(per)]


def test_threshold_count_and_sessions():
    assert rp.find_repeats(rows(ASK, 2)) == []  # below MIN_COUNT
    assert rp.find_repeats(rows(ASK, 1, per=5)) == []  # one session pasting itself
    (r,) = rp.find_repeats(rows(ASK, 3))
    assert r["count"] == 3 and r["sessions"] == ["s0", "s1", "s2"]


def test_normalises_case_and_punctuation_and_skips_acks():
    rs = [("s0", ASK, -1), ("s1", ASK.upper() + "!!", -1), ("s2", "  " + ASK + ".", -1)]
    assert rp.find_repeats(rs)[0]["count"] == 3
    assert rp.find_repeats(rows("yes please do", 5)) == []  # < MIN_WORDS
    assert rp.find_repeats(rows("/review the whole branch now please", 5)) == []


def test_cap_order_and_exemplar_length():
    rs = []
    for i in range(15):
        rs += rows(f"ask number {'x' * i} do the thing again and again please", 3 + i)
    out = rp.find_repeats(rs)
    assert len(out) == rp.MAX_REPEATS
    assert [r["count"] for r in out] == sorted((r["count"] for r in out), reverse=True)
    long = rp.find_repeats(rows("word " * 100, 3))
    assert len(long[0]["exemplar"]) == rp.SNIPPET
    assert rp.find_repeats(rows(ASK, 40))[0]["sessions"].__len__() == rp.MAX_SESSION_IDS


def test_semantic_merge_within_cluster_only():
    a = "write unit tests for the billing module covering refunds and failures"
    b = a + " too"
    rs = rows(a, 2, cid=4) + rows(b, 2, cid=4)
    assert rp.find_repeats(rs) == []  # exact only: two groups of 2
    (r,) = rp.find_repeats(rs, semantic=True)
    assert r["count"] == 4 and r["cluster"] == 4
    other = rows(a, 2, cid=4) + rows(b, 2, cid=5)
    assert rp.find_repeats(other, semantic=True) == []


def test_deterministic():
    rs = rows(ASK, 4) + rows("explain what this function does in detail", 4)
    assert rp.find_repeats(rs) == rp.find_repeats(list(rs))


def test_export_repeats_are_redacted_and_features_valid():
    cfg, con, _ = synth.build_analyzed(backend="tfidf")
    d = export.build(con, cfg)
    assert d["schema"] == "1.2" and len(d["repeats"]) <= rp.MAX_REPEATS
    ids = {s["id"] for s in d["sessions"]}
    for r in d["repeats"]:
        assert set(r) == {"cluster", "count", "exemplar", "sessions"}
        assert r["count"] >= rp.MIN_COUNT and len(r["sessions"]) >= rp.MIN_SESSIONS
        assert len(r["exemplar"]) <= 160 and set(r["sessions"]) <= ids
        assert Redactor().find_leaks(r["exemplar"]) == []
    assert all(
        set(s["features"]) <= {"specificity", "context", "constraints", "length"}
        for s in d["sessions"]
    )
    assert any(s["features"] for s in d["sessions"])
