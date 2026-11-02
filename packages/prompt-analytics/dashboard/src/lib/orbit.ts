// 3D layout + projection for the mind-map constellation. Pure math, no DOM: node positions come from the tree
// (root at the origin, children by angle around their parent: a ring for tools, an outward cone below that),
// then a yaw/pitch/zoom camera projects them with perspective. The canvas view only draws what these return.
import type { MapKind, MapNode } from "./mindmap";

export interface V3 { x: number; y: number; z: number }
export interface ONode { id: string; kind: MapKind; depth: number; parent: string | null; p: V3; r: number }
export interface Cam { yaw: number; pitch: number; zoom: number; tx: number; ty: number; tz: number }
export interface Proj { x: number; y: number; s: number; depth: number; /** 0 = nearest, 1 = farthest */ t: number }

/** World radius = a + b * sqrt(value / largest sibling): area proportional to the value within a level (a = 0), fixed for root / session / more. */
const RAD: Record<MapKind, [number, number]> = { root: [26, 0], tool: [0, 27], intent: [0, 17], project: [0, 11.5], session: [4, 0], more: [5, 0] };
/** Smallest world radius, so a tiny sibling stays visible and clickable (picking adds slop on top). */
export const R_MIN = 1.5;
const GOLD = Math.PI * (3 - Math.sqrt(5));
export const CAM_D = 1200;
export const ZOOM_MIN = 0.4, ZOOM_MAX = 5;

export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** i-th of n evenly spread unit vectors on a sphere. */
export function fibDir(i: number, n: number): V3 {
  const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * GOLD;
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
}

/** Ring radius (world units) by depth: root 0, tools, intents, projects, sessions. */
const RING = [0, 250, 400, 510, 590];
/** Smallest share of its parent's angular budget any child gets, so a tiny sibling still has room to be seen and clicked. */
const MIN_SHARE = 0.06;
/** Angular budgets for children: proportional to subtree size (sessions, at least 1), each at least MIN_SHARE, summing to 1. */
export function shares(sizes: number[]): number[] {
  const tot = sizes.reduce((a, b) => a + Math.max(1, b), 0) || 1, raw = sizes.map((s) => Math.max(MIN_SHARE, Math.max(1, s) / tot));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / sum);
}

/** Positions for every node in the (fully built) tree: a sunburst-style fan. Each node owns an angular wedge of its parent's wedge
 *  (proportional to subtree size) and sits at the wedge centre on its depth's ring, so the canvas fills evenly and branches never tangle.
 *  A slight tilt and depth wobble keep it a 3D constellation. Deterministic, and independent of which nodes are expanded. */
export function layoutOrbit(root: MapNode): Map<string, ONode> {
  const out = new Map<string, ONode>();
  const walk = (n: MapNode, depth: number, parent: string | null, a0: number, a1: number, rel: number, jit = 0) => {
    const [a, b] = RAD[n.kind], am = (a0 + a1) / 2, R = RING[Math.min(depth, RING.length - 1)] + jit;
    const p = depth === 0 ? { x: 0, y: 0, z: 0 } : { x: Math.cos(am) * R, y: 0.82 * Math.sin(am) * R, z: 0.3 * R * Math.sin(2 * am + 0.6 + depth) };
    out.set(n.id, { id: n.id, kind: n.kind, depth, parent, p, r: Math.max(R_MIN, a + b * Math.sqrt(clamp(rel, 0, 1))) });
    if (!n.children.length) return;
    const sh = shares(n.children.map((c) => c.sessions)), span = a1 - a0;
    const mx = Math.max(1e-9, ...n.children.filter((c) => c.kind !== "more").map((c) => c.value));
    let at = a0;
    // crowded siblings alternate across three radii (a stagger), so a narrow wedge reads as a band, not a single arc of touching dots
    const k = n.children.length;
    n.children.forEach((c, i) => { const w = span * sh[i]; walk(c, depth + 1, n.id, at, at + w, c.kind === "more" ? 0 : c.value / mx, depth >= 1 && k > 4 ? ((i % 3) - 1) * 38 : 0); at += w; });
  };
  walk(root, 0, null, -Math.PI * 0.62, Math.PI * 1.38, 1);
  spread([...out.values()]);
  return out;
}

/** Radial spread: push overlapping nodes apart until every pair is at least (r + 6) + (r + 6) apart (collision radius = node radius + 6).
 *  The root stays put; a uniform grid keeps it near-linear for big exports. Deterministic (fixed order, fixed iteration count). */
