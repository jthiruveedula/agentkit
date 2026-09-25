#!/usr/bin/env python3
"""setup-guardian doctor: repo setup-health checks with safe auto-fixes.

Self-contained and stdlib-only (no scripts.lib import) so it runs on any
machine with Python 3. Detects the repo root by walking up from this file.

    python3 skills/setup-guardian/scripts/doctor.py            # human report
    python3 skills/setup-guardian/scripts/doctor.py --fix      # apply safe fixes
    python3 skills/setup-guardian/scripts/doctor.py --watch    # one JSON object
"""

from __future__ import annotations

import argparse
import io
import json
import os
import platform
import re
import subprocess
import sys
import tokenize
from dataclasses import dataclass
from pathlib import Path

CHECKS = [
    "dist_freshness",
    "install_targets",
    "skill_count",
    "pinned_shas",
    "ci_aggregator",
    "external_lock",
    "subprocess_env",
]


@dataclass
class CheckResult:
    name: str
    status: str  # "pass" | "warn" | "fail"
    message: str
    fixed: bool = False
    remediation: str = ""


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
USES_RE = re.compile(r"^\s*-\s*uses:\s*([^\s@#]+)@([^\s#]+)")
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
HEX_RE = re.compile(r"[0-9a-fA-F]{1,64}\Z")
ENV_NONE_RE = re.compile(r"\benv\s*=\s*None\b")
ENV_DICT_RE = re.compile(r"\benv\s*=\s*\{")
ENV_ANY_RE = re.compile(r"\benv\s*=")

KNOWN_BAD_SHAS: dict[str, str] = {
    "249970729cb0ef3589644e2896644e5dc5ba9c38": (
        "LESSON-002: setup-node pin typo 2026-09-20 "
        "(\u20266644e5\u2026 should be \u20266645e5\u2026)"
    ),
}


def find_repo_root(start: Path) -> Path:
    """Walk up from *start* to the repo root (has skills/ and Makefile or .git)."""
    d = start.resolve()
    if d.is_file():
        d = d.parent
    while True:
        if (d / "skills").is_dir() and (
            (d / "Makefile").is_file() or (d / ".git").exists()
        ):
            return d
        parent = d.parent
        if parent == d:
            raise RuntimeError("could not find repo root from %s" % start)
        d = parent


def iter_skill_names(repo: Path) -> list[str]:
    skills = repo / "skills"
    if not skills.is_dir():
        return []
    return sorted(
        p.name for p in skills.iterdir() if p.is_dir() and (p / "SKILL.md").is_file()
    )


def readme_claimed_count(readme_text: str) -> int | None:
    m = re.search(r"^(\d+)\s+skills\.", readme_text, re.M)
    return int(m.group(1)) if m else None


def agents_table_names(agents_text: str) -> list[str]:
    """Skill names from `| `name` |` rows inside the '## Skill catalog' section."""
    names: list[str] = []
    in_section = False
    for line in agents_text.splitlines():
        if line.startswith("## "):
            in_section = line.strip() == "## Skill catalog"
            continue
        if in_section:
            m = re.match(r"^\|\s*`([^`]+)`\s*\|", line)
            if m:
                names.append(m.group(1))
    return names


def uses_pins(workflow_text: str) -> list[tuple[str, str]]:
    """(uses_target, ref) for every `- uses: <target>@<ref>` line."""
    out: list[tuple[str, str]] = []
    for line in workflow_text.splitlines():
        m = USES_RE.match(line)
        if m:
            out.append((m.group(1), m.group(2)))
    return out


def ref_kind(ref: str) -> str:
    """Classify an action pin: 'sha', 'malformed' (truncated/typo'd SHA), 'tag'."""
    if SHA_RE.match(ref):
        return "sha"
    if HEX_RE.match(ref):
        return "malformed"
    return "tag"


