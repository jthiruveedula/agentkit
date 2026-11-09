// Sunburst layout for the mind map. Pure math, no DOM.
// `partition` gives every node of the built tree a slice [x0, x1) of the circle (fractions of a turn), nested inside its parent.
// The view is a window over that partition: the focus node's slice opens to the full circle and its depth becomes the hub,
// so zooming is one tween of four numbers ({x0, x1, d, n}) and every arc follows.
import type { MapNode } from "./mindmap";
import { clamp } from "./math";
import { fmtCompact, fmtInt, fmtPct } from "./format";
import { MIN_N, ROUTER_MIN_N } from "./thresholds";

export const TAU = Math.PI * 2;
/** Smallest share of its parent's slice any child gets, so a $0 or one-session branch stays visible and clickable. */
export const MIN_SHARE = 0.025;
/** Rings drawn outside the hub. */
export const RINGS = 3;
/** Ring edges as fractions of the outer radius: the hub, then three rings. The first ring is the deepest: it carries the tool names
 *  (few, and worth reading in full: "Antigravity" on a 3% sliver at R 200), and the intents once you zoom in. */
export const BOUNDS = [0, 0.3, 0.62, 0.81, 1];

export interface Part { id: string; x0: number; x1: number; depth: number; parent: string | null; node: MapNode }
/** The view: slice [x0, x1) of the turn opened to the full circle, hub depth `d`, and `n` rings drawn (fewer rings get wider, up to the rim). */
export interface Win { x0: number; x1: number; d: number; n: number }

const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Shares of a parent's slice, in order, summing to 1: proportional to `values` (falling back to `fallback`, then equal),
 *  each at least `floor` (or 1/n when the floor cannot fit). */
export function spans(values: number[], fallback: number[] = [], floor = MIN_SHARE): number[] {
  const n = values.length;
  if (!n) return [];
  const sum = (a: number[]) => a.reduce((s, v) => s + pos(v), 0);
  const w = sum(values) > 0 ? values.map(pos) : sum(fallback) > 0 ? fallback.map(pos) : values.map(() => 1);
  const f = Math.min(floor, 1 / n), low = new Set<number>();
  for (;;) {   // children below the floor are pinned to it; the rest share what is left in proportion. At most n passes.
    const free = w.reduce((s, v, i) => s + (low.has(i) ? 0 : v), 0), room = 1 - low.size * f;
    const out = w.map((v, i) => (low.has(i) ? f : free > 0 ? (v / free) * room : room / (n - low.size)));
    const add = out.findIndex((s, i) => !low.has(i) && s < f - 1e-12);
    if (add < 0) return out;
    low.add(add);
  }
}

/** Slices for every node of the tree (not just the visible ones), so expanding never moves a sibling. */
export function partition(root: MapNode): Map<string, Part> {
  const out = new Map<string, Part>();
  const walk = (n: MapNode, depth: number, parent: string | null, x0: number, x1: number) => {
    out.set(n.id, { id: n.id, x0, x1, depth, parent, node: n });
    const s = spans(n.children.map((c) => c.value), n.children.map((c) => c.sessions));
    let at = x0;
    n.children.forEach((c, i) => { const to = i === n.children.length - 1 ? x1 : at + (x1 - x0) * s[i]; walk(c, depth + 1, n.id, at, to); at = to; });
  };
  walk(root, 0, null, 0, 1);
  return out;
}

/** Depth of the hub for a selection at `depth`: the parent of what you picked, so its siblings stay in view; never deeper than an intent. */
export const focusDepth = (depth: number) => Math.max(0, Math.min(2, depth - 1));
/** The ancestor (or self) of `id` that sits at the hub. */
export function focusOf(parts: ReadonlyMap<string, Part>, id: string): Part | undefined {
  let p = parts.get(id);
  const d = p ? focusDepth(p.depth) : 0;
  while (p && p.depth > d && p.parent) p = parts.get(p.parent);
  return p;
}
export const winOf = (p: Part, n = RINGS): Win => ({ x0: p.x0, x1: p.x1, d: p.depth, n });
const mix = (a: number, b: number, e: number) => a + (b - a) * e;
export const lerpWin = (a: Win, b: Win, e: number): Win => ({ x0: mix(a.x0, b.x0, e), x1: mix(a.x1, b.x1, e), d: mix(a.d, b.d, e), n: mix(a.n, b.n, e) });
/** A slice part-way from its old place `o` (none: it was not there) to `q`. */
export const lerpPart = (o: Part | undefined, q: Part, e: number): Part => (o ? { ...q, x0: mix(o.x0, q.x0, e), x1: mix(o.x1, q.x1, e) } : q);
/** Rings the view needs around `focus`: the deepest shown descendant, 1..RINGS (so a shallow view stretches its rings to the rim). */
export function ringsFor(parts: ReadonlyMap<string, Part>, shown: ReadonlySet<string>, focus: Part): number {
  let n = 1;
  for (const id of shown) { const q = parts.get(id); if (q && q.depth > focus.depth && (focus.depth === 0 || id.startsWith(`${focus.id}/`))) n = Math.max(n, q.depth - focus.depth); }
  return Math.min(RINGS, n);
}
export const easeInOut = (p: number) => { const t = Math.min(1, Math.max(0, p)); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };

