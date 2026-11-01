import { describe, expect, it } from "vitest";
import { buildTree } from "../lib/mindmap";
import { baseScale, easeInOut, fibDir, fitOf, layoutOrbit, len, lerpCam, pickNode, project, type Cam } from "../lib/orbit";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const rows = [
  row({ id: "a", source: "claude_code", intent: "bugfix", project: "web" }), row({ id: "b", source: "claude_code", intent: "feature", project: "api" }),
  row({ id: "c", source: "cursor", intent: "bugfix", project: "web" }), row({ id: "d", source: "copilot", intent: "docs", project: "web" }),
];
const cam: Cam = { yaw: 0, pitch: 0, zoom: 1, tx: 0, ty: 0, tz: 0 };

describe("orbit layout", () => {
  const root = buildTree(rows), lay = layoutOrbit(root);
  it("puts the root at the origin and every node in the layout", () => {
    expect(lay.get("root")!.p).toEqual({ x: 0, y: 0, z: 0 });
    const count = (n: typeof root): number => 1 + n.children.reduce((a, c) => a + count(c), 0);
    expect(lay.size).toBe(count(root));
  });
  it("is deterministic and keeps children away from their parent", () => {
    expect([...layoutOrbit(buildTree(rows)).values()].map((n) => n.p)).toEqual([...lay.values()].map((n) => n.p));
    for (const n of lay.values()) if (n.parent) expect(len({ x: n.p.x - lay.get(n.parent)!.p.x, y: n.p.y - lay.get(n.parent)!.p.y, z: n.p.z - lay.get(n.parent)!.p.z })).toBeGreaterThan(40);
  });
  it("spreads tools over distinct points", () => {
    const tools = [...lay.values()].filter((n) => n.kind === "tool");
    expect(new Set(tools.map((t) => `${t.p.x.toFixed(1)},${t.p.y.toFixed(1)},${t.p.z.toFixed(1)}`)).size).toBe(tools.length);
  });
  it("fibDir returns unit vectors", () => { for (let i = 0; i < 7; i++) expect(len(fibDir(i, 7))).toBeCloseTo(1, 6); });
  it("fitOf bounds all nodes", () => {
    const f = fitOf([...lay.values()]);
    for (const n of lay.values()) expect(len({ x: n.p.x - f.center.x, y: n.p.y - f.center.y, z: n.p.z - f.center.z }) + n.r).toBeLessThanOrEqual(f.radius + 1e-6);
  });
});

describe("projection", () => {
  const b = baseScale(800, 600, 300);
  it("maps the target to the canvas centre", () => {
    const p = project({ x: 0, y: 0, z: 0 }, cam, 800, 600, b, 300)!;
    expect([p.x, p.y]).toEqual([400, 300]);
  });
  it("nearer points are bigger and have lower depth ratio t", () => {
    const near = project({ x: 50, y: 0, z: -200 }, cam, 800, 600, b, 300)!, far = project({ x: 50, y: 0, z: 200 }, cam, 800, 600, b, 300)!;
    expect(near.s).toBeGreaterThan(far.s); expect(near.t).toBeLessThan(far.t); expect(Math.abs(near.x - 400)).toBeGreaterThan(Math.abs(far.x - 400));
  });
  it("zoom scales about the centre and yaw turns the scene", () => {
    const a = project({ x: 100, y: 0, z: 0 }, cam, 800, 600, b, 300)!, z = project({ x: 100, y: 0, z: 0 }, { ...cam, zoom: 2 }, 800, 600, b, 300)!;
    expect(z.x - 400).toBeCloseTo(2 * (a.x - 400), 6);
    const turned = project({ x: 100, y: 0, z: 0 }, { ...cam, yaw: Math.PI / 2 }, 800, 600, b, 300)!;
    expect(Math.abs(turned.x - 400)).toBeLessThan(1);
    expect(turned.depth).not.toBeCloseTo(a.depth, 0);
  });
  it("returns null behind the camera", () => { expect(project({ x: 0, y: 0, z: -5000 }, cam, 800, 600, b, 300)).toBeNull(); });
  it("pickNode takes the frontmost disc under the pointer", () => {
    const items = [{ id: "far", x: 100, y: 100, rad: 20, depth: 1500 }, { id: "near", x: 105, y: 100, rad: 10, depth: 900 }];
    expect(pickNode(items, 104, 100)).toBe("near");
    expect(pickNode(items, 82, 100)).toBe("far");
    expect(pickNode(items, 400, 400)).toBeNull();
  });
  it("lerpCam turns the short way and eases 0..1", () => {
    const m = lerpCam({ ...cam, yaw: 3 }, { ...cam, yaw: -3 }, 0.5);
    expect(Math.abs(m.yaw)).toBeGreaterThan(3);
    expect(lerpCam(cam, { ...cam, zoom: 4 }, 0.5).zoom).toBeCloseTo(2, 6);
    expect([easeInOut(0), easeInOut(1), easeInOut(0.5)]).toEqual([0, 1, 0.5]);
  });
});
