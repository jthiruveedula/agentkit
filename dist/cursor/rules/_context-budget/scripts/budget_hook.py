#!/usr/bin/env python3
"""budget_hook.py — watch a Claude Code session's context size; pause and resume.

Wired as hooks by install_hooks.py:

    UserPromptSubmit / PostToolUse  ->  budget_hook.py check
    SessionStart (compact|clear|resume)  ->  budget_hook.py resume

`check` reads the hook JSON on stdin, takes the latest usage block from the
transcript, and once context crosses the budget tells the model to pause:
finish the step, write a checkpoint, ask the user to /compact or /clear.
It warns again every AGENTKIT_BUDGET_STEP tokens past the budget, not on
every call. `resume` re-injects a fresh checkpoint for the working dir.

Manual use:
    budget_hook.py status <transcript.jsonl>   # current context tokens
    budget_hook.py path [cwd]                  # checkpoint path for a dir

Env: AGENTKIT_BUDGET_TOKENS (default 200000), AGENTKIT_BUDGET_STEP (50000),
AGENTKIT_HOME (default ~/.agentkit). Never blocks; errors exit 0 silently
so a broken hook can't stall a session. Stdlib only.
"""

import hashlib
import json
import os
import sys
import time

TAIL_BYTES = 512 * 1024
FRESH_SECONDS = 24 * 3600


def _home():
    return os.environ.get("AGENTKIT_HOME") or os.path.join(
        os.path.expanduser("~"), ".agentkit"
    )


def checkpoint_path(cwd):
    key = hashlib.sha1(os.path.abspath(cwd).encode("utf-8")).hexdigest()[:12]
    name = os.path.basename(os.path.abspath(cwd)) or "root"
    return os.path.join(_home(), "checkpoints", "%s-%s.md" % (name, key))


def context_tokens(transcript):
    """Input-side tokens of the latest API call (what the next turn re-reads)."""
    try:
        with open(transcript, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            fh.seek(max(0, fh.tell() - TAIL_BYTES))
            lines = fh.read().decode("utf-8", "ignore").splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        if '"usage"' not in line:
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        msg = entry.get("message")
        usage = msg.get("usage") if isinstance(msg, dict) else None
        if usage and not entry.get("isSidechain"):
            return (
                usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
    return None


def _state_file(session_id):
    return os.path.join(_home(), "budget", "%s.json" % (session_id or "unknown"))


def check(hook):
    budget = int(os.environ.get("AGENTKIT_BUDGET_TOKENS", 200000))
    step = int(os.environ.get("AGENTKIT_BUDGET_STEP", 50000))
    used = context_tokens(hook.get("transcript_path", ""))
    if used is None or used < budget:
        return None
    level = budget + ((used - budget) // step) * step
    sf = _state_file(hook.get("session_id"))
    try:
        with open(sf, encoding="utf-8") as fh:
            if json.load(fh).get("warned", 0) >= level:
                return None
    except (OSError, ValueError):
        pass
    os.makedirs(os.path.dirname(sf), exist_ok=True)
    with open(sf, "w", encoding="utf-8") as fh:
        json.dump({"warned": level, "used": used, "at": int(time.time())}, fh)

    cp = checkpoint_path(hook.get("cwd") or os.getcwd())
    note = (
        "CONTEXT BUDGET: this session re-reads %d tokens per turn (budget %d). Pause: "
        "finish the current step, then write a checkpoint to %s with sections "
        "## Goal, ## Decisions (with reasons), ## State, ## Open threads / Next action "
        "(under 60 lines; context-compressor template). Then tell the user to run "
        "/compact (same task) or /clear (new task) — the checkpoint is re-injected "
        "automatically on resume." % (used, budget, cp)
    )
    return {
        "systemMessage": "agentkit: context at %dk tokens (budget %dk) — checkpoint, then /compact or /clear."
        % (used // 1000, budget // 1000),
        "hookSpecificOutput": {
            "hookEventName": hook.get("hook_event_name", "UserPromptSubmit"),
            "additionalContext": note,
        },
    }


def resume(hook):
    if hook.get("source", "startup") not in ("compact", "clear", "resume"):
        return None
    cp = checkpoint_path(hook.get("cwd") or os.getcwd())
    try:
        if time.time() - os.path.getmtime(cp) > FRESH_SECONDS:
            return None
        with open(cp, encoding="utf-8") as fh:
            body = fh.read().strip()
    except OSError:
        return None
    if not body:
        return None
    ctx = "Resuming from agentkit checkpoint (%s):\n\n%s" % (cp, body)
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": ctx,
        }
    }


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cmd = argv[0] if argv else ""
    if cmd == "status" and len(argv) > 1:
        print(context_tokens(argv[1]))
        return 0
    if cmd == "path":
        print(checkpoint_path(argv[1] if len(argv) > 1 else os.getcwd()))
        return 0
    if cmd not in ("check", "resume"):
        print(__doc__, file=sys.stderr)
        return 2
    try:
        hook = json.load(sys.stdin)
        out = check(hook) if cmd == "check" else resume(hook)
    except Exception:  # noqa: BLE001 -- a hook must never break the session
        return 0
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
