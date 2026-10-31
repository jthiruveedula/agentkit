"""Antigravity adapter (metadata tier): conversation index from state.vscdb.

Only whitelisted ItemTable keys are ever queried, one ``WHERE key = ?`` each.
Turn text is not recoverable offline, so sessions carry no turns.
"""

from __future__ import annotations

import base64
import binascii
import sqlite3
import struct
from datetime import datetime, timezone
from pathlib import Path

from ..schema import ParsedBatch, Session
from ._vscode import item_value, open_ro, uri_to_path
from .base import Health, SourceFile, home, stat_file, user_data_dirs

APPS = ("Antigravity IDE", "Antigravity")
SUMMARIES_KEY = "antigravityUnifiedStateSync.trajectorySummaries"
KEY_WHITELIST = (SUMMARIES_KEY, "chat.ChatSessionStore.index")
NOTE = "metadata-only: turn text not recoverable offline"


# ---- minimal protobuf wire reader
def _varint(b: bytes, i: int) -> tuple[int, int]:
    n = shift = 0
    while True:
        c = b[i]  # IndexError on truncation -> caller handles
        i += 1
        n |= (c & 0x7F) << shift
        if not c & 0x80:
            return n, i
        shift += 7
        if shift > 70:
            raise ValueError("varint too long")


def parse_pb(b: bytes) -> list[tuple[int, int, object]]:
    """Return [(field, wiretype, value)]. Raises ValueError on malformed input."""
    out, i = [], 0
    try:
        while i < len(b):
            tag, i = _varint(b, i)
            f, wt = tag >> 3, tag & 7
            if wt == 0:
                v, i = _varint(b, i)
            elif wt == 2:
                n, i = _varint(b, i)
                if i + n > len(b):
                    raise ValueError("truncated")
                v, i = b[i:i + n], i + n
            elif wt == 1:
                v, i = struct.unpack_from("<Q", b, i)[0], i + 8
            elif wt == 5:
                v, i = struct.unpack_from("<I", b, i)[0], i + 4
            else:
                raise ValueError(f"wire type {wt}")
            out.append((f, wt, v))
    except (IndexError, struct.error) as ex:
        raise ValueError("truncated") from ex
    return out


def _first(fields, num, wt=None):
    for f, w, v in fields:
        if f == num and (wt is None or w == wt):
            return v
    return None


def _ts(raw) -> datetime | None:
    if not isinstance(raw, bytes):
        return None
    try:
        m = parse_pb(raw)
        secs = _first(m, 1, 0)
        if not secs:
            return None
        return datetime.fromtimestamp(secs + (_first(m, 2, 0) or 0) / 1e9, tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def _find_uri(raw, depth=0) -> str | None:
    if not isinstance(raw, bytes) or depth > 6:
        return None
    if raw.startswith(b"file://"):
        return raw.decode("utf-8", "replace")
    try:
        for _, wt, v in parse_pb(raw):
            if wt == 2 and (u := _find_uri(v, depth + 1)):
                return u
    except ValueError:
        pass
    return None


def _text(raw) -> str | None:
    if not isinstance(raw, bytes):
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def decode_summaries(value: str) -> tuple[list[dict], int]:
    """-> (conversations, n_malformed). Raises ValueError if the outer blob is undecodable."""
    try:
        outer = parse_pb(base64.b64decode(value, validate=False))
    except (binascii.Error, ValueError) as ex:
        raise ValueError("outer blob undecodable") from ex
    convs, bad = [], 0
    for f, wt, entry in outer:
        if f != 1 or wt != 2:
            continue
        try:
            e = parse_pb(entry)
            uid = _text(_first(e, 1, 2))
            wrapper = parse_pb(_first(e, 2, 2) or b"")
            inner = parse_pb(base64.b64decode(_first(wrapper, 1, 2) or b"", validate=True))
            c = {
                "uuid": _text(_first(inner, 4, 2)) or uid,
                "title": _text(_first(inner, 1, 2)),
                "last": _ts(_first(inner, 3, 2)),
                "created": _ts(_first(inner, 7, 2)),
                "uri": _find_uri(_first(inner, 9, 2)) or _find_uri(_first(inner, 17, 2)),
            }
            if not c["uuid"]:
                raise ValueError("no uuid")
            convs.append(c)
        except (ValueError, binascii.Error):
            bad += 1
    return convs, bad


class AntigravityAdapter:
    name = "antigravity"

    def __init__(self) -> None:
        self._cache: dict[Path, tuple[list[dict], int]] = {}

    def _dbs(self) -> list[Path]:
        return [d / "globalStorage" / "state.vscdb" for a in APPS for d in user_data_dirs(a)
                if (d / "globalStorage" / "state.vscdb").is_file()]

    def _pbs(self) -> list[Path]:
        d = home() / ".gemini" / "antigravity" / "conversations"
        return sorted(d.glob("*.pb")) if d.is_dir() else []

    def _read(self, db: Path) -> tuple[list[dict], int]:
        if db not in self._cache:
            conn = open_ro(db)
            try:
                raw = item_value(conn, SUMMARIES_KEY)
            finally:
                conn.close()
            self._cache[db] = decode_summaries(raw) if raw else ([], 0)
        return self._cache[db]

    def discover(self) -> list[SourceFile]:
        out = []
        for p in self._dbs() + self._pbs():
            try:
                out.append(stat_file(self.name, p))
            except OSError:
                pass
        return out

    def parse(self, f: SourceFile) -> ParsedBatch:
        b = ParsedBatch()
        try:
            if f.path.suffix == ".pb":
                known = {c["uuid"] for db in self._dbs() for c in self._safe(db)[0]}
                if f.path.stem not in known:
                    t = datetime.fromtimestamp(f.mtime_ns / 1e9, tz=timezone.utc)
                    b.sessions.append(Session(f"antigravity:{f.path.stem}", self.name, f.key,
                                              started_at=t, ended_at=t))
                return b
            convs, bad = self._read(f.path)
            if bad:
                b.warnings.append(f"antigravity: skipped {bad} malformed conversation(s)")
            for c in convs:
                b.sessions.append(Session(
                    f"antigravity:{c['uuid']}", self.name, f.key,
                    project_path=uri_to_path(c["uri"]), title=c["title"] or None,
                    started_at=c["created"] or c["last"], ended_at=c["last"]))
        except Exception as ex:  # noqa: BLE001
            b.warnings.append(f"antigravity: {f.path.name}: {type(ex).__name__}")
        return b

    def _safe(self, db: Path) -> tuple[list[dict], int]:
        try:
            return self._read(db)
        except (sqlite3.Error, ValueError):
            return [], 0

    def health(self) -> Health:
        dbs, pbs = self._dbs(), self._pbs()
        if not dbs and not pbs:
            return Health(self.name, "missing")
        h = Health(self.name, "ok", messages=[NOTE])
        for db in dbs:
            try:
                convs, bad = self._read(db)
                h.sessions_found += len(convs)
                if bad:
                    h.status = "degraded"
                    h.messages.append(f"{bad} conversation(s) failed to decode")
            except (sqlite3.Error, ValueError) as ex:
                h.status = "degraded"
                h.messages.append(f"index unreadable ({type(ex).__name__})")
        known = {c["uuid"] for db in dbs for c in self._safe(db)[0]}
        h.sessions_found += sum(1 for p in pbs if p.stem not in known)
        return h
