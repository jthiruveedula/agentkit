"""The orchestrator roster is written in four places; they must agree."""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ORCH = REPO_ROOT / "skills" / "orchestrate"
sys.path.insert(0, str(ORCH / "scripts"))

import plan_check  # noqa: E402


def test_orchestrator_roster_agrees_everywhere():
    agent = (REPO_ROOT / "agents" / "orchestrator.md").read_text()
    spawn = re.search(r"Agent\(([^)]*)\)", agent).group(1)
    expected = {n.strip() for n in spawn.split(",")}
    assert expected == plan_check.ROSTER

    skill = (ORCH / "SKILL.md").read_text()
    default = skill.split("Default owners:")[1].split("\n\n")[0]
    assert set(re.findall(r"`([a-z][a-z-]*)`", default)) == expected

    # Owner column of the need -> owner table
    owners = set()
    for row in (ORCH / "reference" / "roster.md").read_text().splitlines():
        m = re.match(r"\|[^|]*\|\s*`([^`]+)`", row)
        if m:
            owners.add(m.group(1))
    assert owners == expected