/** Ring edges for `m` (whole) rings drawn: the hub keeps its size, the first m ring widths stretch to the rim, deeper edges sit on it. */
const edges = (m: number) => {
  const h = BOUNDS[1], top = BOUNDS[m + 1];
  return BOUNDS.map((b, i) => (i <= 1 ? b : i <= m + 1 ? h + ((b - h) * (1 - h)) / (top - h) : 1));
};
/** Radius of ring edge `k` (real-valued while zooming) with `rings` drawn (real-valued too): 0 = centre, 1 = hub edge, `rings` + 1 = outer edge. */
export function radiusAt(k: number, R: number, rings = RINGS): number {
  const n = clamp(rings, 1, RINGS), lo = Math.floor(n), a = edges(lo), b = lo < RINGS ? edges(lo + 1) : a;
  const e = a.map((x, i) => mix(x, b[i], n - lo)), i = clamp(k, 0, e.length - 1), i0 = Math.floor(i), i1 = Math.min(e.length - 1, i0 + 1);
  return R * mix(e[i0], e[i1], i - i0);
}

export interface Arc { a0: number; a1: number; r0: number; r1: number }
/** Screen arc of a slice through window `w` (angles in radians clockwise from 12 o'clock); `sweep` scales the angles for the reveal. */
export function arcOf(p: Part, w: Win, R: number, sweep = 1): Arc {
  const span = w.x1 - w.x0 || 1, f = (x: number) => Math.min(1, Math.max(0, (x - w.x0) / span)) * TAU * sweep;
  const k = p.depth - w.d;
  return { a0: f(p.x0), a1: f(p.x1), r0: radiusAt(k, R, w.n), r1: radiusAt(k + 1, R, w.n) };
}