def ci_aggregator_ok(ci_text: str) -> tuple[bool, str]:
    """True when the CI success gate reads v.get("result") from needs entries."""
    if 'v.get("result")' in ci_text:
        return True, 'aggregator compares v.get("result")'
    bare = re.search(
        r"""\bv\s*(==|!=)\s*['"]success['"]|\bv\s+not\s+in\s*\(\s*['"]success['"]""",
        ci_text,
    )
    if bare:
        return False, (
            'aggregator compares whole needs objects (e.g. "%s") instead of '
            'v.get("result"); needs.* entries are objects {result, outputs}, '
            "not bare strings (LESSON-001)" % bare.group(0).strip()
        )
    return True, "no needs aggregator comparison found"


def _source_problems(src: dict, label: str) -> list[str]:
    """Field checks for one lock source: sha (valid, not known-bad), license."""
    problems: list[str] = []
    sha = src.get("sha")
    if not sha:
        problems.append("source %s: missing 'sha'" % label)
    elif not SHA_RE.match(str(sha)):
        problems.append(
            "source %s: sha %r is not a 40-char lowercase hex SHA" % (label, sha)
        )
    elif str(sha) in KNOWN_BAD_SHAS:
        problems.append(
            "source %s: sha %s -- %s" % (label, sha, KNOWN_BAD_SHAS[str(sha)])
        )
    if not src.get("license"):
        problems.append("source %s: missing 'license'" % label)
    return problems


def lock_problems(lock: dict) -> list[str]:
    """Problems in external/skills.lock.json.

    Accepts the full lock-file shape (top keys $schema/note/sources plus
    per-source name/repo/sha/license) or a single source dict (sha/license).
    """
    if "sources" in lock or "$schema" in lock:
        problems: list[str] = []
        for key in ("$schema", "note", "sources"):
            if key not in lock:
                problems.append("missing top-level key %r" % key)
        sources = lock.get("sources")
        if not isinstance(sources, list):
            if "sources" in lock:
                problems.append("'sources' is not a list")
            return problems
        for i, src in enumerate(sources):
            label = src.get("name", "#%d" % i) if isinstance(src, dict) else "#%d" % i
            if not isinstance(src, dict):
                problems.append("source %s is not an object" % label)
                continue
            if not src.get("name"):
                problems.append("source %s: missing 'name'" % label)
            repo = src.get("repo")
            if not repo:
                problems.append("source %s: missing 'repo'" % label)
            elif not re.match(r"[^/\s]+/[^/\s]+\Z", str(repo)):
                problems.append("source %s: repo %r is not owner/name" % (label, repo))
            problems.extend(_source_problems(src, label))
        return problems
    return _source_problems(lock, str(lock.get("name", "source")))


def _join_continuations(py_text: str) -> list[tuple[int, str]]:
    """Join backslash-continued lines; returns (start_lineno, logical_line)."""
    logical: list[tuple[int, str]] = []
    buf = ""
    start = 0
    for i, line in enumerate(py_text.splitlines(), start=1):
        if not buf:
            start = i
        if line.endswith("\\"):
            buf += line[:-1]
            continue
        buf += line
        logical.append((start, buf))
        buf = ""
    if buf:
        logical.append((start, buf))
    return logical


def _code_only(py_text: str) -> str:
    """Blank string literals and comments, preserving line/column layout.

    Fixture strings (e.g. test data containing the literal text 'env={...}')
    are not real subprocess calls, so they must not be flagged.
    """
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(py_text).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return py_text
    spans = [
        (t.start, t.end) for t in toks if t.type in (tokenize.STRING, tokenize.COMMENT)
    ]
    if not spans:
        return py_text
    buf = [list(line) for line in py_text.split("\n")]
    for (srow, scol), (erow, ecol) in spans:
        for r in range(srow - 1, erow):
            line = buf[r]
            start_c = scol if r == srow - 1 else 0
            end_c = ecol if r == erow - 1 else len(line)
            for c in range(start_c, min(end_c, len(line))):
                line[c] = " "
    return "\n".join("".join(line) for line in buf)


