"""Tests for scripts/session_audit.py. Run with:
python3 -m pytest skills/token-saver/tests/test_session_audit.py
"""

import json
import os
import subprocess
import sys
import tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(SKILL_DIR, "scripts", "session_audit.py")


def _usage(inp, create, read, out):
    return {
        "message": {
            "usage": {
                "input_tokens": inp,
                "cache_creation_input_tokens": create,
                "cache_read_input_tokens": read,
                "output_tokens": out,
            }
        }
    }


def test_sums_usage_and_flags_long_sessions():
    root = tempfile.mkdtemp()
    proj = os.path.join(root, "proj-a")
    os.makedirs(proj)
    lines = [
        _usage(2, 1000, 500, 10),
        {"type": "user"},
        "not json",
        _usage(1, 50, 1500, 20),
    ]
    with open(os.path.join(proj, "s1.jsonl"), "w", encoding="utf-8") as fh:
        for line in lines:
            fh.write((line if isinstance(line, str) else json.dumps(line)) + "\n")

    out = subprocess.run(
        [sys.executable, SCRIPT, "--root", root, "--long", "1", "--json"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    (row,) = json.loads(out)
    assert row["turns"] == 2
    assert row["startup"] == 1502  # first turn: input + create + read
    assert row["fresh_in"] == 1053
    assert row["cache_read"] == 2000
    assert row["output"] == 30
    assert row["long"] is True


def test_null_usage_fields_count_as_zero():
    root = tempfile.mkdtemp()
    proj = os.path.join(root, "proj-n")
    os.makedirs(proj)
    usage = {
        "input_tokens": None,
        "cache_creation_input_tokens": None,
        "cache_read_input_tokens": None,
        "output_tokens": 7,
    }
    with open(os.path.join(proj, "s.jsonl"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps({"message": {"usage": usage}}) + "\n")
    r = subprocess.run(
        [sys.executable, SCRIPT, "--root", root, "--json"],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stderr
    (row,) = json.loads(r.stdout)
    assert (row["fresh_in"], row["cache_read"], row["output"]) == (0, 0, 7)


def test_empty_root_is_not_an_error():
    r = subprocess.run(
        [sys.executable, SCRIPT, "--root", tempfile.mkdtemp()],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0 and "no sessions" in r.stdout
