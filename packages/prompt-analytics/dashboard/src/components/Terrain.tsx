// Interactive 3D terrain (canvas 2D, orthographic) for the hour-of-week heatmap. Lazy-loaded: only mounted once 3D is toggled on.
// Heights are value / max from a zero floor. Drag = orbit, Ctrl/Cmd+wheel (or wheel while focused) = zoom, arrows rotate, +/- zoom, Esc/0/Reset = home.
// The rAF loop runs only while something moves (drag, inertia, reset animation); hover and key steps redraw once. No React state per frame.
import { useEffect, useRef } from "react";
import { bars, centre, proj, fitScale, keyStep, pickBar, describeT, clampTilt, T_DEFAULT, wrapYaw, zoomAround, type Bar, type TCam, type TGrid } from "../lib/terrain";
import { inertia } from "../lib/calorbit";
import { cssVar } from "../lib/palette";
import { reducedNow, useSize } from "../lib/hooks";

export interface TCell { v: number; /** colour family and strength 0..1 */ tone: "accent" | "muted" | "none"; mix: number; tip: string; /** outlined (survives the multiple-test correction) */ mark?: boolean }
interface Props { cells: TCell[]; max: number; maxText: string; rows: string[]; colLabel: (c: number) => string; cols: number; summary: string }

const GRID = (cols: number, rows: number): TGrid => ({ cols, rows, hmax: 3, dy: 2.2 });
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

