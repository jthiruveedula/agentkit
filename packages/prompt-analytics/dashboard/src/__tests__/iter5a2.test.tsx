// Iteration 5a-2: map fit by projected bounds, calendar touch toggle, whole-export labels, header structure.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";
import { baseScale, fitOf, project, screenFit, type Cam, type ONode } from "../lib/orbit";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(sample as never)} />)); };

describe("screenFit", () => {
  // a lopsided cluster: the root at the origin and everything else far to one side
  const nodes: ONode[] = [{ x: 0, y: 0, z: 0, r: 20 }, { x: 400, y: 30, z: 0, r: 10 }, { x: 500, y: -40, z: 50, r: 10 }, { x: 450, y: 80, z: -30, r: 10 }]
    .map((n, i) => ({ id: `n${i}`, kind: "tool" as const, depth: 1, parent: null, p: { x: n.x, y: n.y, z: n.z }, r: n.r }));
  const f = fitOf(nodes), W = 1000, H = 600, base = baseScale(W, H, f.radius);
  const c0: Cam = { yaw: 0.55, pitch: 0.34, zoom: 1, tx: f.center.x, ty: f.center.y, tz: f.center.z };
  it("centres the projected bounds and fills the target box", () => {
    const c = screenFit(nodes, c0, W, H, base, f.radius, 800, 480);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const n of nodes) { const q = project(n.p, c, W, H, base, f.radius)!, r = n.r * q.s; x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r); y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r); }
    expect(Math.abs((x0 + x1) / 2 - W / 2)).toBeLessThan(25);
    expect(Math.abs((y0 + y1) / 2 - H / 2)).toBeLessThan(25);
    expect(x1 - x0).toBeLessThanOrEqual(800 * 1.05);
    expect(y1 - y0).toBeLessThanOrEqual(480 * 1.05);
  });
  it("returns the input camera for no nodes", () => expect(screenFit([], c0, W, H, base, f.radius, 800, 480)).toEqual(c0));
});

describe("5a-2 UI", () => {
  it("Exposure and Recommendations say they ignore filters", () => {
    mount();
    expect(el.querySelector("#s-exposure")?.textContent).toMatch(/whole export/);
    expect(el.querySelector("#s-recs")?.textContent).toMatch(/whole export/);
  });
  it("header keeps the palette button and the toolbar row is its own sticky group", () => {
    mount();
    expect(el.querySelector(".top-tools .kbd")).toBeTruthy();
    expect(el.querySelector(".top-tools .fbtn")).toBeTruthy();
    expect(el.querySelector(".brand .glyph")).toBeTruthy();
  });
  it("3D calendar: Tap to rotate toggles Done and back", () => {
    mount();
    act(() => { [...el.querySelectorAll<HTMLButtonElement>("button.tog3")][0]?.click(); });
    const b = el.querySelector<HTMLButtonElement>(".cal-touch");
    expect(b?.textContent).toBe("Tap to rotate");
    act(() => b!.click());
    expect(el.querySelector(".cal-touch")?.textContent).toBe("Done");
    act(() => el.querySelector<HTMLButtonElement>(".cal-touch")!.click());
    expect(el.querySelector(".cal-touch")?.textContent).toBe("Tap to rotate");
  });
});
