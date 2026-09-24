"""Tests for scripts/plan_check.py. Run with:
python3 -m pytest skills/orchestrate/tests/test_plan_check.py
"""

import os
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
    ),
)
from plan_check import check  # noqa: E402


def _t(tid, owner="implementer", deps=()):
    return {
        "id": tid,
        "owner": owner,
        "objective": "do " + tid,
        "output": "path",
        "deps": list(deps),
    }


def test_waves_follow_dependencies():
    plan = {
        "tasks": [
            _t("a", "researcher"),
            _t("b", deps=["a"]),
            _t("c", "test-writer", ["a"]),
            _t("d", "verifier", ["b", "c"]),
        ]
    }
    errors, waves = check(plan)
    assert errors == []
    assert waves == [["a"], ["b", "c"], ["d"]]


def test_rejects_cycle_unknown_owner_and_wide_wave():
    assert "cycle" in check({"tasks": [_t("a", deps=["b"]), _t("b", deps=["a"])]})[0][0]
    assert "unknown owner" in check({"tasks": [_t("a", "wizard")]})[0][0]
    wide = {"tasks": [_t(str(i)) for i in range(6)]}
    errors, _ = check(wide, max_parallel=5)
    assert errors and "max 5" in errors[0]


def test_rejects_missing_dep_and_empty_fields():
    errors, _ = check(
        {
            "tasks": [
                _t("a", deps=["ghost"]),
                {"id": "b", "owner": "implementer", "deps": []},
            ]
        }
    )
    assert any("unknown dep" in e for e in errors)
    assert any("empty objective" in e for e in errors)
