import { describe, expect, it } from "vitest";
import { flipFrom, isFresh, shouldRefresh } from "../lib/live";

describe("live gate", () => {
  it("refreshes only over http, visible, after the gap", () => {
    expect(shouldRefresh("file:", true, 100000, 0)).toBe(false);
    expect(shouldRefresh("http:", false, 100000, 0)).toBe(false);
    expect(shouldRefresh("http:", true, 10000, 0)).toBe(false);
    expect(shouldRefresh("http:", true, 20000, 0)).toBe(true);
  });
  it("fresh only on a different non-empty stamp", () => {
    expect(isFresh("a", "b")).toBe(true);
    expect(isFresh("a", "a")).toBe(false);
    expect(isFresh("a", "")).toBe(false);
  });
});
describe("flipFrom", () => {
  it("starts centred on the origin box and clamps scale", () => {
    const f = flipFrom({ x: 0, y: 100, w: 200, h: 40 }, { x: 800, y: 0, w: 480, h: 900 });
    expect(f.dx).toBe(100 - 1040); expect(f.dy).toBe(120 - 450);
    expect(f.s).toBe(0.3);
  });
  it("never exceeds 1 and survives zero size", () => {
    expect(flipFrom({ x: 0, y: 0, w: 900, h: 900 }, { x: 0, y: 0, w: 100, h: 100 }).s).toBe(1);
    expect(Number.isFinite(flipFrom({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 0 }).s)).toBe(true);
  });
});
