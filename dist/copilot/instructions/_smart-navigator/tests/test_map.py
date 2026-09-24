#!/usr/bin/env python3
"""Tests for scripts/map.py. Stdlib only: run with `python3 tests/test_map.py`."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "map.py"


class TestMap(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / "package.json").write_text(
            json.dumps(
                {
                    "name": "fixture-repo",
                    "version": "0.0.1",
                    "scripts": {"test": "pytest", "build": "make"},
                }
            )
        )
        (root / "src").mkdir()
        (root / "src" / "main.py").write_text("print('hi')\n")
        (root / "src" / "util.py").write_text("X = 1\n")
        # ignored dirs with junk that must never appear in the map
        (root / "node_modules" / "junk").mkdir(parents=True)
        (root / "node_modules" / "junk" / "index.js").write_text("/* junk */" * 500)
        (root / ".git").mkdir()
        (root / ".git" / "HEAD").write_text("ref: refs/heads/main\n")
        (root / "dist").mkdir()
        (root / "dist" / "bundle.js").write_text("/* bundle */" * 500)
        (root / "bin").mkdir()
        (root / "bin" / "run").write_text("#!/bin/sh\necho hi\n")
        self.root = root

    def run_map(self, *args):
        r = subprocess.run(
            [sys.executable, str(SCRIPT), str(self.root), *args],
            capture_output=True,
            text=True,
        )
        self.assertEqual(r.returncode, 0, "stderr: %s" % r.stderr)
        return r.stdout

    def test_manifest_fields_in_markdown(self):
        out = self.run_map()
        self.assertIn("fixture-repo", out)
        self.assertIn("0.0.1", out)
        self.assertIn("test", out)  # script names listed
        self.assertIn("build", out)

    def test_entry_points_guessed(self):
        out = self.run_map()
        self.assertIn("src/main.py", out)  # main.* name match
        self.assertIn("bin/run", out)  # bin/ script

    def test_ignored_dirs_skipped(self):
        out = self.run_map()
        for junk in ("node_modules", "junk", "bundle.js", ".git", "dist"):
            self.assertNotIn(junk, out)

    def test_tree_has_counts(self):
        out = self.run_map()
        self.assertIn("src/", out)
        self.assertRegex(out, r"src/ \(\d+ files, \d+ KB\)")

    def test_json_parses_and_skips_ignored(self):
        data = json.loads(self.run_map("--json"))
        paths = [ep["path"] for ep in data["entry_points"]]
        self.assertIn("src/main.py", paths)
        self.assertIn("bin/run", paths)
        self.assertTrue(
            any(
                m["kind"] == "package.json" and m["name"] == "fixture-repo"
                for m in data["manifests"]
            )
        )

        def names(nodes):
            for n in nodes:
                yield n["name"]
                yield from names(n.get("children", []))

        tree_names = list(names(data["tree"]))
        for junk in ("node_modules/", ".git/", "dist/"):
            self.assertNotIn(junk, tree_names)

    def test_depth_flag(self):
        out = self.run_map("--depth", "1")
        self.assertIn("src/main.py", out)  # entry points unaffected
        self.assertIn("src/", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
