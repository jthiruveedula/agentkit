"""Shared helpers for VS Code-family adapters (stdlib only, read-only)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse


def uri_to_path(uri: str | None) -> str | None:
    """file:///a/b%20c -> /a/b c. Non-file URIs return None."""
    if not isinstance(uri, str) or not uri.startswith("file:"):
        return None
    p = urlparse(uri)
    path = unquote(p.path)
    if len(path) > 2 and path[0] == "/" and path[2] == ":":  # file:///C:/x
        path = path[1:]
    return path or None


def workspace_folder(ws_dir: Path) -> str | None:
    """Folder path from <ws_dir>/workspace.json, or None."""
    try:
        d = json.loads((ws_dir / "workspace.json").read_text("utf-8"))
        return uri_to_path(d.get("folder")) if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


def ms_to_dt(ms) -> datetime | None:
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or ms <= 0:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def open_ro(db: Path, immutable: bool = False) -> sqlite3.Connection:
    """Read-only open; never copies the DB."""
    q = "immutable=1" if immutable else "mode=ro"
    return sqlite3.connect(f"file:{db.as_posix().replace('?', '%3f').replace('#', '%23')}?{q}", uri=True, timeout=1.0)


def item_value(conn: sqlite3.Connection, key: str) -> str | None:
    """Read one ItemTable value by exact key (never SELECT *)."""
    row = conn.execute("SELECT CAST(value AS TEXT) FROM ItemTable WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def estimate_tokens(text: str | None) -> int:
    return len(text or "") // 4
