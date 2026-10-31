import gzip
import http.client
import threading

import pytest

from prompt_analytics.server import make_server


@pytest.fixture
def srv(cfg):
    cfg.export_dir.mkdir(parents=True)
    (cfg.export_dir / "index.html").write_text("<html>ok</html>")
    s = make_server(cfg, 0)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield s
    s.shutdown()
    s.server_close()


def get(srv, host=None, path="/", method="GET"):
    port = srv.server_address[1]
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.putrequest(method, path, skip_host=True)
    if host is not None:
        c.putheader("Host", host.replace("PORT", str(port)))
    c.endheaders()
    r = c.getresponse()
    r.read()
    return r


def test_binds_loopback(srv):
    assert srv.server_address[0] == "127.0.0.1"


def test_ok_and_headers(srv):
    r = get(srv, "localhost:PORT")
    assert r.status == 200
    assert "default-src 'none'" in r.getheader("Content-Security-Policy")
    assert r.getheader("X-Content-Type-Options") == "nosniff"
    assert r.getheader("Cache-Control") == "no-store"
    assert r.getheader("Access-Control-Allow-Origin") is None
    assert get(srv, "127.0.0.1:PORT").status == 200


@pytest.mark.parametrize("host", ["evil.example:PORT", "127.0.0.1:1", "localhost", None])
def test_bad_host_400(srv, host):
    assert get(srv, host).status == 400


def test_no_listing_no_traversal(srv, cfg):
    (cfg.data_dir / "secret.txt").write_text("s")
    assert get(srv, "127.0.0.1:PORT", "/../secret.txt").status == 404
    assert get(srv, "127.0.0.1:PORT", "/sub/").status == 404
    assert get(srv, "127.0.0.1:PORT", method="POST").status == 405


# ---- exposure review API ----
import json  # noqa: E402

from test_privacy import AWS, SSN, exposure_batch  # noqa: E402

from prompt_analytics import scan, store  # noqa: E402


@pytest.fixture
def api(cfg, make_fake):
    ad = make_fake(make_batch=exposure_batch)
    scan.run(cfg, adapters=[ad])
    cfg.export_dir.mkdir(parents=True, exist_ok=True)
    (cfg.export_dir / "index.html").write_text("<html><head><title>x</title></head><body></body></html>")
    s = make_server(cfg, 0, adapters=[ad])
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield s, ad
    s.shutdown()
    s.server_close()


def call(srv, method, path, token=None, body=None, ctype="application/json", host="127.0.0.1:PORT"):
    port = srv.server_address[1]
    c = http.client.HTTPConnection("127.0.0.1", port)
    h = {"Host": host.replace("PORT", str(port))}
    if token:
        h["X-PA-Token"] = token
    if body is not None:
        h["Content-Type"] = ctype
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    return r.status, r.read()


def test_token_injected_in_memory_only(api, cfg):
    srv, _ = api
    st, body = call(srv, "GET", "/")
    assert st == 200 and f'<meta name="pa-token" content="{srv.token}">'.encode() in body
    assert srv.token not in (cfg.export_dir / "index.html").read_text()


def test_api_auth_and_host(api):
    srv, _ = api
    assert call(srv, "GET", "/api/exposure/fake:exp:0")[0] == 403
    assert call(srv, "GET", "/api/exposure/fake:exp:0", token="wrong")[0] == 403
    assert call(srv, "GET", "/api/exposure/fake:exp:0", token=srv.token, host="evil.test")[0] == 400
    assert call(srv, "GET", "/api/exposure/nope", token=srv.token)[0] == 404


def test_reveal_returns_raw_and_nothing_on_disk(api, cfg):
    srv, _ = api
    st, body = call(srv, "GET", "/api/exposure/fake:exp:0", token=srv.token)
    f = json.loads(body)["findings"]
    assert st == 200 and {x["value"] for x in f} == {SSN, "4111 1111 1111 1111"}
    st, body = call(srv, "GET", "/api/exposure/fake:exp:2", token=srv.token)
    assert json.loads(body)["findings"][0]["value"] == AWS
    for p in cfg.data_dir.rglob("*"):
        if p.is_file():
            raw = p.read_bytes()
            assert SSN.encode() not in raw and AWS.encode() not in raw and srv.token.encode() not in raw


