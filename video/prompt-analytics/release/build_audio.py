"""script.json -> per-scene VO (macOS `say`), the timeline (src/timeline.json), the VO track
(public/vo.wav) and word captions (public/captions.json, Remotion Caption[]) via whisperX
forced alignment of the known script. Run with the whisperX venv python."""

import json
import subprocess
from pathlib import Path

import whisperx

H = Path(__file__).resolve().parent
FPS = 30
LEAD = 0.45  # VO starts this long into its scene
# Manim scenes keep their rendered frame counts; the rest get VO + padding.
MANIM = {
    "shift": "Shift",
    "cpc": "Cpc",
    "length": "Length",
    "retry": "Retry",
    "daypart": "Daypart",
}
PAD = {"open": 0.5, "dash": 0.7, "close": 2.4}


def dur(f):
    return float(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                str(f),
            ]
        )
    )


def frames(f):
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "csv=p=0",
            str(f),
        ]
    )
    return int(out)


script = json.loads((H / "script.json").read_text())
scenes, t = [], 0.0
for s in script:
    vo = H / f"public/vo/{s['id']}.wav"
    subprocess.run(
        [
            "say",
            "-v",
            "Samantha",
            "-r",
            "182",
            "--data-format=LEI16@48000",
            "-o",
            str(vo),
            s["vo"],
        ],
        check=True,
    )
    d = dur(vo)
    n = (
        frames(H / f"public/manim/{MANIM[s['id']]}.mp4")
        if s["id"] in MANIM
        else round((LEAD + d + PAD[s["id"]]) * FPS)
    )
    assert n / FPS >= LEAD + d, f"{s['id']}: VO longer than scene"
    scenes.append(
        {
            "id": s["id"],
            "from": round(t * FPS),
            "frames": n,
            "vo": s["vo"],
            "voStart": round(t + LEAD, 3),
            "voDur": round(d, 3),
        }
    )
    t += n / FPS
total = sum(s["frames"] for s in scenes)

# VO track: each line delayed to its scene start.
ins, filt = [], []
for i, s in enumerate(scenes):
    ins += ["-i", str(H / f"public/vo/{s['id']}.wav")]
    ms = int(s["voStart"] * 1000)
    filt.append(f"[{i}]adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(scenes)))
filt.append(
    f"{mix}amix=inputs={len(scenes)}:normalize=0,apad,atrim=0:{total / FPS:.3f}[out]"
)
subprocess.run(
    [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        *ins,
        "-filter_complex",
        ";".join(filt),
        "-map",
        "[out]",
        "-ar",
        "48000",
        "-ac",
        "1",
        str(H / "public/vo.wav"),
    ],
    check=True,
)

# whisperX: align the known script to the VO track (word-level timestamps).
audio = whisperx.load_audio(str(H / "public/vo.wav"))
model, meta = whisperx.load_align_model(language_code="en", device="cpu")
segs = [
    {"text": s["vo"], "start": s["voStart"], "end": s["voStart"] + s["voDur"]}
    for s in scenes
]
res = whisperx.align(segs, model, meta, audio, "cpu", return_char_alignments=False)
caps = []
for seg in res["segments"]:
    words = [w for w in seg["words"] if "start" in w]
    for j, w in enumerate(words):
        caps.append(
            {
                "text": (" " if caps and not caps[-1].get("pageBreakAfter") else "")
                + w["word"],
                "startMs": round(w["start"] * 1000),
                "endMs": round(w["end"] * 1000),
                "timestampMs": round((w["start"] + w["end"]) * 500),
                "confidence": round(w.get("score", 1), 3),
                "pageBreakAfter": j == len(words) - 1,
            }
        )
(H / "public/captions.json").write_text(json.dumps(caps, indent=0))
(H / "src").mkdir(exist_ok=True)
(H / "src/timeline.json").write_text(
    json.dumps({"fps": FPS, "total": total, "scenes": scenes}, indent=1)
)
print(f"{total} frames = {total / FPS:.2f}s, {len(caps)} caption words")
for s in scenes:
    print(s["id"], s["from"], s["frames"])
