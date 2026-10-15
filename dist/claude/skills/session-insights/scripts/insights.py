#!/usr/bin/env python3
"""insights.py — prompt analytics and friction signals from Claude Code transcripts.

Reads ~/.claude/projects/*/*.jsonl (or --root) and reports what the user
typed and where the session lost time: prompt intent mix, underspecified
prompts, correction/redo turns, interrupts, tool errors, permission
denials, file re-reads, and prompts/commands repeated across sessions
(automation candidates). Ends with ranked, evidence-backed suggestions.

    python3 insights.py                      # last 30 sessions
    python3 insights.py --last 100 --json
    python3 insights.py --incidents > incidents.txt   # feed memory-sync
    python3 insights.py --selftest

Local only: reads transcripts, prints a report, sends nothing anywhere.
Prompt text is truncated in output. Exit 0 always (it's a report). Stdlib only.
"""

import argparse
import glob
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLASSIFY = HERE.parents[1] / "prompt-enhancer" / "scripts" / "classify.py"

CORRECTION_RE = re.compile(
    r"^\s*(no\b|nope\b|wrong\b|that'?s (not|wrong)|not what i|actually\b|instead\b|"
    r"undo\b|revert\b|roll ?back\b|stop\b|don'?t\b|you (forgot|missed|broke)|"
    r"still (not|broken|fail|wrong|doesn'?t)|again\b|i said\b|why did you\b)",
    re.IGNORECASE,
)
INTERRUPT = "[Request interrupted by user"
DENIAL_RE = re.compile(
    r"doesn'?t want to proceed|user (rejected|denied)|permission denied by user",
    re.IGNORECASE,
)
# A prompt with any of these anchors names something concrete.
ANCHOR_RE = re.compile(
    r"[\w./-]+\.\w{1,5}\b|`[^`]+`|#\d+|\b[a-z_]+\(|https?://|\b(line|test|error)\b",
    re.IGNORECASE,
)
ACCEPTANCE_RE = re.compile(
    r"\b(should|must|expect(ed)?|done when|so that|acceptance|pass(es)?|until)\b",
    re.IGNORECASE,
)
NOISE_PREFIXES = (
    "<command-",
    "<local-command",
    "Caveat:",
    "<system-reminder",
    "<bash-",
)


def _load_classifier():
    if not CLASSIFY.exists():
        return lambda text: "unclassified"
    spec = importlib.util.spec_from_file_location("ak_classify", CLASSIFY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return lambda text: mod.classify(text)["intent"]


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
    }
    tool_names = {}
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if not isinstance(d, dict) or d.get("isSidechain"):
                continue
            msg = d.get("message")
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if d.get("type") == "assistant":
                if msg.get("usage"):
                    s["turns"] += 1
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name, inp = b.get("name", "?"), b.get("input") or {}
                    tool_names[b.get("id")] = name
                    s["tool_calls"][name] += 1
                    if name == "Read" and inp.get("file_path"):
                        s["reads"][inp["file_path"]] += 1
                    if name == "Bash" and inp.get("command"):
                        key = _cmd_key(inp["command"])
                        if key:
                            s["commands"][key] += 1
            elif d.get("type") == "user":
                if isinstance(content, list):
                    for b in content:
                        if not isinstance(b, dict) or b.get("type") != "tool_result":
                            continue
                        body = _result_text(b)
                        if DENIAL_RE.search(body):
                            s["denials"] += 1
                        elif b.get("is_error"):
                            name = tool_names.get(b.get("tool_use_id"), "?")
                            s["tool_errors"][name] += 1
                            if len(s["error_samples"]) < 5:
                                s["error_samples"].append(
                                    f"{name}: {body.strip()[:100]}"
                                )
                text = _text_of(content)
                if text is None:
                    continue
                if INTERRUPT in text:
                    s["interrupts"] += 1
                    continue
                text = text.strip()
                if not text or text.startswith(NOISE_PREFIXES) or d.get("isMeta"):
                    continue
                words = len(text.split())
                s["prompts"].append(
                    {
                        "text": text,
                        "words": words,
                        "intent": classify(text),
                        "correction": bool(CORRECTION_RE.search(text))
                        and len(s["prompts"]) > 0,
                        "vague": words < 8 and not ANCHOR_RE.search(text),
                        "has_acceptance": bool(ACCEPTANCE_RE.search(text)),
                        "ts": d.get("timestamp", ""),
                    }
                )
    return s


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
    print("\nsuggestions (highest impact first):")
    if not m["suggestions"]:
        print(
            "  none — no signal crossed a threshold. Analyze more sessions with --last."
        )
    for i, s in enumerate(m["suggestions"], 1):
        print(f"  {i}. {s['finding']}\n     -> {s['action']}")


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
    m = analyze([s], min_prompts=1)
    actions = " ".join(x["action"] for x in m["suggestions"])
    assert "memory-sync" in actions and "line ranges" in actions, m["suggestions"]
    assert len(incidents([s])) == 3, incidents([s])
    print(
        "selftest passed: prompts, corrections, interrupts, errors, denials, re-reads"
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
    m = analyze(sessions, a.long)
    if a.json:
        json.dump(m, sys.stdout, indent=2)
        print()
    else:
        report(m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
