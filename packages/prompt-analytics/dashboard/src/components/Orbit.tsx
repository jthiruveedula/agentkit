// Canvas 2D view of the mind-map constellation: perspective projection from lib/orbit, drag to rotate, pinch / buttons / ctrl-wheel to zoom,
// click a node to fly the camera to it. The render loop only runs while something moves or changed, and never while offscreen or hidden.
import { useEffect, useRef, useState, type KeyboardEvent as RKE, type PointerEvent as RPE } from "react";
import type { MapNode } from "../lib/mindmap";
import { boxesTouch, labelTop } from "../lib/labels";
import { baseScale, clamp, easeInOut, FLY_ZOOM, fitOf, lerpCam, pickNode, project, screenFit, ZOOM_MAX, ZOOM_MIN, type Cam, type Hit, type ONode } from "../lib/orbit";
import { cssVar } from "../lib/palette";
import { fxOn, reducedNow } from "../lib/hooks";

export interface OrbitRow { node: MapNode; depth: number; parent: string | null }
interface Props {
  w: number; h: number; layout: Map<string, ONode>; rows: OrbitRow[]; cur: string;
  colorOf: (n: MapNode) => string; nameOf: (n: MapNode) => string; sub: (n: MapNode) => string;
  /** Node is on the active filter path. */
  on: (id: string) => boolean; related: (id: string) => boolean; open: ReadonlySet<string>;
  onPick: (n: MapNode) => void; onApply: (n: MapNode) => void; onKey: (e: RKE) => void; label: string;
  /** Hotspots by node id: rank (1..3) and a "$cost · friction%" line. Always labelled (flipped left near the edge), ringed. */
  hot: ReadonlyMap<string, { rank: number; text: string }>;
}
interface Item extends Hit { node: MapNode; o: ONode; t: number; e: number }

const motion = () => fxOn() && !reducedNow();
/** Zoom cap for automatic fly-to (manual zoom still reaches ZOOM_MAX). */
const FLY_MAX = 1.8;
const DEFAULT: Cam = { yaw: 0.55, pitch: 0.34, zoom: 1, tx: 0, ty: 0, tz: 0 };

