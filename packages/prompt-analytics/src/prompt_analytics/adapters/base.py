"""SourceAdapter protocol and registry.

An adapter knows one tool's on-disk format. It never redacts and never
writes: ``discover`` lists units of incrementality cheaply, ``parse`` turns
one unit into raw unified records, ``health`` says whether the format still
looks like what the adapter understands. Any exception inside ``parse`` is
caught by ``scan`` and becomes a warning, so one bad file never stops a run.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from ..schema import ParsedBatch

HEALTH_STATUS = ("ok", "degraded", "missing", "unsupported")


@dataclass(frozen=True)
class SourceFile:
    source: str
    path: Path
    size: int
    mtime_ns: int
    # Unit of incrementality: the path for file-per-session stores, or
    # "<db path>#<session id>" when one database holds many sessions.
    key: str
    # Optional cheap change marker when size/mtime of a shared DB is useless
    # (e.g. a per-session updated_at); scan compares it instead of mtime.
    marker: str | None = None


@dataclass
class Health:
    source: str
    status: str  # one of HEALTH_STATUS
    sessions_found: int = 0
    messages: list[str] = field(default_factory=list)
    versions_seen: list[str] = field(default_factory=list)


class SourceAdapter(Protocol):
    name: str

    def discover(self) -> list[SourceFile]: ...

    def parse(self, f: SourceFile) -> ParsedBatch: ...

    def health(self) -> Health: ...


def home() -> Path:
    return Path(os.environ.get("PA_HOME") or Path.home())


def user_data_dirs(app: str) -> list[Path]:
    """VS Code-family ``User`` dir candidates for ``app`` on this OS.

    ``PA_HOME`` overrides the home dir so tests can point at fixtures.
    """
    h = home()
    if sys.platform == "darwin":
        base = h / "Library" / "Application Support"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA") or h / "AppData" / "Roaming")
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or h / ".config")
    return [base / app / "User"]


def stat_file(source: str, path: Path, key: str | None = None) -> SourceFile:
    st = path.stat()
    return SourceFile(source, path, st.st_size, st.st_mtime_ns, key or str(path))


def all_adapters() -> list[SourceAdapter]:
    from .antigravity import AntigravityAdapter
    from .claude_code import ClaudeCodeAdapter
    from .copilot import CopilotAdapter
    from .cursor import CursorAdapter
    from .opencode import OpencodeAdapter

    return [
        ClaudeCodeAdapter(),
        CopilotAdapter(),
        CursorAdapter(),
        OpencodeAdapter(),
        AntigravityAdapter(),
    ]
