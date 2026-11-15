"""Hand-authored Lottie accents (no third-party assets): pulse rings and a drawn check badge."""
import json
from pathlib import Path

OUT = Path(__file__).parent / "public/lottie"
EO = {"x": [0.2], "y": [1]}  # ease-out (Corporate personality: cubic-bezier(0.2,0,0,1))
EI = {"x": [0.2], "y": [0]}


def kf(frames):
    """[(t, value)] -> animated property with ease-out between keys."""
    ks = [{"t": t, "s": v if isinstance(v, list) else [v], "o": EI, "i": EO} for t, v in frames[:-1]]
    t, v = frames[-1]
    return {"a": 1, "k": ks + [{"t": t, "s": v if isinstance(v, list) else [v]}]}


def st(v):
    return {"a": 0, "k": v}


def tr(**kw):
    return {"ty": "tr", "p": st([0, 0]), "a": st([0, 0]), "s": st([100, 100]), "r": st(0), "o": st(100), **kw}


def layer(ind, shapes, ip, op, s=None, o=None, p=(200, 200)):
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": f"l{ind}", "sr": 1, "ip": ip, "op": op, "st": 0, "bm": 0,
            "ks": {"o": o or st(100), "r": st(0), "p": st([*p, 0]), "a": st([0, 0, 0]), "s": s or st([100, 100, 100])},
            "shapes": shapes}


def rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1]


def anim(nm, op, layers):
    return {"v": "5.7.4", "fr": 30, "ip": 0, "op": op, "w": 400, "h": 400, "nm": nm, "ddd": 0, "assets": [], "layers": layers}


# Pulse: three rings expand and fade, staggered 20f; loops every 90f.
rings = []
for i in range(3):
    d = i * 20
    ring = {"ty": "gr", "it": [{"ty": "el", "p": st([0, 0]), "s": st([360, 360])},
                               {"ty": "st", "c": st(rgb("#1957D2")), "o": st(100), "w": st(3), "lc": 2, "lj": 2}, tr()]}
    rings.append(layer(i + 1, [ring], 0, 90, s=kf([(d, [15, 15, 100]), (d + 70, [100, 100, 100])]), o=kf([(d, 0), (d + 8, 70), (d + 70, 0)])))
(OUT / "pulse.json").write_text(json.dumps(anim("pulse", 90, rings)))

# Check badge: disc pops (overshoot), check strokes in with trim path.
G = "#1C8742"
disc = {"ty": "gr", "it": [{"ty": "el", "p": st([0, 0]), "s": st([300, 300])}, {"ty": "fl", "c": st(rgb(G)), "o": st(100)}, tr()]}
ck = {"ty": "gr", "it": [
    {"ty": "sh", "ks": st({"c": False, "v": [[-70, 5], [-20, 55], [75, -50]], "i": [[0, 0]] * 3, "o": [[0, 0]] * 3})},
    {"ty": "st", "c": st([1, 1, 1, 1]), "o": st(100), "w": st(30), "lc": 2, "lj": 2},
    {"ty": "tm", "s": st(0), "e": kf([(8, 0), (26, 100)]), "o": st(0), "m": 1}, tr()]}
pop = {"a": 1, "k": [{"t": 0, "s": [0, 0, 100], "o": {"x": [0.175], "y": [0.885]}, "i": {"x": [0.32], "y": [1.275]}}, {"t": 14, "s": [100, 100, 100]}]}
(OUT / "check.json").write_text(json.dumps(anim("check", 45, [layer(1, [ck], 0, 45), layer(2, [disc], 0, 45, s=pop)])))
print("ok")
