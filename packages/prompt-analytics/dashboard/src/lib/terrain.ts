// Orthographic "terrain" camera for extruded-bar charts (hour-of-week). Pure math, no DOM.
// Orthographic on purpose: perspective would make near bars look taller, so heights stay comparable at every angle.
// World: x = column (hour), y = row (weekday, top row first), z = height above the zero floor. pitch 90 deg = straight down (plan view).
import { clamp } from "./orbit";
import { ZOOM_MAX, ZOOM_MIN, zoomAround, wrapYaw, type View } from "./calorbit";

export interface TCam { yaw: number; pitch: number; zoom: number; tx: number; ty: number }
export const T_DEFAULT: TCam = { yaw: 0, pitch: 76, zoom: 1, tx: 0, ty: 0 };
export const T_PITCH_MIN = 25, T_PITCH_MAX = 90;
export const clampTilt = (p: number) => clamp(p, T_PITCH_MIN, T_PITCH_MAX);

/** `dy`: how many world units deep one row is (rows are stretched so a 7-row grid in a narrow card keeps readable labels; heights are unaffected). */
export interface TGrid { cols: number; rows: number; hmax: number; dy?: number }
export interface Pt { x: number; y: number }
export interface Quad { pts: [Pt, Pt, Pt, Pt]; kind: "top" | "side" }
export interface Bar { i: number; depth: number; quads: Quad[] }

const RAD = Math.PI / 180;
/** Orthographic projection of a world point: screen px from the canvas centre, plus a depth key (larger = nearer the viewer). */
export function proj(x: number, y: number, z: number, c: TCam, g: TGrid, scale: number, w: number, h: number): Pt & { d: number } {
  const dy = g.dy ?? 1, cx = x - g.cols / 2, cy = (y - g.rows / 2) * dy, cyw = Math.cos(c.yaw * RAD), syw = Math.sin(c.yaw * RAD);
  const x1 = cx * cyw - cy * syw, y1 = cx * syw + cy * cyw, sp = Math.sin(c.pitch * RAD), cp = Math.cos(c.pitch * RAD);
  return { x: w / 2 + c.tx + x1 * scale, y: h / 2 + c.ty + (y1 * sp - z * cp) * scale, d: y1 * cp + z * sp };
}

/** px per world unit that fits the whole grid (floor and the tallest possible bar) in `w` x `h` with `pad` px around, at zoom 1. */
export function fitScale(c: TCam, g: TGrid, w: number, h: number, pad = 28): number {
  const u = { ...c, zoom: 1, tx: 0, ty: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of [[0, 0], [g.cols, 0], [0, g.rows], [g.cols, g.rows]]) for (const z of [0, g.hmax]) {
    const p = proj(x, y, z, u, g, 1, 0, 0); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const k = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad) / Math.max(1e-6, y1 - y0));
  return Math.max(1, k);
}
/** Screen offset that puts the fitted box's centre on the canvas centre (added to the camera's pan). */
export function centre(c: TCam, g: TGrid, scale: number): Pt {
  const u = { ...c, zoom: 1, tx: 0, ty: 0 };
  let y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of [[0, 0], [g.cols, 0], [0, g.rows], [g.cols, g.rows]]) for (const z of [0, g.hmax]) { const p = proj(x, y, z, u, g, scale, 0, 0); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x: 0, y: -(y0 + y1) / 2 };
}

/** Faces of every bar, far to near (painter's order). Heights are value / max * hmax from a zero floor. A cell at zero keeps a flat top, so it can still be hovered. */
export function bars(values: number[], max: number, c: TCam, g: TGrid, scale: number, w: number, h: number): Bar[] {
  const cam = { ...c, ty: c.ty + centre(c, g, scale).y * c.zoom }, out: Bar[] = [];
  const yawr = c.yaw * RAD, sy = Math.sin(yawr), cy = Math.cos(yawr);
  const P = (x: number, y: number, z: number): Pt => { const q = proj(x, y, z, cam, g, scale * c.zoom, w, h); return { x: q.x, y: q.y }; };
  // outward side normals (dx, dy) in grid space; a side faces the viewer when its normal has a positive screen-y after the yaw, and the camera is not straight down
  const sides: [number, number, number, number, number, number][] = [[0, 1, 1, 1, 0, 1], [0, 0, 0, 1, -1, 0], [1, 0, 1, 1, 1, 0], [0, 0, 1, 0, 0, -1]];
  for (let i = 0; i < values.length; i++) {
    const col = i % g.cols, row = Math.floor(i / g.cols), z = max > 0 ? clamp(values[i] / max, 0, 1) * g.hmax : 0;
    const q = proj(col + 0.5, row + 0.5, 0, cam, g, scale * c.zoom, w, h), quads: Quad[] = [];
    const m = 0.06;   // gap between bars
    const x0 = col + m, x1 = col + 1 - m, y0 = row + m, y1 = row + 1 - m;
    if (z > 0 && c.pitch < 89.5) for (const [ax, ay, bx, by, nx, ny] of sides) {
      const facing = nx * sy + ny * cy;   // normal's y after the yaw
      if (facing <= 1e-6) continue;
      const [px, py, qx, qy] = [ax ? x1 : x0, ay ? y1 : y0, bx ? x1 : x0, by ? y1 : y0];
      quads.push({ kind: "side", pts: [P(px, py, 0), P(qx, qy, 0), P(qx, qy, z), P(px, py, z)] });
    }
    quads.push({ kind: "top", pts: [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)] });
    out.push({ i, depth: q.d, quads });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** Point in a convex quad (either winding). */
export function inQuad(q: readonly Pt[], px: number, py: number): boolean {
  let pos = false, neg = false;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length], cr = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cr > 0) pos = true; else if (cr < 0) neg = true;
    if (pos && neg) return false;
  }
  return true;
}
/** Cell index under the pointer: nearest bar whose top or side contains it, or -1. `sorted` is far to near. */
export function pickBar(sorted: readonly Bar[], px: number, py: number): number {
  for (let k = sorted.length - 1; k >= 0; k--) for (const q of sorted[k].quads) if (inQuad(q.pts, px, py)) return sorted[k].i;
  return -1;
}

export { wrapYaw, zoomAround, ZOOM_MAX, ZOOM_MIN };
export type { View };
/** Keyboard step: arrows rotate 8 deg / tilt 6 deg, +/- zoom 15%. Returns null for other keys. */
export function keyStep(c: TCam, key: string): Partial<TCam> | null {
  switch (key) {
    case "ArrowLeft": return { yaw: wrapYaw(c.yaw - 8) };
    case "ArrowRight": return { yaw: wrapYaw(c.yaw + 8) };
    case "ArrowUp": return { pitch: clampTilt(c.pitch + 6) };
    case "ArrowDown": return { pitch: clampTilt(c.pitch - 6) };
    case "+": case "=": return { zoom: clamp(c.zoom * 1.15, ZOOM_MIN, ZOOM_MAX) };
    case "-": case "_": return { zoom: clamp(c.zoom / 1.15, ZOOM_MIN, ZOOM_MAX) };
    default: return null;
  }
}
export const describeT = (c: TCam) => `Terrain turned ${Math.round(wrapYaw(c.yaw))} degrees, tilt ${Math.round(c.pitch)} degrees from the floor (90 is straight down), zoom ${c.zoom.toFixed(1)}x`;
