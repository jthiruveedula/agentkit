"""Token price lookup (USD per 1M tokens). Estimates only; see pricing.toml."""

from __future__ import annotations

import re
import tomllib
from functools import lru_cache
from pathlib import Path
from typing import Any

_RATE_KEYS = ("input", "output", "cache_read", "cache_write")


@lru_cache(maxsize=1)
def _builtin() -> dict[str, dict[str, float]]:
    with (Path(__file__).with_name("pricing.toml")).open("rb") as fh:
        return tomllib.load(fh)["models"]


def normalize(model: str) -> str:
    m = model.strip().lower().rsplit("/", 1)[-1].split("@")[0]
    m = re.sub(r"^(anthropic|openai|google)\.", "", m)
    m = m.replace(".", "-").replace("_", "-")
    m = re.sub(r"-v\d+:\d+$", "", m)
    return re.sub(r"-(latest|\d{8}|\d{4}-\d{2}-\d{2})$", "", m)


def _longest(table: dict[str, Any], n: str) -> Any:
    best = None
    for k in table:
        nk = normalize(k)
        if n.startswith(nk) and (best is None or len(nk) > len(best[0])):
            best = (nk, table[k])
    return best[1] if best else None


def lookup(model: str | None, cfg: Any = None) -> dict[str, float] | None:
    if not model:
        return None
    n = normalize(model)
    over = getattr(cfg, "pricing", None) or {}
    return _longest(over, n) or _longest(_builtin(), n)


def estimate(model: str | None, tin: int | None, tout: int | None, cread: int | None, cwrite: int | None, cfg: Any = None) -> float | None:
    """USD estimate, or None when the model is unknown or no tokens are known."""
    rates = lookup(model, cfg)
    if rates is None or all(t is None for t in (tin, tout, cread, cwrite)):
        return None
    toks = (tin, tout, cread, cwrite)
    return sum((t or 0) * float(rates.get(k, 0.0)) for t, k in zip(toks, _RATE_KEYS)) / 1_000_000
