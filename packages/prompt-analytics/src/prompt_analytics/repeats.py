"""Repeated prompts: the same ask typed again in other sessions (candidates for a slash command).

Input is already-redacted text. Deterministic: identical text after normalising, then (when scikit-learn is present)
groups in the same topic cluster merge at TF-IDF cosine >= COSINE. Cap: top MAX_REPEATS with count >= MIN_COUNT.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Sequence

MIN_COUNT = 3  # occurrences
MIN_SESSIONS = (
    2  # a repeat spans sessions; one chat pasting itself is a loop, not a habit
)
MIN_WORDS = 4
MAX_REPEATS = 10
MAX_SESSION_IDS = 25
COSINE = 0.9
SNIPPET = 160
MAX_DISTINCT = (
    2000  # ponytail: dense O(n^2) per cluster over the first 2000 distinct texts
)

_NOISE = re.compile(r"[^\w\[\]:]+")
_ACK = {"continue", "go on", "yes", "ok", "okay", "thanks", "thank you", "proceed"}


def norm(text: str) -> str:
    return " ".join(_NOISE.sub(" ", text.lower()).split())


def _merge_cosine(keys: list[str], cluster: dict[str, int]) -> dict[str, str]:
    """Map each distinct normalised text to the representative it merges into (itself by default)."""
    rep = {k: k for k in keys}
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
    except ImportError:
        return rep
    by_cluster: dict[int, list[str]] = defaultdict(list)
    for k in keys[:MAX_DISTINCT]:
        if cluster.get(k, -1) >= 0:
            by_cluster[cluster[k]].append(k)
    for _, ks in sorted(by_cluster.items()):
        if len(ks) < 2:
            continue
        try:
            X = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True).fit_transform(ks)
        except ValueError:
            continue
        sim = (X @ X.T).toarray()
        for i, k in enumerate(
            ks
        ):  # keys arrive sorted by frequency: the first one in a group is its representative
            if rep[k] != k:
                continue
            for j in range(i + 1, len(ks)):
                if rep[ks[j]] == ks[j] and sim[i, j] >= COSINE:
                    rep[ks[j]] = k
    return rep


def find_repeats(
    rows: Sequence[tuple[str, str, int]], semantic: bool = False
) -> list[dict]:
    """``rows``: (session_id, redacted text, cluster_id or -1), newest session first.
    Returns [{cluster, count, exemplar, sessions}] by count desc."""
    seen: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for sid, text, cid in rows:
        t = " ".join((text or "").split())
        k = norm(t)
        if len(k.split()) < MIN_WORDS or k in _ACK or t.startswith("/"):
            continue
        seen[k].append((sid, t, cid))
    keys = sorted(seen, key=lambda k: (-len(seen[k]), k))
    rep = (
        _merge_cosine(keys, {k: seen[k][0][2] for k in keys})
        if semantic
        else {k: k for k in keys}
    )
    groups: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for k in keys:
        groups[rep[k]].extend(seen[k])
    out = []
    for k, g in groups.items():
        sids = list(dict.fromkeys(s for s, _, _ in g))
        if len(g) < MIN_COUNT or len(sids) < MIN_SESSIONS:
            continue
        clusters = sorted({c for _, _, c in g if c >= 0})
        out.append(
            {
                "cluster": clusters[0] if len(clusters) == 1 else -1,
                "count": len(g),
                "exemplar": g[0][1][:SNIPPET],
                "sessions": sids[:MAX_SESSION_IDS],
                "_k": k,
            }
        )
    out.sort(key=lambda r: (-r["count"], r["_k"]))
    return [{k: v for k, v in r.items() if k != "_k"} for r in out[:MAX_REPEATS]]