const pt = (cx: number, cy: number, r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
/** SVG path for an annular sector (a full ring when it spans the circle; draw with fill-rule evenodd). */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const r = (v: number) => v.toFixed(2);
  if (a1 - a0 >= TAU - 1e-3) {
    const m = a0 + Math.PI;
    const ring = (q: number) => `M${pt(cx, cy, q, a0)}A${r(q)} ${r(q)} 0 1 1 ${pt(cx, cy, q, m)}A${r(q)} ${r(q)} 0 1 1 ${pt(cx, cy, q, a0)}Z`;
    return ring(r1) + (r0 > 0 ? ring(r0) : "");
  }
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(cx, cy, r1, a0)}A${r(r1)} ${r(r1)} 0 ${big} 1 ${pt(cx, cy, r1, a1)}L${pt(cx, cy, r0, a1)}`
    + (r0 > 0 ? `A${r(r0)} ${r(r0)} 0 ${big} 0 ${pt(cx, cy, r0, a0)}` : "") + "Z";
}

/** Curved along the arc: `lines` 2 = name over value; `flip` = on the lower half, where the text runs counter-clockwise. */
export interface TanFit { mode: "tan"; chars: number; lines: 1 | 2; flip: boolean }
/** Straight along the radius at (x, y) turned by `rot` degrees: `lines` 2 = the name may wrap onto a second line (see `split2`). */
export interface RadFit { mode: "rad"; x: number; y: number; rot: number; chars: number; lines: 1 | 2 }
export type Fit = TanFit | RadFit;
/** Where an arc's label fits: curved along the arc (tangent, up to two lines) when the name fits, else straight along the radius
 *  (wrapping onto two lines when the arc is wide enough), truncated; null when nothing readable fits. Text never reads upside down.
 *  `cw` = average glyph width, `lh` = line height, both px. */
export function labelFit(cx: number, cy: number, a: Arc, len: number, cw = 7, lh = 15, pad = 10): Fit | null {
  const da = a.a1 - a.a0, mr = (a.r0 + a.r1) / 2, t = a.r1 - a.r0, mid = (a.a0 + a.a1) / 2;
  if (da <= 0 || t <= 0) return null;
  const deg = (mid * 180) / Math.PI, flip = deg > 90 && deg < 270, x = cx + mr * Math.sin(mid), y = cy - mr * Math.cos(mid);
  const along = Math.min(da, TAU) * (mr - 8), narrow = da * (a.r0 + t / 4);   // usable arc length (inner line of two), width near the inner edge
  const tan = t >= lh + 2 ? Math.floor((along - 12) / cw) : 0, rad = narrow >= lh ? Math.floor((t - pad) / cw) : 0;
  if (tan >= Math.min(len, 4) && (tan >= len || tan >= rad)) return { mode: "tan", chars: tan, lines: t >= 2 * lh + 6 && along >= 5 * cw + 12 ? 2 : 1, flip };
  if (rad >= 4) return { mode: "rad", x, y, rot: deg < 180 ? deg - 90 : deg - 270, chars: rad, lines: len > rad && narrow >= 2 * lh + 2 ? 2 : 1 };
  return null;
}
/** A name too long for one line of `n` characters, on two: at a space, dash, slash, underscore or camelCase step, the head allowed one
 *  character over (the glyph estimate is conservative). Never mid-word: null when there is no such break (the caller clips with an ellipsis). */
export function split2(s: string, n: number): [string, string] | null {
  if (s.length <= n) return null;
  for (let i = Math.min(n + 1, s.length - 1); i >= 2; i--) {   // the latest natural break whose head fits
    const sp = s[i] === " ", soft = /[-/_]/.test(s[i - 1]) || (/[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i]));
    if ((sp || soft) && s.length - i - (sp ? 1 : 0) <= n) return [s.slice(0, i).trimEnd(), s.slice(sp ? i + 1 : i)];
  }
  return null;
}
/** Average glyph width (px) of `s` in the 12px semibold label type: narrow letters (i, l, t, r...) about half, capitals and m/w wider.
 *  Rounded up from system-ui metrics, so a name estimated to fit does fit. */
export function glyphW(s: string): number {
  let w = 0;
  for (const c of s) w += /[ijlrtfI.,:;'!| ]/.test(c) ? 4 : /[mwMW]/.test(c) ? 10.5 : /[A-Z]/.test(c) ? 8.5 : 7;
  return s ? w / s.length : 7;
}
/** A clipped label must keep at least this many characters, ellipsis included ("billi…"): a bare "bil…" is noise, so it is dropped. */
export const MIN_CLIP = 6;
/** Where a name's label fits: at 12px when the whole name shows (one line, or two at a natural break), else at 10.5px (`small`)
 *  when that shows it whole. Else clipped, at whichever size keeps more of it, and null when that is under MIN_CLIP characters. */
export function nameFit(cx: number, cy: number, a: Arc, name: string): (Fit & { small: boolean }) | null {
  const cw = glyphW(name), whole = (f: Fit | null) => !!f && (f.chars >= name.length || (f.lines === 2 && f.mode === "rad" && !!split2(name, f.chars)));
  const big = labelFit(cx, cy, a, name.length, cw);
  if (whole(big)) return { ...big!, small: false };
  const sm = labelFit(cx, cy, a, name.length, cw * 0.875, 13, 6);
  if (whole(sm)) return { ...sm!, small: true };
  const best = sm && (!big || sm.chars > big.chars) ? { ...sm, small: true } : big && { ...big, small: false };
  return best && best.chars >= MIN_CLIP ? best : null;
}
/** Open SVG path along radius `r` from a0 to a1 (reversed when `rev`), in two halves so a full turn still draws: a textPath guide. */
export function arcLine(cx: number, cy: number, r: number, a0: number, a1: number, rev = false): string {
  const e = Math.min(a1, a0 + TAU - 1e-3), m = (a0 + e) / 2, [p, q] = rev ? [e, a0] : [a0, e], sw = rev ? 0 : 1, rr = r.toFixed(2);
  return `M${pt(cx, cy, r, p)}A${rr} ${rr} 0 0 ${sw} ${pt(cx, cy, r, m)}A${rr} ${rr} 0 0 ${sw} ${pt(cx, cy, r, q)}`;
}
/** Struggle heat 0..1 for an arc against the current average: 0 at or below it, 1 at three times it (none when the average is 0). */
export const heat = (rate: number, avg: number) => (avg > 0 ? Math.min(1, Math.max(0, (rate / avg - 1) / 2)) : 0);
/** An edge needs the rate this far above the average, so a node at about the average never reads as a problem. */
export const EDGE_OVER = 1.25;
/** The red struggle edge of a node, gated by how many sessions with a prompt (`rated`) the rate stands on (lib/thresholds):
 *  none under ROUTER_MIN_N or under EDGE_OVER times the average, capped at half strength and faded under MIN_N, the full ramp from there. Null = no edge. */
export function edgeOf(n: Pick<MapNode, "struggled" | "rated">, avg: number): { k: number; faded: boolean } | null {
  const k = n.rated >= ROUTER_MIN_N && n.struggled >= avg * EDGE_OVER ? heat(n.struggled, avg) : 0;
  return k > 0 ? (n.rated < MIN_N ? { k: Math.min(0.5, k), faded: true } : { k, faded: false }) : null;
}
/** The struggled rate with the n it stands on ("25% of 40 struggled"), or "too few to read" under ROUTER_MIN_N. */
export const struggleNote = (n: Pick<MapNode, "struggled" | "rated">, short = false) =>
  (n.rated < ROUTER_MIN_N ? (short ? "too few to read" : "struggled: too few to read") : short ? `${fmtPct(n.struggled, 0)} struggled` : `${fmtPct(n.struggled, 0)} of ${fmtInt(n.rated)} struggled`);
/** `s` cut to `n` characters with an ellipsis. */
export const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`);
/** Numbers in `s` shortened but whole: money loses its cents ($504.12 -> $504; under 50 cents "<$1", never a false $0), and with `compact`
 *  money and whole numbers go short ($1,234 -> $1.2k). Percentages and plain decimals are left alone. */
