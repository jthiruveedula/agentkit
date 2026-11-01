import { describe, expect, it } from "vitest";
import { spread } from "../lib/orbit";

const n = (id: string, x: number, depth = 1, r = 8) => ({ id, p: { x, y: 0, z: 0 }, r, depth }) as never;

describe("orbit spread", () => {
  it("separates overlapping siblings to r+r+2*pad, keeps root fixed, deterministic", () => {
    const mk = () => [n("root", 0, 0, 26), n("a", 1), n("b", 2)] as { id: string; p: { x: number; y: number; z: number }; r: number }[];
    const A = mk(), B = mk();
    spread(A as never); spread(B as never);
    expect(A.map((o) => o.p)).toEqual(B.map((o) => o.p));
    const d = (a: { p: { x: number; y: number; z: number } }, b: typeof a) => Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y, a.p.z - b.p.z);
    expect(d(A[1], A[2])).toBeGreaterThanOrEqual(8 + 8 + 12 - 0.5);
    expect(A[0].p).toEqual({ x: 0, y: 0, z: 0 });
  });
});