ENV_NAME_RE = re.compile(r"\benv\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\b")
# `x = <expr built from os.environ>` -- passing env=x later is safe.
OS_ENVIRON_DERIVED_RE = re.compile(
    r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"
    r"(?:dict\s*\(\s*os\.environ|os\.environ\.copy\s*\(|\{\s*\*\*\s*os\.environ|os\.environ\s*\|)"
)


def subprocess_env_findings(py_text: str) -> list[tuple[int, str, str]]:
    """(lineno, 'fail'|'warn', message) for risky subprocess env= usage."""
    findings: list[tuple[int, str, str]] = []
    code = _code_only(py_text)
    safe_names = set(OS_ENVIRON_DERIVED_RE.findall(code))
    for lineno, line in _join_continuations(code):
        if ENV_NONE_RE.search(line):
            continue
        if "os.environ" in line:
            continue
        if ENV_DICT_RE.search(line):
            findings.append(
                (
                    lineno,
                    "fail",
                    "subprocess env={...} dict literal without os.environ: "
                    "inherited vars (e.g. SystemRoot on Windows) are dropped "
                    "and child Python may fail to start (LESSON-003)",
                )
            )
        elif ENV_ANY_RE.search(line):
            m = ENV_NAME_RE.search(line)
            if m and m.group(1) in safe_names:
                continue  # env=<var> where <var> was built from os.environ
            findings.append(
                (
                    lineno,
                    "warn",
                    "subprocess env=... without os.environ: verify the "
                    "inherited environment is preserved",
                )
            )
    return findings


def tool_bases(home: Path, plat: str, env: dict[str, str]) -> dict[str, Path]:
    """Install base directories per tool (mirrors install.sh)."""
    if plat.lower() == "darwin":
        copilot = home / "Library" / "Application Support" / "Code" / "User"
    else:
        copilot = home / ".config" / "Code" / "User"
    return {
        "claude": Path(env.get("CLAUDE_HOME") or str(home / ".claude")),
        "copilot": copilot,
        "cursor": Path(env.get("CURSOR_HOME") or str(home / ".cursor")),
        "antigravity": Path(env.get("ANTIGRAVITY_HOME") or str(home / ".antigravity")),
    }


def expected_install_dests(
    repo: Path, home: Path, plat: str, env: dict[str, str]
) -> dict[str, list[tuple[Path, Path]]]:
    """tool -> [(dest, src)] install targets (mirrors install.sh link_one calls)."""
    bases = tool_bases(home, plat, env)
    dist = repo / "dist"
    out: dict[str, list[tuple[Path, Path]]] = {
        "claude": [],
        "copilot": [],
        "cursor": [],
        "antigravity": [],
    }

    def files(d: Path, pattern: str) -> list[Path]:
        return sorted(d.glob(pattern)) if d.is_dir() else []

    def dirs(d: Path) -> list[Path]:
        return sorted(p for p in d.iterdir() if p.is_dir()) if d.is_dir() else []

    for d in dirs(dist / "claude" / "skills"):
        out["claude"].append((bases["claude"] / "skills" / d.name, d))
    for f in files(dist / "claude" / "agents", "*.md"):
        out["claude"].append((bases["claude"] / "agents" / f.name, f))

    out["copilot"].append(
        (bases["copilot"] / "copilot-instructions.md", repo / "AGENTS.md")
    )
    for f in files(dist / "copilot" / "instructions", "*.instructions.md"):
        out["copilot"].append((bases["copilot"] / "instructions" / f.name, f))

    for f in files(dist / "cursor" / "rules", "*.mdc"):
        out["cursor"].append((bases["cursor"] / "rules" / f.name, f))
    out["cursor"].append((home / "AGENTS.md", repo / "AGENTS.md"))

    for f in files(dist / "antigravity" / "rules", "*.md"):
        out["antigravity"].append((bases["antigravity"] / "rules" / f.name, f))
    for f in files(dist / "antigravity" / "workflows", "*.md"):
        out["antigravity"].append((bases["antigravity"] / "workflows" / f.name, f))

    return out


