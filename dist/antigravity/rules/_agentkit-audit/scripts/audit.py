#!/usr/bin/env python3
"""Audit an agentkit repo and emit audit.json (stdlib only, deterministic).

Heuristics are documented in reference/metrics.md. Numbers come only from
this script. Usage:
  audit.py [--root PATH] [--out FILE] [--baseline FILE] [--compact] [--json-only]
Read-only: never follows symlinks out of --root, caps per-file reads, no shell.
"""

import argparse
import datetime
import json
import os
import re
import io
import subprocess
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
try:
    from frontmatter import FrontmatterError, parse  # noqa: E402
except ImportError:  # installed copy: no repo scripts/lib; minimal fallback

    class FrontmatterError(ValueError):
        pass

    def parse(text, origin="<string>"):
        lines = text.splitlines()
        if not lines or lines[0].strip() != "---":
            raise FrontmatterError("%s: no frontmatter" % origin)
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), 0)
        if not end:
            raise FrontmatterError("%s: unterminated frontmatter" % origin)
        meta = {}
        for ln in lines[1:end]:
            m = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$", ln)
            if not m:
                continue
            v = m.group(2).strip()
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
            elif len(v) > 1 and v[0] in "'\"" and v[-1] == v[0]:
                v = v[1:-1]
            meta[m.group(1)] = v
        return meta, "\n".join(lines[end + 1 :]).lstrip("\n")


TARGETS = {"PEI": 85, "OVS": 90, "CRI": 90, "MNSS": 92, "SRS": 95, "APS": 90}
TOK_TARGET = {"skill": 1200, "agent": 400}
FILLER = re.compile(
    r"\b(very|really|simply|just|basically|actually|essentially|obviously|please|comprehensive|robust)\b",
    re.I,
)
GOOD_CTX = re.compile(
    r"\b(offset|limit|range|grep|rg|summar\w*|targeted|head|tail|checkpoint|diff)\b",
    re.I,
)
BAD_CTX = re.compile(r"read (the )?(entire|whole|all)\b|whole[- ]file|read every", re.I)
# Feedback loop in the body: a check step that says to fix and repeat/re-run.
LOOP = re.compile(
    r"\b(validat|verif|lint|check|test|re-?run)\w*[^\n]{0,120}?\b(repeat|until|re-?run|again)\b",
    re.I,
)
# A whole-file mention within 60 chars after a negation is guidance, not a leak.
NEGATED = re.compile(r"\b(don't|do not|never|avoid|no|not|instead of)\b", re.I)
MAX_BYTES = 512 * 1024
CONFIRM = re.compile(
    r"confirm|approv|ask (the )?user|permission|consent|dry[- ]run|never|do not|don't|avoid|must not|refuse",
    re.I,
)
DESTRUCTIVE = re.compile(
    r"\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|git\s+reset\s+--hard"
    r"|\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|git\s+push\s+[^\n]*(--force\b|\s-f\b)",
    re.I,
)
FETCH = re.compile(
    r"\b(WebFetch|WebSearch|firecrawl|curl|wget|scrap\w+|crawl\w*|fetch\w*|download\w*)\b",
    re.I,
)
UNTRUSTED = re.compile(
    r"untrusted|as data\b|never as instruction|not (as )?instructions|prompt[- ]injection",
    re.I,
)
SHELL = re.compile(r"shell\s*=\s*True|\bos\.(system|popen)\s*\(")
ENV_DICT = re.compile(r"\benv\s*=\s*\{")
NPX = re.compile(
    r"\bnpx\s+(?:(?:-y|--yes)\s+)?(@?[\w.-]+(?:/[\w.-]+)?)(@[\w.^~<>=-]+)?"
)
PIP = re.compile(r"\bpip3?\s+install\s+([^\n`|;&]*)")
CURL_SH = re.compile(r"(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b")
SEV_BY_H = {
    "sec.shell": "high",
    "sec.env": "med",
    "sec.destructive": "high",
    "sec.untrusted": "med",
    "sec.unpinned": "med",
    "sec.curl_sh": "high",
    "srs.tests": "low",
    "srs.scripts": "low",
    "srs.tools": "low",
    "srs.refs": "low",
    "audit.skipped": "low",
    "pin.stale": "low",
}
SEC_PENALTY = {"high": 20, "med": 10, "low": 5}
STALE_DAYS = 90
ROUTERS = ("ext-", "data-eng-router")


