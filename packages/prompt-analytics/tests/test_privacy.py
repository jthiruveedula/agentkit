"""End-to-end privacy tests. All secrets are fake and assembled at runtime."""

import base64
import json
import socket
import stat
import urllib.parse
from datetime import timedelta

import pytest

from conftest import T0, FakeAdapter
from prompt_analytics import scan, store
from prompt_analytics.cli import main
from prompt_analytics.privacy import NetworkBlocked, Redactor, block_network, unblock_network
from prompt_analytics.schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn

AWS = "AK" + "IA" + "IOSFODNN7EXAMPLE"
GH = "gh" + "p_" + "aB3dE5gH7jK9mN1pQ3sT5vX7zA9cD1fG3hJ5"
ANT = "sk-" + "ant-" + "api03-" + "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2"
GOOG = "AI" + "za" + "Sy" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"[:33]
SLACK = "xo" + "xb-" + "123456789012-" + "AbCdEfGhIjKl"
STRIPE = "sk_" + "live_" + "AbCdEfGhIjKlMnOp1234"
JWT = "ey" + "J" + "hbGciOiJIUzI1NiJ9" + "." + "ey" + "J" + "zdWIiOiJ4eXoxMjMifQ" + "." + "abcDEF123_-xyz789"
PEM_BODY = "MIIEowIBAAKCAQEAfakefakefakefake0123456789"
PEM = "-----BEGIN " + "RSA PRIVATE KEY-----\n" + PEM_BODY + "\n-----END RSA PRIVATE KEY-----"
URLPW = "hunter2" + "hunter2x"
URL = "https://alice:" + URLPW + "@db.example.net/app"
EMAIL = "alice.smith" + "@" + "acme-corp.io"
HOMEP = "/Users/" + "alice" + "/work/app"
ASSIGN_V = "zzTopSecret" + "Value99"
ASSIGN = '{"api_key": "' + ASSIGN_V + '"}'
ENV_V = "pa55w0rd" + "-very-secret"
ENV = "DB_PASSWORD=" + ENV_V + "\nOPENAI_API_KEY=" + "sk-" + "proj-" + "Q1w2E3r4T5y6U7i8O9p0AaBb"
SSN = "123-45" + "-6789"
CARD = "4111 1111 " + "1111 1111"

# (needle that must not survive, text containing it)
NEEDLES = [AWS, GH, ANT, GOOG, SLACK, STRIPE, JWT, PEM_BODY, URLPW, EMAIL, "/Users/alice", ASSIGN_V, ENV_V,
           "Q1w2E3r4T5y6U7i8O9p0AaBb", SSN, CARD]
B64 = base64.b64encode((AWS + ":" + ANT).encode()).decode()
QUOTED = urllib.parse.quote(EMAIL + " " + ASSIGN_V)
BLOB = " ".join([AWS, GH, ANT, GOOG, SLACK, STRIPE, JWT, PEM, URL, EMAIL, HOMEP, ASSIGN, ENV, SSN, CARD])


def batch_with_secrets(f):
    sid = "fake:leak"
    turns = [Turn(f"{sid}:{i}", sid, i, "user" if i % 2 == 0 else "assistant", T0 + timedelta(minutes=i),
                  f"pos{i} {BLOB} {B64}") for i in range(4)]
    return ParsedBatch(
        [Session(sid, "fake", f.key, project_path=HOMEP, title="fix " + AWS + " for " + EMAIL, started_at=T0,
                 ended_at=T0 + timedelta(hours=1))],
        turns,
        [ToolCall("c1", sid, turns[1].turn_id, "tool_" + AWS)],
        [CodeEdit("e1", sid, None, "/Users/alice/other/" + GH + ".py"), CodeEdit("e2", sid, None, HOMEP + "/src/x.py")],
    )


def all_varchar(con):
    cols = con.execute("SELECT table_name, column_name FROM information_schema.columns "
                       "WHERE table_schema='main' AND data_type='VARCHAR'").fetchall()
    out = []
    for t, c in cols:
        out += [(t, c, v) for (v,) in con.execute(f'SELECT "{c}" FROM "{t}" WHERE "{c}" IS NOT NULL').fetchall()]
    return out


@pytest.mark.parametrize("mode", ["redacted", "none"])
@pytest.mark.parametrize("style", ["kind", "hash"])
def test_no_secret_in_any_column(cfg, make_fake, mode, style):
    cfg.store_text, cfg.redact_style = mode, style
    scan.run(cfg, adapters=[make_fake(make_batch=batch_with_secrets)])
    con = store.connect(cfg, read_only=True)
    cells = all_varchar(con)
    assert any(t == "turns" for t, _, _ in cells)
    for t, c, v in cells:
        for n in NEEDLES + [B64, QUOTED]:
            assert n not in v, f"{n[:12]}... leaked in {t}.{c}"
    if mode == "none":
        assert con.execute("SELECT count(*) FROM turns WHERE text IS NOT NULL").fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM sessions WHERE title IS NOT NULL").fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM code_edits WHERE file IS NOT NULL").fetchone()[0] == 0
        assert con.execute("SELECT min(text_len) FROM turns").fetchone()[0] > 100
    con.close()


