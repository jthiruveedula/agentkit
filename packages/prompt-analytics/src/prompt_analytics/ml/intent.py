"""Seed-centroid intent classification with regex priors (seeds live in intents.toml)."""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

import numpy as np

INTENTS_PATH = Path(__file__).resolve().parent.parent / "intents.toml"
PRIOR = 0.05


@dataclass
class IntentSpec:
    version: str
    labels: list[str]
    seeds: dict[str, list[str]]
    patterns: dict[str, re.Pattern[str]]
    thresholds: dict[str, tuple[float, float]]

    def thresholds_for(self, backend: str) -> tuple[float, float]:
        key = "tfidf" if backend.startswith("tfidf") else "default"
        return self.thresholds.get(key, self.thresholds["default"])

    def seed_texts(self) -> tuple[list[str], list[str]]:
        texts, labs = [], []
        for lab in self.labels:
            for s in self.seeds[lab]:
                texts.append(s)
                labs.append(lab)
        return texts, labs


def load_intents(path: Path | None = None) -> IntentSpec:
    raw = tomllib.loads((path or INTENTS_PATH).read_text())
    labels = sorted(raw["intents"])
    return IntentSpec(
        version=str(raw["version"]), labels=labels,
        seeds={k: list(raw["intents"][k]["seeds"]) for k in labels},
        patterns={k: re.compile("|".join(raw["intents"][k].get("patterns", [])) or r"(?!x)x", re.I) for k in labels},
        thresholds={k: (float(v[0]), float(v[1])) for k, v in raw["thresholds"].items()},
    )


def regex_hits(texts: list[str], spec: IntentSpec) -> np.ndarray:
    """(n, K) regex match counts capped at 2, columns ordered as ``spec.labels``."""
    out = np.zeros((len(texts), len(spec.labels)), dtype=np.float32)
    for j, lab in enumerate(spec.labels):
        rx = spec.patterns[lab]
        for i, t in enumerate(texts):
            out[i, j] = min(2, len(rx.findall(t)))
    return out


def centroids(E_seed: np.ndarray, seed_labels: list[str], labels: list[str]) -> np.ndarray:
    C = np.stack([E_seed[[i for i, l in enumerate(seed_labels) if l == lab]].mean(axis=0) for lab in labels])
    return C / np.maximum(np.linalg.norm(C, axis=1, keepdims=True), 1e-12)


def classify(E: np.ndarray, C: np.ndarray, hits: np.ndarray, labels: list[str], min_score: float, margin: float) -> tuple[list[str], np.ndarray]:
    """Best class by cosine + PRIOR*hits; ``other`` when the score is low or the margin to #2 is thin."""
    if len(E) == 0:
        return [], np.zeros(0, dtype=np.float32)
    S = E @ C.T + PRIOR * hits
    order = np.argsort(-S, axis=1, kind="stable")
    top = S[np.arange(len(S)), order[:, 0]]
    second = S[np.arange(len(S)), order[:, 1]] if S.shape[1] > 1 else np.zeros(len(S))
    out = [labels[order[i, 0]] if top[i] >= min_score and top[i] - second[i] >= margin else "other" for i in range(len(S))]
    return out, np.clip(top, 0.0, 1.0)