export function Orbit(p: Props) {
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const P = useRef(p); P.current = p;
  const S = useRef({
    cam: { ...DEFAULT }, anim: null as null | { from: Cam; to: Cam; t0: number; ms: number }, fit: { center: { x: 0, y: 0, z: 0 }, radius: 400 },
    items: [] as Item[], born: new Map<string, number>(), raf: 0, visible: true, focused: false, hover: null as string | null,
    ptr: new Map<number, { x: number; y: number }>(), drag: null as null | { x: number; y: number; moved: boolean }, pinch: 0,
    colors: new Map<string, string>(), theme: null as null | Record<string, string>, ready: false,
    /** World radius the base scale was fitted to on first layout; later refits become zoom changes so the scale never jumps. */
    r0: 0, sprites: new Map<string, HTMLCanvasElement | null>(),
    /** Per-frame scratch, reused so a frame allocates no arrays; text widths cached by font + string. */
    draw: [] as Item[], placed: [] as [number, number, number, number][], tw: new Map<string, number>(),
  });
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const resolve = (c: string) => { const m = S.current.colors; let r = m.get(c); if (!r) { r = c.startsWith("var(") ? cssVar(c.slice(4, -1)) : c; m.set(c, r); } return r; };
  const request = () => { const s = S.current; if (!s.raf && s.visible && !document.hidden) s.raf = requestAnimationFrame(frame); };
  const go = (to: Partial<Cam>, ms = 650) => {
    const s = S.current, target = { ...s.cam, ...to, zoom: clamp(to.zoom ?? s.cam.zoom, ZOOM_MIN, ZOOM_MAX) };
    if (!motion() || ms === 0) { s.cam = target; s.anim = null; } else s.anim = { from: s.cam, to: target, t0: performance.now(), ms };
    setZoomPct(Math.round(target.zoom * 100)); request();
  };
  const refit = () => { const s = S.current; s.fit = fitOf(P.current.rows.map((r) => P.current.layout.get(r.node.id)).filter(Boolean) as ONode[]); if (!s.r0) s.r0 = s.fit.radius; return s.fit; };
  /** Camera that centres the visible nodes' bounds and zooms so they fill the canvas. */
  const home = (): Cam => {
    const f = refit(), { w, h, rows, layout } = P.current, s = S.current;
    const c0: Cam = { ...DEFAULT, tx: f.center.x, ty: f.center.y, tz: f.center.z, zoom: 1 };
    if (w <= 0 || h <= 0) return c0;
    // the hub (root) sits at the canvas centre: fit the nodes plus their mirror image through the origin, so the zoom is set by the widest side; leave room at the sides for labels
    const ns = rows.map((r) => layout.get(r.node.id)).filter(Boolean) as ONode[], both = [...ns, ...ns.map((n) => ({ ...n, p: { x: -n.p.x, y: -n.p.y, z: -n.p.z } }))];
    const c = screenFit(both, { ...c0, tx: 0, ty: 0, tz: 0 }, w, h, baseScale(w, h, s.r0 || f.radius), f.radius, Math.max(w * 0.5, w * 0.92 - 190), h * 0.84);
    return { ...c, tx: 0, ty: 0, tz: 0 };
  };
  const reset = () => go(home(), 700);
  /** Camera that frames `ids` (the focused node plus its visible children). */
  /** 25% padding around the group, and never past FLY_MAX: flying in keeps the neighbourhood in view. */
  const frameOf = (ids: string[]): Partial<Cam> => {
    const L = P.current.layout, f = fitOf(ids.map((id) => L.get(id)).filter(Boolean) as ONode[]), s = S.current;
    return { tx: f.center.x, ty: f.center.y, tz: f.center.z, zoom: clamp((s.r0 || f.radius) / (f.radius * 1.25), ZOOM_MIN, FLY_MAX) };
  };
  /** Where the camera belongs for the current focus: root = everything visible; an expanded node = it and its children; else fly in. */
  const target = (): Partial<Cam> => {
    const { cur, rows, layout } = P.current, o = layout.get(cur);
    if (!o || o.kind === "root") { const h0 = home(); return { tx: h0.tx, ty: h0.ty, tz: h0.tz, zoom: h0.zoom }; }
    const kids = rows.filter((r) => r.parent === cur).map((r) => r.node.id);
    if (kids.length) return frameOf([cur, ...kids]);
    return { tx: o.p.x, ty: o.p.y, tz: o.p.z, zoom: clamp(Math.max(S.current.cam.zoom, FLY_ZOOM[o.kind]), ZOOM_MIN, Math.max(FLY_MAX, S.current.cam.zoom)) };
  };
  const measure = (font: string, t: string, ctx: CanvasRenderingContext2D) => {
    const m = S.current.tw, k = `${font}|${t}`; let v = m.get(k);
    if (v === undefined) { ctx.font = font; v = ctx.measureText(t).width; if (m.size > 2000) m.clear(); m.set(k, v); }
    return v;
  };
  /** Shaded sphere sprite per colour, built once (not a gradient per node per frame). */
  const sprite = (col: string) => {
    const m = S.current.sprites; if (m.has(col)) return m.get(col)!;
    const c = document.createElement("canvas"); c.width = c.height = 96;
    const g = c.getContext("2d");
    if (g) {
      g.beginPath(); g.arc(48, 48, 47, 0, 7); g.fillStyle = col; g.fill();
      const sh = g.createRadialGradient(48, 48, 24, 48, 48, 48); sh.addColorStop(0, "rgba(0,20,70,0)"); sh.addColorStop(1, "rgba(0,20,70,0.3)"); g.fillStyle = sh; g.fill();
      const hi = g.createRadialGradient(30, 29, 0, 30, 29, 45); hi.addColorStop(0, "rgba(255,255,255,0.6)"); hi.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = hi; g.fill();
    }
    const out = g ? c : null; m.set(col, out); return out;
  };
  const zoomBy = (k: number) => go({ zoom: S.current.cam.zoom * k }, 220);

  function frame(now: number) {
    const s = S.current, c = cv.current, ctx = c?.getContext("2d");
    s.raf = 0;
    if (!c || !ctx) return;
    let busy = false;
    if (s.anim) {
      const k = (now - s.anim.t0) / s.anim.ms;
      s.cam = lerpCam(s.anim.from, s.anim.to, easeInOut(k));
      if (k >= 1) { s.cam = s.anim.to; s.anim = null; } else busy = true;
    }
    if (draw(ctx, now)) busy = true;
    if (busy) request();
  }

  function draw(ctx: CanvasRenderingContext2D, now: number): boolean {
    const s = S.current, { w, h, layout, rows, cur, colorOf, nameOf, sub, on, related } = P.current;
    if (w <= 0 || h <= 0) return false;
    const th = (s.theme ??= { ink: cssVar("--ink"), muted: cssVar("--muted"), surface: cssVar("--surface"), line: cssVar("--line-2"), accent: cssVar("--accent"), warn: cssVar("--warn"), sans: cssVar("--sans") || "sans-serif" });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const base = baseScale(w, h, s.r0 || s.fit.radius), mo = motion(), hot = P.current.hot;
    let grow = false;
    const items = s.draw; items.length = 0;
    for (const { node, parent } of rows) {
      const o = layout.get(node.id); if (!o) continue;
      if (!s.born.has(node.id)) s.born.set(node.id, mo && s.ready ? now : -1e9);
      const e = clamp((now - s.born.get(node.id)!) / 420, 0, 1), k = 1 - (1 - e) ** 3;
      if (e < 1) grow = true;
      const po = parent ? layout.get(parent) : undefined;
      const pos = po && k < 1 ? { x: po.p.x + (o.p.x - po.p.x) * k, y: po.p.y + (o.p.y - po.p.y) * k, z: po.p.z + (o.p.z - po.p.z) * k } : o.p;
      const pr = project(pos, s.cam, w, h, base, s.fit.radius); if (!pr) continue;
      items.push({ id: node.id, x: pr.x, y: pr.y, rad: o.r * pr.s * (0.35 + 0.65 * k), depth: pr.depth, node, o, t: pr.t, e: k });
    }
    items.sort((a, b) => b.depth - a.depth);
    const pick = s.items; pick.length = 0; for (let i = items.length - 1; i >= 0; i--) pick.push(items[i]);   // nearest first, for picking
    const at = new Map(items.map((i) => [i.id, i]));
    const fade = (i: Item) => (0.4 + 0.6 * (1 - i.t)) * i.e * (related(i.id) ? 1 : 0.28);

    // links: the focused path at full strength, everything off it fades to 0.15
    ctx.lineCap = "round";
    const fadeL = (i: Item) => (0.4 + 0.6 * (1 - i.t)) * i.e * (related(i.id) ? 1 : 0.15);
    const hotIds = [...hot.keys()];   // ids are paths: a link is on a hotspot's way (or the focused node's) when its child id is a prefix of that id
    const lit = (id: string) => id === cur || cur.startsWith(`${id}/`) || id === s.hover || hotIds.some((h) => h === id || h.startsWith(`${id}/`));
    for (const it of items) {
      const par = it.o.parent ? at.get(it.o.parent) : null; if (!par) continue;
      ctx.globalAlpha = 0.34 * Math.min(fadeL(it), fadeL(par)) * (lit(it.id) || it.o.parent === cur ? 1 : 0.15);   // off the hotspot / focus path: 15% ctx.strokeStyle = resolve(colorOf(it.node)); ctx.lineWidth = Math.max(0.8, Math.min(5, it.rad * 0.35));
      ctx.beginPath(); ctx.moveTo(par.x, par.y); ctx.lineTo(it.x, it.y); ctx.stroke();
    }

    // nodes, far to near
    for (const it of items) {
      const n = it.node, r = Math.max(it.rad, 0.8), a = fade(it), col = resolve(colorOf(n)), hollow = n.kind === "session" || n.kind === "more";
      if (it.t > 0.66 && !hollow) {   // far: a soft, defocused disc instead of a crisp sphere
        ctx.fillStyle = col;
        for (const [m, k] of [[1.35, 0.25], [1.1, 0.4], [0.85, 0.7]] as const) { ctx.globalAlpha = a * k; ctx.beginPath(); ctx.arc(it.x, it.y, r * m, 0, 7); ctx.fill(); }
      } else {
        // expandability is fill: a collapsed parent is a solid sphere, an expanded one opens to a tinted disc with a rim
        const opened = P.current.open.has(n.id) && n.children.length > 0, spr = !hollow && r > 4 ? sprite(col) : null;
        if (spr) { ctx.globalAlpha = a * (opened ? 0.35 : 1); ctx.drawImage(spr, it.x - r, it.y - r, r * 2, r * 2); }
        else { ctx.globalAlpha = a * (opened && !hollow ? 0.35 : 1); ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, 7); ctx.fillStyle = hollow ? th.surface : col; ctx.fill(); }
        if (hollow || opened) { ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 2; if (n.kind === "more") ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
      }
      if (r >= 6 && n.kind !== "root" && n.kind !== "more" && n.sessions > 0) {   // friction ring
        ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.strokeStyle = th.line; ctx.beginPath(); ctx.arc(it.x, it.y, r + 3.5, 0, 7); ctx.stroke();
        ctx.strokeStyle = th.warn; ctx.beginPath(); ctx.arc(it.x, it.y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, n.friction)); ctx.stroke();
      }
      const ring = (extra: number, color: string, width: number, dash: number[] = []) => { ctx.globalAlpha = Math.max(a, 0.9); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); ctx.arc(it.x, it.y, r + extra, 0, 7); ctx.stroke(); ctx.setLineDash([]); };
      if (on(n.id)) ring(7, th.accent, 2);
      if (n.id === cur) { ring(7, th.accent, 2.5); if (s.focused) ring(12, th.accent, 2, [4, 3]); }
      if (n.id === s.hover && n.id !== cur) ring(6, th.ink, 1.5);
      if (hot.has(n.id)) ring(10, th.warn, 2, [5, 3]);
    }

    // labels: tools, the focused / hovered node with its children and ancestors, and hotspots. Everything else stays unlabelled
    // until its parent is focused or hovered. Hubs push their label radially away from their parent; a label never sits on its own
    // node or ring, nor (when a clear spot exists) on another node, and a greedy pass drops any non-hub label that would still collide.
    const anc = new Set<string>(); for (let id: string | null | undefined = cur; id; id = layout.get(id)?.parent) anc.add(id);
    // resting labels are capped at 8 (hotspots first, then by sessions); the rest appear on hover / focus
    const top = new Set(labelTop(items.filter((i) => i.o.depth <= 1 || hot.has(i.id)).map((i) => ({ id: i.id, w: i.node.sessions, hot: hot.has(i.id) })), 8));
    const shown = (i: Item) => top.has(i.id) || anc.has(i.id) || i.id === s.hover || i.o.parent === cur || (!!s.hover && i.o.parent === s.hover);
    const pri = (i: Item) => (i.id === cur ? 0 : hot.has(i.id) ? 1 : i.id === s.hover ? 2 : i.o.kind === "root" ? 3 : i.o.kind === "tool" ? 4 : 5 + i.o.depth);
    const placed = s.placed; placed.length = 0;
    const clash = (b: [number, number, number, number]) => placed.some((q) => boxesTouch(b, q, 4));   // 4 px gutter: labels never touch
    /** Radius a node occupies including its rings. */
    const occ = (i: Item) => i.rad + (hot.has(i.id) ? 14 : i.id === cur ? (s.focused ? 16 : 11) : i.rad >= 6 && i.o.kind !== "root" && i.o.kind !== "more" ? 8 : on(i.id) ? 11 : 3);
    const onNode = (b: [number, number, number, number], skip: Item | null, own: boolean) => items.some((o) => {
      if (own !== (o === skip)) return false;
      const nx = clamp(o.x, b[0], b[0] + b[2]), ny = clamp(o.y, b[1], b[1] + b[3]);
      return Math.hypot(o.x - nx, o.y - ny) < (own ? occ(o) : o.rad + 2);
    });
    const F1 = `600 12px ${th.sans}`, F2 = `12px ${th.sans}`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
    for (const it of items.filter(shown).sort((a, b) => pri(a) - pri(b) || a.depth - b.depth)) {
      const big = pri(it) <= 4, a = fade(it); if (!big && a < 0.3) continue;
      const hs = hot.get(it.id), rank = hs?.rank, name = nameOf(it.node), nm0 = name.length > 24 ? `${name.slice(0, 23)}…` : name, nm = rank ? `${rank}. ${nm0}` : nm0;
      const subtxt = hs ? hs.text : big ? sub(it.node) : "";
      const tw = measure(F1, nm, ctx), sw = subtxt ? measure(F2, subtxt, ctx) : 0, bw = Math.max(tw, sw) + 4, bh = subtxt ? 32 : 18;
      const par = it.o.parent ? at.get(it.o.parent) : null;
      const base0 = par ? Math.atan2(it.y - par.y, it.x - par.x) : 0;   // radial: away from the parent; the root defaults to the right
      const box = (th0: number): [number, number, number, number] => {
        const ux = Math.cos(th0), uy = Math.sin(th0), g = occ(it) + 4, px = it.x + ux * g, py = it.y + uy * g;
        const bx = ux > 0.4 ? px : ux < -0.4 ? px - bw : px - bw / 2, by = Math.abs(ux) > 0.4 ? py - bh / 2 + (uy * bh) / 2 : uy > 0 ? py : py - bh;
        return [bx - 2, by, bw, bh];
      };
      const inside = (b: [number, number, number, number]) => b[0] >= 2 && b[0] + b[2] <= w - 2 && b[1] >= 0 && b[1] + b[3] <= h;
      const angles = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI].map((d) => base0 + d);
      const free = (th0: number, others: boolean) => { const b = box(th0); return inside(b) && !onNode(b, it, true) && !clash(b) && (!others || !onNode(b, it, false)); };
      const th1 = angles.find((t) => free(t, true)) ?? (big ? angles.find((t) => free(t, false)) : undefined);
      if (th1 === undefined) continue;
      const [bx, by] = box(th1), x = bx + 2, y = by + 14;
      placed.push([bx, by, bw, bh]); ctx.globalAlpha = Math.max(0.75, a);
      ctx.lineWidth = 5; ctx.strokeStyle = th.surface;
      ctx.font = F1; ctx.strokeText(nm, x, y - 1); ctx.fillStyle = it.id === cur ? th.accent : th.ink; ctx.fillText(nm, x, y - 1);
      if (subtxt) { ctx.font = F2; ctx.strokeText(subtxt, x, y + 13); ctx.fillStyle = th.muted; ctx.fillText(subtxt, x, y + 13); }
    }
    ctx.globalAlpha = 1; s.ready = true;
    return grow;
  }

  // size the backing store, then repaint on any prop change
  useEffect(() => {
    const c = cv.current; if (!c || p.w <= 0 || p.h <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(p.w * dpr); c.height = Math.round(p.h * dpr);
    request();
  }, [p.w, p.h]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { request(); });  // eslint-disable-line react-hooks/exhaustive-deps

  // first layout: fit, then (when motion is allowed) a short intro turn
  useEffect(() => {
    if (p.w <= 0) return;
    const s = S.current, h0 = home();
    if (motion()) { s.cam = { ...h0, yaw: h0.yaw - 1.1, zoom: h0.zoom * 0.7 }; go(h0, 1100); } else { s.cam = h0; request(); }
  }, [p.w > 0]);  // eslint-disable-line react-hooks/exhaustive-deps

  // focus or visible set changed (click, keys, breadcrumb, expand / collapse / filter): fit and centre what the user is looking at
  const firstMove = useRef(true);
  useEffect(() => {
    if (firstMove.current) { firstMove.current = false; return; }
    if (p.w <= 0) return;
    go(target(), 650);
  }, [p.cur, p.rows]);  // eslint-disable-line react-hooks/exhaustive-deps

  // offscreen / hidden tabs stop rendering; wheel zoom only with ctrl/cmd (pinch) or once the canvas has focus
  useEffect(() => {
    const c = cv.current, b = box.current; if (!c || !b) return;
    const s = S.current;
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((es) => { s.visible = es[es.length - 1].isIntersecting; if (s.visible) request(); }, { threshold: 0 });
    io?.observe(c);
    const vis = () => { if (!document.hidden) request(); };
    document.addEventListener("visibilitychange", vis);
    let timer = 0;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === c)) {   // plain scroll belongs to the page; remind how to zoom
        b.dataset.hint = "1"; window.clearTimeout(timer); timer = window.setTimeout(() => { delete b.dataset.hint; }, 1600); return;
      }
      e.preventDefault();
      go({ zoom: s.cam.zoom * Math.exp(-clamp(e.deltaY, -60, 60) * (e.ctrlKey ? 0.01 : 0.004)) }, 0);
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", vis); c.removeEventListener("wheel", wheel); window.clearTimeout(timer); cancelAnimationFrame(s.raf); s.raf = 0; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => { const r = cv.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: RPE) => {
    if (e.button !== 0) return;
    const s = S.current; cv.current?.setPointerCapture(e.pointerId); s.ptr.set(e.pointerId, local(e));
    if (s.ptr.size === 1) s.drag = { ...local(e), moved: false }; else { s.drag = null; const [a, b] = [...s.ptr.values()]; s.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const move = (e: RPE) => {
    const s = S.current, pt = local(e), prev = s.ptr.get(e.pointerId);
    if (prev) {
      s.ptr.set(e.pointerId, pt);
      if (s.ptr.size === 2) { const [a, b] = [...s.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (s.pinch > 0) go({ zoom: s.cam.zoom * (d / s.pinch) }, 0); s.pinch = d; return; }
      const d = s.drag;
      if (d) {
        if (!d.moved && Math.hypot(pt.x - d.x, pt.y - d.y) < 5) return;
        d.moved = true; s.anim = null;
        s.cam = { ...s.cam, yaw: s.cam.yaw + (pt.x - prev.x) * 0.006, pitch: clamp(s.cam.pitch + (pt.y - prev.y) * 0.006, -1.35, 1.35) };
        cv.current!.style.cursor = "grabbing"; request(); return;
      }
    }
    const id = pickNode(s.items, pt.x, pt.y);
    if (id !== s.hover) {
      s.hover = id; cv.current!.style.cursor = id ? "pointer" : "grab";
      const it = id ? s.items.find((i) => i.id === id) : null;
      setHover(it ? { id: it.id, x: it.x, y: it.y } : null); request();
    }
  };
  const up = (e: RPE) => {
    const s = S.current, d = s.drag; s.ptr.delete(e.pointerId); s.drag = null; s.pinch = 0;
    if (cv.current) cv.current.style.cursor = s.hover ? "pointer" : "grab";
    if (d && !d.moved && e.type === "pointerup") {
      const id = pickNode(s.items, d.x, d.y), n = id ? s.items.find((i) => i.id === id)?.node : null;
      if (n) { if (e.detail >= 2) P.current.onApply(n); else P.current.onPick(n); }
      cv.current?.focus({ preventScroll: true });
    }
  };
  const leave = () => { const s = S.current; if (s.hover) { s.hover = null; setHover(null); request(); } };
  /** Touch: the canvas keeps pan-y (the page scrolls) until "Tap to rotate" turns on touch-action none; Done, Esc or a tap outside turn it off. */
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (!touch) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setTouch(false); };
    document.addEventListener("pointerdown", out); return () => document.removeEventListener("pointerdown", out);
  }, [touch]);
  const key = (e: RKE) => {
    if (e.key === "Escape" && touch) { e.preventDefault(); setTouch(false); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.3); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.3); }
    else if (e.key === "0") { e.preventDefault(); reset(); }
    else P.current.onKey(e);
  };
  const hn = hover ? p.rows.find((r) => r.node.id === hover.id)?.node : null;
  const [help, setHelp] = useState(false);
  const helpBtn = useRef<HTMLButtonElement>(null);

  return (
    <div className="mm3" ref={box} data-touch={touch || undefined}>
      <canvas ref={cv} style={{ width: p.w, height: p.h }} tabIndex={0} role="application" aria-roledescription="3D map" aria-label={p.label} aria-describedby="mm-keys"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave}
        onFocus={() => { S.current.focused = true; request(); }} onBlur={() => { S.current.focused = false; request(); }} onKeyDown={key} />
      {hn && hover && <div className="mm-tip" style={{ left: clamp(hover.x + 14, 8, Math.max(8, p.w - 190)), top: clamp(hover.y + 14, 8, Math.max(8, p.h - 70)) }} aria-hidden="true"><b>{p.nameOf(hn)}</b><span>{p.sub(hn)}</span></div>}
      <div className="mm-zoom seg" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>−</button>
        <button type="button" aria-label={`Reset view, zoom ${zoomPct}%`} onClick={reset}>{zoomPct}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.3)}>+</button>
      </div>
      <button type="button" className="btn mm-touch" aria-pressed={touch} onClick={() => setTouch(!touch)}>{touch ? "Done" : "Tap to rotate"}</button>
      <p className="mm-wheel" aria-hidden="true">⌘/Ctrl + scroll to zoom</p>
      <div className="mm-help" onKeyDown={(e) => { if (e.key === "Escape" && help) { e.stopPropagation(); setHelp(false); helpBtn.current?.focus(); } }}>
        <button ref={helpBtn} type="button" className="btn mm-q" aria-expanded={help} aria-controls={help ? "mm-keys" : undefined} aria-label="Map controls" onClick={() => setHelp((x) => !x)}>?</button>
        <div id="mm-keys" className="pop mm-pop" hidden={!help}>
          Drag to rotate, click to fly and expand, double-click to filter. Keys: arrows move, Enter expands, Space filters, + and − zoom, 0 resets. Solid = collapsed, rimmed = expanded.
        </div>
      </div>
    </div>
  );
}