def clamp(x):
    return max(0, min(100, int(round(x))))


def harmonic(vals):
    vals = list(vals)
    if not vals or min(vals) <= 0:
        return 0
    return round(len(vals) / sum(1.0 / v for v in vals), 1)


def mean(vals):
    vals = list(vals)
    return round(sum(vals) / len(vals), 1) if vals else 0


def tokens(text):
    return len(text) // 4  # chars/4, same heuristic as token-saver


class Reader:
    """Reads each file at most once; refuses symlink escapes and huge files."""

    def __init__(self, root):
        self.root = Path(root).resolve()
        self.cache, self.notes = {}, []

    def rel(self, p):
        try:
            return p.relative_to(self.root).as_posix()
        except ValueError:
            return p.as_posix()

    def text(self, p):
        if p in self.cache:
            return self.cache[p]
        out = ""
        try:
            rp = p.resolve()
            if not rp.is_relative_to(self.root):
                self.notes.append((self.rel(p), "symlink escapes --root, skipped"))
            elif not rp.is_file():
                pass
            elif rp.stat().st_size > MAX_BYTES:
                self.notes.append(
                    (self.rel(p), "over %d KB cap, skipped" % (MAX_BYTES // 1024))
                )
            else:
                out = rp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
        self.cache[p] = out
        return out


def read_units(rd):
    root = rd.root
    units = []
    for p in sorted((root / "skills").glob("*/SKILL.md")):
        units.append(("skill", p.parent.name, p, p.parent))
    for p in sorted((root / "agents").glob("*.md")):
        units.append(("agent", p.stem, p, None))
    # Repo-level tests that load a skill's scripts count as that skill's tests;
    # `"skills" / "x" / "scripts"` is normalized to `skills/x/scripts`.
    repo_tests = re.sub(
        r'"\s*/\s*"',
        "/",
        "".join(rd.text(x) for x in sorted((root / "tests").glob("test_*.py"))),
    )
    out = []
    for kind, name, p, d in units:
        text = rd.text(p)
        try:
            meta, body = parse(text, origin=str(p))
        except FrontmatterError:
            meta, body = {}, text
        scripts = []
        if d and (d / "scripts").is_dir():
            for x in sorted((d / "scripts").iterdir()):
                if x.suffix in (".py", ".sh") and x.is_file():
                    scripts.append((rd.rel(x), rd.text(x)))
        evals = 0
        if d and (d / "evals" / "evals.json").is_file():
            try:
                ev = json.loads(rd.text(d / "evals" / "evals.json") or "[]")
            except ValueError:
                ev = []
            evals = sum(
                1
                for e in (ev if isinstance(ev, list) else [])
                if isinstance(e, dict)
                and str(e.get("query", "")).strip()
                and isinstance(e.get("expected_behavior"), list)
                and e["expected_behavior"]
            )
        out.append(
            dict(
                kind=kind,
                name=name,
                text=text,
                meta=meta,
                body=body,
                dir=d,
                scripts=scripts,
                evals=evals,
                repo_tested=bool(d) and ("skills/%s/scripts" % name) in repo_tests,
                path=rd.rel(p),
            )
        )
    return out


def tools_s(meta):
    t = meta.get("tools", "")
    return ", ".join(map(str, t)) if isinstance(t, list) else str(t or "")


def line_of(text, m):
    return text.count("\n", 0, m.start()) + 1


def code_only(t):
    """Python source with strings/comments blanked (keeps line numbers), so
    detector regexes and docs in strings don't self-trigger."""
    try:
        out = t.splitlines(keepends=True)
        for tok in tokenize.generate_tokens(io.StringIO(t).readline):
            if (
                tok.type in (tokenize.STRING, tokenize.COMMENT)
                and tok.start[0] == tok.end[0]
            ):
                r, (c0, c1) = tok.start[0] - 1, (tok.start[1], tok.end[1])
                out[r] = out[r][:c0] + "_" * (c1 - c0) + out[r][c1:]
            elif tok.type == tokenize.STRING:  # multi-line string: blank spans only
                (r0, c0), (r1, c1) = tok.start, tok.end
                for r in range(r0, r1 + 1):
                    s = out[r - 1].rstrip("\n")
                    lo = c0 if r == r0 else 0
                    hi = c1 if r == r1 else len(s)
                    out[r - 1] = (
                        s[:lo] + "_" * (hi - lo) + s[hi:] + out[r - 1][len(s) :]
                    )
        return "".join(out)
    except (tokenize.TokenError, SyntaxError, IndentationError):
        return t


def security(u):
    """Concrete guardrail checks -> [(cat, heuristic, msg, sev, path)]."""
    out, cat = [], "Guardrail Gap"
    body, meta = u["body"], u["meta"]
    docs = [(u["path"], body)]
    code = [(p, code_only(t) if p.endswith(".py") else t) for p, t in u["scripts"]]

    def add(h, msg, path, sev=None):
        out.append((cat, h, msg, sev, path))

    for path, t in code:
        if path.endswith(".py"):
            m = SHELL.search(t)
            if m:
                add(
                    "sec.shell", "shell=True/os.system at line %d" % line_of(t, m), path
                )
            for m in ENV_DICT.finditer(t):
                ln = t.splitlines()[line_of(t, m) - 1]
                if "os.environ" not in ln:
                    add(
                        "sec.env",
                        "subprocess env= replaces whole environment at line %d"
                        % line_of(t, m),
                        path,
                    )
                    break
    lines = body.splitlines()
    for i, ln in enumerate(lines):
        if DESTRUCTIVE.search(ln) and not CONFIRM.search(
            " ".join(lines[max(0, i - 3) : i + 4])
        ):
            add(
                "sec.destructive",
                "destructive command without confirm wording at line %d" % (i + 1),
                u["path"],
            )
            break
    tools = str(tools_s(meta)) + str(meta.get("allowed-tools", ""))
    if (
        FETCH.search(body) or re.search(r"WebFetch|WebSearch", tools)
    ) and not UNTRUSTED.search(body):
        add(
            "sec.untrusted",
            "fetches web/external content without an untrusted-data statement",
            u["path"],
        )
    for path, t in docs + code:
        for m in CURL_SH.finditer(t):
            add(
                "sec.curl_sh",
                "pipes remote script into a shell at line %d" % line_of(t, m),
                path,
            )
            break
        for m in NPX.finditer(t):
            if not m.group(2):
                add(
                    "sec.unpinned",
                    "npx %s without @version at line %d" % (m.group(1), line_of(t, m)),
                    path,
                )
                break
        for m in PIP.finditer(t):
            args = [a for a in m.group(1).split() if not a.startswith("-")]
            if any(
                a not in (".", "pip")
                and "==" not in a
                and not a.startswith(("$", "<", "{"))
                for a in args
            ) and not re.search(r"\s-r\b|--require-hashes", m.group(1)):
                add(
                    "sec.unpinned",
                    "pip install without == pin at line %d" % line_of(t, m),
                    path,
                )
                break
    return out


def pin_findings(rd):
    root = rd.root
    try:
        lock = json.loads(rd.text(root / "external" / "skills.lock.json") or "null")
    except ValueError:
        return []
    srcs = lock.get("sources") if isinstance(lock, dict) else None
    if not isinstance(srcs, list):
        return []
    try:
        upd = json.loads(rd.text(root / "external" / "updates.json") or "null")
    except ValueError:
        upd = None
    if isinstance(upd, dict):
        upd = upd.get("sources")
    by = {x.get("name"): x for x in upd or [] if isinstance(x, dict)}
    path, out = "external/skills.lock.json", []
    today = datetime.date.today()

    def add(name, msg, sev):
        out.append(
            finding(
                "external:%s" % name,
                "external",
                path,
                "Stale third-party pin",
                "pin.stale",
                msg,
                sev,
            )
        )

    for s in srcs:
        if not isinstance(s, dict) or not s.get("name"):
            continue
        n, u = s["name"], by.get(s["name"], {})
        b = u.get("behind_by")
        if isinstance(b, int) and not isinstance(b, bool) and b > 0:
            add(
                n,
                "pin is %d commit(s) behind upstream" % b,
                "med" if b >= 50 else "low",
            )
        if u.get("archived") is True:
            add(n, "upstream repo is archived", "high")
        if u.get("license_changed") is True:
            add(n, "upstream license changed since pin", "high")
        try:
            age = (today - datetime.date.fromisoformat(str(s.get("checked"))[:10])).days
        except ValueError:
            continue
        if age > STALE_DAYS:
            add(n, "pin last checked %d days ago" % age, "low")
    return out


def score_unit(u):
    """Return (scores, tokens, [(category, heuristic, message[, sev, path])])."""
    k, text, meta, body, d = u["kind"], u["text"], u["meta"], u["body"], u["dir"]
    desc = meta.get("description", "") or ""
    tok = tokens(text)
    target = TOK_TARGET[k]
    has_ref = bool(
        d and (d / "reference").is_dir() and any((d / "reference").glob("*.md"))
    )
    f = []

    # PEI
    pei = 80
    if tok > target:
        pei -= min(40, 40 * (tok - target) / target)
        f.append(
            (
                "Token Surface Bloat",
                "pei.tokens",
                "%d tokens exceeds target %d" % (tok, target),
            )
        )
    if len(desc) > 300:
        pei -= min(15, (len(desc) - 300) / 10)
        f.append(
            (
                "Token Surface Bloat",
                "pei.description",
                "description %d chars (target <=300)" % len(desc),
            )
        )
    if not re.search(r"use when|use for|use to", desc, re.I):
        pei -= 20
        f.append(
            (
                "High Instruction Drift",
                "pei.trigger",
                "description lacks a 'Use when' trigger",
            )
        )
    words = max(1, len(body.split()))
    dens = len(FILLER.findall(body)) / words
    if dens > 0.02:
        pei -= min(10, (dens - 0.02) * 500)
        f.append(
            (
                "High Instruction Drift",
                "pei.filler",
                "filler density %.1f%%" % (dens * 100),
            )
        )
    if tok <= target or has_ref:
        pei += 10
    if k == "skill" and len(re.findall(r"^\s*\d+\.\s", body, re.M)) >= 3:
        pei += 10
    elif k == "agent" and tok <= target:
        pei += 10

    # OVS
    if k == "agent":
        low = body.lower()
        ho = body[low.find("handoff contract") :] if "handoff contract" in low else ""
        checks = [
            (25, "charter" in low, "ovs.charter", "no Charter"),
            (
                20,
                bool(re.search(r"handoff contract\s*\((in|from)\b", low)),
                "ovs.handoff_in",
                "no Handoff contract (in)",
            ),
            (
                20,
                bool(re.search(r"handoff contract\s*\((out|to)\b", low)),
                "ovs.handoff_out",
                "no Handoff contract (out)",
            ),
            (
                20,
                bool(tools_s(meta)) and tools_s(meta).strip() != "*",
                "ovs.tools",
                "tools field missing or '*'",
            ),
            (
                15,
                bool(re.search(r"`[a-z][a-z0-9-]+`", ho)),
                "ovs.next_agent",
                "no next agent named in backticks",
            ),
        ]
    else:
        short = (not u["name"].startswith(ROUTERS)) or tok <= 600
        checks = [
            (
                50,
                bool(re.search(r"^#+\s*Procedure", body, re.M | re.I)),
                "ovs.procedure",
                "no Procedure section",
            ),
            (
                25,
                bool(re.search(r"use when", desc, re.I)),
                "ovs.trigger",
                "no 'Use when' trigger",
            ),
            (25, short, "ovs.router_short", "router skill over 600 tokens"),
        ]
    ovs = 0
    for w, ok, h, msg in checks:
        if ok:
            ovs += w
        else:
            f.append(("Orchestration Bottleneck", h, msg))

    # CRI
    cri = 70 + min(30, 5 * len(set(m.lower() for m in GOOD_CTX.findall(body))))
    bad = sum(
        1
        for m in BAD_CTX.finditer(body)
        if not NEGATED.search(body[max(0, m.start() - 60) : m.start()])
    )
    if bad:
        cri -= 15 * bad
        f.append(
            (
                "Context Leak",
                "cri.whole_file",
                "%d whole-file read instruction(s)" % bad,
            )
        )
    if k == "skill" and tok > target * 1.5 and not has_ref:
        cri -= 20
        f.append(
            ("Context Leak", "cri.no_reference", "long inline body without reference/")
        )

    # SRS
    srs = 0
    if k == "skill":
        parts = [
            (
                30,
                bool(d and (d / "tests").is_dir() and any((d / "tests").glob("test*")))
                or u.get("repo_tested", False)
                or u.get("evals", 0) >= 3,
                "srs.tests",
                "no tests/ or >=3 evals/evals.json scenarios",
            ),
            (
                30,
                bool(
                    d
                    and (d / "scripts").is_dir()
                    and any(
                        x for x in (d / "scripts").iterdir() if x.name != ".gitkeep"
                    )
                )
                or bool(LOOP.search(body)),
                "srs.scripts",
                "no scripts/ or validate-fix-repeat loop",
            ),
        ]
    else:
        parts = [
            (30, checks[3][1], "srs.tools", "tools not scoped"),
            (
                30,
                bool(re.search(r"`[a-z][a-z0-9-]+`", body)),
                "srs.refs",
                "references no skill/agent",
            ),
        ]
    for w, ok, h, msg in parts:
        if ok:
            srs += w
        else:
            f.append(("Guardrail Gap", h, msg))
    sec = security(u)
    f += sec
    srs += max(0, 40 - sum(SEC_PENALTY[t[3] or SEV_BY_H[t[1]]] for t in sec))

    return dict(PEI=clamp(pei), OVS=clamp(ovs), CRI=clamp(cri), SRS=clamp(srs)), tok, f


def mnss(rd, nskills):
    root = rd.root
    site = root / "site"
    blob = (
        "".join(
            rd.text(p)
            for p in sorted(site.rglob("*"))
            if p.suffix in (".html", ".css", ".js")
        )
        if site.is_dir()
        else ""
    )
    index_t = rd.text(site / "index.html")
    readme_t = rd.text(root / "README.md")
    counts = {
        int(n)
        for n in re.findall(
            r"\b(\d+)\s+(?:native\s+)?skills\b", index_t + readme_t, re.I
        )
    }
    checks = [
        (
            "mnss.reduced_motion",
            "prefers-reduced-motion" in blob,
            "site ignores prefers-reduced-motion",
        ),
        ("mnss.aria", "aria-" in index_t, "no aria-* attributes in site/index.html"),
        (
            "mnss.skill_count",
            all(c == nskills for c in counts),
            "hard-coded skill count mismatches %d skills" % nskills,
        ),
        (
            "mnss.dashboard",
            (site / "audit" / "index.html").is_file(),
            "site/audit/index.html missing",
        ),
        (
            "mnss.readme_link",
            bool(re.search(r"github\.io|\bsite/", readme_t)),
            "README does not link the site",
        ),
    ]
    score, f = 0, []
    for h, ok, msg in checks:
        if ok:
            score += 20
        else:
            f.append(finding("site", "repo", "site/", "Static Presentation", h, msg))
    return score, f


def graph(units):
    skills = {u["name"] for u in units if u["kind"] == "skill"}
    agents = {u["name"] for u in units if u["kind"] == "agent"}
    nodes = [dict(id=u["name"], kind=u["kind"], label=u["name"]) for u in units]
    edges = set()
    for u in units:
        if u["kind"] != "agent":
            continue
        n, body = u["name"], u["body"]
        if n == "orchestrator":
            for lst in re.findall(r"Agent\(([^)]*)\)", tools_s(u["meta"])):
                for a in (x.strip() for x in lst.split(",")):
                    if a in agents:
                        edges.add((n, a, "delegates"))
        low = body.lower()
        i = low.find("handoff contract")
        ho = body[i:] if i >= 0 else ""
        for t in re.findall(r"`([a-z][a-z0-9-]+)`", body):
            if t in skills:
                edges.add((n, t, "applies"))
        for t in re.findall(r"`([a-z][a-z0-9-]+)`", ho):
            if t in agents and t != n:
                edges.add((n, t, "hands-off"))
    return dict(
        nodes=sorted(nodes, key=lambda x: (x["kind"], x["id"])),
        edges=[
            {"source": s, "target": t, "type": y, "from": s, "to": t, "kind": y}
            for s, t, y in sorted(edges)
        ],
    )


TAGS = (
    ("data", "data|pipeline|dbt|etl"),
    ("genai", "genai|llm|rag|prompt|mcp"),
    ("ml", "ml-|ml_|model"),
    ("frontend", "frontend|ui|motion|3d"),
    ("review", "review|verif|test|debug"),
    ("ops", "budget|token|boost|cli|setup|audit"),
    ("memory", "memory|context"),
    ("docs", "doc|spec|meeting|standup"),
)
SEVERITY = {
    "Guardrail Gap": "med",
    "Static Presentation": "low",
    "Token Surface Bloat": "low",
}


def finding(unit, kind, path, cat, h, msg, sev=None):
    """The only place findings are built: audit() and mnss() both use it."""
    return dict(
        id=h,
        unit=unit,
        kind=kind,
        category=cat,
        heuristic=h,
        severity=sev or SEV_BY_H.get(h) or SEVERITY.get(cat, "med"),
        path=path,
        message=msg,
        detail=msg,
    )


def tags_for(u):
    if u["name"].startswith("ext-"):
        return ["router"]
    h = (u["name"] + " " + str(u["meta"].get("description", ""))).lower()
    return [t for t, pat in TAGS if re.search(pat, h)] or ["ops"]


def audit(root):
    rd = Reader(root)
    units, findings, rows = read_units(rd), [], []
    for u in units:
        sc, tok, f = score_unit(u)
        rows.append(
            dict(
                name=u["name"],
                kind=u["kind"],
                path=u["path"],
                tokens=tok,
                scores=sc,
                tags=tags_for(u),
                flags=sorted({t[1] for t in f}),
            )
        )
        for cat, h, msg, *rest in f:
            sev, path = (rest + [None, None])[:2]
            findings.append(
                finding(u["name"], u["kind"], path or u["path"], cat, h, msg, sev)
            )
    nskills = sum(1 for u in units if u["kind"] == "skill")
    m, mf = mnss(rd, nskills)
    findings += mf + pin_findings(rd)
    findings += [
        finding("audit", "repo", p, "Guardrail Gap", "audit.skipped", msg)
        for p, msg in sorted(set(rd.notes))
    ]
    scores = {
        k: mean(r["scores"][k] for r in rows) for k in ("PEI", "OVS", "CRI", "SRS")
    }
    scores["MNSS"] = m
    scores["APS"] = harmonic(scores[k] for k in ("PEI", "OVS", "CRI", "MNSS", "SRS"))
    findings.sort(key=lambda x: (x["category"], x["heuristic"], x["unit"], x["path"]))
    return dict(
        scores=scores,
        targets=TARGETS,
        counts=dict(skills=nskills, agents=len(units) - nskills),
        tokens=dict(
            skills=sum(r["tokens"] for r in rows if r["kind"] == "skill"),
            agents=sum(r["tokens"] for r in rows if r["kind"] == "agent"),
            total=sum(r["tokens"] for r in rows),
        ),
        units=sorted(rows, key=lambda r: (r["kind"], r["name"])),
        findings=findings,
        graph=graph(units),
    )


def _sha(root):
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                check=True,
                timeout=3,
            ).stdout.strip()
            or None
        )
    except (OSError, subprocess.SubprocessError):
        return None


