# ruff: noqa: F403, F405  (manim scenes use the conventional `from manim import *`)
"""Manim data-story segments for the release video. Data: ../data/insights.json (MOCK run of the
shipped builders). Charts sit right of x=-1.4; Remotion lays the headline on the left and captions below.
Each scene's run time matches its slot in src/timeline.ts (DUR)."""

import json
from pathlib import Path

from manim import *

D = json.loads(
    (Path(__file__).resolve().parent.parent / "data/insights.json").read_text()
)
INS = {i["id"].split(".2")[0]: i for i in D["insights"]}
DUR = {"Shift": 8.6, "Cpc": 6.8, "Length": 8.5, "Retry": 6.8, "Daypart": 7.5}

BG, CARD, LINE, INK, MUTED = "#E7EDF6", "#FFFFFF", "#DADEE3", "#11161F", "#575E69"
ACCENT, SOFT, GOOD, BAD, PRIOR = "#1957D2", "#E4EFFF", "#1C8742", "#C9302D", "#7D8086"
FONT = "Avenir Next"
X0, X1, Y0, Y1 = -1.0, 6.3, -2.55, 2.45  # plot box inside the card


def T(s, size=22, color=MUTED, weight=MEDIUM):
    return Text(s, font=FONT, font_size=size, color=color, weight=weight)


class Base(Scene):
    def setup(self):
        self.camera.background_color = BG

    def card(self, title):
        c = RoundedRectangle(
            corner_radius=0.22,
            width=8.3,
            height=6.7,
            fill_color=CARD,
            fill_opacity=1,
            stroke_width=0,
        )
        c.move_to([2.65, 0.05, 0])
        sh = (
            c.copy()
            .set_fill("#B9C6DA", 0.35)
            .shift(0.06 * DOWN + 0.02 * RIGHT)
            .set_z_index(-1)
        )
        t = T(title, 20, MUTED).next_to(c.get_corner(UL), DR, buff=0.32)
        self.play(
            FadeIn(sh, shift=0.25 * UP),
            FadeIn(c, shift=0.25 * UP),
            FadeIn(t, shift=0.1 * UP),
            run_time=0.6,
            rate_func=rate_functions.ease_out_cubic,
        )
        return VGroup(sh, c, t)

    def axes(self, n, ymax, yticks, fmt):
        ax = Axes(
            x_range=[-0.5, n - 0.5, 1],
            y_range=[0, ymax, ymax],
            x_length=X1 - X0,
            y_length=Y1 - Y0,
            axis_config={
                "stroke_color": LINE,
                "stroke_width": 2,
                "include_ticks": False,
                "include_tip": False,
            },
            y_axis_config={"stroke_opacity": 0},
        ).move_to([(X0 + X1) / 2, (Y0 + Y1) / 2, 0])
        grid = VGroup(
            *[
                DashedLine(
                    ax.c2p(-0.5, v),
                    ax.c2p(n - 0.5, v),
                    stroke_color=LINE,
                    stroke_width=1.5,
                    dash_length=0.06,
                )
                for v in yticks
            ]
        )
        lab = VGroup(
            *[T(fmt(v), 16).next_to(ax.c2p(-0.5, v), LEFT, buff=0.15) for v in yticks]
        )
        self.play(Create(ax), FadeIn(grid), FadeIn(lab), run_time=0.5)
        return ax

    def hold(self, used):
        self.wait(max(DUR[type(self).__name__] - used, 0.1))