const shorten = (s: string, compact: boolean) => s.replace(/(\$?)(\d+(?:,\d{3})*)(\.\d+)?(?![\d.%])/g, (m, cur: string, int: string, dec?: string) => {
  if (!cur && (dec || !compact)) return m;
  const v = parseFloat(int.replace(/,/g, "") + (dec ?? ""));
  return cur && v > 0 && v < 0.5 ? "<$1" : cur + (compact ? fmtCompact(v) : fmtInt(v));
});
/** A value line (money, counts, shares) in `n` characters. Numbers are never ellipsized: a clipped "$504.…" reads as wrong data. In order:
 *  as is, cents dropped, compact, then for a pair ("$143.90/$158.10 cost") only its first value; "" when nothing fits (drop the label).
 *  Text with no digits ("unpriced", "too few to read") is not a number and clips as usual. */
export function fitNum(s: string, n: number): string {
  if (!/\d/.test(s)) return clip(s, n);
  const one = s.replace(/\/\S+/, "");
  return [s, shorten(s, false), shorten(s, true), one, shorten(one, false), shorten(one, true)].find((t) => t.length <= n) ?? "";
}
/** Below this uncovered width (px) a side panel's cover is ignored: a smaller sunburst is not worth it (about 1000px viewports and under). */
export const MIN_VIS = 340;
/** Where the chart sits on a W x H card when a side panel covers its right `cover` px: the chart's radius and its x shift. Uncovered (or too
 *  little left, MIN_VIS): radius as always (callouts beside it) and no shift. Else centred in the uncovered part, the radius kept unless that
 *  part is narrower than the disc; callouts that would land under the panel are the caller's to hide. */
export function placeChart(W: number, H: number, cover = 0): { R: number; dx: number; moved: boolean } {
  const side = W >= 760 ? 170 : 160, R = Math.max(90, Math.min(H / 2 - 18, W / 2 - side - 12)), vis = W - cover;
  if (cover <= 0 || vis < MIN_VIS) return { R, dx: 0, moved: false };
  return { R: Math.min(R, vis / 2 - 12), dx: vis / 2 - W / 2, moved: true };
}

/** Callout rows on one side of the chart: keep the order, at least `gap` apart, inside [lo, hi] (as far as they fit). */
export function stack(ys: number[], gap: number, lo: number, hi: number): number[] {
  const out = ys.map((y) => Math.min(hi, Math.max(lo, y)));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? hi : out[i + 1] - gap);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i === 0 ? lo : out[i - 1] + gap);
  return out;
}
