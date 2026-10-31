"""scaffold.py must keep a hostile description inside one frontmatter line."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "scaffold.py"


def scaffold(tmp_path, monkeypatch, desc):
    spec = importlib.util.spec_from_file_location("scaffold_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "SKILLS_DIR", tmp_path)
    assert mod.main(["demo-skill", desc]) == 0
    text = (tmp_path / "demo-skill" / "SKILL.md").read_text(encoding="utf-8")
    # frontmatter must be exactly: fence, name, description, version, fence
    head = text.splitlines()[:5]
    assert head[0] == head[4] == "---"
    assert head[1] == "name: demo-skill" and head[3] == "version: 0.1.0"
    return head[2]


def test_newline_and_fence_cannot_break_frontmatter(tmp_path, monkeypatch):
    desc = "Does a thing for you here.\n---\nname: evil\nUse when: asked"
    line = scaffold(tmp_path, monkeypatch, desc)
    assert "Does a thing" in line


def test_leading_indicator_is_quoted(tmp_path, monkeypatch):
    desc = "[x] checklist helper that does stuff. Use when asked"
    line = scaffold(tmp_path, monkeypatch, desc)
    assert line.startswith("description: '[x] checklist")
