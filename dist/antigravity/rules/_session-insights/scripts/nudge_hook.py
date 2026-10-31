#!/usr/bin/env python3
"""nudge_hook.py — live prompt-quality nudge for Claude Code (UserPromptSubmit).

When a submitted prompt is a task (code-gen / debug / refactor) that names
no file, symbol or error and states no done-condition, it adds one line of
context telling the agent to state its assumed target and done-condition
before editing, and shows the user a short tip. Advisory only: it never
blocks a prompt, and any error exits 0 after one line on stderr.

    python3 nudge_hook.py install             # ~/.claude/settings.json
    python3 nudge_hook.py install --dry-run
    python3 nudge_hook.py install --uninstall
    echo '{"prompt": "fix the bug"}' | python3 nudge_hook.py check

Env: AGENTKIT_NUDGE=off disables it; AGENTKIT_NUDGE=model hides the user tip.
Stdlib only.
"""

import json
import os
import sys

# Only cheap stdlib at import time: this runs on every prompt. The installer
# imports its heavier modules lazily.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # prompt_signals sits beside this script
from prompt_signals import (  # noqa: E402
    ACCEPTANCE_RE,
    ANCHOR_RE,
    CORRECTION_RE,
    load_classifier,
)

MARK = "nudge_hook.py"
TASK_INTENTS = {"code-gen", "debug", "refactor"}
CONTEXT = (
    "session-insights: this prompt names no file, symbol or error and no "
    "done-condition. Before editing, state in one line the target you assume "
    "and how you will verify it is done; ask one question instead if the "
    "target can't be inferred from context."
)
TIP = "tip: name the file/function and the done-condition to skip a round-trip"


def verdict(prompt):
    """Return the hook output dict for a prompt, or None to stay silent."""
    mode = os.environ.get("AGENTKIT_NUDGE", "on").lower()
    text = (prompt or "").strip()
    if mode == "off" or not text or text.startswith(("/", "!", "#")):
        return None
    words = len(text.split())
    if (
        words >= 25
        or ANCHOR_RE.search(text)
        or ACCEPTANCE_RE.search(text)
        or CORRECTION_RE.search(text)
    ):
        return None
    if load_classifier()(text) not in TASK_INTENTS:
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
    except Exception as e:  # noqa: BLE001 -- a hook must never break the session
        print("agentkit nudge_hook: %s: %s" % (type(e).__name__, e), file=sys.stderr)
        return 0
    if out:
        print(json.dumps(out))
    return 0


def apply(settings, uninstall=False):
    import shlex

    hooks = settings.setdefault("hooks", {})
    groups = []
    for g in hooks.get("UserPromptSubmit", []):
        kept = [h for h in g.get("hooks", []) if MARK not in h.get("command", "")]
        if kept:
            groups.append(dict(g, hooks=kept))
    if not uninstall:
        cmd = "python3 %s check" % shlex.quote(os.path.join(HERE, MARK))
        groups.append({"hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
    if groups:
        hooks["UserPromptSubmit"] = groups
    else:
        hooks.pop("UserPromptSubmit", None)
    if not hooks:
        settings.pop("hooks")
    return settings


def write_settings(path, text):
    """Keep one .bak (before the first change), then replace the file atomically."""
    import shutil
    import tempfile

    path = os.path.realpath(path)  # write through a symlinked settings.json
    if os.path.exists(path) and not os.path.exists(path + ".bak"):
        shutil.copy2(path, path + ".bak")
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".settings-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        if os.path.exists(path):
            shutil.copymode(path, tmp)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def install(argv):
    import argparse

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
    write_settings(a.settings, text)
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
