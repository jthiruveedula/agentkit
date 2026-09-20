#!/usr/bin/env python3
"""map.py -- structure-first repo reconnaissance. Stdlib only.

Prints a compact markdown map of a repo: detected manifests with key
fields, a depth-limited tree with per-directory file counts and sizes,
and guessed entry points. Ignores build artifacts and VCS dirs.

Usage:
    python3 map.py [DIR] [--depth N] [--json]
"""

import argparse
import json
import os
import re
import sys

try:
    import tomllib
except ImportError:  # Python < 3.11: fall back to regex parsing
    tomllib = None

IGNORE = {
    "node_modules",
    ".git",
    "dist",
    "__pycache__",
    ".venv",
    "target",
    ".hg",
    ".svn",
    ".tox",
    ".eggs",
    "coverage",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
}

ENTRY_NAME = re.compile(r"^(main|cli|index|app|server|run)(\.[a-z0-9]+)?$", re.I)
MANIFEST_FILES = [
    "package.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Makefile",
    "makefile",
    "README.md",
    "README.rst",
    "README.txt",
]


def is_ignored(name):
    return name in IGNORE


def list_entries(path):
    """Non-ignored, non-symlink entries; dirs first, then A-Z."""
    try:
        entries = list(os.scandir(path))
    except OSError:
        return []
    out = [e for e in entries if not is_ignored(e.name) and not e.is_symlink()]
    out.sort(key=lambda e: (not e.is_dir(follow_symlinks=False), e.name.lower()))
    return out


def dir_stats(path):
    """Recursive (files, bytes) for a dir, honoring IGNORE."""
    files, size = 0, 0
    stack = [path]
    while stack:
        for e in list_entries(stack.pop()):
            if e.is_dir(follow_symlinks=False):
                stack.append(e.path)
            else:
                files += 1
                try:
                    size += e.stat().st_size
                except OSError:
                    pass
    return files, size


def fmt_kb(size):
    return "%d KB" % round(size / 1024)


# ---------------------------------------------------------------- manifests


def parse_package_json(path):
    try:
        data = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return {
        "kind": "package.json",
        "name": data.get("name"),
        "version": data.get("version"),
        "scripts": sorted((data.get("scripts") or {}).keys()),
        "main": data.get("main"),
        "bin": data.get("bin"),
    }


def parse_pyproject(path):
    name, version, scripts, script_map = None, None, [], {}
    try:
        if tomllib is None:
            raise ImportError
        proj = tomllib.load(open(path, "rb")).get("project", {})
        name, version = proj.get("name"), proj.get("version")
        script_map = dict(proj.get("scripts") or {})
        scripts = sorted(script_map.keys())
    except Exception:
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            return None
        m = re.search(r'^name\s*=\s*["\']([^"\']+)', text, re.M)
        name = m.group(1) if m else None
        m = re.search(r'^version\s*=\s*["\']([^"\']+)', text, re.M)
        version = m.group(1) if m else None
    return {
        "kind": "pyproject.toml",
        "name": name,
        "version": version,
        "scripts": scripts,
        "script_map": script_map,
    }


def parse_gomod(path):
    module = gov = None
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return None
    for ln in lines:
        m = re.match(r"^module\s+(\S+)", ln)
        if m:
            module = m.group(1)
        m = re.match(r"^go\s+(\S+)", ln)
        if m:
            gov = m.group(1)
        if module and gov:
            break
    return {"kind": "go.mod", "name": module, "version": gov, "scripts": []}


def parse_cargo(path):
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    sec = re.search(r"\[package\](.*?)(?:^\[|\Z)", text, re.M | re.S)
    name = version = None
    if sec:
        m = re.search(r'^name\s*=\s*"([^"]+)"', sec.group(1), re.M)
        name = m.group(1) if m else None
        m = re.search(r'^version\s*=\s*"([^"]+)"', sec.group(1), re.M)
        version = m.group(1) if m else None
    return {"kind": "Cargo.toml", "name": name, "version": version, "scripts": []}


def parse_makefile(path):
    targets = []
    try:
        for ln in open(path, encoding="utf-8"):
            m = re.match(r"^([A-Za-z0-9][A-Za-z0-9_.\-/]*)\s*:(?![=:])", ln)
            if m:
                t = m.group(1)
                if not t.startswith(".") and "%" not in t and t not in targets:
                    targets.append(t)
    except OSError:
        return None
    return {
        "kind": os.path.basename(path),
        "name": None,
        "version": None,
        "scripts": targets[:15],
    }


def parse_readme(path):
    try:
        for ln in open(path, encoding="utf-8"):
            ln = ln.strip()
            if ln:
                return {
                    "kind": os.path.basename(path),
                    "name": ln.lstrip("#").strip()[:80],
                    "version": None,
                    "scripts": [],
                }
    except OSError:
        pass
    return None


