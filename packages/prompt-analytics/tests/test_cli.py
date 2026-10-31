import json

from prompt_analytics.cli import main


def test_doctor_json_empty_home(tmp_path, monkeypatch, capsys):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("PA_HOME", str(home))
    assert main(["--data-dir", str(tmp_path / "d"), "doctor", "--json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert set(out) == {"sources", "data_dir", "ml", "analysis"}
    assert all(s["status"] in ("missing", "unsupported", "ok", "degraded") for s in out["sources"])


def test_doctor_table_and_scan_json(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    d = str(tmp_path / "d")
    assert main(["--data-dir", d, "doctor"]) == 0
    assert "ml backends" in capsys.readouterr().out
    assert main(["--data-dir", d, "scan", "--json"]) == 0
    assert "sources" in json.loads(capsys.readouterr().out)
    assert main(["--data-dir", d, "exposure", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["categories"] == {}


def test_usage_error_nonzero(capsys):
    assert main(["scan", "--bogus"]) != 0
