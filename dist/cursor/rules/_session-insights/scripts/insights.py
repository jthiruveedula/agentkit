#!/usr/bin/env python3
"""insights.py — prompt analytics and friction signals from Claude Code transcripts.

Reads ~/.claude/projects/*/*.jsonl (or --root) and reports what the user
typed and where the session lost time: prompt intent mix, underspecified
prompts, correction/redo turns, interrupts, tool errors, permission
denials, file re-reads, and prompts/commands repeated across sessions
(automation candidates). It also tags each session's outcome, attributes
token cost to intent, measures subagent spend, and maps recurring tool
errors to setup fixes. Ends with ranked, evidence-backed suggestions.

    python3 insights.py                      # last 30 sessions
    python3 insights.py --last 100 --json
    python3 insights.py --incidents > incidents.txt   # feed memory-sync
    python3 insights.py --save               # snapshot + week-over-week trend
    python3 insights.py --html report.html   # static dashboard
    python3 insights.py --draft-commands .claude/commands
    python3 insights.py --selftest

Snapshots live in $AGENTKIT_DATA_DIR/insights/ (default ~/.agentkit/insights;
$AGENTKIT_HOME is still read as a fallback). Prompt text is secret-redacted before it
is stored, and snapshot/draft/HTML output is written 0600 in 0700 dirs.

Local only: reads transcripts, prints a report, sends nothing anywhere.
Prompt text is truncated in output. Exit 0 always (it's a report). Stdlib only.
"""

import argparse
import glob
import json
import os
import html
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # prompt_signals sits beside this script
from prompt_signals import (  # noqa: E402
    ACCEPTANCE_RE,
    ANCHOR_RE,
    CORRECTION_RE,
    load_classifier as _load_classifier,
    redact,
)

INTERRUPT = "[Request interrupted by user"
DENIAL_RE = re.compile(
    r"doesn'?t want to proceed|user (rejected|denied)|permission denied by user",
    re.IGNORECASE,
)
COMMIT_RE = re.compile(r"\bgit (commit|push)\b|\bgh pr (create|merge)\b")
SHIP_TOOLS = ("create_pull_request", "merge_pull_request", "push_files")
TEST_RE = re.compile(
    r"\b(pytest|make (test|check|ci)|(npm|pnpm|yarn|bun) (run )?test|go test|"
    r"cargo test|jest|vitest|tox|unittest|rspec|phpunit|mvn test|gradle test)\b"
)
# Recurring tool-error text -> the setup change that removes it for good.
SETUP_FIXES = [
    (
        re.compile(r"ModuleNotFoundError|No module named|ImportError", re.I),
        "missing Python deps",
        "Install deps in a SessionStart hook or setup script (pip install -r requirements.txt / uv sync).",
    ),
    (
        re.compile(r"Cannot find module|ERR_MODULE_NOT_FOUND|npm ERR! missing", re.I),
        "missing Node deps",
        "Run npm ci in a SessionStart hook or setup script.",
    ),
    (
        re.compile(
            r"command not found|not recognized as an internal|No such file or directory: '\w+'",
            re.I,
        ),
        "missing CLI tool",
        "Install the tool in the environment setup, or note the right command in CLAUDE.md.",
    ),
    (
        re.compile(
            r"\b[A-Z][A-Z0-9_]{3,} (is )?not set|KeyError: '[A-Z][A-Z0-9_]+'|(?i:missing (env|environment))"
        ),
        "missing env var",
        "Export it in the environment config or a .env loaded by a SessionStart hook.",
    ),
    (
        re.compile(r"EADDRINUSE|address already in use", re.I),
        "port already in use",
        "Kill stale dev servers in a SessionStart hook; document the port in CLAUDE.md.",
    ),
    (
        re.compile(
            r"File has not been read yet|String to replace not found|old_string", re.I
        ),
        "edit without fresh read",
        "Add a CLAUDE.md rule: re-read the exact lines before Edit; prefer small unique anchors.",
    ),
    (
        re.compile(r"Permission denied|EACCES", re.I),
        "filesystem permissions",
        "Fix ownership or run from a writable dir; add the path to the sandbox allowlist.",
    ),
    (
        re.compile(r"timed? ?out|ETIMEDOUT", re.I),
        "timeouts",
        "Run slow commands in the background or raise the tool timeout; cache network fetches.",
    ),
]
SUCCESS = ("shipped", "tests-green")
NOISE_PREFIXES = (
    "<command-",
    "<local-command",
    "Caveat:",
    "<system-reminder",
    "<bash-",
)