def classify_dest(dest: Path, src: Path) -> str:
    """'missing' | 'dangling' | 'elsewhere' | 'copy' | 'ok' for an install dest."""
    if dest.is_symlink():
        if not dest.exists():
            return "dangling"
        try:
            same = os.path.realpath(dest) == os.path.realpath(src)
        except OSError:
            return "dangling"
        return "ok" if same else "elsewhere"
    if dest.exists():
        return "copy"
    return "missing"


def fix_readme_count(repo: Path, n: int) -> bool:
    """Rewrite the first '<n> skills.' README line to the true count."""
    p = repo / "README.md"
    if not p.is_file():
        return False
    text = p.read_text(encoding="utf-8")
    new = re.sub(r"^\d+\s+skills\.", "%d skills." % n, text, count=1, flags=re.M)
    if new == text:
        return False
    p.write_text(new, encoding="utf-8")
    return True


def _run_ok(cmd: list[str], repo: Path) -> bool:
    try:
        r = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0


def regen_catalog(repo: Path) -> bool:
    return _run_ok([sys.executable, "site/scripts/build-catalog.py"], repo)


def rebuild_dist(repo: Path) -> bool:
    return _run_ok([sys.executable, "scripts/build.py"], repo)


def dist_is_fresh(repo: Path) -> bool:
    return _run_ok([sys.executable, "scripts/build.py", "--check"], repo)


# ---------------------------------------------------------------------------
# checks
# ---------------------------------------------------------------------------


def check_dist_freshness(repo: Path, fix: bool = False) -> CheckResult:
    name = "dist_freshness"
    if dist_is_fresh(repo):
        return CheckResult(
            name, "pass", "dist/ matches source (scripts/build.py --check clean)"
        )
    if fix and rebuild_dist(repo) and dist_is_fresh(repo):
        return CheckResult(
            name,
            "pass",
            "dist/ had drifted; rebuilt with scripts/build.py",
            fixed=True,
        )
    return CheckResult(
        name,
        "fail",
        "dist/ has drifted from source (scripts/build.py --check failed)",
        remediation="run `make build` (or doctor.py --fix) to regenerate dist/ "
        "from source; never hand-edit anything under dist/",
    )


ALL_TOOLS = ("claude", "copilot", "cursor", "antigravity")


def installed_tools(state_dir: Path) -> tuple[str, ...]:
    """Tools from the installer's saved --tools (state_dir/tools), else all.

    Checking every tool made a claude-only install report copilot/cursor/
    antigravity as "missing" -- a permanent false FAIL.
    """
    try:
        saved = (state_dir / "tools").read_text(encoding="utf-8").strip()
    except OSError:
        return ALL_TOOLS
    picked = tuple(t for t in ALL_TOOLS if t in {s.strip() for s in saved.split(",")})
    return picked or ALL_TOOLS


