"""Topic clusters (HDBSCAN, KMeans fallback), c-TF-IDF labels, medoid exemplars, 2D galaxy projection."""

from __future__ import annotations

import numpy as np

EXTRA_STOP = {"redacted", "user", "please", "thanks", "thank", "just", "want", "need", "like", "make", "use", "using", "can", "you"}
HDBSCAN_MAX_N = 8000  # ponytail: sklearn HDBSCAN is superlinear; above this go straight to MiniBatchKMeans


def reduce(E: np.ndarray, dims: int = 32) -> np.ndarray:
    from sklearn.decomposition import PCA

    k = min(dims, E.shape[1], E.shape[0] - 1)
    if k < 2:
        return E
    Z = PCA(n_components=k, random_state=0).fit_transform(E)
    return (Z / np.maximum(np.linalg.norm(Z, axis=1, keepdims=True), 1e-12)).astype(np.float32)


def _kmeans(Z: np.ndarray) -> np.ndarray:
    from sklearn.cluster import MiniBatchKMeans

    n = len(Z)
    k = int(min(max(2, n // 2), np.clip(round((n / 2) ** 0.5), 12, 60)))
    return MiniBatchKMeans(n_clusters=k, random_state=0, n_init=3, batch_size=2048).fit_predict(Z).astype(int)


def cluster(E: np.ndarray) -> tuple[np.ndarray, str]:
    """(labels with -1 = unclustered, method). Deterministic."""
    n = len(E)
    if n < 4:
        return np.zeros(n, dtype=int), "single"
    Z = reduce(E)
    if 45 <= n <= HDBSCAN_MAX_N:
        from sklearn.cluster import HDBSCAN

        lab = HDBSCAN(min_cluster_size=max(15, n // 2000), min_samples=5, cluster_selection_method="leaf").fit_predict(Z)
        k = len(set(lab.tolist()) - {-1})
        if k >= 2 and (lab == -1).mean() <= 0.5:
            return lab.astype(int), "hdbscan"
    return _kmeans(Z), "kmeans"


def ctfidf_labels(texts: list[str], labels: np.ndarray, top_k: int = 6) -> dict[int, list[str]]:
    """Top ``top_k`` terms per cluster by class-based TF-IDF: tf(t,c) * log(1 + A / f_t)."""
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

    ids = sorted(set(labels.tolist()) - {-1})
    if not ids:
        return {}
    docs = [" ".join(t for t, l in zip(texts, labels) if l == c) for c in ids]
    cv = CountVectorizer(stop_words=sorted(ENGLISH_STOP_WORDS | EXTRA_STOP), token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z_]{2,}\b", lowercase=True)
    try:
        X = cv.fit_transform(docs).toarray().astype(float)
    except ValueError:
        return {c: [] for c in ids}
    terms = cv.get_feature_names_out()
    tf = X / np.maximum(X.sum(axis=1, keepdims=True), 1)
    idf = np.log(1 + X.sum(axis=1).mean() / np.maximum(X.sum(axis=0), 1))
    S = tf * idf
    out = {}
    for row, c in enumerate(ids):
        order = sorted(range(len(terms)), key=lambda j: (-S[row, j], terms[j]))
        out[c] = [str(terms[j]) for j in order[:top_k] if S[row, j] > 0]
    return out


def medoids(Z: np.ndarray, labels: np.ndarray) -> dict[int, int]:
    """Row index of the member closest to each cluster's centroid."""
    out = {}
    for c in sorted(set(labels.tolist()) - {-1}):
        idx = np.nonzero(labels == c)[0]
        cen = Z[idx].mean(axis=0)
        out[c] = int(idx[np.argmin(np.linalg.norm(Z[idx] - cen, axis=1))])
    return out


def project2d(E: np.ndarray) -> np.ndarray:
    """UMAP (cosine, seed 42) when the viz extra is installed, else PCA."""
    n = len(E)
    if n < 3:
        return np.zeros((n, 2), dtype=np.float32)
    try:
        import umap  # type: ignore[import-not-found]

        return np.asarray(umap.UMAP(n_components=2, metric="cosine", random_state=42, n_neighbors=min(15, n - 1)).fit_transform(E), dtype=np.float32)
    except ImportError:
        from sklearn.decomposition import PCA

        return PCA(n_components=2, random_state=0).fit_transform(E).astype(np.float32)