def _text_of(content):
    """User-typed text from a message content, or None for tool results."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        parts = [
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        return "\n".join(parts) if parts else None
    return None


def _result_text(block):
    c = block.get("content")
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c if isinstance(b, dict))
    return str(c or "")


def _norm(text, words=8):
    w = re.findall(r"[a-z0-9]+", text.lower())
    return " ".join(w[:words])


def _cmd_key(cmd):
    """First two words of the first command in a pipeline: 'git status', 'npm test'."""
    first = re.split(r"&&|\|\||;|\|", cmd.strip(), maxsplit=1)[0]
    toks = [t for t in first.split() if not t.startswith("-") and "=" not in t]
    return " ".join(toks[:2])


def parse_session(path, classify):
    s = {
        "session": os.path.basename(path)[:8],
        "project": os.path.basename(os.path.dirname(path))[-32:],
        "prompts": [],
        "turns": 0,
        "interrupts": 0,
        "tool_calls": Counter(),
        "tool_errors": Counter(),
        "error_samples": [],
        "denials": 0,
        "reads": Counter(),
        "commands": Counter(),
        "tokens": 0,
        "agent_calls": 0,
        "subagent_tokens": 0,
        "setup_gaps": Counter(),
        "shipped": False,
        "last_test_ok": None,
        "ended_on_friction": False,
    }
    tool_names, test_ids, seen_usage = {}, set(), set()
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if not isinstance(d, dict):
                continue
            msg = d.get("message")
            if not isinstance(msg, dict):
                continue
            if d.get("isSidechain"):
                s["subagent_tokens"] += _usage_tokens(msg, seen_usage)
                continue
            content = msg.get("content")
            if d.get("type") == "assistant":
                if msg.get("usage"):
                    s["turns"] += 1
                    s["tokens"] += _usage_tokens(msg, seen_usage)
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name, inp = b.get("name", "?"), b.get("input") or {}
                    tool_names[b.get("id")] = name
                    s["tool_calls"][name] += 1
                    if name in ("Agent", "Task"):
                        s["agent_calls"] += 1
                    if name.endswith(SHIP_TOOLS):
                        s["shipped"] = True
                    if name == "Read" and inp.get("file_path"):
                        s["reads"][inp["file_path"]] += 1
                    if name == "Bash" and inp.get("command"):
                        cmd = inp["command"]
                        key = _cmd_key(cmd)
                        if key:
                            s["commands"][key] += 1
                        if COMMIT_RE.search(cmd):
                            s["shipped"] = True
                        if TEST_RE.search(cmd):
                            test_ids.add(b.get("id"))
            elif d.get("type") == "user":
                if isinstance(content, list):
                    for b in content:
                        if not isinstance(b, dict) or b.get("type") != "tool_result":
                            continue
                        body = _result_text(b)
                        tid = b.get("tool_use_id")
                        if tid in test_ids:
                            s["last_test_ok"] = not b.get("is_error")
                        if DENIAL_RE.search(body):
                            s["denials"] += 1
                        elif b.get("is_error"):
                            name = tool_names.get(tid, "?")
                            s["tool_errors"][name] += 1
                            for rx, gap, _ in SETUP_FIXES:
                                if rx.search(body):
                                    s["setup_gaps"][gap] += 1
                                    break
                            if len(s["error_samples"]) < 5:
                                s["error_samples"].append(
                                    f"{name}: {body.strip()[:100]}"
                                )
                text = _text_of(content)
                if text is None:
                    continue
                if INTERRUPT in text:
                    s["interrupts"] += 1
                    s["ended_on_friction"] = True
                    continue
                text = text.strip()
                if not text or text.startswith(NOISE_PREFIXES) or d.get("isMeta"):
                    continue
                words = len(text.split())
                s["prompts"].append(
                    {
                        "text": redact(text),  # stored text never carries secrets
                        "words": words,
                        "intent": classify(text),
                        "correction": bool(CORRECTION_RE.search(text))
                        and len(s["prompts"]) > 0,
                        "vague": words < 8 and not ANCHOR_RE.search(text),
                        "has_acceptance": bool(ACCEPTANCE_RE.search(text)),
                        "ts": d.get("timestamp", ""),
                    }
                )
                s["ended_on_friction"] = s["prompts"][-1]["correction"]
    # Newer Claude Code writes subagent transcripts beside the session.
    for sub in glob.glob(
        os.path.join(os.path.splitext(path)[0], "subagents", "*.jsonl")
    ):
        with open(sub, encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                try:
                    msg = json.loads(line).get("message")
                except (ValueError, AttributeError):
                    continue
                if isinstance(msg, dict):
                    s["subagent_tokens"] += _usage_tokens(msg, seen_usage)
    s["outcome"] = outcome(s)
    return s


def _usage_tokens(msg, seen):
    """Total tokens of one API call; split assistant records share an id."""
    usage = msg.get("usage")
    if not isinstance(usage, dict) or (msg.get("id") and msg["id"] in seen):
        return 0
    if msg.get("id"):
        seen.add(msg["id"])
    return sum(
        usage.get(k, 0) or 0
        for k in (
            "input_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
            "output_tokens",
        )
    )


def outcome(s):
    """End state from the transcript alone: what the session left behind."""
    if s["shipped"]:
        return "shipped"
    if s["last_test_ok"]:
        return "tests-green"
    if s["ended_on_friction"] or s["last_test_ok"] is False:
        return "abandoned"
    return "exploratory"


def _dominant_intent(s):
    c = Counter(p["intent"] for p in s["prompts"] if p["intent"] != "ambiguous")
    return c.most_common(1)[0][0] if c else "ambiguous"


def _rate(group):
    return (
        round(sum(s["outcome"] in SUCCESS for s in group) / len(group), 2)
        if group
        else None
    )


def analyze(sessions, long_turns=300, min_prompts=5):
    prompts = [p for s in sessions for p in s["prompts"]]
    n = max(len(prompts), 1)
    tool_calls = sum((s["tool_calls"] for s in sessions), Counter())
    tool_errors = sum((s["tool_errors"] for s in sessions), Counter())

    # Prompts opening the same way in 3+ sessions -> slash command / skill.
    openers = defaultdict(set)
    for s in sessions:
        for p in s["prompts"][:3]:
            key = _norm(p["text"], 6)
            if len(key.split()) >= 3:
                openers[key].add(s["session"])
    repeated_prompts = sorted(
        ((k, len(v)) for k, v in openers.items() if len(v) >= 3), key=lambda kv: -kv[1]
    )
    # Commands used in 3+ sessions -> permission allowlist or a script.
    cmd_sessions = defaultdict(set)
    for s in sessions:
        for c in s["commands"]:
            cmd_sessions[c].add(s["session"])
    repeated_cmds = sorted(
        ((k, len(v)) for k, v in cmd_sessions.items() if len(v) >= 3),
        key=lambda kv: -kv[1],
    )
    rereads = sorted(
        (
            (s["session"], f, c)
            for s in sessions
            for f, c in s["reads"].items()
            if c >= 3
        ),
        key=lambda t: -t[2],
    )
    hour = Counter(p["ts"][11:13] for p in prompts if len(p["ts"]) >= 13)

    # Which prompt habits go with sessions that ship? (correlation, not cause)
    def first(s):
        return s["prompts"][0] if s["prompts"] else None

    with_prompt = [s for s in sessions if first(s)]
    traits = {
        "done_condition": [s for s in with_prompt if first(s)["has_acceptance"]],
        "no_done_condition": [s for s in with_prompt if not first(s)["has_acceptance"]],
        "specific_first_prompt": [s for s in with_prompt if not first(s)["vague"]],
        "vague_first_prompt": [s for s in with_prompt if first(s)["vague"]],
    }
    cost = defaultdict(list)
    for s in sessions:
        if s["tokens"]:
            cost[_dominant_intent(s)].append(s["tokens"])
    main_tokens = sum(s["tokens"] for s in sessions)
    sub_tokens = sum(s["subagent_tokens"] for s in sessions)
    gaps = defaultdict(set)
    for s in sessions:
        for g in s["setup_gaps"]:
            gaps[g].add(s["session"])
    fixes = {gap: fix for _, gap, fix in SETUP_FIXES}

    m = {
        "sessions": len(sessions),
        "prompts": len(prompts),
        "intent_mix": dict(Counter(p["intent"] for p in prompts).most_common()),
        "median_prompt_words": sorted(p["words"] for p in prompts)[len(prompts) // 2]
        if prompts
        else 0,
        "vague_rate": round(sum(p["vague"] for p in prompts) / n, 2),
        "acceptance_rate": round(sum(p["has_acceptance"] for p in prompts) / n, 2),
        "correction_rate": round(sum(p["correction"] for p in prompts) / n, 2),
        "interrupts": sum(s["interrupts"] for s in sessions),
        "denials": sum(s["denials"] for s in sessions),
        "tool_calls": sum(tool_calls.values()),
        "tool_error_rate": round(
            sum(tool_errors.values()) / max(sum(tool_calls.values()), 1), 3
        ),
        "tool_errors": dict(tool_errors.most_common(5)),
        "long_sessions": [s["session"] for s in sessions if s["turns"] > long_turns],
        "rereads": [{"session": a, "file": f, "reads": c} for a, f, c in rereads[:5]],
        "repeated_prompts": [
            {"opener": k, "sessions": c} for k, c in repeated_prompts[:5]
        ],
        "repeated_commands": [
            {"command": k, "sessions": c} for k, c in repeated_cmds[:8]
        ],
        "busiest_hours_utc": [h for h, _ in hour.most_common(3)],
        "outcomes": dict(Counter(s["outcome"] for s in sessions).most_common()),
        "success_rate": _rate(sessions),
        "success_by_trait": {
            k: {"sessions": len(v), "success_rate": _rate(v)} for k, v in traits.items()
        },
        "tokens": main_tokens,
        "cost_by_intent": {
            k: {"sessions": len(v), "avg_tokens": sum(v) // len(v)}
            for k, v in sorted(cost.items(), key=lambda kv: -sum(kv[1]))
        },
        "subagents": {
            "calls": sum(s["agent_calls"] for s in sessions),
            "tokens": sub_tokens,
            "share": round(sub_tokens / max(main_tokens + sub_tokens, 1), 2),
            "success_rate_with": _rate([s for s in sessions if s["agent_calls"]]),
            "success_rate_without": _rate(
                [s for s in sessions if not s["agent_calls"]]
            ),
        },
        "setup_gaps": [
            {"gap": g, "sessions": len(v), "fix": fixes[g]}
            for g, v in sorted(gaps.items(), key=lambda kv: -len(kv[1]))
        ],
    }
    m["suggestions"] = suggest(m, prompts, min_prompts)
    return m


def suggest(m, prompts, min_prompts=5):
    """Rule-based, ranked by estimated time saved. Each names its evidence."""
    out = []

    def add(weight, finding, action):
        out.append({"weight": weight, "finding": finding, "action": action})

    if m["prompts"] >= min_prompts and m["vague_rate"] >= 0.25:
        ex = next((p["text"][:60] for p in prompts if p["vague"]), "")
        add(
            5,
            f'{m["vague_rate"]:.0%} of prompts are short with no file, symbol or error named (e.g. "{ex}")',
            "Name the file/function/error and the done-condition; run prompt-enhancer on rough asks first.",
        )
    if m["prompts"] >= min_prompts and m["correction_rate"] >= 0.15:
        add(
            5,
            f"{m['correction_rate']:.0%} of follow-ups are corrections/redos",
            "Run memory-sync on `insights.py --incidents` to turn repeats into durable corrections; "
            "ask for a plan before edits on multi-file work.",
        )
    if m["prompts"] >= min_prompts and m["acceptance_rate"] < 0.2:
        add(
            3,
            f"only {m['acceptance_rate']:.0%} of prompts state what 'done' looks like",
            'End task prompts with an acceptance line ("done when X passes"); use spec-writer for features.',
        )
    if m["interrupts"] >= max(1, min_prompts // 2):
        add(
            4,
            f"{m['interrupts']} interrupts — the agent went the wrong way mid-turn",
            "Start risky or ambiguous work in plan mode, or ask for a 3-bullet plan before execution.",
        )
    if m["denials"] >= max(1, min_prompts // 2):
        add(
            3,
            f"{m['denials']} permission denials",
            "Run /fewer-permission-prompts, or add deny rules so the agent stops proposing them.",
        )
    if m["tool_calls"] >= 4 * min_prompts and m["tool_error_rate"] >= 0.08:
        worst = next(iter(m["tool_errors"]), "?")
        add(
            4,
            f"{m['tool_error_rate']:.0%} of tool calls fail (most: {worst})",
            "Record the recurring failure as a memory correction; add a SessionStart hook that installs deps/env.",
        )
    if m["long_sessions"]:
        add(
            4,
            f"{len(m['long_sessions'])} sessions over the long-turn threshold",
            "Install context-budget hooks; /clear between unrelated tasks; checkpoint with context-compressor.",
        )
    if m["rereads"]:
        r = m["rereads"][0]
        add(
            2,
            f"{os.path.basename(r['file'])} read {r['reads']}x in one session",
            "Search before read and use line ranges (token-saver); add key facts to CLAUDE.md.",
        )
    for rp in m["repeated_prompts"][:2]:
        add(
            4,
            f'"{rp["opener"]}…" opens {rp["sessions"]} sessions',
            "Turn it into a slash command or skill (skill-forge) so it runs in one keystroke.",
        )
    if m["repeated_commands"]:
        cmds = ", ".join(c["command"] for c in m["repeated_commands"][:4])
        add(
            2,
            f"commands reused across 3+ sessions: {cmds}",
            "Allowlist the read-only ones; wrap multi-step ones in a make target or script.",
        )
    for g in m["setup_gaps"][:2]:
        if g["sessions"] >= max(1, min_prompts // 2):
            add(
                4,
                f"{g['gap']} broke tool calls in {g['sessions']} sessions",
                g["fix"],
            )
    bt = m["success_by_trait"]
    yes, no = bt["done_condition"], bt["no_done_condition"]
    if (
        min(yes["sessions"], no["sessions"]) >= max(1, min_prompts // 2)
        and yes["success_rate"] - no["success_rate"] >= 0.15
    ):
        add(
            4,
            f"sessions whose first prompt states a done-condition finish "
            f"{yes['success_rate']:.0%} of the time vs {no['success_rate']:.0%} without",
            "Open every task with the target and how you'll know it's done; spec-writer for bigger asks.",
        )
    sub = m["subagents"]
    if sub["calls"] >= max(1, min_prompts // 2) and sub["share"] >= 0.4:
        add(
            3,
            f"subagents used {sub['share']:.0%} of all tokens across {sub['calls']} calls",
            "Fan out only for independent, read-heavy work (orchestrate's cost check); "
            "do single-file changes inline.",
        )
    if len(m["cost_by_intent"]) >= 2:
        (top, c), *_ = m["cost_by_intent"].items()
        if c["sessions"] >= max(1, min_prompts // 2) and c["avg_tokens"] >= 2 * (
            m["tokens"] // max(m["sessions"], 1)
        ):
            add(
                2,
                f"{top} sessions average {c['avg_tokens']:,} tokens, 2x+ the overall mean",
                "Route that work to a cheaper model or a scoped subagent; checkpoint and /clear between steps.",
            )
    out.sort(key=lambda s: -s["weight"])
    return out


def incidents(sessions):
    """One line per friction event, for memory-sync's rank_patterns.py."""
    lines = []
    for s in sessions:
        prev = None
        for p in s["prompts"]:
            if p["correction"] and prev:
                lines.append(
                    f"user corrected after '{prev[:50]}': {p['text'][:90]}".replace(
                        "\n", " "
                    )
                )
            prev = p["text"]
        lines.extend(e.replace("\n", " ") for e in s["error_samples"])
    return lines


