#!/usr/bin/env python3
"""uvx/pip entry point. Delegates straight to install.sh -- see its
docstring for the actual install logic and flags."""
import subprocess
import sys
from pathlib import Path

try:
    from importlib import resources
except ImportError:  # pragma: no cover - Python < 3.7, below requires-python
    resources = None


def _find_install_sh():
    """Locate install.sh.

    Prefers importlib.resources so an installed wheel (where install.sh
    ships as package data) works. Falls back to the source-checkout layout
    (src/agentkit/cli.py -> parents[2] is the repo root) when the resource
    lookup fails.
    """
    if resources is not None:
        try:
            # importlib.resources.path is the Python 3.8-compatible API
            # (importlib.resources.files arrived in 3.9).
            with resources.path("agentkit", "install.sh") as p:
                if p.is_file():
                    return str(p)
        except (FileNotFoundError, ModuleNotFoundError, TypeError):
            pass
    repo_root = Path(__file__).resolve().parents[2]
    return str(repo_root / "install.sh")


def main():
    script = _find_install_sh()
    if not Path(script).exists():
        print("error: install.sh not found -- run this from a full agentkit clone", file=sys.stderr)
        return 1
    return subprocess.call(["sh", script] + sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
