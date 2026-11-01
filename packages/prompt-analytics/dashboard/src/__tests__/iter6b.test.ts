import { describe, expect, it } from "vitest";
import { barRects, easeOut, linkMark, linkReducer, staggerDelay, linkDispatch, linkGet, linkProps } from "../lib/motion";
import { shares, layoutOrbit } from "../lib/orbit";
import { tiltOf } from "../components/Fx";
import type { MapNode } from "../lib/mindmap";

describe("easing and stagger", () => {
  it("easeOut spans 0..1 and clamps", () => { expect(easeOut(0)).toBe(0); expect(easeOut(1)).toBe(1); expect(easeOut(2)).toBe(1); expect(easeOut(0.5)).toBeGreaterThan(0.5); });
  it("staggerDelay is linear then capped", () => { expect(staggerDelay(0)).toBe(0); expect(staggerDelay(3)).toBe(180); expect(staggerDelay(50)).toBe(480); expect(staggerDelay(8, 70, 560)).toBe(560); });
});

describe("linked hover reducer", () => {
  it("enter sets, a stale leave keeps the new entity, a matching leave clears", () => {
    let s = linkReducer(null, { t: "enter", e: "tool:claude" });
    s = linkReducer(s, { t: "enter", e: "tool:cursor" });
    expect(linkReducer(s, { t: "leave", e: "tool:claude" })).toBe("tool:cursor");
    expect(linkReducer(s, { t: "leave", e: "tool:cursor" })).toBeNull();
    expect(linkReducer(s, { t: "clear" })).toBeNull();
  });
  it("marks highlight the entity, dim the same kind, ignore other kinds", () => {
    expect(linkMark("tool:a", "tool:a")).toBe("hl"); expect(linkMark("tool:a", "tool:b")).toBe("dim");
    expect(linkMark("tool:a", "week:2026-01-05")).toBeNull(); expect(linkMark(null, "tool:a")).toBeNull();
  });
  it("tags marks in the DOM and clears them", () => {
    document.body.innerHTML = '<i data-e="tool:a"></i><i data-e="tool:b"></i><i data-e="week:x"></i>';
    const [a, b, w] = [...document.querySelectorAll("i")];
    linkProps("tool:a").onFocus();
    expect(linkGet()).toBe("tool:a"); expect(a.hasAttribute("data-hl")).toBe(true); expect(b.hasAttribute("data-dim")).toBe(true); expect(w.hasAttribute("data-dim")).toBe(false);
    linkDispatch({ t: "clear" });
    expect(document.querySelectorAll("[data-hl],[data-dim]").length).toBe(0);
  });
});

describe("chart-type morph mapping", () => {
  it("bars share the line's y positions and grow from the baseline", () => {
    const r = barRects([10, 50, 100], (i) => i * 20, 100, 8);
    expect(r.map((b) => b.h)).toEqual([90, 50, 0]); expect(r.map((b) => b.y + b.h)).toEqual([100, 100, 100]); expect(r[1].x).toBe(16);
  });
  it("a point below the baseline never gives a negative height", () => { expect(barRects([120], () => 0, 100, 4)[0].h).toBe(0); });
});

describe("card tilt", () => {
  it("is zero at the centre and never beyond 3 degrees", () => {
    expect(tiltOf(0.5, 0.5)).toEqual({ rx: 0, ry: 0 });
    const t = tiltOf(5, -5); expect(Math.abs(t.rx)).toBeLessThanOrEqual(3); expect(Math.abs(t.ry)).toBeLessThanOrEqual(3);
  });
});

describe("sunburst fan layout", () => {
  it("shares are proportional to size, floored, and sum to 1", () => {
    const s = shares([90, 9, 1]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9); expect(s[0]).toBeGreaterThan(s[1]); expect(Math.min(...s)).toBeGreaterThan(0.04);
  });
  const node = (id: string, kind: MapNode["kind"], sessions: number, children: MapNode[] = []): MapNode => ({ id, kind, label: id, value: sessions, sessions, friction: 0, applied: 0, filter: {}, children });
  it("children sit on their depth ring, bigger subtrees get wider wedges", () => {
    const root = node("root", "root", 12, [node("root/a", "tool", 10, [node("root/a/x", "intent", 7), node("root/a/y", "intent", 3)]), node("root/b", "tool", 2)]);
    const l = layoutOrbit(root), ang = (id: string) => Math.atan2(l.get(id)!.p.y / 0.82, l.get(id)!.p.x);
    expect(l.get("root")!.p).toEqual({ x: 0, y: 0, z: 0 });
    expect(l.get("root/a/x")!.parent).toBe("root/a");
    expect(Math.hypot(l.get("root/a")!.p.x, l.get("root/a")!.p.y / 0.82)).toBeGreaterThan(200);
    expect(Number.isFinite(ang("root/b"))).toBe(true);
  });
});