def check_install_targets(repo: Path, fix: bool = False) -> CheckResult:
    name = "install_targets"
    home = Path.home()
    env = dict(os.environ)
    dests = expected_install_dests(repo, home, platform.system(), env)

    state_dir = (
        Path(env.get("XDG_STATE_HOME") or str(home / ".local" / "state")) / "agentkit"
    )
    parts: list[str] = []
    bad_tools: list[str] = []
    warn_tools: list[str] = []
    for tool in installed_tools(state_dir):
        c = {"ok": 0, "missing": 0, "dangling": 0, "elsewhere": 0, "copy": 0}
        for dest, src in dests[tool]:
            c[classify_dest(dest, src)] += 1
        extra = ""
        if c["elsewhere"] or c["copy"]:
            extra = " elsewhere=%d copy=%d" % (c["elsewhere"], c["copy"])
        parts.append(
            "%s: ok=%d missing=%d dangling=%d%s"
            % (tool, c["ok"], c["missing"], c["dangling"], extra)
        )
        if c["missing"] or c["dangling"]:
            bad_tools.append(tool)
        elif c["elsewhere"] or c["copy"]:
            warn_tools.append(tool)

    manifest = state_dir / "manifest.tsv"
    stale: list[str] = []
    if manifest.is_file():
        for line in manifest.read_text(encoding="utf-8").splitlines():
            p = line.strip()
            if p and not Path(p).exists():
                stale.append(p)

    message = "; ".join(parts)
    if stale:
        message += "; stale manifest entries: %d" % len(stale)
    if bad_tools or stale:
        details: list[str] = []
        if bad_tools:
            details.append("missing or dangling targets for: %s" % ", ".join(bad_tools))
        if stale:
            shown = ", ".join(stale[:5])
            if len(stale) > 5:
                shown += ", ..."
            details.append("stale manifest entries (path no longer exists): %s" % shown)
        tools = ",".join(bad_tools) if bad_tools else "claude"
        return CheckResult(
            name,
            "fail",
            message + " -- " + "; ".join(details),
            remediation="re-run the installer for the affected tools "
            "(e.g. ./install.sh --tools=%s), or re-run the full install" % tools,
        )
    if warn_tools:
        return CheckResult(
            name,
            "warn",
            message + " -- some destinations are copies or point elsewhere "
            "(not managed symlinks)",
            remediation="re-run ./install.sh to replace copies/foreign links "
            "with managed symlinks",
        )
    return CheckResult(name, "pass", message)


def _catalog_skill_count(repo: Path) -> int | None:
    p = repo / "site" / "assets" / "skills.json"
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(data, dict):
        skills = data.get("skills", data)
        return len(skills) if isinstance(skills, list) else None
    if isinstance(data, list):
        return len(data)
    return None


def check_skill_count(repo: Path, fix: bool = False) -> CheckResult:
    name = "skill_count"
    n = len(iter_skill_names(repo))
    readme_p = repo / "README.md"
    agents_p = repo / "AGENTS.md"
    readme = (
        readme_claimed_count(readme_p.read_text(encoding="utf-8"))
        if readme_p.is_file()
        else None
    )
    catalog = _catalog_skill_count(repo)
    agents = (
        len(agents_table_names(agents_p.read_text(encoding="utf-8")))
        if agents_p.is_file()
        else None
    )
    mismatches: list[str] = []
    if readme != n:
        mismatches.append("README claims %s (skills/ has %d)" % (readme, n))
    if catalog != n:
        mismatches.append(
            "site/assets/skills.json lists %s (skills/ has %d)" % (catalog, n)
        )
    if agents != n:
        mismatches.append(
            "AGENTS.md catalog table lists %s (skills/ has %d)" % (agents, n)
        )
    if not mismatches:
        return CheckResult(
            name,
            "pass",
            "skill count consistent: %d (README, skills.json, AGENTS.md)" % n,
        )
    if fix:
        changed = fix_readme_count(repo, n)
        regen_catalog(repo)
        rebuild_dist(repo)
        result = check_skill_count(repo, fix=False)
        if result.status == "pass":
            result.fixed = True
            result.message += (
                " (auto-fixed: README count%s, catalog regen, dist rebuild)"
                % (" updated" if changed else "")
            )
            return result
    return CheckResult(
        name,
        "fail",
        "skill count drift: " + "; ".join(mismatches),
        remediation="never hand-write skill counts; run `make build` "
        "(or doctor.py --fix) to regenerate the README count, "
        "site/assets/skills.json, and AGENTS.md from skills/",
    )


