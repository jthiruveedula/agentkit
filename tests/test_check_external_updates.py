"""Offline tests for scripts/check-external-updates.py (no network)."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "cu", ROOT / "scripts" / "check-external-updates.py"
)
cu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cu)

OLD, NEW = "a" * 40, "b" * 40
LOCK = (
    '{\n  "sources": [\n'
    '    { "name": "x", "repo": "o/x", "sha": "%s", "license": "MIT", "sha256": "%s" },\n'
    '    { "name": "arch", "repo": "o/arch", "sha": "%s", "license": "MIT" },\n'
    '    { "name": "lic", "repo": "o/lic", "sha": "%s", "license": "MIT" }\n'
    "  ]\n}\n"
) % (OLD, "1" * 64, "c" * 40, "d" * 40)


def fake_get(url):
    repo = (
        url.split("/repos/")[1].split("/")[0]
        + "/"
        + url.split("/repos/")[1].split("/")[1]
    )
    meta = {
        "o/x": ("MIT", False),
        "o/arch": ("MIT", True),
        "o/lic": ("GPL-3.0", False),
    }[repo]
    if "/compare/" in url:
        return {
            "ahead_by": 1,
            "commits": [{"sha": NEW}],
            "html_url": "https://github.com/%s/compare/a...b" % repo,
        }
    return {
        "default_branch": "main",
        "archived": meta[1],
        "license": {"spdx_id": meta[0]},
    }


@pytest.fixture
def lock(tmp_path):
    p = tmp_path / "skills.lock.json"
    p.write_text(LOCK)
    return p


def test_detect_and_bump_only_eligible(lock):
    sources = json.loads(LOCK)["sources"]
    rows = [cu.check_source(s, fake_get) for s in sources]
    assert [r["behind_by"] for r in rows] == [1, 1, 1]
    assert rows[1]["archived"] and rows[2]["license_changed"]
    done = cu.bump(lock, rows, sources, sha256_fn=lambda r, s: "2" * 64)
    assert done == ["x"]
    expect = LOCK.replace(OLD, NEW).replace("1" * 64, "2" * 64)
    assert lock.read_text() == expect  # formatting preserved, others untouched


def test_invalid_input_rejected_before_request():
    def boom(url):
        raise AssertionError("request made")

    for src in (
        {"repo": "a/b/../c", "sha": OLD},
        {"repo": "o/x", "sha": "ABC"},
        {"repo": "o/x?x=1", "sha": OLD},
    ):
        assert cu.check_source(src, boom)["error"] == "invalid_input"


def test_fetch_rejects_non_api_url():
    with pytest.raises(cu.FetchError):
        cu.fetch("https://evil.example/repos/a/b")


def test_rate_limited_exit_zero_unless_strict(lock, monkeypatch, capsys):
    def limited(url, token=None):
        raise cu.FetchError("rate_limited")

    monkeypatch.setattr(cu, "fetch", limited)
    assert cu.main(["--lock", str(lock)]) == 0
    assert cu.main(["--lock", str(lock), "--strict"]) == 1


def test_token_never_printed(lock, monkeypatch, capsys):
    monkeypatch.setenv("GITHUB_TOKEN", "fake-token-for-test")
    monkeypatch.setattr(cu, "fetch", lambda u, t=None: fake_get(u))
    cu.main(["--lock", str(lock), "--json"])
    cu.main(["--lock", str(lock)])
    out = capsys.readouterr()
    assert "fake-token-for-test" not in out.out + out.err


def test_manual_pins(tmp_path):
    (tmp_path / "skills" / "s").mkdir(parents=True)
    (tmp_path / "skills" / "s" / "SKILL.md").write_text("npx -y muse-image-mcp@0.1.3\n")
    (tmp_path / "install.sh").write_text('BOOST_INSTALL_SH_SHA256="abc"\n')
    pins = {m["pin"] for m in cu.manual_pins(tmp_path)}
    assert pins == {"muse-image-mcp@0.1.3", "boost installer sha256"}
