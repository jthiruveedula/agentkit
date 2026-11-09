import { describe, expect, it } from "vitest";
import { barRects, easeOut, linkMark, linkReducer, staggerDelay, linkDispatch, linkGet, linkProps } from "../lib/motion";
import { partition, spans, TAU, arcOf, winOf } from "../lib/sunburst";
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
  it("spans are proportional to value, floored, and sum to 1", () => {
    const s = spans([90, 9, 1]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9); expect(s[0]).toBeGreaterThan(s[1]); expect(Math.min(...s)).toBeGreaterThanOrEqual(0.025 - 1e-12);
  });
  const node = (id: string, kind: MapNode["kind"], sessions: number, children: MapNode[] = []): MapNode => ({ id, kind, label: id, value: sessions, sessions, friction: 0, applied: 0, struggled: 0, rated: 0, priced: 0, filter: {}, children });
  it("children nest inside their parent's slice on the next ring, bigger subtrees get wider slices", () => {
    const root = node("root", "root", 12, [node("root/a", "tool", 10, [node("root/a/x", "intent", 7), node("root/a/y", "intent", 3)]), node("root/b", "tool", 2)]);
    const l = partition(root), a = l.get("root/a")!, x = l.get("root/a/x")!, y = l.get("root/a/y")!;
    expect([l.get("root")!.x0, l.get("root")!.x1]).toEqual([0, 1]);
    expect(x.parent).toBe("root/a"); expect(x.depth).toBe(2);
    expect(x.x0).toBe(a.x0); expect(y.x1).toBe(a.x1); expect(x.x1 - x.x0).toBeGreaterThan(y.x1 - y.x0);
    const arc = arcOf(a, winOf(l.get("root")!), 100);
    expect(arc.a1 - arc.a0).toBeCloseTo((10 / 12) * TAU, 9);
  });
});
