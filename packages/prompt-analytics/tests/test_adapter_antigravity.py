import base64
import json
import sqlite3
from pathlib import Path

from prompt_analytics.adapters import antigravity as ag
from prompt_analytics.adapters.base import user_data_dirs


def varint(n):
    out = b""
    while True:
        c = n & 0x7F
        n >>= 7
        out += bytes([c | (0x80 if n else 0)])
        if not n:
            return out


def ld(f, data):
    data = data.encode() if isinstance(data, str) else data
    return varint(f << 3 | 2) + varint(len(data)) + data


def vi(f, n):
    return varint(f << 3) + varint(n)


def ts(secs, nanos=0):
    return vi(1, secs) + vi(2, nanos)


def conv(uid, title, last, created, folder):
    inner = ld(1, title) + vi(2, 12) + ld(3, ts(last, 5)) + ld(4, uid) + ld(7, ts(created)) \
        + ld(9, ld(1, ld(2, folder))) + ld(10, ts(last))
    return ld(1, ld(1, uid) + ld(2, ld(1, base64.b64encode(inner))))


def build(tmp_path, monkeypatch, extra=b""):
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    g = user_data_dirs("Antigravity IDE")[0] / "globalStorage"
    g.mkdir(parents=True)
    blob = conv("u1", "First", 1_700_000_100, 1_700_000_000, "file:///tmp/p%201") \
        + conv("u2", "Second", 1_700_000_200, 1_700_000_050, "file:///tmp/p2") \
        + conv("u3", "Third", 1_700_000_300, 1_700_000_060, "file:///tmp/p3") + extra
    c = sqlite3.connect(g / "state.vscdb")
    c.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
    c.execute("INSERT INTO ItemTable VALUES (?,?)", (ag.SUMMARIES_KEY, base64.b64encode(blob).decode()))
    c.execute("INSERT INTO ItemTable VALUES (?,?)", ("antigravityUnifiedStateSync.oauthToken", "FAKE-DO-NOT-READ"))
    c.commit()
    c.close()
    return g / "state.vscdb"


def test_parse_and_whitelist(tmp_path, monkeypatch):
    bad = ld(1, ld(1, "u4") + ld(2, ld(1, "!!notbase64")))  # malformed entry
    db = build(tmp_path, monkeypatch, bad)
    mt = db.stat().st_mtime_ns
    sql: list[str] = []
    real = sqlite3.connect

    def spy(*a, **k):
        c = real(*a, **k)
        c.set_trace_callback(sql.append)
        return c

    monkeypatch.setattr(sqlite3, "connect", spy)
    a = ag.AntigravityAdapter()
    fs = a.discover()
    b = a.parse(fs[0])
    h = a.health()
    assert [s.session_id for s in b.sessions] == ["antigravity:u1", "antigravity:u2", "antigravity:u3"]
    s = b.sessions[0]
    assert (s.title, s.project_path) == ("First", "/tmp/p 1") and not b.turns
    assert s.started_at.timestamp() == 1_700_000_000 and int(s.ended_at.timestamp()) == 1_700_000_100
    assert s.ended_at.tzinfo is not None
    assert any("malformed" in w for w in b.warnings)
    assert h.status == "degraded"  # malformed entry flagged
    assert any("metadata-only" in m for m in h.messages)
    assert not any("oauth" in q.lower() or "select *" in q.lower() for q in sql)
    assert all("WHERE key = " in q for q in sql if "ItemTable" in q and "sqlite_master" not in q)
    assert "FAKE-DO-NOT-READ" not in json.dumps([vars(x) for x in b.sessions], default=str)
    assert db.stat().st_mtime_ns == mt


def test_pb_fallback_and_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    assert ag.AntigravityAdapter().health().status == "missing"
    build(tmp_path, monkeypatch)
    d = Path(tmp_path) / ".gemini" / "antigravity" / "conversations"
    d.mkdir(parents=True)
    (d / "u1.pb").write_bytes(b"x")
    (d / "zz.pb").write_bytes(b"x")
    a = ag.AntigravityAdapter()
    fs = a.discover()
    assert len(fs) == 3
    got = [x for f in fs for x in a.parse(f).sessions if f.path.suffix == ".pb"]
    assert [s.session_id for s in got] == ["antigravity:zz"]


def test_truncated_pb_raises_valueerror():
    import pytest
    with pytest.raises(ValueError):
        ag.parse_pb(ld(1, "abcdef")[:-2])