class Shift(Base):
    def construct(self):
        wk = D["weekly"]
        self.card("Weekly share of sessions landing code")
        ax = self.axes(len(wk), 1.0, [0.25, 0.5, 0.75, 1.0], lambda v: f"{v:.0%}")
        pts = [ax.c2p(i, w["rate"]) for i, w in enumerate(wk)]
        line = (
            VMobject(stroke_color=PRIOR, stroke_width=3)
            .set_points_as_corners(pts)
            .set_z_index(1)
        )
        dots = VGroup(*[Dot(p, radius=0.06, color=PRIOR) for p in pts]).set_z_index(1)
        mon = VGroup(
            *[
                T(m, 16).next_to(ax.c2p(i, 0), DOWN, buff=0.18)
                for i, m in [(0, "Jan"), (4, "Feb"), (8, "Mar"), (13, "Apr")]
            ]
        )
        self.add(mon)
        self.play(
            Create(line),
            LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.06),
            run_time=1.8,
            rate_func=rate_functions.ease_in_out_sine,
        )
        k = 8
        b = sum(w["rate"] for w in wk[:k]) / k
        a = sum(w["rate"] for w in wk[k:]) / (len(wk) - k)
        lv1 = Line(
            ax.c2p(-0.3, b), ax.c2p(k - 0.5, b), color=MUTED, stroke_width=6
        ).set_z_index(2)
        step = Line(
            ax.c2p(k - 0.5, b), ax.c2p(k - 0.5, a), color=ACCENT, stroke_width=6
        ).set_z_index(2)
        lv2 = Line(
            ax.c2p(k - 0.5, a), ax.c2p(len(wk) - 0.7, a), color=ACCENT, stroke_width=6
        ).set_z_index(2)
        band = Rectangle(
            width=ax.c2p(len(wk) - 0.5, 0)[0] - ax.c2p(k - 0.5, 0)[0],
            height=Y1 - Y0,
            fill_color=SOFT,
            fill_opacity=0.9,
            stroke_width=0,
        )
        band.align_to(ax.c2p(k - 0.5, 0), LEFT).align_to(
            ax.c2p(0, 0), DOWN
        ).set_z_index(0.5)
        since = (
            T("since Mar 2", 18, ACCENT)
            .next_to(ax.c2p(k - 0.5, 0.98), RIGHT, buff=0.12)
            .set_z_index(3)
        )
        self.play(FadeIn(band), Create(lv1), FadeIn(since), run_time=0.7)
        self.play(
            Create(step),
            Create(lv2),
            run_time=0.8,
            rate_func=rate_functions.ease_out_cubic,
        )
        nb = T(f"{b:.0%}", 44, MUTED, BOLD).next_to(lv1, DOWN, buff=0.3)
        na = T(f"{a:.0%}", 56, ACCENT, BOLD).next_to(lv2, DOWN, buff=0.3).set_z_index(3)
        self.play(
            FadeIn(nb, shift=0.15 * UP),
            FadeIn(na, shift=0.2 * UP, scale=0.8),
            run_time=0.6,
        )
        self.hold(0.6 + 0.5 + 1.8 + 0.7 + 0.8 + 0.6)


class Cpc(Base):
    def construct(self):
        wk = D["weekly"]
        self.card("Weekly cost per landed change")
        ax = self.axes(len(wk), 28, [7, 14, 21, 28], lambda v: f"${v:.0f}")
        w = (ax.c2p(1, 0)[0] - ax.c2p(0, 0)[0]) * 0.62
        bars = VGroup()
        for i, r in enumerate(wk):
            h = ax.c2p(0, r["cpc"])[1] - ax.c2p(0, 0)[1]
            bars.add(
                RoundedRectangle(
                    corner_radius=0.05,
                    width=w,
                    height=max(h, 0.02),
                    fill_color=BAD if i == len(wk) - 1 else PRIOR,
                    fill_opacity=1 if i == len(wk) - 1 else 0.55,
                    stroke_width=0,
                ).move_to(ax.c2p(i, 0), aligned_edge=DOWN)
            )
        self.play(
            LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars[:-1]], lag_ratio=0.05),
            run_time=1.3,
        )
        med = DashedLine(
            ax.c2p(-0.5, 3),
            ax.c2p(len(wk) - 0.5, 3),
            color=INK,
            stroke_width=2.5,
            dash_length=0.1,
        )
        ml = (
            T("usually $3", 18, INK)
            .next_to(ax.c2p(len(wk) - 0.5, 3), UP, buff=0.1)
            .shift(1.5 * LEFT)
        )
        self.play(Create(med), FadeIn(ml), run_time=0.5)
        self.play(
            GrowFromEdge(bars[-1], DOWN),
            run_time=0.7,
            rate_func=rate_functions.ease_out_back,
        )
        big = (
            T("$25", 56, BAD, BOLD)
            .next_to(bars[-1], LEFT, buff=0.2)
            .align_to(bars[-1], UP)
        )
        self.play(
            FadeIn(big, shift=0.2 * RIGHT),
            Indicate(bars[-1], color=BAD, scale_factor=1.06),
            run_time=0.7,
        )
        self.hold(0.6 + 0.5 + 1.3 + 0.5 + 0.7 + 0.7)


