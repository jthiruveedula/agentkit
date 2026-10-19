#!/usr/bin/env python3
"""nudge_hook.py — live prompt-quality nudge for Claude Code (UserPromptSubmit).

When a submitted prompt is a task (code-gen / debug / refactor) that names
no file, symbol or error and states no done-condition, it adds one line of
context telling the agent to state its assumed target and done-condition
before editing, and shows the user a short tip. Advisory only: it never
blocks a prompt, and any error exits 0 silently.

    python3 nudge_hook.py install             # ~/.claude/settings.json
    python3 nudge_hook.py install --dry-run
    python3 nudge_hook.py install --uninstall
    echo '{"prompt": "fix the bug"}' | python3 nudge_hook.py check

Env: AGENTKIT_NUDGE=off disables it; AGENTKIT_NUDGE=model hides the user tip.
Stdlib only.
"""

import argparse
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARK = "nudge_hook.py"
TASK_INTENTS = {"code-gen", "debug", "refactor"}
CONTEXT = (
    "session-insights: this prompt names no file, symbol or error and no "
    "done-condition. Before editing, state in one line the target you assume "
    "and how you will verify it is done; ask one question instead if the "
    "target can't be inferred from context."
)
TIP = "tip: name the file/function and the done-condition to skip a round-trip"


def _insights():
    spec = importlib.util.spec_from_file_location("ak_insights", HERE / "insights.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def verdict(prompt, ins=None):
    """Return the hook output dict for a prompt, or None to stay silent."""
    mode = os.environ.get("AGENTKIT_NUDGE", "on").lower()
    text = (prompt or "").strip()
    if mode == "off" or not text or text.startswith(("/", "!", "#")):
        return None
    ins = ins or _insights()
    words = len(text.split())
    if (
        words >= 25
        or ins.ANCHOR_RE.search(text)
        or ins.ACCEPTANCE_RE.search(text)
        or ins.CORRECTION_RE.search(text)
    ):
        return None
    if ins._load_classifier()(text) not in TASK_INTENTS:
        return None
    out = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": CONTEXT,
        }
    }
    if mode != "model":
        out["systemMessage"] = TIP
    return out


def check(stdin=None):
    try:
        data = json.load(stdin or sys.stdin)
        out = verdict(data.get("prompt", "") if isinstance(data, dict) else "")
    except Exception:
        return 0
    if out:
        print(json.dumps(out))
    return 0


def apply(settings, uninstall=False):
    hooks = settings.setdefault("hooks", {})
    groups = []
    for g in hooks.get("UserPromptSubmit", []):
        kept = [h for h in g.get("hooks", []) if MARK not in h.get("command", "")]
        if kept:
            groups.append(dict(g, hooks=kept))
    if not uninstall:
        cmd = 'python3 "%s" check' % (HERE / MARK)
        groups.append({"hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
    if groups:
        hooks["UserPromptSubmit"] = groups
    else:
        hooks.pop("UserPromptSubmit", None)
    if not hooks:
        settings.pop("hooks")
    return settings


def install(argv):
    ap = argparse.ArgumentParser(prog="nudge_hook.py install")
    ap.add_argument("--settings", default=os.path.expanduser("~/.claude/settings.json"))
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    try:
        with open(a.settings, encoding="utf-8") as fh:
            settings = json.load(fh)
    except FileNotFoundError:
        settings = {}
    text = json.dumps(apply(settings, a.uninstall), indent=2) + "\n"
    if a.dry_run:
        print(text)
        return 0
    if os.path.exists(a.settings):
        shutil.copy2(a.settings, a.settings + ".bak")
    os.makedirs(os.path.dirname(os.path.abspath(a.settings)), exist_ok=True)
    with open(a.settings, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(
        "%s prompt nudge hook in %s"
        % ("removed" if a.uninstall else "installed", a.settings)
    )
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["install"]:
        return install(argv[1:])
    if argv[:1] == ["check"]:
        return check()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