def report(m):
    print(
        f"sessions={m['sessions']} prompts={m['prompts']} tool_calls={m['tool_calls']}"
    )
    print(
        "intent mix:", ", ".join(f"{k} {v}" for k, v in m["intent_mix"].items()) or "-"
    )
    print(
        f"median prompt {m['median_prompt_words']} words | vague {m['vague_rate']:.0%} | "
        f"states done-condition {m['acceptance_rate']:.0%} | corrections {m['correction_rate']:.0%}"
    )
    print(
        f"interrupts {m['interrupts']} | denials {m['denials']} | tool error rate {m['tool_error_rate']:.1%}"
        + (f" {m['tool_errors']}" if m["tool_errors"] else "")
    )
    if m["busiest_hours_utc"]:
        print("busiest hours (UTC):", ", ".join(m["busiest_hours_utc"]))
    print(
        "outcomes:",
        ", ".join(f"{k} {v}" for k, v in m["outcomes"].items()) or "-",
        f"| success {m['success_rate']:.0%}" if m["success_rate"] is not None else "",
    )
    if m["cost_by_intent"]:
        print(
            "avg tokens/session by intent:",
            ", ".join(
                f"{k} {v['avg_tokens']:,}"
                for k, v in list(m["cost_by_intent"].items())[:4]
            ),
        )
    sub = m["subagents"]
    if sub["calls"]:
        print(
            f"subagents: {sub['calls']} calls, {sub['tokens']:,} tokens "
            f"({sub['share']:.0%} of spend)"
        )
    if m["setup_gaps"]:
        print(
            "setup gaps:",
            ", ".join(f"{g['gap']} ({g['sessions']})" for g in m["setup_gaps"]),
        )
    print("\nsuggestions (highest impact first):")
    if not m["suggestions"]:
        print(
            "  none — no signal crossed a threshold. Analyze more sessions with --last."
        )
    for i, s in enumerate(m["suggestions"], 1):
        print(f"  {i}. {s['finding']}\n     -> {s['action']}")


