"""prompt_signals.py — the prompt regexes, classifier loader and redact() shared by
insights.py and nudge_hook.py. Kept small so the per-prompt hook never has to exec
the whole analyzer. Stdlib only.
"""

import os
import re

# os.path, not pathlib, and importlib is imported lazily: the nudge hook runs on
# every prompt, so import time is its whole cost.
HERE = os.path.dirname(os.path.abspath(__file__))
CLASSIFY = os.path.join(
    os.path.dirname(os.path.dirname(HERE)), "prompt-enhancer", "scripts", "classify.py"
)

CORRECTION_RE = re.compile(
    r"^\s*(no\b|nope\b|wrong\b|that'?s (not|wrong)|not what i|actually\b|instead\b|"
    r"undo\b|revert\b|roll ?back\b|stop\b|don'?t\b|you (forgot|missed|broke)|"
    r"still (not|broken|fail|wrong|doesn'?t)|again\b|i said\b|why did you\b)",
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

# Mirrors SECRET/redact() in skills/memory-sync/scripts/rank_patterns.py (a skill
# script can't import another skill); keep the two patterns in step.
SECRET = re.compile(
    r"(?i)\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9]{16,}|AKIA[0-9A-Z]{12,}|xox[a-z]-[a-z0-9-]{8,}"
    r"|eyJ[a-z0-9_-]{10,}\.[a-z0-9_.-]+|bearer\s+\S{12,})"
    r"|(?i:(?:token|secret|password|passwd|api[_-]?key)\s*[=:]\s*\S+)"
)


def redact(line):
    """Mask likely secrets so they never reach snapshots, drafts or reports."""
    return SECRET.sub("[REDACTED]", line)


def load_classifier():
    if not os.path.exists(CLASSIFY):
        return lambda text: "unclassified"
    import importlib.util

    spec = importlib.util.spec_from_file_location("ak_classify", CLASSIFY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return lambda text: mod.classify(text)["intent"]