export default function Terrain({ cells, max, maxText, rows, colLabel, cols, summary }: Props) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), tip = useRef<HTMLDivElement>(null), live = useRef<HTMLParagraphElement>(null);
  const size = useSize(box);
  const P = useRef({ cells, max, maxText, rows, colLabel, cols });
  P.current = { cells, max, maxText, rows, colLabel, cols };
  const S = useRef({ cam: { ...T_DEFAULT } as TCam, vel: { yaw: 0, pitch: 0 }, raf: 0, last: 0, drag: false, hover: -1, sorted: [] as Bar[], anim: null as null | { from: TCam; to: TCam; t0: number }, draw: () => {}, step: (_: Partial<TCam>) => {}, home: () => {}, colors: new Map<string, string>() });

  useEffect(() => {
    const el = cv.current, bx = box.current;
    if (!el || !bx || size.w < 40 || size.h < 40) return;
    const s = S.current, ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = DPR(), w = size.w, h = size.h;
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    s.colors.clear();
    const col = (k: string) => { let c = s.colors.get(k); if (!c) { c = cssVar(k); s.colors.set(k, c); } return c; };
    const fill = (c: TCell) => c.tone === "none" ? col("--sunk") : `color-mix(in oklch, ${col(c.tone === "accent" ? "--accent" : "--muted")} ${Math.round(14 + c.mix * 56)}%, ${col("--sunk")})`;
    const say = (t: string) => { if (live.current) live.current.textContent = t; };
    const draw = () => {
      const t0 = performance.now(), { cells: cs, max: mx, rows: rl, colLabel: cl, cols: nc } = P.current, g = GRID(nc, rl.length), c = s.cam;
      const base = fitScale(c, g, w, h), ink = col("--ink"), muted = col("--muted"), line = col("--line-2");
      s.sorted = bars(cs.map((x) => x.v), mx, c, g, base, w, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.font = `12px ${col("--sans") || "system-ui, sans-serif"}`; ctx.textBaseline = "middle";
      const oy = centre(c, g, base).y * c.zoom, k = base * c.zoom, cam = { ...c, ty: c.ty + oy };
      const at = (x: number, y: number, z = 0) => proj(x, y, z, cam, g, k, w, h);
      // floor outline (zero baseline)
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath();
      [[0, 0], [nc, 0], [nc, rl.length], [0, rl.length]].forEach(([x, y], i) => { const p = at(x, y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
      // bars, far to near
      const hov = s.hover;
      for (const b of s.sorted) {
        const cell = cs[b.i], f = fill(cell);
        for (const q of b.quads) {
          ctx.beginPath(); q.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
          ctx.fillStyle = f; ctx.fill();
          if (q.kind === "side") { ctx.fillStyle = "rgba(10, 24, 70, 0.24)"; ctx.fill(); }
          else if (cell.mark || b.i === hov) { ctx.lineWidth = b.i === hov ? 2 : 2.5; ctx.strokeStyle = b.i === hov && !cell.mark ? col("--accent") : ink; ctx.stroke(); }
        }
      }
      // labels: weekday on the left edge, hours on the bottom edge, both follow the edge when the terrain turns
      ctx.fillStyle = muted; ctx.textAlign = "center";
      const gap = Math.hypot(at(0, 1).x - at(0, 0).x, at(0, 1).y - at(0, 0).y), every = gap < 13 ? 2 : 1;   // thin the weekday labels when rows are closer than a line of text
      rl.forEach((r, i) => { if (i % every) return; const p = at(-0.9, i + 0.5); ctx.fillText(r, p.x, p.y); });
      for (let x = 0; x < nc; x += 6) { const p = at(x + 0.5, rl.length + 0.9); ctx.fillText(cl(x), p.x, p.y); }
      const lastX = nc - 1; if (lastX % 6) { const p = at(lastX + 0.5, rl.length + 0.9); ctx.fillText(cl(lastX), p.x, p.y); }
      el.dataset.ms = (performance.now() - t0).toFixed(2);
    };
    const frame = (t: number) => {
      s.raf = 0;
      const dt = Math.min(64, Math.max(0, t - s.last)); s.last = t;
      if (s.anim) {
        const p = Math.min(1, (t - s.anim.t0) / 320), e = 1 - (1 - p) ** 3, { from, to } = s.anim;
        s.cam = { yaw: from.yaw + wrapYaw(to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e, tx: from.tx * (1 - e), ty: from.ty * (1 - e) };
        if (p >= 1) s.anim = null;
      } else if (s.vel.yaw || s.vel.pitch) {
        s.cam.yaw = wrapYaw(s.cam.yaw + s.vel.yaw * dt); s.cam.pitch = clampTilt(s.cam.pitch + s.vel.pitch * dt);
        s.vel = { yaw: inertia(s.vel.yaw, dt), pitch: inertia(s.vel.pitch, dt) };
      }
      draw();
      if (s.anim || s.vel.yaw || s.vel.pitch) s.raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!s.raf && !document.hidden) { s.last = performance.now(); s.raf = requestAnimationFrame(frame); } };
    s.draw = () => { if (!s.raf) draw(); };
    s.step = (d) => { s.vel = { yaw: 0, pitch: 0 }; s.anim = null; s.cam = { ...s.cam, ...d }; if (s.cam.zoom <= 1.001) Object.assign(s.cam, { tx: 0, ty: 0 }); draw(); say(describeT(s.cam)); };
    s.home = () => { s.vel = { yaw: 0, pitch: 0 }; if (reducedNow()) { s.anim = null; s.cam = { ...T_DEFAULT }; draw(); } else { s.anim = { from: s.cam, to: { ...T_DEFAULT }, t0: performance.now() }; kick(); } say("View reset to the plan-like default");  };

    const pos = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const showTip = (i: number, x: number, y: number) => {
      const t = tip.current; if (!t) return;
      if (i < 0) { t.hidden = true; return; }
      t.hidden = false; t.textContent = P.current.cells[i].tip;
      t.style.transform = `translate(${Math.min(Math.max(4, x + 12), w - t.offsetWidth - 4)}px, ${Math.max(4, y - 30)}px)`;
    };
    let last = { x: 0, y: 0, t: 0 }, pinch = 0;
    const ptr = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => { ptr.set(e.pointerId, pos(e)); el.setPointerCapture?.(e.pointerId); s.drag = ptr.size === 1; last = { ...pos(e), t: e.timeStamp }; s.vel = { yaw: 0, pitch: 0 }; s.anim = null; };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      if (ptr.has(e.pointerId)) {
        ptr.set(e.pointerId, p);
        if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) { const z = zoomAround({ x: (a.x + b.x) / 2 - w / 2, y: (a.y + b.y) / 2 - h / 2 }, { ...s.cam, yaw: 0, pitch: 0 }, s.cam.zoom * d / pinch); s.cam = { ...s.cam, ...z }; s.draw(); } pinch = d; return; }
        const dx = p.x - last.x, dy = p.y - last.y, dt = Math.max(1, e.timeStamp - last.t);
        s.cam.yaw = wrapYaw(s.cam.yaw + dx * 0.4); s.cam.pitch = clampTilt(s.cam.pitch + dy * 0.3);
        s.vel = { yaw: (dx * 0.4) / dt, pitch: (dy * 0.3) / dt }; last = { ...p, t: e.timeStamp };
        s.hover = -1; showTip(-1, 0, 0); if (!s.raf) draw(); return;
      }
      const i = pickBar(s.sorted, p.x, p.y);
      if (i !== s.hover) { s.hover = i; s.draw(); }
      showTip(i, p.x, p.y);
    };
    const up = (e: PointerEvent) => {
      ptr.delete(e.pointerId); pinch = 0;
      if (!ptr.size && s.drag) { s.drag = false; if (reducedNow() || e.timeStamp - last.t > 80) s.vel = { yaw: 0, pitch: 0 }; else kick(); }
    };
    const leave = () => { s.hover = -1; showTip(-1, 0, 0); s.draw(); };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === el)) return;
      e.preventDefault(); const p = pos(e);
      s.step(zoomAround({ x: p.x - w / 2, y: p.y - h / 2 }, { ...s.cam }, s.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "0") { e.preventDefault(); s.home(); return; }
      const d = keyStep(s.cam, e.key); if (d) { e.preventDefault(); s.step(d); }
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("keydown", key); el.addEventListener("dblclick", s.home);
    // a visible, hidden-tab or offscreen terrain draws nothing: the loop stops itself, and a resize / data change redraws once
    draw();
    return () => {
      cancelAnimationFrame(s.raf); s.raf = 0;
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel); el.removeEventListener("keydown", key); el.removeEventListener("dblclick", s.home);
    };
  }, [size.w, size.h]);
  useEffect(() => { S.current.draw(); }, [cells, max]);

  return (
    <div className="ter" ref={box}>
      <canvas ref={cv} tabIndex={0} role="group" aria-label={`3D terrain. ${summary} Arrow keys rotate and tilt, plus and minus zoom, Escape resets. The table below has every value.`} style={{ width: size.w, height: size.h }} />
      <div className="ter-tip" ref={tip} hidden />
      <p className="sr-only" aria-live="polite" ref={live} />
      <button type="button" className="btn ter-reset" onClick={() => S.current.home()}>Reset view</button>
      <span className="ter-hint" aria-hidden="true">Bar height: 0 to {maxText}<br />Drag to orbit, Ctrl/Cmd + scroll to zoom</span>
    </div>
  );
}