TREND_KEYS = (
    ("vague_rate", "vague prompts", -1),
    ("acceptance_rate", "states done-condition", 1),
    ("correction_rate", "corrections", -1),
    ("tool_error_rate", "tool error rate", -1),
    ("success_rate", "sessions that ship/pass", 1),
)


def _insights_home():
    # AGENTKIT_HOME is the pre-AGENTKIT_DATA_DIR name; install.sh uses it for the repo clone.
    base = (
        os.environ.get("AGENTKIT_DATA_DIR")
        or os.environ.get("AGENTKIT_HOME")
        or os.path.expanduser("~/.agentkit")
    )
    return os.path.join(base, "insights")


def _write_private(path, text):
    """Write text to path as 0600 (the dir is made 0700 by the caller)."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.chmod(path, 0o600)  # O_CREAT keeps the mode of a file that already existed


def history(home=None):
    files = sorted(glob.glob(os.path.join(home or _insights_home(), "*.json")))
    out = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                out.append(json.load(fh))
        except (OSError, ValueError):
            continue
    return out


def save(m, home=None, keep=12):
    """Write today's snapshot (one per UTC day) and prune to the newest `keep`."""
    home = home or _insights_home()
    os.makedirs(home, mode=0o700, exist_ok=True)
    m = dict(m, date=time.strftime("%Y-%m-%d", time.gmtime()))
    path = os.path.join(home, m["date"] + ".json")
    _write_private(path, json.dumps(m, indent=2))
    for old in sorted(glob.glob(os.path.join(home, "*.json")))[:-keep]:
        os.remove(old)
    return path


