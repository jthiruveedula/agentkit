"""Tests for scripts/estimate.py. Run with:
python3 tests/test_estimate.py        # plain asserts
python3 -m pytest tests/test_estimate.py
"""

import json
import os
import subprocess
import sys
import tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(SKILL_DIR, "scripts", "estimate.py")


def _fixture(lines, name="f.txt", width=40):
    """Create a temp fixture with exactly `lines` lines."""
    d = tempfile.mkdtemp()
    path = os.path.join(d, name)
    with open(path, "w") as fh:
        for i in range(lines):
            fh.write(f"x{i:0{width}d}\n")
    return path


def _run(*args):
    return subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True,
        text=True,
    )


def _strategy(lines, name="code.py"):
    out = _run("--json", _fixture(lines, name))
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)["files"][0]["strategy"]


# --- strategy boundaries ---


def test_small_file_full_read_ok():
    assert _strategy(10) == "full-read ok"
    assert _strategy(149) == "full-read ok"


def test_boundary_150_lines_is_targeted_ranges():
    assert _strategy(150) == "targeted ranges"
    assert _strategy(399) == "targeted ranges"


def test_boundary_400_lines_is_grep_first():
    assert _strategy(400) == "grep-first"
    assert _strategy(5000) == "grep-first"


def test_log_files_get_head_tail():
    assert _strategy(500, "server.log") == "head+tail"
    assert _strategy(50, "debug.log") == "full-read ok"


# --- output shape ---


def test_text_output_fields():
    out = _run(_fixture(20))
    assert out.returncode == 0
    line = out.stdout.strip()
    for token in ("lines", "bytes", "tokens", "->"):
        assert token in line, line
    assert "full-read ok" in line


def test_json_output_shape():
    path = _fixture(200)
    out = _run("--json", path)
    assert out.returncode == 0, out.stderr
    payload = json.loads(out.stdout)
    assert set(payload) == {"files"}
    f = payload["files"][0]
    assert set(f) == {"path", "lines", "bytes", "est_tokens", "strategy"}
    assert f["lines"] == 200
    assert f["est_tokens"] == f["bytes"] // 4  # ascii fixture: bytes == chars
    assert f["strategy"] == "targeted ranges"


def test_token_heuristic_is_chars_over_four():
    # multibyte chars: token estimate must follow decoded chars, not bytes
    d = tempfile.mkdtemp()
    path = os.path.join(d, "u.py")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("héllo wörld\n" * 100)  # 12 chars/line inc newline
    out = _run("--json", path)
    assert out.returncode == 0
    f = json.loads(out.stdout)["files"][0]
    assert f["est_tokens"] == (12 * 100) // 4


# --- budget ---


def test_budget_warning_and_exit_code():
    path = _fixture(1000)  # ~10k tokens
    out = _run(path, "--budget", "100")
    assert out.returncode == 1
    assert "exceeds budget" in out.stderr
    ok = _run(path, "--budget", "1000000")
    assert ok.returncode == 0


def test_budget_in_json():
    path = _fixture(1000)
    out = _run("--json", "--budget", "100", path)
    payload = json.loads(out.stdout)
    assert payload["over_budget"] is True
    assert payload["total_est_tokens"] > 100
    assert out.returncode == 1


# --- errors ---


def test_missing_file_exit_code():
    out = _run("/no/such/file.py")
    assert out.returncode == 2
    assert "no such file" in out.stderr


def test_missing_file_does_not_kill_valid_files():
    good = _fixture(10)
    out = _run("--json", good, "/no/such/file.py")
    assert out.returncode == 2
    assert len(json.loads(out.stdout)["files"]) == 1


if __name__ == "__main__":
    tests = [
        v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    sys.exit(1 if failed else 0)
