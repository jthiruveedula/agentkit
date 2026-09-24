#!/usr/bin/env python3
"""install_hooks.py — add/remove the context-budget hooks in Claude Code settings.

    python3 scripts/install_hooks.py            # ~/.claude/settings.json
    python3 scripts/install_hooks.py --dry-run
    python3 scripts/install_hooks.py --uninstall
    python3 scripts/install_hooks.py --settings path/to/settings.json

Idempotent: entries are recognised by the budget_hook.py path, so re-running
never duplicates them. Writes a .bak next to the settings file first.
Stdlib only.
"""

import argparse
import json
import os
import shutil
import sys

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "budget_hook.py")
MARK = "budget_hook.py"


def _entries():
    cmd = 'python3 "%s"' % HOOK
    check = {"hooks": [{"type": "command", "command": cmd + " check", "timeout": 5}]}
    return {
        "UserPromptSubmit": [check],
        "PostToolUse": [dict(check, matcher="*")],
        "SessionStart": [
            {
                "matcher": "compact|clear|resume",
                "hooks": [
                    {"type": "command", "command": cmd + " resume", "timeout": 5}
                ],
            }
        ],
    }


def _strip(groups):
    kept = []
    for g in groups:
        hooks = [h for h in g.get("hooks", []) if MARK not in h.get("command", "")]
        if hooks:
            kept.append(dict(g, hooks=hooks))
    return kept


def apply(settings, uninstall=False):
    hooks = settings.setdefault("hooks", {})
    for event in list(_entries()):
        groups = _strip(hooks.get(event, []))
        if not uninstall:
            groups += _entries()[event]
        if groups:
            hooks[event] = groups
        else:
            hooks.pop(event, None)
    if not hooks:
        settings.pop("hooks")
    return settings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--settings", default=os.path.expanduser("~/.claude/settings.json"))
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    try:
        with open(a.settings, encoding="utf-8") as fh:
            settings = json.load(fh)
    except FileNotFoundError:
        settings = {}
    out = apply(settings, a.uninstall)
    text = json.dumps(out, indent=2) + "\n"
    if a.dry_run:
        print(text)
        return 0
    if os.path.exists(a.settings):
        shutil.copy2(a.settings, a.settings + ".bak")
    os.makedirs(os.path.dirname(os.path.abspath(a.settings)), exist_ok=True)
    with open(a.settings, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(
        "%s context-budget hooks in %s"
        % ("removed" if a.uninstall else "installed", a.settings)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
