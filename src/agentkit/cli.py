#!/usr/bin/env python3
"""uvx/pip entry point. Delegates straight to install.sh -- see its
docstring for the actual install logic and flags."""
import subprocess
import sys
from pathlib import Path


def main():
    repo_root = Path(__file__).resolve().parents[2]
    script = repo_root / "install.sh"
    if not script.exists():
        print("error: install.sh not found -- run this from a full agentkit clone", file=sys.stderr)
        return 1
    return subprocess.call(["sh", str(script)] + sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
