#!/usr/bin/env python3
"""Build dist/<tool>/... from the canonical skills/agents/commands sources.

Deterministic: same inputs always produce byte-identical output, so
`--check` can catch hand-edited drift in CI.

    python3 scripts/build.py            # write dist/
    python3 scripts/build.py --check    # fail (exit 1) if dist/ would change
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from frontmatter import load  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
MARKETPLACE = REPO_ROOT / ".claude-plugin" / "marketplace.json"
SKILLS_DIR = REPO_ROOT / "skills"
AGENTS_DIR = REPO_ROOT / "agents"
DIST = REPO_ROOT / "dist"


def read_skills():
    records = []
    for skill_md in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        meta, body = load(skill_md)
        records.append({"dir": skill_md.parent, "meta": meta, "body": body})
    return records


def read_agents():
    records = []
    for agent_md in sorted(AGENTS_DIR.glob("*.md")):
        meta, body = load(agent_md)
        records.append({"path": agent_md, "meta": meta, "body": body})
    return records


# ---- per-tool emitters -----------------------------------------------------
# Each returns {relative_path: bytes} to write under dist/<tool>/.


def emit_claude(skills, agents):
    out = {}
    for s in skills:
        meta, dirp = s["meta"], s["dir"]
        fm = {
            k: meta[k]
            for k in ("name", "description", "allowed-tools", "model", "version")
            if k in meta
        }
        out["skills/%s/SKILL.md" % meta["name"]] = _render(
            fm,
            s["body"],
            order=("name", "description", "allowed-tools", "model", "version"),
        )
        _copy_assets_into(dirp, out, "skills/%s" % meta["name"])
    for a in agents:
        out["agents/%s.md" % a["meta"]["name"]] = _render(a["meta"], a["body"])
    return out


def emit_copilot(skills, agents):
    out = {}
    for s in skills:
        meta = s["meta"]
        fm = {"description": meta["description"], "applyTo": "**"}
        assets = _copy_assets_into(s["dir"], out, "instructions/_%s" % meta["name"])
        body = _rewrite_asset_refs(s["body"], assets, "_%s" % meta["name"])
        out["instructions/%s.instructions.md" % meta["name"]] = _render(
            fm, body, order=("description", "applyTo")
        )
    return out


def emit_cursor(skills, agents):
    out = {}
    for s in skills:
        meta = s["meta"]
        fm = {"description": meta["description"], "alwaysApply": False}
        assets = _copy_assets_into(s["dir"], out, "rules/_%s" % meta["name"])
        body = _rewrite_asset_refs(s["body"], assets, "_%s" % meta["name"])
        out["rules/%s.mdc" % meta["name"]] = _render(
            fm, body, order=("description", "alwaysApply")
        )
    return out


def emit_antigravity(skills, agents):
    out = {}
    for s in skills:
        meta = s["meta"]
        fm = {"description": meta["description"], "trigger": "model_decision"}
        assets = _copy_assets_into(s["dir"], out, "rules/_%s" % meta["name"])
        body = _rewrite_asset_refs(s["body"], assets, "_%s" % meta["name"])
        out["rules/%s.md" % meta["name"]] = _render(
            fm, body, order=("description", "trigger")
        )
    for a in agents:
        out["workflows/%s.md" % a["meta"]["name"]] = _render(a["meta"], a["body"])
    return out


def _copy_assets_into(src_dir, out, prefix):
    """Copy reference/scripts/tests files into the output tree.

    Returns the list of copied asset paths relative to the skill dir
    (e.g. "scripts/classify.py"), POSIX-style, sorted longest first so a
    later string rewrite can replace longer paths before their prefixes.
    """
    copied = []
    for sub in ("reference", "scripts", "tests"):
        src = src_dir / sub
        if not src.is_dir():
            continue
        for f in sorted(src.rglob("*")):
            if f.is_dir() or f.name == ".gitkeep":
                continue
            # Hermetic build: never ship interpreter bytecode or OS dotfiles.
            # They are local residue -- e.g. __pycache__ created when pytest
            # imports a skill script mid-run -- and their presence poisons
            # the --check drift gate depending on what ran before the build.
            if (
                "__pycache__" in f.parts
                or f.suffix in (".pyc", ".pyo")
                or f.name.startswith(".")
            ):
                continue
            rel = f.relative_to(src_dir).as_posix()
            out["%s/%s" % (prefix, rel)] = f.read_bytes()
            copied.append(rel)
    return sorted(copied, key=len, reverse=True)


def _rewrite_asset_refs(body, assets, assets_dir):
    """Rewrite bare asset rel-paths to be correct relative to the emitted
    markdown file's own directory (e.g. "scripts/x.py" ->
    "_<skill>/scripts/x.py" under Copilot's instructions/).

    Only strings exactly matching a real asset rel-path of this skill are
    rewritten; generic prose is left alone. Run on the original body before
    _render.
    """
    for rel in assets:
        body = body.replace(rel, "%s/%s" % (assets_dir, rel))
    return body


def _render(meta, body, order=None):
    from frontmatter import dump

    text = dump(meta, order=order) + "\n" + body
    return text.encode("utf-8")


EMITTERS = {
    "claude": emit_claude,
    "copilot": emit_copilot,
    "cursor": emit_cursor,
    "antigravity": emit_antigravity,
}


def render_agents_md(skills, agents):
    lines = [
        "# AGENTS.md",
        "",
        "> Generated by `scripts/build.py` from `skills/*/SKILL.md` and",
        "> `agents/*.md`. Do not hand-edit — edit the source and rebuild.",
        "",
        "Shared cross-tool contract: every skill below works identically",
        "whether invoked from Claude Code, Copilot, Cursor, or Antigravity.",
        "Per-tool shims translate frontmatter only; the procedure is one file.",
        "",
        "## Skill catalog",
        "",
        "| Skill | Version | Trigger |",
        "|---|---|---|",
    ]
    for s in skills:
        m = s["meta"]
        lines.append(
            "| `%s` | %s | %s |" % (m["name"], m.get("version", "-"), m["description"])
        )
    lines += ["", "## Subagents", "", "| Agent | Charter |", "|---|---|"]
    for a in agents:
        m = a["meta"]
        lines.append("| `%s` | %s |" % (m["name"], m["description"]))
    lines += [
        "",
        "## Tool coverage",
        "",
        "Subagents are emitted for Claude Code (`agents/`, under `dist/claude/`)",
        "and Antigravity (`workflows/`, under `dist/antigravity/`). Copilot and",
        "Cursor have no agent equivalent mapped — a known gap, documented here",
        "intentionally.",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def render_marketplace(skills, agents):
    """marketplace.json with its skills/agents arrays derived from the sources.

    Every other field is preserved from the committed file.
    """
    data = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
    plugin = data["plugins"][0]
    plugin["skills"] = ["skills/%s" % s["dir"].name for s in skills]
    plugin["agents"] = ["agents/%s" % a["path"].name for a in agents]
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def build():
    skills = read_skills()
    agents = read_agents()
    tree = {}
    for tool, emitter in EMITTERS.items():
        for rel, content in emitter(skills, agents).items():
            tree["%s/%s" % (tool, rel)] = content
    tree["../AGENTS.md"] = render_agents_md(skills, agents)  # repo root, not dist/
    tree["../.claude-plugin/marketplace.json"] = render_marketplace(skills, agents)
    return tree


def write_tree(tree, check=False):
    changed = []
    for rel, content in tree.items():
        dest = (
            (DIST / rel).resolve()
            if not rel.startswith("../")
            else (REPO_ROOT / rel[3:]).resolve()
        )
        if check:
            if not dest.exists() or dest.read_bytes() != content:
                changed.append(str(dest.relative_to(REPO_ROOT)))
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)

    # stale files: anything under dist/ not in this build's tree
    live = {(DIST / rel).resolve() for rel in tree if not rel.startswith("../")}
    stale = (
        [f for f in sorted(DIST.rglob("*")) if f.is_file() and f.resolve() not in live]
        if DIST.is_dir()
        else []
    )
    if check:
        return changed + [str(f.relative_to(REPO_ROOT)) + " (stray)" for f in stale]

    for f in stale:
        f.unlink()
    if DIST.is_dir():
        for d in sorted(DIST.rglob("*"), reverse=True):
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()
    return []


def main(argv=None):
    check = "--check" in (argv or sys.argv[1:])
    tree = build()
    changed = write_tree(tree, check=check)
    if check:
        if changed:
            print(
                "dist/ is stale (%d file(s) differ from source or are stray):"
                % len(changed),
                file=sys.stderr,
            )
            for c in changed:
                print("  " + c, file=sys.stderr)
            print("run: python3 scripts/build.py", file=sys.stderr)
            return 1
        print("dist/ matches source (%d files)" % len(tree))
        return 0
    print("built %d files across %d tools + AGENTS.md" % (len(tree), len(EMITTERS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