def test_file_modes(cfg, make_fake):
    scan.run(cfg, adapters=[make_fake(make_batch=batch_with_secrets)])
    paths = [cfg.data_dir, *cfg.data_dir.rglob("*")]
    assert cfg.salt_path in paths and cfg.db_path in paths
    assert all(stat.S_IMODE(p.stat().st_mode) & 0o077 == 0 for p in paths)


def test_idempotent_and_negative_corpus():
    r = Redactor()
    once = r.redact(BLOB + " " + B64)
    assert r.redact(once) == once
    keep = ("commit 0123456789abcdef0123456789abcdef01234567 id 123e4567-e89b-12d3-a456-426614174000 "
            "sha256 " + "ab" * 32 + " pip install sk-learn at src/pkg/module.py v1.2.3")
    assert r.redact(keep) == keep


def test_block_network_raises():
    block_network()
    with pytest.raises(NetworkBlocked):
        socket.create_connection(("example.com", 80))
    unblock_network()


def test_scan_blocks_network(cfg, make_fake):
    scan.run(cfg, adapters=[make_fake()])
    with pytest.raises(NetworkBlocked):
        socket.create_connection(("example.com", 80))


# ---- exposure scan ----

def exposure_batch(f):
    sid = "fake:exp"
    texts = [
        f"my ssn is {SSN} and card {CARD}",
        f"patient {EMAIL} was diagnosed with diabetes, dosage 5mg",
        f"deploy with {AWS}",
        "plain request about refactoring",
    ]
    turns = [Turn(f"{sid}:{i}", sid, i, "user", T0 + timedelta(minutes=i), t) for i, t in enumerate(texts)]
    turns.append(Turn(f"{sid}:a", sid, 9, "assistant", T0, f"assistant mentions {SSN}"))  # assistant text not scanned
    return ParsedBatch([Session(sid, "fake", f.key, title="exposure demo", started_at=T0, ended_at=T0)], turns)


@pytest.mark.parametrize("mode", ["redacted", "none"])
def test_exposures(cfg, make_fake, mode, capsys):
    cfg.store_text = mode
    rep = scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)])
    assert set(rep.exposures) == {"secret", "pii", "phi"}
    assert rep.exposures["pii"]["kinds"] == {"ssn": 1, "card": 1, "email": 1}
    assert rep.exposures["secret"]["kinds"] == {"aws": 1}
    con = store.connect(cfg, read_only=True)
    rows = set(con.execute("SELECT turn_id, kind, category FROM exposures").fetchall())
    assert rows == {("fake:exp:0", "ssn", "pii"), ("fake:exp:0", "card", "pii"), ("fake:exp:1", "email", "pii"),
                    ("fake:exp:1", "phi_context", "phi"), ("fake:exp:2", "aws", "secret")}
    for _, _, v in all_varchar(con):
        for n in (SSN, CARD, EMAIL, AWS):
            assert n not in v
    con.close()
    # rescan with --full replaces rather than duplicates
    scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)], full=True)
    con = store.connect(cfg, read_only=True)
    assert con.execute("SELECT count(*) FROM exposures").fetchone()[0] == 5
    con.close()


def test_exposure_cli_json_and_warning(cfg, make_fake, capsys, monkeypatch, tmp_path):
    scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)])
    from prompt_analytics.cli import _print_exposure_warning

    rep = scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)])
    _print_exposure_warning(rep.exposures)
    out = capsys.readouterr().out
    assert "secrets in 1 session" in out and "PII in 1 session" in out and "prompt-analytics exposure" in out
    assert main(["--data-dir", str(cfg.data_dir), "exposure", "--json", "--since", "3650"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert set(data) == {"categories", "sessions"}
    pii = data["categories"]["pii"]
    assert {"sessions", "prompts", "kinds", "by_source", "first", "last", "advice"} <= set(pii)
    assert pii["by_source"] == {"fake": 1} and pii["kinds"]["ssn"]["prompts"] == 1
    assert data["sessions"] == [{"source": "fake", "date": "2026-01-01", "title": "exposure demo",
                                 "kinds": ["aws", "card", "email", "phi_context", "ssn"],
                                 "turns": {"open": 3, "reviewed": 0, "false_positive": 0}}]
    assert SSN not in json.dumps(data)
    assert main(["--data-dir", str(cfg.data_dir), "exposure"]) == 0
    assert "advice:" in capsys.readouterr().out
