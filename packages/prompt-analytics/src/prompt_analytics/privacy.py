"""Redaction, keyed hashing, private file permissions and a network tripwire.

Everything that leaves an adapter passes through ``Redactor.redact`` before it
is stored, and the dashboard export is redacted again and then scanned by
``find_leaks`` (any hit fails the export). Patterns are dependency-free regex
(shapes borrowed from gitleaks) plus a Shannon-entropy fallback.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import re
import secrets
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

# Bump when built-in patterns change: stored rows carry it so a rule fix can
# trigger re-redaction from the raw source.
RULES_VERSION = "1"

_HEX_ID = re.compile(r"^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")
_UUID = re.compile(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")
_ENTROPY_TOKEN = re.compile(r"(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{24,}(?![A-Za-z0-9+/_=-])")
_PLACEHOLDER = re.compile(r"\[REDACTED:[a-z_-]+(?::[0-9a-f]{8})?\]|\[USER\]")

# (kind, pattern, group to replace or 0 for whole match). Order matters:
# most specific first so a generic rule never eats half a known token.
_BUILTINS: list[tuple[str, str, int]] = [
    ("pem", r"-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\s\S]*\Z)", 0),
    ("aws", r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b", 0),
    ("github", r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b", 0),
    ("anthropic", r"\bsk-ant-[A-Za-z0-9_-]{20,}", 0),
    ("openai", r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}", 0),
    ("google", r"\bAIza[0-9A-Za-z_-]{35}\b", 0),
    ("slack", r"\bxox[baprs]-[A-Za-z0-9-]{10,}", 0),
    ("stripe", r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}", 0),
    ("jwt", r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}", 0),
    ("bearer", r"(?i)(\bbearer\s+)([A-Za-z0-9._~+/=-]{16,})", 2),
    ("urlcred", r"(?i)(\b[a-z][a-z0-9+.-]*://[^\s:/@]+:)([^\s@/]+)(@)", 2),
    (
        "assign",
        r"(?i)([\"']?[\w.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|credential|private[_-]?key|access[_-]?key)"
        r"[\w.-]*[\"']?\s*[:=]\s*)(\[REDACTED:[^\]\s]*\]|\"[^\"\n]*\"|'[^'\n]*'|[^\s,;}\])]+)",
        2,
    ),
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", 0),
    ("email", r"\b[A-Za-z0-9._+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", 0),  # URL-encoded
    ("ssn", r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b", 0),
    ("card", r"(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])", 0),
    ("phone", r"(?<![\w.])\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}(?![\w.])", 0),
    ("ipv4", r"(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])", 0),
    ("hostname", r"(?i)\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|corp|lan|intra)\b", 0),
]
_HOMEDIR = [
    re.compile(r"(/Users/|/home/)(?!\[USER\])[^/\s\"'`]+"),
    re.compile(r"(?i)([A-Z]:\\{1,2}Users\\{1,2})(?!\[USER\])[^\\\s\"'`]+"),
]
_IP_ALLOW = {"127.0.0.1", "0.0.0.0", "255.255.255.255"}


def luhn(digits: str) -> bool:
    if not 13 <= len(digits) <= 19 or len(set(digits)) < 2:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def shannon(s: str) -> float:
    if not s:
        return 0.0
    counts: dict[str, int] = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    n = len(s)
    return -sum(c / n * math.log2(c / n) for c in counts.values())


@dataclass
class _Rule:
    kind: str
    rx: re.Pattern[str]
    group: int


class Redactor:
    """Configurable redactor. ``cfg`` is the ``[redact]`` table of config.toml."""

    def __init__(self, cfg: dict[str, Any] | None = None, salt: bytes | None = None, style: str = "kind"):
        cfg = cfg or {}
        enabled = {k: True for k, _, _ in _BUILTINS} | {"homedir": True, "entropy": True}
        enabled.update({k: bool(v) for k, v in (cfg.get("builtins") or {}).items()})
        self.enabled = enabled
        self.rules = [_Rule(k, re.compile(p), g) for k, p, g in _BUILTINS if enabled.get(k, True)]
        for c in cfg.get("custom") or []:
            self.rules.append(_Rule(str(c["name"]), re.compile(c["pattern"]), int(c.get("group", 0))))
        allow = cfg.get("allow") or {}
        self.allow_literals = set(allow.get("literals") or [])
        self.allow_patterns = [re.compile(p) for p in allow.get("patterns") or []]
        self.salt = salt
        self.style = style

    def _allowed(self, value: str) -> bool:
        return value in self.allow_literals or any(p.search(value) for p in self.allow_patterns)

    def _token(self, kind: str, value: str) -> str:
        if self.style == "hash" and self.salt:
            return f"[REDACTED:{kind}:{hmac_hex(self.salt, value.encode())[:8]}]"
        return f"[REDACTED:{kind}]"

    def _sub(self, rule: _Rule, text: str) -> str:
        def repl(m: re.Match[str]) -> str:
            value = m.group(rule.group)
            if _PLACEHOLDER.fullmatch(value) or self._allowed(value):
                return m.group(0)
            if rule.kind == "ipv4" and value in _IP_ALLOW:
                return m.group(0)
            if rule.kind == "card" and not luhn(re.sub(r"\D", "", value)):
                return m.group(0)
            if rule.kind == "assign" and _PLACEHOLDER.search(value):
                return m.group(0)
            if rule.group == 0:
                return self._token(rule.kind, value)
            start, end = m.span(rule.group)
            base = m.start(0)
            whole = m.group(0)
            return whole[: start - base] + self._token(rule.kind, value) + whole[end - base :]

        return rule.rx.sub(repl, text)

    def redact(self, text: str | None) -> str | None:
        if not text:
            return text
        out = text
        for rule in self.rules:
            out = self._sub(rule, out)
        if self.enabled.get("homedir", True):
            for rx in _HOMEDIR:
                out = rx.sub(lambda m: m.group(1) + "[USER]", out)
        if self.enabled.get("entropy", True):
            out = _ENTROPY_TOKEN.sub(self._entropy_repl, out)
        return out

    def _entropy_repl(self, m: re.Match[str]) -> str:
        tok = m.group(0)
        if _HEX_ID.match(tok) or _UUID.match(tok) or self._allowed(tok):
            return tok
        # Paths/identifiers like some/long/module/path or snake_case_names are
        # low-risk; require mixed character classes plus high entropy.
        classes = sum(bool(re.search(p, tok)) for p in (r"[a-z]", r"[A-Z]", r"\d"))
        if classes < 3 or shannon(tok) < 4.0 or tok.count("/") >= 2:
            return tok
        return self._token("entropy", tok)

    def find_leaks(self, text: str) -> list[str]:
        """Kinds of secret still present in ``text`` (used as the export gate)."""
        hits = []
        for rule in self.rules:
            if rule.kind in ("phone", "ipv4", "hostname", "card"):
                continue  # PII heuristics are too noisy to fail a build on
            for m in rule.rx.finditer(text):
                value = m.group(rule.group)
                if not (_PLACEHOLDER.fullmatch(value) or _PLACEHOLDER.search(value) or self._allowed(value)):
                    hits.append(rule.kind)
                    break
        for rx in _HOMEDIR:
            if rx.search(text):
                hits.append("homedir")
                break
        return hits


_default: Redactor | None = None


def redact(text: str | None) -> str | None:
    """Redact with built-in rules only. Use a configured ``Redactor`` in the pipeline."""
    global _default
    if _default is None:
        _default = Redactor()
    return _default.redact(text)


def hmac_hex(salt: bytes, data: bytes) -> str:
    return hmac.new(salt, data, hashlib.sha256).hexdigest()


def load_salt(path: Path) -> bytes:
    """Per-install 32-byte salt, created 0600 on first use. Never exported."""
    if path.is_file():
        return path.read_bytes()
    secure_dir(path.parent)
    salt = secrets.token_bytes(32)
    write_private(path, salt)
    return salt


def secure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)
    return path


def write_private(path: Path, data: bytes | str) -> None:
    """Write a file readable only by the owner (0600), atomically."""
    secure_dir(path.parent)
    raw = data.encode() if isinstance(data, str) else data
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(raw)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def harden_tree(root: Path) -> None:
    """chmod every file 0600 / dir 0700 under ``root`` (DuckDB ignores our umask on some OSes)."""
    if not root.exists():
        return
    os.chmod(root, 0o700)
    for p in root.rglob("*"):
        os.chmod(p, 0o700 if p.is_dir() else 0o600)


class NetworkBlocked(RuntimeError):
    pass


_real_connect: Callable[..., Any] | None = None


def block_network(allow_loopback: bool = True) -> None:
    """Tripwire: make outbound socket connects raise. Not a sandbox, a guard.

    Also forces Hugging Face libraries offline so an embedding backend never
    phones home after the one-time ``doctor --download-models``.
    """
    global _real_connect
    for var in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[var] = "1"
    if _real_connect is not None:
        return
    _real_connect = socket.socket.connect

    def guarded(self: socket.socket, address: Any) -> Any:
        host = address[0] if isinstance(address, tuple) else address
        if allow_loopback and (host in ("127.0.0.1", "::1", "localhost") or isinstance(host, str) and host.startswith("/")):
            return _real_connect(self, address)  # type: ignore[misc]
        raise NetworkBlocked(f"prompt-analytics is local-only; blocked connect to {host!r}")

    socket.socket.connect = guarded  # type: ignore[method-assign]


def unblock_network() -> None:
    global _real_connect
    if _real_connect is not None:
        socket.socket.connect = _real_connect  # type: ignore[method-assign]
        _real_connect = None
