"""Friction cues: corrections, frustration, rephrase loops, abandonment, interrupts."""

from __future__ import annotations

import re

import numpy as np
import polars as pl

# Copied from skills/session-insights/scripts/prompt_signals.py (a skill script cannot be imported).
CORRECTION_RE = re.compile(
    r"^\s*(no\b|nope\b|wrong\b|that'?s (not|wrong)|not what i|actually\b|instead\b|"
    r"undo\b|revert\b|roll ?back\b|stop\b|don'?t\b|you (forgot|missed|broke)|"
    r"still (not|broken|fail|wrong|doesn'?t)|again\b|i said\b|why did you\b)",
    re.IGNORECASE,
)
FRUSTRATION_RE = re.compile(
    r"(!{2,}|\b(wtf|ugh+|damn|seriously|useless|for the (second|third|fourth|fifth) time|"
    r"why (is|does|did) (it|this) (still|keep)|keeps? (failing|breaking)|this is (wrong|broken|terrible)|"
    r"still (not working|broken|failing))\b)",
    re.IGNORECASE,
)
_WORD = re.compile(r"\w+")
REPHRASE_THRESHOLDS = {"model2vec": 0.85, "fastembed": 0.88, "tfidf": 0.80}


def lexical_flags(text: str | None) -> tuple[bool, bool]:
    if not text:
        return False, False
    return bool(CORRECTION_RE.search(text)), bool(FRUSTRATION_RE.search(text))


def tokens(text: str) -> frozenset[str]:
    return frozenset(_WORD.findall(text.lower()))


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


def rephrase_threshold(backend: str) -> float:
    return REPHRASE_THRESHOLDS.get(backend.split(":")[0], 0.80)


def rephrase_flags(E: np.ndarray, session_codes: np.ndarray, toks: list[frozenset[str]], thr: float, lookback: int = 3, jac: float = 0.5) -> np.ndarray:
    """Row i is a rephrase when cos to one of the previous ``lookback`` rows of the SAME session is > thr
    and token jaccard > ``jac``. Rows must be sorted by (session, idx)."""
    n = len(E)
    flags = np.zeros(n, dtype=bool)
    for k in range(1, lookback + 1):
        if n <= k:
            break
        same = session_codes[k:] == session_codes[:-k]
        cos = np.einsum("ij,ij->i", E[k:], E[:-k])
        for i in np.nonzero(same & (cos > thr))[0] + k:
            if not flags[i] and jaccard(toks[i], toks[i - k]) > jac:
                flags[i] = True
    return flags


def abandoned(df: pl.DataFrame) -> pl.Series:
    """Per session: <=3 turns, nothing landed (no applied edit, no commit), and the last turn is a user turn
    or an assistant turn with no edit/tool work. An answered ``explain`` session is not abandoned.
    Sessions without turns are unknown, never abandoned. Needs n_turns, last_role, last_ok, has_work, has_applied,
    has_outcome, intent."""
    d = (
        (pl.col("n_turns") > 0) & (pl.col("n_turns") <= 3) & ~pl.col("has_applied") & ~pl.col("has_outcome")
        & ((pl.col("last_role") == "user") | ((pl.col("last_role") == "assistant") & ~pl.col("has_work")))
        & ~((pl.col("intent") == "explain") & (pl.col("last_role") == "assistant") & pl.col("last_ok"))
    )
    return df.select(d.alias("a"))["a"]


def friction_score(df: pl.DataFrame) -> pl.DataFrame:
    """Weighted 0..1 friction with visible components. Needs n_user, corrections, frustrations, loops,
    interrupts, abandoned."""
    nu = pl.col("n_user").clip(lower_bound=1)
    comp = df.with_columns(
        (pl.col("corrections") / nu).clip(0, 1).alias("f_correction"),
        (pl.col("frustrations") / nu).clip(0, 1).alias("f_frustration"),
        (pl.col("loops") / 3.0).clip(0, 1).alias("f_loops"),
        pl.col("abandoned").cast(pl.Float64).alias("f_abandoned"),
        (pl.col("interrupts") / nu).clip(0, 1).alias("f_interrupt"),
    )
    return comp.with_columns(
        (0.30 * pl.col("f_correction") + 0.15 * pl.col("f_frustration") + 0.25 * pl.col("f_loops")
         + 0.20 * pl.col("f_abandoned") + 0.10 * pl.col("f_interrupt")).alias("friction")
    ).with_columns(pl.when(pl.col("n_user") > 0).then(pl.col("friction")).otherwise(None).alias("friction"))


def rephrase_jaccard(session_codes: np.ndarray, toks: list[frozenset[str]], lookback: int = 3, jac: float = 0.6) -> np.ndarray:
    """Basic tier (no embeddings): rephrase = token jaccard > ``jac`` with one of the previous ``lookback`` prompts of the same session."""
    flags = np.zeros(len(toks), dtype=bool)
    for i in range(len(toks)):
        flags[i] = any(session_codes[i - k] == session_codes[i] and jaccard(toks[i], toks[i - k]) > jac for k in range(1, min(lookback, i) + 1))
    return flags
