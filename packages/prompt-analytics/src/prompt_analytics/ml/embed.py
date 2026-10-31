"""Embedder protocol: fastembed | model2vec | tfidf_svd, all lazily imported.

Pretrained backends are cached in ``embeddings_cache`` keyed by (HMAC of text, backend).
tfidf_svd is fitted on the corpus itself so its vectors are corpus-relative and never cached.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

import duckdb
import numpy as np

from ..analytics.metrics import put
from ..privacy import hmac_hex

MAX_CHARS = 1500  # ~256 tokens


class Embedder(Protocol):
    name: str
    pretrained: bool

    def fit(self, texts: list[str]) -> None: ...
    def embed(self, texts: list[str]) -> np.ndarray: ...


def l2(x: np.ndarray) -> np.ndarray:
    return (x / np.maximum(np.linalg.norm(x, axis=1, keepdims=True), 1e-12)).astype(np.float32)


class TfidfSvd:
    name = "tfidf"
    pretrained = False

    def __init__(self, dims: int = 100):
        self.dims = dims
        self.vec: Any = None
        self.svd: Any = None

    def fit(self, texts: list[str]) -> None:
        from sklearn.decomposition import TruncatedSVD
        from sklearn.feature_extraction.text import TfidfVectorizer

        docs = [t[:MAX_CHARS] for t in texts]
        for min_df in (3, 1):
            self.vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=min_df, max_features=50000, dtype=np.float32)
            try:
                X = self.vec.fit_transform(docs)
                break
            except ValueError:  # empty vocabulary at min_df=3 on tiny corpora
                X = None
        if X is None:
            raise ValueError("tfidf: empty vocabulary")
        k = min(self.dims, X.shape[1] - 1, X.shape[0] - 1)
        self.svd = TruncatedSVD(n_components=k, random_state=0) if k >= 2 else None
        if self.svd is not None:
            self.svd.fit(X)

    def embed(self, texts: list[str]) -> np.ndarray:
        X = self.vec.transform([t[:MAX_CHARS] for t in texts])
        return l2(self.svd.transform(X) if self.svd is not None else X.toarray())


class FastEmbed:
    pretrained = True

    def __init__(self, models_dir: Path | None):
        from fastembed import TextEmbedding

        self.name = "fastembed:BAAI/bge-small-en-v1.5"
        self.m = TextEmbedding("BAAI/bge-small-en-v1.5", cache_dir=str(models_dir) if models_dir else None)

    def fit(self, texts: list[str]) -> None:
        pass

    def embed(self, texts: list[str]) -> np.ndarray:
        return l2(np.array(list(self.m.embed([t[:MAX_CHARS] for t in texts])), dtype=np.float32))


class Model2Vec:
    pretrained = True

    def __init__(self) -> None:
        from model2vec import StaticModel

        self.name = "model2vec:minishlab/potion-base-8M"
        self.m = StaticModel.from_pretrained("minishlab/potion-base-8M")

    def fit(self, texts: list[str]) -> None:
        pass

    def embed(self, texts: list[str]) -> np.ndarray:
        return l2(np.asarray(self.m.encode([t[:MAX_CHARS] for t in texts]), dtype=np.float32))


def get_embedder(backend: str | None, models_dir: Path | None = None) -> tuple[Embedder, list[str]]:
    """Best installed backend (or the requested one), degrading to tfidf with a warning."""
    warnings: list[str] = []
    order = ["fastembed", "model2vec", "tfidf"] if backend in (None, "auto") else [backend, "tfidf"]
    for name in order:
        if name == "tfidf":
            return TfidfSvd(), warnings
        try:
            return (FastEmbed(models_dir) if name == "fastembed" else Model2Vec()), warnings
        except Exception as e:  # ImportError, missing/offline model, onnx runtime problems
            if backend not in (None, "auto"):
                warnings.append(f"embed backend {name} unavailable ({type(e).__name__}); using tfidf")
    return TfidfSvd(), warnings


def embed_cached(con: duckdb.DuckDBPyConnection, emb: Embedder, texts: list[str], salt: bytes, tmp_dir: Path | None = None) -> np.ndarray:
    """Embed ``texts`` (any order, duplicates ok). Pretrained vectors are read from / written to the cache."""
    import polars as pl

    uniq = sorted(set(texts))
    if not uniq:
        return np.zeros((0, 1), dtype=np.float32)
    if not emb.pretrained:
        vecs = dict(zip(uniq, emb.embed(uniq)))
        return np.stack([vecs[t] for t in texts])
    keys = {t: hmac_hex(salt, t.encode()) for t in uniq}
    have = {k: np.asarray(v, dtype=np.float32) for k, v in con.execute(
        "SELECT text_hmac, vec FROM embeddings_cache WHERE backend = ?", [emb.name]).fetchall()}
    miss = [t for t in uniq if keys[t] not in have]
    if miss:
        new = emb.embed(miss)
        put(con, "embeddings_cache", pl.DataFrame(
            {"text_hmac": [keys[t] for t in miss], "backend": [emb.name] * len(miss), "vec": [v.tolist() for v in new]},
            schema={"text_hmac": pl.Utf8, "backend": pl.Utf8, "vec": pl.List(pl.Float32)}), tmp_dir)
        have.update({keys[t]: v for t, v in zip(miss, new)})
    return np.stack([have[keys[t]] for t in texts])


def near_dupes(E: np.ndarray, codes: np.ndarray, thr: float = 0.95, cap: int = 4000) -> dict[str, float]:
    """Share of prompts with an earlier near-identical prompt from ANOTHER session. ponytail: first ``cap`` prompts, dense O(cap^2)."""
    E, codes = E[:cap], codes[:cap]
    if len(E) < 2:
        return {"n": 0, "of": len(E), "share": 0.0}
    hit = (E @ E.T >= thr) & (codes[:, None] != codes[None, :]) & np.triu(np.ones((len(E), len(E)), dtype=bool), 1)
    n = int(hit.any(axis=0).sum())
    return {"n": n, "of": len(E), "share": n / len(E)}
