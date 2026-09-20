"""Unit tests for scripts/build.py -- determinism, --check drift gate, and
per-tool asset path rewriting."""
import posixpath
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import build  # noqa: E402


def test_build_is_deterministic():
    tree1 = build.build()
    tree2 = build.build()
    assert tree1 == tree2


def test_build_produces_all_four_tools():
    tree = build.build()
    tools = {rel.split("/")[0] for rel in tree if not rel.startswith("../")}
    assert tools == {"claude", "copilot", "cursor", "antigravity"}


def test_build_ignores_pycache_residue():
    # Regression: local interpreter residue must never leak into dist/.
    # Pytest imports skill scripts at collection time, creating
    # skills/<name>/scripts/__pycache__/ mid-run; if the build copied it,
    # the --check drift gate would fail depending on what ran before it.
    residue = REPO_ROOT / "skills" / "memory" / "scripts" / "__pycache__"
    residue.mkdir(exist_ok=True)
    marker = residue / "junk.cpython-312.pyc"
    try:
        marker.write_bytes(b"fake bytecode")
        tree = build.build()
        bad = [k for k in tree if "__pycache__" in k or k.endswith((".pyc", ".pyo"))]
        assert not bad, bad
    finally:
        marker.unlink(missing_ok=True)
        try:
            residue.rmdir()
        except OSError:
            pass  # real __pycache__ from this test run may remain; harmless


def test_check_passes_on_committed_dist():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "build.py"), "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr + result.stdout


# Skill markdown locations per tool: (markdown dir relative to dist root,
# markdown filename template, asset-rewrite prefix template or None).
_TOOL_LAYOUT = {
    "claude": ("claude/skills/%s", "SKILL.md", None),
    "copilot": ("copilot/instructions", "%s.instructions.md", "_%s"),
    "cursor": ("cursor/rules", "%s.mdc", "_%s"),
    "antigravity": ("antigravity/rules", "%s.md", "_%s"),
}


def _md_location(tool, skill):
    """(tree key of the skill's emitted markdown, its directory)."""
    dir_tmpl, file_tmpl, _ = _TOOL_LAYOUT[tool]
    md_dir = dir_tmpl % skill if "%s" in dir_tmpl else dir_tmpl
    md_file = file_tmpl % skill if "%s" in file_tmpl else file_tmpl
    return "%s/%s" % (md_dir, md_file), md_dir


def _skill_assets():
    """{skill name: asset rel-paths like 'scripts/x.py', longest first}."""
    found = {}
    for skill_md in sorted((REPO_ROOT / "skills").glob("*/SKILL.md")):
        name = skill_md.parent.name
        assets = []
        for sub in ("reference", "scripts", "tests"):
            src = skill_md.parent / sub
            if src.is_dir():
                for f in sorted(src.rglob("*")):
                    if f.is_file() and f.name != ".gitkeep":
                        assets.append(f.relative_to(skill_md.parent).as_posix())
        found[name] = sorted(assets, key=len, reverse=True)
    return found


def _strip_rewritten(content, rewritten_refs):
    """Remove every rewritten asset ref (longest first) from content."""
    for ref in sorted(rewritten_refs, key=len, reverse=True):
        content = content.replace(ref, "")
    return content


def test_asset_references_resolve_in_every_tool():
    tree = build.build()
    assets_by_skill = _skill_assets()
    bodies = {s["meta"]["name"]: s["body"] for s in build.read_skills()}

    for skill, assets in assets_by_skill.items():
        if not assets:
            continue
        for tool in _TOOL_LAYOUT:
            prefix_tmpl = _TOOL_LAYOUT[tool][2]
            md_key, md_dir = _md_location(tool, skill)
            content = tree[md_key].decode("utf-8")

            rewritten_refs = []
            for asset in assets:
                rewritten = asset if prefix_tmpl is None else "%s/%s" % (prefix_tmpl % skill, asset)
                rewritten_refs.append(rewritten)
                # Every body mention of the asset must survive as the
                # tool-correct path ...
                if asset in bodies[skill]:
                    assert rewritten in content, (tool, skill, asset)
                # ... and every such mention must resolve to an emitted file.
                if rewritten in content:
                    resolved = posixpath.normpath(posixpath.join(md_dir, rewritten))
                    assert resolved in tree, (tool, skill, rewritten)

            # The bare (un-rewritten) form must not survive in tools whose
            # assets live elsewhere; anything left is a dangling reference.
            if prefix_tmpl is not None:
                scrubbed = _strip_rewritten(content, rewritten_refs)
                for asset in assets:
                    assert asset not in scrubbed, (tool, skill, asset)


def test_non_asset_references_are_not_rewritten():
    # skill-forge's body mentions repo-level scripts (validate.py, build.py)
    # that are NOT its assets; the rewrite must leave those alone.
    tree = build.build()
    bodies = {s["meta"]["name"]: s["body"] for s in build.read_skills()}
    assert "scripts/validate.py" in bodies["skill-forge"]
    assert "scripts/validate.py" not in _skill_assets()["skill-forge"]

    for tool in _TOOL_LAYOUT:
        md_key, _ = _md_location(tool, "skill-forge")
        content = tree[md_key].decode("utf-8")
        assert "scripts/validate.py" in content, tool
        assert "_skill-forge/scripts/validate.py" not in content, tool
