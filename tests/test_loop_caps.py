"""Every retry loop in a skill must carry an attempt cap."""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
LOOP = re.compile(r"\b(re-?run|regenerate|repeat|re-check)\b[^\n]*", re.I)
UNTIL = re.compile(r"until|and repeat", re.I)


def test_uncapped_retry_loops_have_a_cap():
    bad = []
    for path in sorted((REPO_ROOT / "skills").glob("*/SKILL.md")):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if (
                LOOP.search(line)
                and UNTIL.search(line)
                and "max 3 attempts" not in line
            ):
                bad.append("%s:%d" % (path.relative_to(REPO_ROOT), n))
    assert not bad, bad
