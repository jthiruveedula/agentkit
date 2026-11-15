"""Success-rate curves over ordered bins: a Wilson band per bin, and at most one bin that provably stands apart."""

from __future__ import annotations

from statistics import NormalDist

from .whatworks import wilson

MIN_BIN = 15
MIN_ABS = 0.1
ALPHA = 0.05


def standout(
    labels: list[str], k: list[int], n: list[int], cumulative: bool = False
) -> tuple[list[dict], dict | None]:
    """``k[i]`` successes out of ``n[i]`` sessions in ordered bin ``i``. Returns (curve, pick).

    curve: one ``{label, rate, lo, hi, n}`` per bin, 95% Wilson band.
    pick: the bin whose rate differs from every other session by >= MIN_ABS with a Newcombe-Wilson interval that
    excludes 0 after a Bonferroni correction for the number of bins tested; None when nothing clears that bar.
    ``cumulative`` tests "bin i or later" against "earlier", for dose-style axes such as retries or length;
    otherwise each bin is tested against the rest. Either way the largest significant gap wins.
    """
    curve = []
    for lab, ki, ni in zip(labels, k, n):
        p, lo, hi = wilson(ki, ni)
        curve.append(
            {
                "label": lab,
                "rate": round(p, 4),
                "lo": round(lo, 4),
                "hi": round(hi, 4),
                "n": int(ni),
            }
        )
    K, N = sum(k), sum(n)
    groups = []
    for i in range(1 if cumulative else 0, len(n)):
        gk, gn = (sum(k[i:]), sum(n[i:])) if cumulative else (k[i], n[i])
        if gn >= MIN_BIN and N - gn >= MIN_BIN:
            groups.append((i, gk, gn))
    if not groups:
        return curve, None
    z = NormalDist().inv_cdf(1 - ALPHA / (2 * len(groups)))
    hits = []
    for i, gk, gn in groups:
        p1, l1, u1 = wilson(gk, gn, z)
        p0, l0, u0 = wilson(K - gk, N - gn, z)
        d = p1 - p0
        lo = d - ((p1 - l1) ** 2 + (u0 - p0) ** 2) ** 0.5
        hi = d + ((u1 - p1) ** 2 + (p0 - l0) ** 2) ** 0.5
        if abs(d) >= MIN_ABS and (lo > 0 or hi < 0):
            hits.append(
                {
                    "index": i,
                    "rate": p1,
                    "rest": p0,
                    "diff": d,
                    "ci": [lo, hi],
                    "n": int(gn),
                    "tested": len(groups),
                }
            )
    return curve, max(hits, key=lambda h: abs(h["diff"]), default=None)


if __name__ == "__main__":
    lab = ["a", "b", "c", "d"]
    assert standout(lab, [50, 50, 50, 50], [100] * 4)[1] is None  # flat: no claim
    assert standout(lab, [52, 47, 55, 49], [100] * 4)[1] is None  # noise: no claim
    assert standout(lab, [5, 5, 5, 0], [10, 10, 10, 10])[1] is None  # tiny bins
    assert standout(lab, [50, 50, 85, 50], [100] * 4)[1]["index"] == 2  # sweet spot
    c, p = standout(lab, [60, 58, 25, 20], [100] * 4, cumulative=True)
    assert p["index"] == 2 and p["diff"] < 0 and len(c) == 4  # cliff at the third bin
    assert standout(lab, [20, 40, 60, 80], [100] * 4, cumulative=True)[1]["diff"] > 0
    print("ok")