def trend(prev, cur):
    """Lines like 'corrections 22% -> 12% (better)' for the key rates."""
    lines = []
    for key, label, good in TREND_KEYS:
        a, b = prev.get(key), cur.get(key)
        if a is None or b is None or a == b:
            continue
        verdict = "better" if (b - a) * good > 0 else "worse"
        lines.append(f"{label} {a:.0%} -> {b:.0%} ({verdict})")
    return lines


def _slug(text):
    return "-".join(re.findall(r"[a-z0-9]+", text.lower())[:4]) or "command"


def draft_commands(sessions, out_dir, min_sessions=3):
    """Draft a .claude/commands/<slug>.md for each opener repeated across sessions.

    Never overwrites: an existing file is left alone so hand edits survive."""
    by_opener = defaultdict(dict)
    for s in sessions:
        for p in s["prompts"][:3]:
            key = _norm(p["text"], 6)
            if len(key.split()) >= 3:
                by_opener[key].setdefault(s["session"], p["text"])
    written = []
    for key, examples in sorted(by_opener.items(), key=lambda kv: -len(kv[1])):
        if len(examples) < min_sessions:
            continue
        path = os.path.join(out_dir, _slug(key) + ".md")
        if os.path.exists(path):
            continue
        fullest = sorted(examples.values(), key=len, reverse=True)[:3]
        os.makedirs(out_dir, mode=0o700, exist_ok=True)
        body = [
            "---",
            f"description: {key} … (drafted by session-insights; edit before use)",
            "argument-hint: <target and done-condition>",
            "---",
            "",
            f"{fullest[0].splitlines()[0][:200]}",
            "",
            "Target: $ARGUMENTS",
            "",
            "Done when: <state the check that proves it>",
            "",
            "<!-- Past prompts that opened this way (truncated):",
            *(f"  - {e.splitlines()[0][:120].replace('--', '-')}" for e in fullest),
            "-->",
            "",
        ]
        _write_private(path, "\n".join(body))
        written.append(path)
    return written