export function spread(nodes: ONode[], pad = 6, iters = 14): void {
  const CELL = 80;   // above the largest possible pair distance (root 26 + tool 27 + 2 * pad)
  for (let it = 0; it < iters; it++) {
    const grid = new Map<string, ONode[]>(), key = (n: ONode) => `${Math.floor(n.p.x / CELL)},${Math.floor(n.p.y / CELL)},${Math.floor(n.p.z / CELL)}`;
    for (const n of nodes) { const k = key(n), g = grid.get(k); if (g) g.push(n); else grid.set(k, [n]); }
    let moved = false;
    for (const a of nodes) {
      const cx = Math.floor(a.p.x / CELL), cy = Math.floor(a.p.y / CELL), cz = Math.floor(a.p.z / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const b of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          if (b.id <= a.id || a.id.startsWith(`${b.id}/`) || b.id.startsWith(`${a.id}/`)) continue;   // each pair once; a parent and its child are meant to be near
          let vx = b.p.x - a.p.x, vy = b.p.y - a.p.y, vz = b.p.z - a.p.z, d = Math.hypot(vx, vy, vz);
          const min = a.r + b.r + 2 * pad;
          if (d >= min) continue;
          if (d < 1e-6) { vx = 1; vy = 0; vz = 0; d = 1; }
          const push = (min - d) / 2 / d, fa = a.depth === 0 ? 0 : 1, fb = b.depth === 0 ? 0 : 1, tot = fa + fb || 1;
          a.p = { x: a.p.x - (vx * push * 2 * fa) / tot, y: a.p.y - (vy * push * 2 * fa) / tot, z: a.p.z - (vz * push * 2 * fa) / tot };
          b.p = { x: b.p.x + (vx * push * 2 * fb) / tot, y: b.p.y + (vy * push * 2 * fb) / tot, z: b.p.z + (vz * push * 2 * fb) / tot };
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/** Bounding centre and radius (incl. node radii) of a set of nodes. */
export function fitOf(nodes: ONode[]): { center: V3; radius: number } {
  if (!nodes.length) return { center: { x: 0, y: 0, z: 0 }, radius: 1 };
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const n of nodes) for (const k of ["x", "y", "z"] as const) { lo[k] = Math.min(lo[k], n.p[k] - n.r); hi[k] = Math.max(hi[k], n.p[k] + n.r); }
  const center = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
  return { center, radius: Math.max(1, ...nodes.map((n) => len({ x: n.p.x - center.x, y: n.p.y - center.y, z: n.p.z - center.z }) + n.r)) };
}

/** Perspective projection about the camera target. `base` is px per world unit at zoom 1 and the target's depth; null when behind the camera. */
export function project(p: V3, c: Cam, w: number, h: number, base: number, fitR: number): Proj | null {
  const x = p.x - c.tx, y = p.y - c.ty, z = p.z - c.tz;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const depth = CAM_D + z2;
  if (depth < 80) return null;
  const s = (base * c.zoom * CAM_D) / depth;
  return { x: w / 2 + x1 * s, y: h / 2 - y2 * s, s, depth, t: clamp(0.5 + z2 / (2 * fitR), 0, 1) };
}
/** Camera that frames `nodes` by what the projection actually shows: zoom so the projected bounding box (discs included) fills `fillW` x `fillH` px,
 *  and shift the target along the camera's right/up axes so the box centre lands on the canvas centre. `c` is the unzoomed camera (zoom 1, target at the world box centre). */
export function screenFit(nodes: ONode[], c: Cam, w: number, h: number, base: number, fitR: number, fillW: number, fillH: number): Cam {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) { const q = project(n.p, c, w, h, base, fitR); if (!q) continue; const r = n.r * q.s; x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r); y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r); }
  if (!(x1 > x0) || !(y1 > y0)) return c;
  const k = clamp(Math.min(fillW / (x1 - x0), fillH / (y1 - y0)), ZOOM_MIN, ZOOM_MAX);
  const ox = (x0 + x1) / 2 - w / 2, oy = (y0 + y1) / 2 - h / 2;   // box centre offset at zoom 1, screen px (y down)
  const cx = ox / base, cy = -oy / base;   // camera-space shift (right, up) in world units
  const cyw = Math.cos(c.yaw), syw = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const wy = cy * cp, z1 = -cy * sp;   // undo pitch with z2 = 0, then yaw
  return { ...c, zoom: k, tx: c.tx + cx * cyw - z1 * syw, ty: c.ty + wy, tz: c.tz + cx * syw + z1 * cyw };
}
export const baseScale = (w: number, h: number, fitR: number) => Math.min(w, h) / (2 * fitR * 1.08);   // 8% margin: perspective enlarges near nodes, labels and the hint need room

export interface Hit { id: string; x: number; y: number; rad: number; depth: number }
/** Frontmost node whose disc (plus `slop` px) contains the point. */
export function pickNode(items: Hit[], px: number, py: number, slop = 6): string | null {
  let best: Hit | null = null;
  for (const it of items) if (Math.hypot(it.x - px, it.y - py) <= Math.max(it.rad, 4) + slop && (!best || it.depth < best.depth)) best = it;
  return best?.id ?? null;
}

/** Interpolate cameras; yaw takes the short way round. */
export function lerpCam(a: Cam, b: Cam, e: number): Cam {
  let dy = (b.yaw - a.yaw) % (2 * Math.PI);
  if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
  const k = (x: number, y: number) => x + (y - x) * e;
  return { yaw: a.yaw + dy * e, pitch: k(a.pitch, b.pitch), zoom: a.zoom * (b.zoom / a.zoom) ** e, tx: k(a.tx, b.tx), ty: k(a.ty, b.ty), tz: k(a.tz, b.tz) };
}
export const easeInOut = (p: number) => { const t = clamp(p, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };

/** Zoom to fly to when a node of this kind is selected (children of a bigger shell need less zoom). */
export const FLY_ZOOM: Record<MapKind, number> = { root: 1, tool: 1.5, intent: 2.1, project: 2.8, session: 3.4, more: 2.4 };