def write_atomic(path, s):
    path = Path(path)
    tmp = path.with_name(".%s.%d.tmp" % (path.name, os.getpid()))
    try:
        tmp.write_text(s, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--root", default=str(ROOT if (ROOT / "skills").is_dir() else Path.cwd())
    )
    ap.add_argument("--out")
    ap.add_argument("--baseline")
    ap.add_argument(
        "--compact",
        action="store_true",
        help="minified JSON (auto for .json under site/)",
    )
    ap.add_argument(
        "--json-only",
        action="store_true",
        help="print JSON only (default; kept for scripts)",
    )
    a = ap.parse_args(argv)
    base = None
    if a.baseline:
        base = json.loads(
            Path(a.baseline).read_text(encoding="utf-8", errors="replace")
        ).get("current")
    rep = dict(
        schema=1,
        generated_by="skills/agentkit-audit/scripts/audit.py",
        sha=_sha(a.root),
        current=audit(a.root),
        baseline=base,
    )
    compact = a.compact or bool(
        a.out and a.out.endswith(".json") and "site" in Path(a.out).resolve().parts
    )
    if compact:
        s = json.dumps(rep, separators=(",", ":"), sort_keys=True) + "\n"
    else:
        s = json.dumps(rep, indent=2, sort_keys=True) + "\n"
    if a.out:
        write_atomic(a.out, s)
        if not a.json_only:
            c = rep["current"]["scores"]
            print(
                "APS %s  " % c["APS"]
                + " ".join(
                    "%s %s" % (k, c[k]) for k in ("PEI", "OVS", "CRI", "MNSS", "SRS")
                )
            )
    else:
        sys.stdout.write(s)


if __name__ == "__main__":
    main()