def check_pinned_shas(repo: Path, fix: bool = False) -> CheckResult:
    name = "pinned_shas"
    fails: list[str] = []
    warns: list[str] = []
    wf_dir = repo / ".github" / "workflows"
    for wf in sorted(wf_dir.glob("*.yml")) if wf_dir.is_dir() else []:
        try:
            text = wf.read_text(encoding="utf-8")
        except OSError:
            continue
        for target, ref in uses_pins(text):
            if ref in KNOWN_BAD_SHAS:
                fails.append(
                    "%s: %s@%s -- %s" % (wf.name, target, ref, KNOWN_BAD_SHAS[ref])
                )
            elif ref_kind(ref) == "malformed":
                fails.append(
                    "%s: %s@%s is a malformed SHA (truncated or typo'd)"
                    % (wf.name, target, ref)
                )
            elif ref_kind(ref) == "tag":
                warns.append("%s: %s@%s is not SHA-pinned" % (wf.name, target, ref))
    if fails:
        return CheckResult(
            name,
            "fail",
            "bad action pins: " + "; ".join(fails),
            remediation="fix the pin(s) above, then verify with "
            "`git ls-remote https://github.com/<owner>/<repo>` -- "
            "see reference/lessons.md LESSON-002. No auto-fix: pins must "
            "resolve to a real commit.",
        )
    if warns:
        return CheckResult(
            name,
            "warn",
            "tag pins (not SHA-pinned): " + "; ".join(warns),
            remediation="pin to a full commit SHA and verify with "
            "`git ls-remote https://github.com/<owner>/<repo>`",
        )
    return CheckResult(name, "pass", "all action pins are full 40-char SHAs")


def check_ci_aggregator(repo: Path, fix: bool = False) -> CheckResult:
    name = "ci_aggregator"
    ci = repo / ".github" / "workflows" / "ci.yml"
    if not ci.is_file():
        return CheckResult(name, "warn", "no .github/workflows/ci.yml found")
    ok, reason = ci_aggregator_ok(ci.read_text(encoding="utf-8"))
    if ok:
        return CheckResult(name, "pass", reason)
    return CheckResult(
        name,
        "fail",
        reason,
        remediation='compare v.get("result"), not the whole needs object:\n'
        '  failed = {k: v.get("result") for k, v in needs.items()\n'
        '            if v.get("result") not in ("success", "skipped")}\n'
        "see reference/lessons.md LESSON-001. No auto-fix: edit "
        ".github/workflows/ci.yml by hand.",
    )


