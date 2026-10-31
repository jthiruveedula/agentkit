"""Prompt quality: four 0..1 sub-scores, a 0..100 blend, and validation against outcomes."""

from __future__ import annotations

import re

import numpy as np

AXES = ["specificity", "context", "constraints", "length"]
WEIGHTS = (30.0, 25.0, 25.0, 20.0)

_PATH = re.compile(r"(?:[\w.-]+/)+[\w.-]+|\b[\w-]+\.(?:py|js|ts|tsx|jsx|go|rs|java|rb|md|json|toml|ya?ml|sql|sh|css|html|c|cpp|h)\b")
_SYMBOL = re.compile(r"`[^`\n]+`|\b[a-z_][a-z0-9_]*\(\)|\b[a-z]+[A-Z]\w+\b|\b[A-Z][a-z]+[A-Z]\w+\b|\b[a-z]+_[a-z_]+\b")
_ERROR = re.compile(r"\b\w*(?:Error|Exception)\b|Traceback|\bpanic\b|\bsegfault\b|\bENOENT\b|\b[45]\d\d\b|exit code", re.I)
_LINE = re.compile(r"\bline\s+\d+|:\d+(?::\d+)?\b|#\d+", re.I)
_FENCE = re.compile(r"```")
_URL = re.compile(r"https?://")
_LOG = re.compile(r"(?m)^\s*(?:at\s+\S+|\d{4}-\d\d-\d\d[ T]\d\d:\d\d|\[(?:ERROR|WARN|INFO)\]|File \")")
# Copied from prompt_signals.ACCEPTANCE_RE, extended with modal/negation/test cues.
_ACCEPT = re.compile(r"\b(should|must|expect(ed)?|done when|so that|acceptance|pass(es)?|until)\b", re.I)
_MODAL = re.compile(r"\b(must|should|need to|make sure|ensure|keep)\b", re.I)
_NEGATE = re.compile(r"\b(don'?t|do not|never|without|avoid|only|no new)\b", re.I)
_LIST = re.compile(r"(?m)^\s*(?:[-*]|\d+[.)])\s+\S")
_VERIFY = re.compile(r"\b(tests?|verify|assert|passes?)\b", re.I)


def subscores(text: str) -> tuple[float, float, float, float]:
    spec = sum(bool(rx.search(text)) for rx in (_PATH, _SYMBOL, _ERROR, _LINE))
    ctx = max(1.0 if _FENCE.search(text) else 0.0, 0.7 if _LOG.search(text) else 0.0, 0.6 if _URL.search(text) else 0.0)
    cons = sum([bool(_MODAL.search(text)), bool(_NEGATE.search(text)), bool(_ACCEPT.search(text)),
                len(_LIST.findall(text)) >= 2, bool(_VERIFY.search(text))])
    n = len(text)
    length = n / 40.0 if n < 40 else 1.0 if n <= 300 else max(0.2, 1.0 - (n - 300) / 1700.0)
    return min(1.0, spec / 2), ctx, min(1.0, cons / 2), min(1.0, length)


def blend(sub: tuple[float, float, float, float]) -> float:
    return sum(w * s for w, s in zip(WEIGHTS, sub))


def validate(quality: np.ndarray, iterations: np.ndarray, intents: np.ndarray, min_group: int = 10) -> tuple[float | None, int]:
    """Within-intent Spearman of first-prompt quality vs follow-up count, averaged weighted by group size.
    Returns (rho or None, n used). Descriptive, not causal."""
    import polars as pl  # scipy-free so the basic tier works without scikit-learn

    def rank(v: np.ndarray) -> np.ndarray:
        return pl.Series(v).rank("average").to_numpy()

    num = den = 0.0
    for lab in sorted(set(intents.tolist())):
        m = intents == lab
        if m.sum() < min_group or np.ptp(quality[m]) == 0 or np.ptp(iterations[m]) == 0:
            continue
        rho = np.corrcoef(rank(quality[m]), rank(iterations[m]))[0, 1]
        num += float(rho) * m.sum()
        den += m.sum()
    return (round(num / den, 4), int(den)) if den >= 20 else (None, int(den))


def grouped_auc(X: np.ndarray, y: np.ndarray, groups: np.ndarray, folds: int = 5) -> float | None:
    """Grouped-CV ROC AUC of a logistic model on the four sub-scores predicting ``y`` (e.g. no correction in
    the next 2 turns). None when classes or groups are too few."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import GroupKFold

    if len(set(y.tolist())) < 2 or len(set(groups.tolist())) < folds or len(y) < 50:
        return None
    pred = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=folds).split(X, y, groups):
        if len(set(y[tr].tolist())) < 2:
            return None
        pred[te] = LogisticRegression(max_iter=200).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
    return round(float(roc_auc_score(y, pred)), 4)
