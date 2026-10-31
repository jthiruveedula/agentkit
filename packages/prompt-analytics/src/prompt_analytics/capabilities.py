"""What this machine can run: probe installed libs (no heavy imports) and resolve the analysis tier.

basic = stdlib + duckdb + polars; ml = + scikit-learn; deep = ml + a local embedding model that is ALREADY cached
(analyze never downloads; ``doctor --download-models`` does).
"""

from __future__ import annotations

import importlib.util
import os
from importlib import metadata
from pathlib import Path
from typing import Any

MODES = ("basic", "ml", "deep")
LIBS = {"numpy": "numpy", "scikit-learn": "sklearn", "fastembed": "fastembed", "sentence-transformers": "sentence_transformers", "torch": "torch"}
FETCH = ("python -c \"from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')\"  "
         "# or: prompt-analytics doctor --download-models")
UPGRADE = {"ml": "uv pip install 'prompt-analytics[ml]'", "deep": "uv pip install 'prompt-analytics[deep]' && " + FETCH}


def _has(mod: str) -> bool:
    try:
        return importlib.util.find_spec(mod) is not None
    except (ImportError, ValueError):  # a module blocked with sys.modules[name] = None
        return False


def _ver(dist: str) -> str | None:
    if not _has(LIBS[dist]):
        return None
    try:
        return metadata.version(dist)
    except metadata.PackageNotFoundError:
        return "unknown"


def model_cached(models_dir: Path | None) -> bool:
    """fastembed cache under models_dir, or a sentence-transformers model in the local HF cache."""
    if models_dir and models_dir.is_dir() and any(models_dir.glob("models--*")):
        return True
    hub = Path(os.environ.get("HF_HOME") or Path.home() / ".cache" / "huggingface") / "hub"
    return _has("sentence_transformers") and hub.is_dir() and any(hub.glob("models--sentence-transformers--*"))


def _accel() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:  # noqa: BLE001 - probing only
        pass
    return "cpu"


def probe(models_dir: Path | None = None, requested: str | None = None) -> dict[str, Any]:
    libs = {d: _ver(d) for d in LIBS}
    ml = bool(libs["numpy"] and libs["scikit-learn"])
    cached = model_cached(models_dir)
    deep = ml and bool(libs["fastembed"] or libs["sentence-transformers"]) and cached
    available = ["basic"] + (["ml"] if ml else []) + (["deep"] if deep else [])
    nxt = next((m for m in MODES if m not in available), None)
    return {"libs": libs, "available": available, "model_cached": cached,
            "accel": _accel() if requested == "deep" and libs["torch"] else "cpu",
            "upgrade": {"mode": nxt, "command": UPGRADE[nxt]} if nxt else None}


def resolve(requested: str | None, pr: dict[str, Any]) -> tuple[str, str]:
    """(mode, reason). Auto = highest available; an unavailable explicit tier falls back (fail soft)."""
    av, libs = pr["available"], pr["libs"]
    best = av[-1]
    detail = {"basic": "scikit-learn not installed" if not libs["scikit-learn"] else "basic only",
              "ml": f"scikit-learn {libs['scikit-learn']} found, no embedding model",
              "deep": f"embedding model cached ({'fastembed' if libs['fastembed'] else 'sentence-transformers'})"}[best]
    req = requested or "auto"
    if req == "auto":
        return best, f"auto: {detail}"
    if req not in MODES:
        return best, f"unknown mode {req!r}; auto: {detail}"
    if req in av:
        return req, f"requested {req}"
    why = {"ml": "needs scikit-learn + numpy", "deep": "needs fastembed or sentence-transformers and a cached model"}[req]
    return best, f"requested {req} not available ({why}); using {best}"
