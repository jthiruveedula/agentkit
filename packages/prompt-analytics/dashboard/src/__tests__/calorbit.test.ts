import { describe, expect, it } from "vitest";
import { BASE, billboard, fitScale, clampPitch, clampZoom, DEFAULT_VIEW, describeView, edgeFade, facing, inertia, nearestYaw, viewTransform, wrapYaw, zoomAround } from "../lib/calorbit";

describe("calendar orbit math", () => {
  it("clamps pitch so the floor never flips, and zoom to 0.5..3", () => {
    expect(clampPitch(-40)).toBe(10); expect(clampPitch(95)).toBe(80); expect(clampPitch(54)).toBe(54);
    expect(clampZoom(0.1)).toBe(0.5); expect(clampZoom(9)).toBe(3); expect(clampZoom(1.5)).toBe(1.5);
  });
  it("wraps yaw to (-180, 180] and resets the short way round", () => {
    expect(wrapYaw(190)).toBe(-170); expect(wrapYaw(-190)).toBe(170); expect(wrapYaw(720 + 30)).toBe(30); expect(wrapYaw(-180)).toBe(180);
    expect(nearestYaw(350, -30)).toBe(330); expect(nearestYaw(-200, -30)).toBe(-30); expect(nearestYaw(700, -30)).toBe(690);
  });
  it("keeps the point under the cursor fixed while zooming", () => {
    const v = { ...DEFAULT_VIEW, zoom: 1, tx: 10, ty: -4 }, c = { x: 120, y: 30 };
    const z = zoomAround(c, v, 2);
    // a floor point at screen offset c maps through t + s * p; solve p before, re-project after
    const p = { x: (c.x - v.tx) / v.zoom, y: (c.y - v.ty) / v.zoom };
    expect(z.tx + p.x * z.zoom).toBeCloseTo(c.x); expect(z.ty + p.y * z.zoom).toBeCloseTo(c.y);
    expect(zoomAround(c, v, 99).zoom).toBe(3);
    expect(zoomAround({ x: 0, y: 0 }, { ...v, tx: 0, ty: 0 }, 2)).toEqual({ zoom: 2, tx: 0, ty: 0 });
  });
  it("decays inertia frame-rate independently and stops", () => {
    expect(inertia(1, 1000 / 60)).toBeCloseTo(0.92);
    expect(inertia(inertia(1, 1000 / 60), 1000 / 60)).toBeCloseTo(inertia(1, 2000 / 60));
    expect(inertia(0.001, 16)).toBe(0);
    let v = 0.5, n = 0; while (v && n < 500) { v = inertia(v, 16); n++; } expect(n).toBeLessThan(100);
  });
  it("tells which floor edge faces the camera", () => {
    expect(facing(0, 90)).toBeCloseTo(1);    // bottom edge, unrotated: toward the viewer
    expect(facing(0, 270)).toBeCloseTo(-1);  // top edge: away
    expect(facing(-30, 180)).toBeCloseTo(0.5); // day labels on the left, default yaw: toward
    expect(facing(180, 90)).toBeCloseTo(-1);
  });
  it("fades far-edge labels only when the camera is low", () => {
    expect(edgeFade(-30, 54, 270)).toBe(1);            // default view: months readable
    expect(edgeFade(0, 80, 270)).toBeCloseTo(0.3);     // low (near edge-on) and behind: faded
    expect(edgeFade(0, 80, 90)).toBe(1);               // low but in front: full
    expect(edgeFade(0, 10, 270)).toBe(1);              // plan view: nothing hides behind columns
    expect(edgeFade(0, 67.5, 270)).toBeCloseTo(0.65);
  });
  it("fits the floor to the stage at every yaw", () => {
    expect(fitScale(-30, 54, 700, 150, 2000, 2000)).toBe(BASE);   // plenty of room: default scale
    const side = fitScale(90, 54, 700, 150, 700, 260), front = fitScale(0, 54, 700, 150, 700, 260);
    expect(side).toBeLessThan(front);                               // long axis toward the camera: shrink to fit
    expect((700 * Math.cos(54 * Math.PI / 180) + 50 * Math.sin(54 * Math.PI / 180)) * side).toBeCloseTo(260);
    expect(fitScale(0, 54, 0, 0, 1, 1)).toBe(BASE);
  });
  it("builds transforms and an announcement", () => {
    expect(viewTransform(DEFAULT_VIEW)).toBe("translate(0.0px, 0.0px) rotateX(54.00deg) rotateZ(-30.00deg) scale(0.7400)");
    expect(billboard(DEFAULT_VIEW)).toBe("rotateZ(30.00deg) rotateX(-54.00deg) scale(1.149)");
    expect(billboard({ ...DEFAULT_VIEW, zoom: 3 })).toContain("scale(1.000)");
    expect(describeView(DEFAULT_VIEW)).toBe("View turned 0 degrees, tilt 54 degrees, zoom 1.0x");
    expect(describeView({ ...DEFAULT_VIEW, yaw: 90 })).toContain("turned 120 degrees");
  });
});
