#!/usr/bin/env python3
"""Tests for scripts/checkpoint.py. stdlib only.

Run: python3 tests/test_checkpoint.py  (or python3 -m pytest)
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "checkpoint.py"

GOLDEN = """\
# Checkpoint: agentkit migration
Key: proj.agentkit.checkpoint
Updated: 2026-09-20 16:00 CDT

## Goal
Migrate agentkit skills to the shared cross-tool contract.

## Decisions
- Keep skills stdlib-only — no dependency installs in agent runtimes.
- One checkpoint per workstream — supersede, never append.

## State
Done:
- Wrote scripts/checkpoint.py with render and lint modes.
In flight:
- Reference docs still need the keep/drop table.

## Open threads
- Should AGENTS.md rebuild be automatic → next: check scripts/build.py behavior.
- Test coverage for render mode → next: decide if needed.

## Memory keys touched
- proj.agentkit.checkpoint — created on 2026-09-20.
"""

MISSING_SECTION = """\
# Checkpoint: agentkit migration
Key: proj.agentkit.checkpoint

## Goal
Migrate agentkit skills to the shared cross-tool contract.

## State
Done:
- Wrote the script.
"""


def write_file(body: str) -> Path:
    tmp = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False)
    tmp.write(body)
    tmp.close()
    return Path(tmp.name)


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
    )


class TestRender(unittest.TestCase):
    def test_render_prints_template_with_all_sections(self):
        proc = run("render")
        self.assertEqual(proc.returncode, 0)
        out = proc.stdout
        for section in ("## Goal", "## Decisions", "## State", "## Open threads"):
            self.assertIn(section, out, f"template missing {section}")


class TestLintGolden(unittest.TestCase):
    def test_golden_passes(self):
        path = write_file(GOLDEN)
        proc = run("lint", str(path))
        self.assertEqual(proc.returncode, 0, proc.stdout)
        self.assertIn("OK", proc.stdout)

    def test_golden_json_parses_and_reports_ok(self):
        path = write_file(GOLDEN)
        proc = run("lint", str(path), "--json")
        self.assertEqual(proc.returncode, 0, proc.stdout)
        result = json.loads(proc.stdout)  # must parse
        self.assertTrue(result["ok"])
        self.assertEqual(result["errors"], [])
        self.assertLessEqual(result["line_count"], 60)


class TestLintFailures(unittest.TestCase):
    def test_missing_section_fails(self):
        path = write_file(MISSING_SECTION)
        proc = run("lint", str(path))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Decisions", proc.stdout)

    def test_missing_section_json_names_problem(self):
        path = write_file(MISSING_SECTION)
        proc = run("lint", str(path), "--json")
        self.assertNotEqual(proc.returncode, 0)
        result = json.loads(proc.stdout)
        self.assertFalse(result["ok"])
        self.assertTrue(any("Decisions" in e for e in result["errors"]))

    def test_empty_section_fails(self):
        body = GOLDEN.replace(
            "## Decisions\n- Keep skills stdlib-only — no dependency installs in agent runtimes.\n- One checkpoint per workstream — supersede, never append.\n",
            "## Decisions\n",
        )
        path = write_file(body)
        proc = run("lint", str(path))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Decisions", proc.stdout)

    def test_overlong_fails(self):
        padding = "\n".join(f"- filler line {i}" for i in range(60))
        path = write_file(GOLDEN + padding)
        proc = run("lint", str(path))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("too long", proc.stdout)

    def test_placeholder_only_section_fails(self):
        proc = run("render")
        path = write_file(proc.stdout)  # blank template must not lint clean
        lint_proc = run("lint", str(path))
        self.assertNotEqual(lint_proc.returncode, 0)

    def test_missing_file_fails(self):
        proc = run("lint", "/tmp/does-not-exist-checkpoint.md")
        self.assertNotEqual(proc.returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
