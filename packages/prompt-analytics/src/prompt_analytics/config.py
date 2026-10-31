"""Runtime configuration: data paths plus the user's optional TOML overrides.

Config file: ``<data_dir>/config.toml`` (all keys optional)::

    store_text = "redacted"          # none | redacted | full
    redact_style = "kind"            # kind | hash
    sources = ["claude_code", ...]   # default: all
    [redact.builtins] phone = false
    [[redact.custom]] name = "ticket"  pattern = 'ACME-\\d{4,}'
    [redact.allow] literals = [...]  patterns = [...]
    [sensitive] enabled = true  disabled = ["phone"]   # exposure scan of pasted PII/PHI/secrets
    [analysis] mode = "auto"         # auto | basic | ml | deep
    [outcomes] enabled = true  before_h = 4  after_h = 2  repos = []
    [pricing."model-id"] input = 3.0  output = 15.0  cache_read = 0.3  cache_write = 3.75
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

STORE_TEXT = ("none", "redacted", "full")


def default_data_dir() -> Path:
    base = os.environ.get("AGENTKIT_DATA_DIR") or os.environ.get("AGENTKIT_HOME")
    root = Path(base) if base else Path.home() / ".agentkit"
    return root / "prompt-analytics"


@dataclass
class Config:
    data_dir: Path = field(default_factory=default_data_dir)
    store_text: str = "redacted"
    redact_style: str = "kind"
    sources: list[str] | None = None  # None = every registered adapter
    redact: dict[str, Any] = field(default_factory=dict)
    outcomes: dict[str, Any] = field(default_factory=lambda: {"enabled": True, "before_h": 4, "after_h": 2, "repos": []})
    pricing: dict[str, dict[str, float]] = field(default_factory=dict)
    sensitive: dict[str, Any] = field(default_factory=dict)  # [sensitive] enabled / disabled kinds
    analysis: dict[str, Any] = field(default_factory=lambda: {"mode": "auto"})  # [analysis] mode = auto|basic|ml|deep
    embed_backend: str | None = None  # None = best installed: fastembed > model2vec > tfidf

    @property
    def db_path(self) -> Path:
        return self.data_dir / "analytics.duckdb"

    @property
    def salt_path(self) -> Path:
        return self.data_dir / "salt"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def export_dir(self) -> Path:
        return self.data_dir / "export"

    @classmethod
    def load(cls, data_dir: Path | None = None, **overrides: Any) -> "Config":
        cfg = cls(data_dir=Path(data_dir) if data_dir else default_data_dir())
        path = cfg.data_dir / "config.toml"
        if path.is_file():
            with path.open("rb") as fh:
                raw = tomllib.load(fh)
            for key, value in raw.items():
                if key in ("outcomes", "analysis"):
                    getattr(cfg, key).update(value)
                elif hasattr(cfg, key) and key != "data_dir":
                    setattr(cfg, key, value)
        for key, value in overrides.items():
            if value is not None:
                setattr(cfg, key, value)
        if cfg.store_text not in STORE_TEXT:
            raise ValueError(f"store_text must be one of {STORE_TEXT}, got {cfg.store_text!r}")
        return cfg