def render_html(m, past=()):
    """Static, dependency-free dashboard of the current report and its history."""
    e = html.escape

    def pct(v):
        return "-" if v is None else f"{v:.0%}"

    tiles = [
        ("Sessions", m["sessions"]),
        ("Prompts", m["prompts"]),
        ("Success", pct(m["success_rate"])),
        ("Done-condition", pct(m["acceptance_rate"])),
        ("Corrections", pct(m["correction_rate"])),
        ("Tool errors", f"{m['tool_error_rate']:.1%}"),
    ]
    rows = "".join(
        f"<tr><td>{e(h.get('date', '?'))}</td>"
        + "".join(f"<td>{pct(h.get(k))}</td>" for k, _, _ in TREND_KEYS)
        + "</tr>"
        for h in list(past)[-12:]
    )
    sugg = (
        "".join(
            f"<li><b>{e(x['finding'])}</b><br>{e(x['action'])}</li>"
            for x in m["suggestions"]
        )
        or "<li>No signal crossed a threshold.</li>"
    )

    def kv(d):
        return "".join(
            f"<tr><td>{e(str(k))}</td><td>{e(str(v))}</td></tr>" for k, v in d.items()
        )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Session Insights</title>
<style>
:root {{ --bg:#fafaf9; --fg:#1c1917; --muted:#78716c; --card:#fff; --line:#e7e5e4; --accent:#2563eb; }}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{ --bg:#0c0a09; --fg:#f5f5f4; --muted:#a8a29e; --card:#1c1917; --line:#292524; --accent:#60a5fa; }}
}}
:root[data-theme="dark"] {{ --bg:#0c0a09; --fg:#f5f5f4; --muted:#a8a29e; --card:#1c1917; --line:#292524; --accent:#60a5fa; }}
body {{ background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,sans-serif; margin:0; padding:24px 16px; }}
main {{ max-width:960px; margin:auto; }}
h1 {{ margin:0 0 4px; }} h2 {{ margin-top:32px; font-size:17px; }}
.muted {{ color:var(--muted); }}
.tiles {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-top:20px; }}
.tile {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; }}
.tile b {{ display:block; font-size:24px; color:var(--accent); }}
table {{ width:100%; border-collapse:collapse; background:var(--card); }}
td,th {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); }}
.scroll {{ overflow-x:auto; }}
li {{ margin-bottom:10px; }}
</style></head><body><main>
<h1>Session Insights</h1>
<p class="muted">Generated locally {e(time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()))}. Nothing was uploaded.</p>
<div class="tiles">{"".join(f'<div class="tile"><b>{e(str(v))}</b>{e(k)}</div>' for k, v in tiles)}</div>
<h2>Suggestions</h2><ol>{sugg}</ol>
<h2>Trend</h2><div class="scroll"><table><tr><th>Date</th>{"".join(f"<th>{e(lbl)}</th>" for _, lbl, _ in TREND_KEYS)}</tr>{rows or '<tr><td colspan="6" class="muted">Run with --save weekly to build history.</td></tr>'}</table></div>
<h2>Outcomes</h2><table>{kv(m["outcomes"])}</table>
<h2>Intent mix</h2><table>{kv(m["intent_mix"])}</table>
<h2>Avg tokens per session by intent</h2><table>{kv({k: f"{v['avg_tokens']:,} ({v['sessions']} sessions)" for k, v in m["cost_by_intent"].items()})}</table>
<h2>Setup gaps</h2><table>{kv({g["gap"]: g["fix"] for g in m["setup_gaps"]}) or '<tr><td class="muted">none</td></tr>'}</table>
</main></body></html>
"""


def selftest():
    fixture = HERE.parent / "tests" / "fixture.jsonl"
    s = parse_session(str(fixture), _load_classifier())
    assert len(s["prompts"]) == 4, s["prompts"]
    assert s["interrupts"] == 1, s["interrupts"]
    assert s["tool_errors"]["Bash"] == 1, s["tool_errors"]
    assert s["denials"] == 1, s["denials"]
    assert s["reads"]["src/app.py"] == 3, s["reads"]
    assert [p["correction"] for p in s["prompts"]] == [False, True, False, True], s[
        "prompts"
    ]
    assert s["prompts"][2]["vague"] and not s["prompts"][0]["vague"]
    assert s["setup_gaps"]["missing Python deps"] == 1, s["setup_gaps"]
    assert s["tokens"] == 75 and s["subagent_tokens"] == 60, (
        s["tokens"],
        s["subagent_tokens"],
    )
    assert s["agent_calls"] == 1 and s["outcome"] == "abandoned", s["outcome"]
    m = analyze([s], min_prompts=1)
    actions = " ".join(x["action"] for x in m["suggestions"])
    assert "memory-sync" in actions and "line ranges" in actions, m["suggestions"]
    assert "SessionStart" in actions and "Fan out" in actions, m["suggestions"]
    assert m["subagents"]["share"] == 0.44, m["subagents"]
    assert len(incidents([s])) == 3, incidents([s])
    assert trend({"correction_rate": 0.5}, {"correction_rate": 0.2}) == [
        "corrections 50% -> 20% (better)"
    ]
    assert "<title>Session Insights</title>" in render_html(m, [dict(m, date="x")])
    print(
        "selftest passed: prompts, corrections, interrupts, errors, denials, re-reads, "
        "outcomes, cost, subagents, setup gaps, trend, html"
    )
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--last", type=int, default=30, help="most recent N sessions")
    ap.add_argument("--project", help="only project dirs containing this substring")
    ap.add_argument("--long", type=int, default=300, help="long-session turn threshold")
    ap.add_argument("--json", action="store_true")
    ap.add_argument(
        "--incidents", action="store_true", help="print friction lines for memory-sync"
    )
    ap.add_argument(
        "--save", action="store_true", help="store a snapshot and print the trend"
    )
    ap.add_argument(
        "--trend", action="store_true", help="compare with the last saved snapshot"
    )
    ap.add_argument("--html", metavar="PATH", help="write a static HTML dashboard")
    ap.add_argument(
        "--draft-commands",
        metavar="DIR",
        help="draft slash commands for repeated prompt openers (never overwrites)",
    )
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()

    files = glob.glob(os.path.join(a.root, "*", "*.jsonl"))
    if a.project:
        files = [f for f in files if a.project in os.path.dirname(f)]
    files = sorted(files, key=os.path.getmtime)[-a.last :]
    classify = _load_classifier()
    sessions = [
        s
        for s in (parse_session(f, classify) for f in files)
        if s["prompts"] or s["turns"]
    ]
    if not sessions:
        print("no sessions found under", a.root)
        return 0
    if a.incidents:
        print("\n".join(incidents(sessions)))
        return 0
    if a.draft_commands:
        written = draft_commands(sessions, a.draft_commands)
        print("\n".join(written) or "no prompt opener repeats across 3+ sessions yet")
        return 0
    m = analyze(sessions, a.long)
    past = history()
    if a.json:
        json.dump(m, sys.stdout, indent=2)
        print()
    else:
        report(m)
    if (a.trend or a.save) and past:
        lines = trend(past[-1], m)
        print(f"\nsince {past[-1].get('date', 'last snapshot')}:")
        print("\n".join(f"  {x}" for x in lines) or "  no change in key rates")
    if a.save:
        print("\nsaved", save(m))
        past = history()
    if a.html:
        _write_private(a.html, render_html(m, past))
        print("wrote", a.html)
    return 0


if __name__ == "__main__":
    sys.exit(main())