class CurveScene(Base):
    key, title, xlab, bl_right, big_up = "", "", "", False, False

    def tick(self, s):
        return s

    def construct(self):
        ev = INS[self.key]["evidence"]
        cv, pick, base = ev["curve"], ev["pick"], ev["baseline"]
        n = len(cv)
        self.card(self.title)
        ax = self.axes(n, 1.0, [0.25, 0.5, 0.75, 1.0], lambda v: f"{v:.0%}")
        xl = VGroup(
            *[
                T(self.tick(c["label"]), 16).next_to(ax.c2p(i, 0), DOWN, buff=0.18)
                for i, c in enumerate(cv)
            ]
        )
        cap = T(self.xlab, 16, MUTED).next_to(xl, DOWN, buff=0.14)
        hi = [ax.c2p(i, c["hi"]) for i, c in enumerate(cv)]
        lo = [ax.c2p(i, c["lo"]) for i, c in enumerate(cv)]
        band = Polygon(
            *hi, *reversed(lo), fill_color=SOFT, fill_opacity=1, stroke_width=0
        ).set_z_index(-0.5)
        pts = [ax.c2p(i, c["rate"]) for i, c in enumerate(cv)]
        line = (
            VMobject(stroke_color=ACCENT, stroke_width=5).set_points_smoothly(pts)
            if self.smooth
            else VMobject(stroke_color=ACCENT, stroke_width=5).set_points_as_corners(
                pts
            )
        )
        dots = VGroup(*[Dot(p, radius=0.08, color=ACCENT) for p in pts])
        self.play(
            FadeIn(xl),
            FadeIn(cap),
            FadeIn(band),
            Create(line),
            LaggedStart(*[FadeIn(d, scale=0.4) for d in dots], lag_ratio=0.12),
            run_time=1.8,
            rate_func=rate_functions.ease_in_out_sine,
        )
        bl = DashedLine(
            ax.c2p(-0.5, base),
            ax.c2p(n - 0.5, base),
            color=INK,
            stroke_width=2.5,
            dash_length=0.1,
        )
        bt = T(f"everyone else {base:.0%}", 18, INK).next_to(
            ax.c2p(0, base), UP, buff=0.08
        )
        bt.align_to(
            ax.c2p(n - 0.5 if self.bl_right else -0.4, 0),
            RIGHT if self.bl_right else LEFT,
        )
        self.play(Create(bl), FadeIn(bt), run_time=0.6)
        on = (
            range(pick, n) if ev.get("cumulative") else [pick]
        )  # cumulative claims cover pick..last
        rate = sum(cv[i]["rate"] * cv[i]["n"] for i in on) / sum(cv[i]["n"] for i in on)
        col = GOOD if rate > base else BAD
        rings = VGroup(
            *[
                Circle(radius=0.26, color=col, stroke_width=5).move_to(pts[i])
                for i in on
            ]
        )
        if self.big_up:
            big = T(f"{rate:.0%}", 60, col, BOLD).next_to(
                VGroup(*[dots[i] for i in on]), UP, buff=0.45
            )
        else:
            big = T(f"{rate:.0%}", 60, col, BOLD).next_to(
                pts[pick],
                (UL if cv[pick]["rate"] > cv[pick - 1]["rate"] else DL)
                if pick == n - 1
                else DR,
                buff=0.3,
            )
        self.play(
            *[dots[i].animate.set_color(col).scale(1.4) for i in on],
            Create(rings),
            FadeIn(big, scale=0.8),
            run_time=0.7,
            rate_func=rate_functions.ease_out_back,
        )
        self.hold(0.6 + 0.5 + 1.8 + 0.6 + 0.7)


class Length(CurveScene):
    key, title, xlab, smooth = (
        "works.prompt_length",
        "Sessions landing code, by opening prompt length",
        "characters",
        True,
    )
    bl_right, big_up = True, True


class Retry(CurveScene):
    key, title, xlab, smooth = (
        "friction.retry_cliff",
        "Sessions landing code, by rephrase retries",
        "retries",
        False,
    )
    bl_right = True


class Daypart(CurveScene):
    key, title, xlab, smooth = (
        "time.daypart",
        "Sessions landing code, by start time",
        "start hour (UTC)",
        True,
    )
    bl_right, big_up = True, True

    def tick(self, s):
        return (
            s.replace("am", "a")
            .replace("pm", "p")
            .replace("12a-", "12-")
            .replace("12p-", "12-")
        )
