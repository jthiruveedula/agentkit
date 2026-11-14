"""Frontmatter round-trip and strict-YAML validity of every emitted file."""

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import build  # noqa: E402
from frontmatter import dump, parse  # noqa: E402


def test_apostrophe_and_colon_round_trip():
    meta = {"name": "x", "description": "it's fine: really. Use when x"}
    assert parse(dump(meta) + "\nbody\n") == (meta, "body\n")


def test_emitted_frontmatter_is_strict_yaml():
    yaml = pytest.importorskip("yaml")
    bad = []
    for rel, data in build.build().items():
        if not rel.endswith((".md", ".mdc")):
            continue
        text = data.decode("utf-8")
        if not text.startswith("---\n"):
            continue
        block = text.split("\n---\n", 1)[0][4:]
        try:
            ok = isinstance(yaml.safe_load(block), dict)
        except yaml.YAMLError:
            ok = False
        if not ok:
            bad.append(rel)
    assert not bad, bad
