import os
import time

from prompt_analytics import scan, store


def run(cfg, ad, **kw):
    return scan.run(cfg, adapters=[ad], **kw).sources["fake"]


def test_incremental(cfg, make_fake, fake_root):
    ad = make_fake()
    r = run(cfg, ad)
    assert (r.files_seen, r.parsed, r.skipped, r.sessions) == (1, 1, 0, 1)
    r = run(cfg, ad)
    assert (r.parsed, r.skipped) == (0, 1) and ad.parse_calls == 1
    p = fake_root / "a.jsonl"
    p.write_text("changed")
    os.utime(p, ns=(time.time_ns() + 10**9, time.time_ns() + 10**9))
    r = run(cfg, ad)
    assert r.parsed == 1
    # touched but identical content -> content hmac equal -> skipped
    os.utime(p, ns=(time.time_ns() + 5 * 10**9,) * 2)
    assert run(cfg, ad).parsed == 0
    assert run(cfg, ad, full=True).parsed == 1


def test_rules_version_change_reparses(cfg, make_fake, monkeypatch):
    ad = make_fake()
    run(cfg, ad)
    monkeypatch.setattr(scan, "RULES_VERSION", "999")
    assert run(cfg, ad).parsed == 1


def test_parse_error_is_warning(cfg, make_fake):
    r = run(cfg, make_fake(parse_error=True))
    assert r.parsed == 0 and r.n_warnings == 1 and "boom" in r.warnings[0]
    assert run(cfg, make_fake()).parsed == 1  # watermark untouched, retried


def test_health_error_unsupported(cfg, make_fake):
    r = run(cfg, make_fake(health_error=True))
    assert r.status == "unsupported" and r.files_seen == 0
    con = store.connect(cfg, read_only=True)
    assert con.execute("SELECT status FROM source_health").fetchone()[0] == "unsupported"


def test_source_filter(cfg, make_fake):
    assert scan.run(cfg, sources=["other"], adapters=[make_fake()]).sources == {}