def check_external_lock(repo: Path, fix: bool = False) -> CheckResult:
    name = "external_lock"
    p = repo / "external" / "skills.lock.json"
    try:
        lock = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return CheckResult(
            name,
            "fail",
            "cannot read external/skills.lock.json: %s" % e,
            remediation="restore external/skills.lock.json from git",
        )
    problems = lock_problems(lock)
    if problems:
        return CheckResult(
            name,
            "fail",
            "lock file problems: " + "; ".join(problems),
            remediation="fix external/skills.lock.json (name/repo/sha/license "
            "per source, sha = 40-char lowercase hex)",
        )
    warns: list[str] = []
    sources = lock.get("sources", [])
    for src in sources:
        if not isinstance(src, dict):
            continue
        d = repo / "external" / str(src.get("name", ""))
        if (d / ".git").is_dir():
            try:
                r = subprocess.run(
                    ["git", "-C", str(d), "rev-parse", "HEAD"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
            except (OSError, subprocess.TimeoutExpired):
                continue
            head = r.stdout.strip()
            if r.returncode == 0 and head and head != src.get("sha"):
                warns.append(
                    "%s: checked-out %s != locked %s"
                    % (src.get("name"), head[:12], str(src.get("sha"))[:12])
                )
    if warns:
        return CheckResult(
            name,
            "warn",
            "external checkouts differ from lock: " + "; ".join(warns),
            remediation="re-run scripts/sync-external.sh to re-sync "
            "external/<name>/ to the locked SHA",
        )
    return CheckResult(
        name,
        "pass",
        "external/skills.lock.json valid; %d sources pinned" % len(sources),
    )


def _iter_scan_files(repo: Path) -> list[Path]:
    files: list[Path] = []
    for root in (repo / "scripts", repo / "tests"):
        if root.is_dir():
            files.extend(p for p in root.glob("*.py") if "__pycache__" not in p.parts)
    skills_scripts = repo / "skills"
    if skills_scripts.is_dir():
        files.extend(
            p
            for p in skills_scripts.glob("*/scripts/*.py")
            if "__pycache__" not in p.parts
        )
    return sorted(set(files))


def check_subprocess_env(repo: Path, fix: bool = False) -> CheckResult:
    name = "subprocess_env"
    findings: list[tuple[Path, int, str, str]] = []
    for p in _iter_scan_files(repo):
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            continue
        for lineno, sev, msg in subprocess_env_findings(text):
            findings.append((p, lineno, sev, msg))
    fails = [f for f in findings if f[2] == "fail"]
    warns = [f for f in findings if f[2] == "warn"]
    remediation = (
        'build env from os.environ, e.g. env = dict(os.environ, MY_VAR="x") -- '
        "on Windows, inherited vars like SystemRoot are required for child "
        "Python startup (LESSON-003)"
    )

    def detail(rows: list[tuple[Path, int, str, str]]) -> str:
        return "; ".join(
            "%s:%d %s" % (p.relative_to(repo), ln, m) for p, ln, _, m in rows[:5]
        )

    if fails:
        return CheckResult(
            name,
            "fail",
            "bare subprocess env= dicts (%d): %s" % (len(fails), detail(fails)),
            remediation=remediation,
        )
    if warns:
        return CheckResult(
            name,
            "warn",
            "suspicious subprocess env= without os.environ (%d): %s"
            % (len(warns), detail(warns)),
            remediation=remediation,
        )
    return CheckResult(name, "pass", "no bare subprocess env= dicts found")


_CHECK_FUNCS = {
    "dist_freshness": check_dist_freshness,
    "install_targets": check_install_targets,
    "skill_count": check_skill_count,
    "pinned_shas": check_pinned_shas,
    "ci_aggregator": check_ci_aggregator,
    "external_lock": check_external_lock,
    "subprocess_env": check_subprocess_env,
}


def run_all(repo: Path, fix: bool = False) -> list[CheckResult]:
    return [_CHECK_FUNCS[name](repo, fix=fix) for name in CHECKS]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="setup-guardian: repo setup-health checks with safe auto-fixes"
    )
    parser.add_argument("--repo", default=None, help="repo root (default: auto-detect)")
    parser.add_argument("--fix", action="store_true", help="apply safe auto-fixes")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument(
        "--watch", action="store_true", help="watch mode: one JSON object"
    )
    parser.add_argument("--check", default=None, help="run a single named check")
    args = parser.parse_args(argv)

    repo = (
        Path(args.repo).resolve()
        if args.repo
        else find_repo_root(Path(__file__).resolve())
    )
    if args.check:
        if args.check not in _CHECK_FUNCS:
            print(
                "unknown check %r (choose from %s)" % (args.check, ", ".join(CHECKS)),
                file=sys.stderr,
            )
            raise SystemExit(2)
        results = [_CHECK_FUNCS[args.check](repo, fix=args.fix)]
    else:
        results = run_all(repo, fix=args.fix)

    failures = sum(1 for r in results if r.status == "fail")
    warnings = sum(1 for r in results if r.status == "warn")

    if args.json or args.watch:
        payload = {
            "ok": failures == 0,
            "failures": failures,
            "warnings": warnings,
            "checks": [
                {
                    "name": r.name,
                    "status": r.status,
                    "message": r.message,
                    "fixed": r.fixed,
                    "remediation": r.remediation,
                }
                for r in results
            ],
        }
        print(json.dumps(payload))
    else:
        for r in results:
            print("[%s] %s: %s" % (r.status.upper(), r.name, r.message))
            if r.status == "fail" and r.remediation:
                for line in r.remediation.splitlines():
                    print("  -> %s" % line)
    raise SystemExit(0 if failures == 0 else 1)


if __name__ == "__main__":
    main()
