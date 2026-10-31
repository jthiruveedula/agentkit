"""Git outcomes: link commits to sessions via read-only ``git log``.

Stores only an HMAC of the sha, timestamp and numstat totals. Never the raw
sha, message, author or file names.
"""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import Config
from .privacy import hmac_hex, load_salt

_FMT = "%H%x09%cI"


def _env() -> dict[str, str]:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"}
    for k in ("SYSTEMROOT", "HOME"):  # Windows needs SYSTEMROOT; HOME lets git find safe.directory config
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def _git_log(root: str, since: datetime) -> list[tuple[str, datetime, int, int, int]]:
    cmd = ["git", "-C", root, "log", f"--since={since.isoformat()}", "--no-merges", f"--pretty=format:{_FMT}", "--numstat"]
    out = subprocess.run(cmd, env=_env(), capture_output=True, text=True, timeout=30, check=True).stdout
    commits: list[list] = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 2 and len(parts[0]) in (40, 64):
            commits.append([parts[0], datetime.fromisoformat(parts[1]), 0, 0, 0])
        elif len(parts) >= 3 and commits:
            commits[-1][2] += 1
            commits[-1][3] += int(parts[0]) if parts[0].isdigit() else 0  # "-" for binary files
            commits[-1][4] += int(parts[1]) if parts[1].isdigit() else 0
    return [tuple(c) for c in commits]  # type: ignore[misc]


def collect(con: Any, cfg: Config) -> dict[str, Any]:
    cfg_o = cfg.outcomes or {}
    salt = load_salt(cfg.salt_path)
    before = timedelta(hours=float(cfg_o.get("before_h", 4)))
    after = timedelta(hours=float(cfg_o.get("after_h", 2)))
    allow = cfg_o.get("repos") or []
    roots: dict[str, str] = {}  # project_id -> real path
    if allow:
        for r in allow:
            p = os.path.normpath(os.path.expanduser(r))
            roots[hmac_hex(salt, p.encode())[:16]] = p
        known = {r[0] for r in con.execute("SELECT project_id FROM projects").fetchall()}
        roots = {k: v for k, v in roots.items() if k in known}
    else:
        for pid, root in con.execute("SELECT project_id, root FROM projects WHERE repo").fetchall():
            roots[pid] = os.path.expanduser(root)
    report: dict[str, Any] = {"repos": 0, "outcomes": 0, "linked": 0, "warnings": []}
    for pid, root in roots.items():
        if not Path(root).is_dir():
            report["warnings"].append(f"repo not found: {Path(root).name}")
            continue
        sess = [(sid, datetime.fromtimestamp(s, timezone.utc), datetime.fromtimestamp(e if e is not None else s, timezone.utc))
                for sid, s, e in con.execute(
                    "SELECT session_id, epoch(started_at), epoch(ended_at) FROM sessions "
                    "WHERE project_id=? AND NOT coalesce(is_subagent,false) AND started_at IS NOT NULL", [pid]).fetchall()]
        if not sess:
            continue
        since = min(s[1] for s in sess) - timedelta(days=1)
        try:
            commits = _git_log(root, since)
        except (subprocess.SubprocessError, OSError, ValueError) as e:
            report["warnings"].append(f"git log failed for {Path(root).name}: {type(e).__name__}")
            continue
        rows = []
        for sha, ts, files, ins, dele in commits:
            cand = [s for s in sess if s[1] <= ts and ts - s[2] <= after and ts - s[1] <= before]
            link = max(cand, key=lambda s: s[1])[0] if cand else None
            rows.append((hmac_hex(salt, sha.encode())[:16], pid, link, ts, "commit", files, ins, dele))
        con.begin()
        try:
            con.execute("DELETE FROM outcomes WHERE project_id=?", [pid])
            if rows:
                con.executemany("INSERT OR REPLACE INTO outcomes VALUES (?,?,?,?,?,?,?,?)", rows)
            con.commit()
        except BaseException:
            con.rollback()
            raise
        report["repos"] += 1
        report["outcomes"] += len(rows)
        report["linked"] += sum(r[2] is not None for r in rows)
    return report
