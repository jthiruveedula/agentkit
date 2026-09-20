#!/usr/bin/env python3
"""Stitch site/assets/logos-raw/*.svg into one site/assets/logo-sprite.svg
sprite (<symbol> per tool, recoloured to currentColor). Re-run after
updating/adding a raw logo -- e.g. when a tool ships a new mark.

    python3 site/scripts/build-logo-sprite.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "logos-raw"
OUT = ROOT / "assets" / "logo-sprite.svg"

# name -> display title, in sprite order
ORDER = {
    "claude": "Claude Code",
    "copilot": "GitHub Copilot",
    "cursor": "Cursor",
    "antigravity": "Antigravity",
}


def build():
    symbols = []
    for name, title in ORDER.items():
        src = RAW / f"{name}.svg"
        text = src.read_text()
        viewbox = re.search(r'viewBox="([^"]+)"', text).group(1)
        paths = re.findall(r'<path[^>]*\bd="([^"]+)"[^>]*/?>', text)
        path_tags = "".join(f'<path d="{d}" fill="currentColor"/>' for d in paths)
        symbols.append(f'<symbol id="logo-{name}" viewBox="{viewbox}"><title>{title}</title>{path_tags}</symbol>')

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n  '
        + "\n  ".join(symbols)
        + "\n</svg>\n"
    )
    OUT.write_text(svg)
    print("wrote %s (%d bytes, %d symbols)" % (OUT, len(svg), len(symbols)))


if __name__ == "__main__":
    build()
    sys.exit(0)