PARSERS = {
    "package.json": parse_package_json,
    "pyproject.toml": parse_pyproject,
    "go.mod": parse_gomod,
    "Cargo.toml": parse_cargo,
    "Makefile": parse_makefile,
    "makefile": parse_makefile,
    "README.md": parse_readme,
    "README.rst": parse_readme,
    "README.txt": parse_readme,
}


def find_manifests(root):
    manifests = []
    for fn in MANIFEST_FILES:
        path = os.path.join(root, fn)
        if os.path.isfile(path):
            m = PARSERS[fn](path)
            if m:
                manifests.append(m)
    return manifests


# ------------------------------------------------------------ entry points


def find_entry_points(root, manifests):
    cands = {}  # relpath -> reason

    def add(rel, reason):
        if rel:
            cands.setdefault(os.path.normpath(rel), reason)

    for m in manifests:
        if m["kind"] == "package.json":
            add(m.get("main"), "package.json main")
            bin_ = m.get("bin")
            if isinstance(bin_, dict):
                for k, v in bin_.items():
                    add(v, "package.json bin:%s" % k)
            elif isinstance(bin_, str):
                add(bin_, "package.json bin")
        if m["kind"] == "pyproject.toml":
            for k, v in (m.get("script_map") or {}).items():
                add(
                    v.split(":")[0].replace(".", "/") + ".py", "pyproject script:%s" % k
                )

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not is_ignored(d))
        rel = os.path.relpath(dirpath, root)
        for fn in filenames:
            r = fn if rel == "." else os.path.join(rel, fn)
            if rel == "bin" or rel.startswith("bin" + os.sep):
                add(r, "bin/")
            if ENTRY_NAME.match(fn):
                add(r, "name match")
    return [{"path": p, "reason": r} for p, r in sorted(cands.items())]


# ------------------------------------------------------------------ tree


def build_tree(root, max_depth):
    def node(path, depth):
        name = os.path.basename(path)
        if not os.path.isdir(path):
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            return {"name": name, "type": "file", "kb": fmt_kb(size)}
        files, size = dir_stats(path)
        n = {"name": name + "/", "type": "dir", "files": files, "kb": fmt_kb(size)}
        if depth < max_depth:
            n["children"] = [node(e.path, depth + 1) for e in list_entries(path)]
        return n

    return [node(e.path, 1) for e in list_entries(root)]


def render_markdown(root, manifests, entry_points, tree):
    lines = ["# map: %s" % os.path.basename(root.rstrip(os.sep) or root), ""]
    lines.append("## manifests")
    if manifests:
        for m in manifests:
            bits = ["**%s**" % m["kind"]]
            if m.get("name"):
                label = "`%s`" % m["name"]
                if m.get("version"):
                    label += " v%s" % m["version"]
                bits.append(label)
            if m.get("scripts"):
                bits.append("scripts: " + ", ".join(m["scripts"]))
            lines.append("- " + " -- ".join(bits))
    else:
        lines.append("- none found")
    lines += ["", "## tree"]

    def emit(nodes, prefix, out):
        for i, n in enumerate(nodes):
            last = i == len(nodes) - 1
            bar, cont = ("`-- ", "    ") if last else ("|-- ", "|   ")
            if n["type"] == "dir":
                out.append(
                    "%s%s%s (%d files, %s)"
                    % (prefix, bar, n["name"], n["files"], n["kb"])
                )
                if "children" in n:
                    emit(n["children"], prefix + cont, out)
            else:
                out.append("%s%s%s" % (prefix, bar, n["name"]))

    files, size = dir_stats(root)
    lines.append(". (%d files, %s)" % (files, fmt_kb(size)))
    emit(tree, "", lines)

    lines += ["", "## entry points"]
    if entry_points:
        for ep in entry_points:
            lines.append("- `%s` -- %s" % (ep["path"], ep["reason"]))
    else:
        lines.append("- none found")
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------------ main


def main(argv=None):
    ap = argparse.ArgumentParser(description="Structure-first repo map (stdlib only).")
    ap.add_argument("dir", nargs="?", default=".", help="repo root (default: .)")
    ap.add_argument("--depth", type=int, default=2, help="tree depth (default: 2)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of markdown")
    args = ap.parse_args(argv)

    root = os.path.abspath(args.dir)
    if not os.path.isdir(root):
        sys.exit("map.py: not a directory: %s" % args.dir)

    manifests = find_manifests(root)
    entry_points = find_entry_points(root, manifests)
    tree = build_tree(root, max(1, args.depth))

    if args.json:
        print(
            json.dumps(
                {
                    "root": root,
                    "manifests": manifests,
                    "entry_points": entry_points,
                    "tree": tree,
                },
                indent=2,
            )
        )
    else:
        print(render_markdown(root, manifests, entry_points, tree))


if __name__ == "__main__":
    main()
