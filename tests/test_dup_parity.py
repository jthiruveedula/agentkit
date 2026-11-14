"""Drift guards for code intentionally duplicated across self-contained skills."""

import importlib.util
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _load(rel, name):
    path = ROOT / rel
    sys.path.insert(0, str(path.parent))  # sibling imports (prompt_signals)
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        sys.path.remove(str(path.parent))
    return mod


def test_secret_regex_parity():
    a = _load("skills/memory-sync/scripts/rank_patterns.py", "dp_rank").SECRET
    b = _load("skills/session-insights/scripts/prompt_signals.py", "dp_sig").SECRET
    assert (a.pattern, a.flags) == (b.pattern, b.flags)


def test_classifier_threshold_parity():
    a = _load("skills/data-eng-router/scripts/classify.py", "dp_router")
    b = _load("skills/prompt-enhancer/scripts/classify.py", "dp_enh")
    for k in ("MIN_EVIDENCE", "MIN_SHARE", "HIGH", "MEDIUM"):
        assert getattr(a, k) == getattr(b, k), k


WRITERS = [
    ("skills/context-budget/scripts/install_hooks.py", "dp_hooks"),
    ("skills/session-insights/scripts/nudge_hook.py", "dp_nudge"),
]


@pytest.mark.parametrize("rel,name", WRITERS)
@pytest.mark.parametrize("symlink", [False, True])
def test_write_settings_parity(tmp_path, rel, name, symlink):
    write = _load(rel, name).write_settings
    real = tmp_path / "real" / "settings.json"
    real.parent.mkdir()
    real.write_text("old")
    target = real
    if symlink:
        target = tmp_path / "link.json"
        target.symlink_to(real)
    write(str(target), "one")
    bak = Path(str(real) + ".bak")
    assert real.read_text() == "one" and bak.read_text() == "old"
    write(str(target), "two")
    assert real.read_text() == "two" and bak.read_text() == "old"
    assert not symlink or target.is_symlink()
    assert sorted(os.listdir(real.parent)) == ["settings.json", "settings.json.bak"]
