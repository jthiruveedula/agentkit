#!/usr/bin/env python3
"""install_hooks.py — add/remove the context-budget hooks in Claude Code settings.

    python3 scripts/install_hooks.py            # ~/.claude/settings.json
    python3 scripts/install_hooks.py --dry-run
    python3 scripts/install_hooks.py --uninstall
    python3 scripts/install_hooks.py --settings path/to/settings.json

Idempotent: entries are recognised by the budget_hook.py path, so re-running
never duplicates them. Keeps one .bak next to the settings file (made before the
first change) and replaces the file atomically.
Stdlib only.
"""

import argparse
import json
import os
import shlex
import shutil
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "budget_hook.py")
MARK = "budget_hook.py"


def _entries():
    cmd = "python3 %s" % shlex.quote(HOOK)
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


def write_settings(path, text):
    """Keep one .bak (before the first change), then replace the file atomically."""
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
    except ValueError:
        print("settings is not valid JSON; refusing to overwrite", file=sys.stderr)
        return 2
    if not isinstance(settings, dict):
        print("settings is not a JSON object; refusing to overwrite", file=sys.stderr)
        return 2
    out = apply(settings, a.uninstall)
    text = json.dumps(out, indent=2) + "\n"
    if a.dry_run:
        print(text)
        return 0
    write_settings(a.settings, text)
    print(
        "%s context-budget hooks in %s"
        % ("removed" if a.uninstall else "installed", a.settings)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