def test_reveal_404_when_source_changed(api, fake_root):
    srv, ad = api
    ad.make_batch = lambda f: __import__("prompt_analytics.schema", fromlist=["x"]).ParsedBatch()
    assert call(srv, "GET", "/api/exposure/fake:exp:0", token=srv.token)[0] == 404


def test_review_persists_and_survives_rescan(api, cfg):
    srv, ad = api
    t = srv.token
    u = "/api/exposure/fake:exp:0/review"
    assert call(srv, "POST", u, token=t, body='{"status":"reviewed"}', ctype="text/plain")[0] == 415
    assert call(srv, "POST", u, token=t, body="x" * 2000)[0] == 413
    assert call(srv, "POST", u, token=t, body='{"status":"bogus"}')[0] == 400
    assert call(srv, "POST", u, body='{"status":"reviewed"}')[0] == 403
    assert call(srv, "POST", u, token=t, body='{"status":"false_positive"}')[0] == 200
    scan.run(cfg, adapters=[ad], full=True)
    con = store.connect(cfg, read_only=True)
    assert con.execute("SELECT status FROM exposure_reviews WHERE turn_id='fake:exp:0'").fetchone()[0] == "false_positive"
    con.close()


def test_preview_masked(cfg, make_fake):
    scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)])
    con = store.connect(cfg, read_only=True)
    pv = {r[0]: r[1] for r in con.execute("SELECT turn_id, preview FROM exposures").fetchall()}
    assert "⟦ssn⟧" in pv["fake:exp:0"] and SSN not in pv["fake:exp:0"]
    assert "⟦aws⟧" in pv["fake:exp:2"] and AWS not in pv["fake:exp:2"]
    con.close()
    cfg.store_text = "none"
    scan.run(cfg, adapters=[make_fake(make_batch=exposure_batch)], full=True)
    con = store.connect(cfg, read_only=True)
    assert con.execute("SELECT count(*) FROM exposures WHERE preview IS NOT NULL").fetchone()[0] == 0
    con.close()


def test_cli_reveal(cfg, make_fake, capsys, monkeypatch):
    ad = make_fake(make_batch=exposure_batch)
    scan.run(cfg, adapters=[ad])
    monkeypatch.setattr(scan, "_load_adapters", lambda: [ad])
    from prompt_analytics.cli import main

    assert main(["--data-dir", str(cfg.data_dir), "exposure", "--reveal", "fake:exp:2"]) == 0
    assert AWS in capsys.readouterr().out


def test_api_analyze(api, monkeypatch):
    from prompt_analytics import capabilities

    real = capabilities.probe
    monkeypatch.setattr(capabilities, "probe", lambda *a, **k: {**real(*a, **k), "available": ["basic", "ml"]})
    srv, _ = api
    t, u = srv.token, "/api/analyze"
    assert call(srv, "POST", u, body='{"mode":"basic"}')[0] == 403
    assert call(srv, "POST", u, token=t, body='{"mode":"basic"}', host="evil.test")[0] == 400
    assert call(srv, "POST", u, token=t, body='{"mode":"basic"}', ctype="text/plain")[0] == 415
    assert call(srv, "GET", u, token=t)[0] == 405
    assert call(srv, "POST", u, token=t, body='{"mode":"bogus"}')[0] == 400
    st, body = call(srv, "POST", u, token=t, body='{"mode":"deep"}')
    assert st == 409 and json.loads(body)["available"] == ["basic", "ml"]
    st, body = call(srv, "POST", u, token=t, body='{"mode":"basic"}')
    d = json.loads(body)
    assert st == 200 and d["engine"]["mode"] == "basic" and d["engine"]["available"] == ["basic", "ml"]


def test_index_gzip(api):
    srv, _ = api
    c = http.client.HTTPConnection(*srv.server_address)
    c.request("GET", "/", headers={"Host": f"127.0.0.1:{srv.server_address[1]}", "Accept-Encoding": "gzip"})
    r = c.getresponse()
    assert r.getheader("Content-Encoding") == "gzip"
    assert srv.token.encode() in gzip.decompress(r.read())
