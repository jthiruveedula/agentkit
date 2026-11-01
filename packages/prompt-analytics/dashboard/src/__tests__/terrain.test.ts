import { describe, expect, it } from "vitest";
import { bars, fitScale, inQuad, keyStep, pickBar, proj, T_DEFAULT, type TCam, type TGrid } from "../lib/terrain";

const g: TGrid = { cols: 24, rows: 7, hmax: 3, dy: 2.2 };
const top: TCam = { ...T_DEFAULT, pitch: 90 };
const W = 400, H = 280;

describe("terrain projection", () => {
  it("plan view ignores height (orthographic: no misleading perspective)", () => {
    const a = proj(5, 3, 0, top, g, 10, W, H), b = proj(5, 3, 6, top, g, 10, W, H);
    expect(b.x).toBeCloseTo(a.x); expect(b.y).toBeCloseTo(a.y);
  });
  it("same value gives the same on-screen height for near and far bars (heights comparable)", () => {
    const cam: TCam = { ...T_DEFAULT, pitch: 50 }, vals = new Array(168).fill(0); vals[2] = 10; vals[6 * 24 + 2] = 10;
    const sc = fitScale(cam, g, W, H), bs = bars(vals, 10, cam, g, sc, W, H);
    const ht = (i: number) => { const q = bs.find((b) => b.i === i)!.quads.find((x) => x.kind === "top")!.pts[0].y; const f = bs.find((b) => b.i === i)!.quads.find((x) => x.kind === "side")!.pts; return f[0].y - f[3].y + 0 * q; };
    expect(ht(2)).toBeCloseTo(ht(6 * 24 + 2), 5);
  });
  it("height is proportional from a zero baseline", () => {
    const vals = new Array(168).fill(0); vals[0] = 5; vals[1] = 10;
    const bs = bars(vals, 10, { ...T_DEFAULT, pitch: 45 }, g, 10, W, H);
    const h = (i: number) => { const s = bs.find((b) => b.i === i)!.quads.find((x) => x.kind === "side")!.pts; return s[0].y - s[3].y; };
    expect(h(1) / h(0)).toBeCloseTo(2, 5);
  });
  it("zero cells keep a flat, hoverable top and no sides", () => {
    const bs = bars(new Array(168).fill(0), 10, T_DEFAULT, g, 10, W, H);
    expect(bs.every((b) => b.quads.length === 1 && b.quads[0].kind === "top")).toBe(true);
  });
  it("painter order: far first", () => {
    const bs = bars(new Array(168).fill(1), 1, { ...T_DEFAULT, pitch: 40 }, g, 10, W, H);
    for (let i = 1; i < bs.length; i++) expect(bs[i].depth).toBeGreaterThanOrEqual(bs[i - 1].depth);
  });
  it("fit keeps every corner inside the canvas at several angles", () => {
    for (const [yaw, pitch] of [[0, 90], [0, 66], [45, 40], [90, 30], [180, 66]]) {
      const c: TCam = { yaw, pitch, zoom: 1, tx: 0, ty: 0 }, sc = fitScale(c, g, W, H), bs = bars(new Array(168).fill(1), 1, c, g, sc, W, H);
      for (const b of bs) for (const q of b.quads) for (const p of q.pts) { expect(p.x).toBeGreaterThan(-1); expect(p.x).toBeLessThan(W + 1); expect(p.y).toBeGreaterThan(-1); expect(p.y).toBeLessThan(H + 1); }
    }
  });
});

describe("picking", () => {
  it("point in quad, both windings", () => {
    const q = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(inQuad(q, 5, 5)).toBe(true); expect(inQuad(q, 11, 5)).toBe(false); expect(inQuad([...q].reverse(), 5, 5)).toBe(true);
  });
  it("finds the cell under the pointer in plan view, and -1 outside", () => {
    const sc = fitScale(top, g, W, H), bs = bars(new Array(168).fill(1), 1, top, g, sc, W, H);
    const p = proj(3.5, 2.5, 0, top, g, sc, W, H);
    // plan view: the centring offset is applied in bars(), so aim at that bar's own top face
    const t = bs.find((b) => b.i === 2 * 24 + 3)!.quads[0].pts, cx = (t[0].x + t[2].x) / 2, cy = (t[0].y + t[2].y) / 2;
    expect(pickBar(bs, cx, cy)).toBe(2 * 24 + 3); expect(pickBar(bs, -50, -50)).toBe(-1); expect(p).toBeTruthy();
  });
  it("a tall near bar wins over the one behind it", () => {
    const cam: TCam = { ...T_DEFAULT, pitch: 35 }, vals = new Array(168).fill(0); vals[24 * 3] = 10; vals[24 * 4] = 10;
    const sc = fitScale(cam, g, W, H), bs = bars(vals, 10, cam, g, sc, W, H);
    const t = bs.find((b) => b.i === 24 * 4)!.quads.find((q) => q.kind === "top")!.pts, x = (t[0].x + t[2].x) / 2, y = (t[0].y + t[2].y) / 2;
    expect(pickBar(bs, x, y)).toBe(24 * 4);
  });
});

describe("keyboard", () => {
  it("arrows rotate/tilt (tilt clamped), +/- zoom, others ignored", () => {
    expect(keyStep(T_DEFAULT, "ArrowRight")?.yaw).toBe(8);
    expect(keyStep({ ...T_DEFAULT, pitch: 90 }, "ArrowUp")?.pitch).toBe(90);
    expect(keyStep({ ...T_DEFAULT, pitch: 25 }, "ArrowDown")?.pitch).toBe(25);
    expect(keyStep(T_DEFAULT, "+")!.zoom).toBeGreaterThan(1); expect(keyStep(T_DEFAULT, "-")!.zoom).toBeLessThan(1);
    expect(keyStep(T_DEFAULT, "a")).toBeNull();
  });
});
