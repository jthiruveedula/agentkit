// SVG sunburst for the mind map (layout math in lib/sunburst.ts). The hub is the focused node; rings go tool > intent > project > session.
// Arc length = share of the chosen metric, fill = the tool's hue (lighter each ring out), the red outer edge = struggled above the average
// (only on enough sessions, lib/sunburst `edgeOf`), dashed outline + numbered callout = hotspot. Picking a node one level down zooms
// (one tween of the window); the hub zooms back out. A shallow view stretches its rings to the rim.
// Motion only under html.fx without reduced motion, only while a tween runs, and never offscreen (it snaps instead).
// Keyboard focus survives every zoom: the selected arc is never unmounted mid-tween, and a layout effect puts focus back on it.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as RKE } from "react";
import type { MapNode } from "../lib/mindmap";
import { arcLine, arcOf, arcPath, clip, easeInOut, edgeOf, fitNum, focusOf, glyphW, lerpPart, lerpWin, nameFit, placeChart, RINGS, radiusAt, ringsFor, split2, stack, winOf, type Arc, type Part, type Win } from "../lib/sunburst";
import { srcColor } from "../lib/palette";
import { fxOn, onReveal, reducedNow } from "../lib/hooks";

interface Props {
  w: number; h: number; parts: ReadonlyMap<string, Part>; shown: ReadonlySet<string>; cur: string; open: ReadonlySet<string>;
  /** hotspot callouts by branch id: `note` when it fits beside the chart, else `short` */
  hot: ReadonlyMap<string, { rank: number; label: string; note: string; short: string }>;
  nameOf: (n: MapNode) => string; ariaOf: (n: MapNode) => string;
  /** the node's value on the metric, as shown ("unpriced" for a cost nobody priced) */ fmt: (n: MapNode) => string;
  /** small hub lines under the value, each [full, short] (the short one when the full one does not fit the disc's chord) */ info: (n: MapNode) => [string, string][];
  metric: string; related: (id: string) => boolean; label: string; describedBy: string;
  /** px of the chart's right side under an open side panel: the chart re-centres in what is left (lib/sunburst placeChart) */ cover?: number;
  onPick: (n: MapNode) => void; onApply: (n: MapNode) => void; onKey: (e: RKE) => void; onUp: () => void; onSel: (id: string) => void; onHot: (id: string) => void;
}
interface Drawn { p: Part; a: Arc; k: number }
interface Frame { win: Win; parts: ReadonlyMap<string, Part> }
interface Anim { from: Frame; to: Frame; e: number }

const MS = 560, SWEEP_MS = 900, HEAT = 6, CW = 7, DBL_MS = 800;
const motion = () => fxOn() && !reducedNow();
/** Fill strength (% of the tool hue over the surface) by kind: the tool ring is strongest, each ring out is lighter. Dark text stays above 4.5:1. */
const TINT: Record<string, number> = { tool: 44, intent: 30, project: 20, session: 13 };
const toolOf = (n: MapNode) => (n.kind === "tool" ? n.label : n.src ?? "other");
const fillOf = (n: MapNode) => (n.kind === "more" ? "var(--sunk)" : `color-mix(in oklab, ${srcColor(toolOf(n))} ${TINT[n.kind] ?? 20}%, var(--surface))`);
/** Heat 0..1 (lib/sunburst `edgeOf`) on a ramp from a faint tint to --bad. */
const heatOf = (k: number) => `color-mix(in oklab, var(--bad) ${Math.round(25 + 75 * k)}%, var(--surface))`;
const sameWin = (a: Win, b: Win) => a.x0 === b.x0 && a.x1 === b.x1 && a.d === b.d && a.n === b.n;
/** The frame a tween is drawing right now (where an interrupting tween starts from). */
const frameOf = (a: Anim): Frame => ({ win: lerpWin(a.from.win, a.to.win, a.e), parts: new Map([...a.to.parts].map(([id, q]) => [id, lerpPart(a.from.parts.get(id), q, a.e)])) });

export function Sunburst(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const W = p.w || 720, H = p.h || 520;   // jsdom and the first frame have no size yet
  const { R, dx, moved } = placeChart(W, H, p.cover), cx = W / 2, cy = H / 2;
  const focus = focusOf(p.parts, p.cur) ?? p.parts.values().next().value!;
  const target = winOf(focus, ringsFor(p.parts, p.shown, focus));
  const [hover, setHover] = useState<string | null>(null);
  const uid = useId().replace(/[^\w-]/g, ""), avg = p.parts.values().next().value?.node.struggled ?? 0;

  // ---- tween: zoom window, ring count and metric morph share one eased clock. It starts from the frame on screen (so an interrupted tween
  // never jumps) and its first frame is set before paint (so the end state never flashes).
  const settled = useRef<Frame>({ win: target, parts: p.parts });
  const [anim, setAnim] = useState<Anim | null>(null);
  const inView = () => { const r = svg.current?.getBoundingClientRect(); return !!r && r.bottom > 0 && r.top < innerHeight && !document.hidden; };
  useLayoutEffect(() => {
    const to = { win: target, parts: p.parts }, from = anim ? frameOf(anim) : settled.current;
    settled.current = to;
    if (from.parts === to.parts && sameWin(from.win, to.win)) return;
    if (!motion() || !inView()) { setAnim(null); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => { const e = motion() ? easeInOut((t - t0) / MS) : 1; setAnim(e < 1 ? { from, to, e } : null); if (e < 1) raf = requestAnimationFrame(step); };
    setAnim({ from, to, e: 0 });
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p.parts, target.x0, target.x1, target.d, target.n]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reveal: the rings sweep open once when the section scrolls in (motion on only)
  const [sweep, setSweep] = useState(() => (motion() ? 0 : 1));
  useEffect(() => {
    if (!motion()) { setSweep(1); return; }
    let raf = 0;
    const off = onReveal(svg.current, () => {
      if (!motion()) { setSweep(1); return; }
      const t0 = performance.now();
      const step = (t: number) => { if (!motion()) { setSweep(1); return; } const e = easeInOut((t - t0) / SWEEP_MS); setSweep(e); if (e < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    });
    return () => { off(); cancelAnimationFrame(raf); setSweep(1); };
  }, []);

  // ---- focus: while the chart had keyboard focus, it stays on the selection. `had` drops only when focus moves outside the chart
  // (a removed element fires no blur, so a zoom never clears it); `ptr` marks focus that came from the pointer (it selects on click, not on focus).
  const had = useRef(false), ptr = useRef(false), pick = useRef<{ id: string; t: number } | null>(null);
  useLayoutEffect(() => {
    if (!had.current || !svg.current) return;
    const a = document.activeElement as SVGElement | null;
    if (a && svg.current.contains(a) && a.dataset?.id === p.cur) return;
    svg.current.querySelector<SVGElement>(`[data-id="${CSS.escape(p.cur)}"]`)?.focus({ preventScroll: true });
  });

  // ---- what to draw this frame (mid-tween: the tween's own end state, so new props never jump a running frame)
  const to = anim ? anim.to : { win: target, parts: p.parts };
  const win = anim ? lerpWin(anim.from.win, to.win, anim.e) : target;
  const drawn: Drawn[] = [];
  for (const q of to.parts.values()) {
    const k = q.depth - win.d, keep = q.id === p.cur && q.id !== focus.id;   // the selection always stays mounted (it may hold focus)
    if (!p.shown.has(q.id) || k > RINGS + 1 || (k <= 0 && !keep)) continue;
    const a = arcOf(anim ? lerpPart(anim.from.parts.get(q.id), q, anim.e) : q, win, R, sweep);
    if (!keep && (a.r1 - a.r0 < 0.5 || a.a1 - a.a0 < 0.0015)) continue;
    drawn.push({ p: q, a, k });
  }
  const byId = new Map(drawn.map((d) => [d.p.id, d]));
  const curD = byId.get(p.cur), hubR = radiusAt(1, R) - 2;
  const tab = (id: string) => (id === p.cur || (id === focus.id && !curD) ? 0 : -1);
  const tree = (q: Part) => {
    const sib = q.parent ? p.parts.get(q.parent)!.node.children : [q.node];
    return { "aria-level": q.depth + 1, "aria-setsize": sib.length, "aria-posinset": sib.findIndex((c) => c.id === q.id) + 1, "aria-selected": q.id === p.cur, "aria-expanded": q.node.children.length ? p.open.has(q.id) : undefined };
  };

  // hub readout: what the pointer is over (while it is drawn), else the selection; its parent heads it when it is not the hub itself
  const rq = p.parts.get(hover && byId.has(hover) ? hover : p.cur) ?? focus, rd = rq.node;
  const head = rq.id !== focus.id && rq.parent ? p.parts.get(rq.parent)?.node : undefined;
  const big = hubR >= 54;
  /** hub lines: text, its short form, class, line height, average glyph width (12px bold names, 22px values, 12px regular meta), and whether it is a name */
  type Line = [string, string, string, number, number, boolean?];
  const meta = ([t, short]: [string, string]): Line => [t, short, "sb-m", 15, 6];
  const name = p.nameOf(rd), value = p.fmt(rd), up = big && head ? p.nameOf(head) : "";
  const lines: Line[] = [...(up ? [[`${up} ›`, `${up} ›`, "sb-m", 15, 6, true] as Line] : []), [name, name, "sb-n", 17, CW, true], [value, value, "sb-v", 28, 13], ...(big ? p.info(rd).map(meta) : [])];
  let ly = cy - lines.reduce((s, l) => s + l[3], 0) / 2;
  const hubText = lines.map(([t, short, cls, lh, cw, isName]) => {   // each line fits the disc's chord at its height: in full, else its short form, else a name clips and a number shortens (never "$504.…")
    const y = ly + lh / 2, off = Math.abs(y - cy) + lh / 2, chord = 2 * Math.sqrt(Math.max(0, hubR * hubR - off * off)) - 4, n = Math.max(3, Math.floor(chord / cw));
    ly += lh;
    const pick = t.length <= n ? t : short;
    return { t: isName ? clip(pick, n) : fitNum(pick, n), cls, y };
  });

  // hotspot callouts: each points at its arc, or the nearest drawn ancestor when its branch is folded or hidden behind "+N more"
  const room = Math.max(4, Math.floor((W / 2 - R - 62) / CW));   // 14+ characters on a W-limited chart (side 160+): "auth-service", "5/45 sessions"
  const calls = [...p.hot].flatMap(([id, x0]) => {
    const seg = id.split("/");
    let q: Part | undefined;
    for (let i = seg.length; i > 0 && !q; i--) q = p.parts.get(seg.slice(0, i).join("/"));
    while (q && !byId.has(q.id)) q = q.parent ? p.parts.get(q.parent) : undefined;
    const d = q && byId.get(q.id);
    if (!d) return [];
    const m = (d.a.a0 + d.a.a1) / 2, right = Math.sin(m) >= 0, re = R + 10, lx = right ? cx + R + 30 : cx - R - 30;
    const note = fitNum(x0.note.length <= room ? x0.note : x0.short, room), x = { ...x0, note };   // money shortens, never "$143.90/$158.1…"
    const wide = 28 + Math.min(room, Math.max(x.label.length, note.length)) * CW;   // badge + text: the click target, not just the 18px badge
    const l = right ? lx - 4 : lx + 4 - wide;
    if (moved && (l + dx < 0 || l + wide + dx > W - (p.cover ?? 0))) return [];   // re-centred beside a panel: no callout under it or off the card
    return [{ id, x, right, lx, wide, ax: cx + d.a.r1 * Math.sin(m), ay: cy - d.a.r1 * Math.cos(m), ex: cx + re * Math.sin(m), ey: cy - re * Math.cos(m), exact: d.p.id === id }];
  });
  for (const right of [true, false]) {
    const g = calls.filter((c) => c.right === right).sort((a, b) => a.ey - b.ey), ys = stack(g.map((c) => c.ey), 38, 18, H - 30);
    g.forEach((c, i) => { c.ey = ys[i]; });
  }

  return (
    <div className="sb">
      <svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="tree" aria-label={p.label} aria-describedby={p.describedBy}
        onKeyDown={(e) => { ptr.current = false; p.onKey(e); }} onPointerDown={() => { ptr.current = true; }}
        onFocus={() => { had.current = true; }} onBlur={(e) => { had.current = !!svg.current?.contains(e.relatedTarget as Node | null); if (!had.current) ptr.current = false; }}
        onClick={(e) => {   // a double-click applies the node its first click picked (the arcs may have moved under the pointer since)
          if (e.detail < 2) return;
          const last = pick.current && e.timeStamp - pick.current.t < DBL_MS ? pick.current.id : (e.target as Element).closest<SVGElement>(".sb-arc")?.dataset.id;
          const n = last ? p.parts.get(last)?.node : undefined;
          pick.current = null;
          if (n) p.onApply(n);
        }}
        onPointerMove={(e) => {   // the readout follows real pointer moves only: an arc sliding under a still pointer (a zoom) never takes it
          if (!e.movementX && !e.movementY) return;
          setHover((e.target as Element).closest<SVGElement>(".sb-arc")?.dataset.id ?? null);
        }}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" className="sb-hatch" /></pattern>
        </defs>
        <g className="sb-shift" style={dx ? { transform: `translateX(${dx.toFixed(1)}px)` } : undefined}>
        <g className="sb-hub" data-id={focus.id} role="treeitem" tabIndex={tab(focus.id)} {...tree(focus)}
          aria-label={`${p.ariaOf(focus.node)}${focus.parent ? ". Centre: zoom out" : ""}`} onClick={(e) => { if (e.detail < 2) { setHover(null); p.onUp(); } }}
          onFocus={() => { if (!ptr.current && focus.id !== p.cur) p.onSel(focus.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); p.onUp(); } }}>
          <circle cx={cx} cy={cy} r={hubR} className="sb-disc" data-sel={!curD || undefined} />
          {focus.parent && <circle cx={cx} cy={cy} r={hubR - 3} className="sb-ring" style={{ stroke: srcColor(toolOf(focus.node)) }} />}
          <g aria-hidden="true">
            {hubText.map((l, i) => <text key={i} x={cx} y={l.y.toFixed(1)} textAnchor="middle" dominantBaseline="central" className={l.cls}>{l.t}</text>)}
          </g>
        </g>
        <g className="sb-arcs">
          {drawn.map(({ p: q, a }) => (
            <path key={q.id} d={arcPath(cx, cy, a.r0, a.r1, a.a0, a.a1)} fillRule="evenodd" className="sb-arc" data-id={q.id} data-kind={q.node.kind}
              data-dim={!p.related(q.id) || undefined} style={{ fill: fillOf(q.node) }} role="treeitem" tabIndex={tab(q.id)} aria-label={p.ariaOf(q.node)} {...tree(q)}
              onFocus={() => { setHover(null); if (!ptr.current && q.id !== p.cur) p.onSel(q.id); }}
              onClick={(e) => { if (e.detail < 2) { pick.current = { id: q.id, t: e.timeStamp }; setHover(null); p.onPick(q.node); } }} />
          ))}
        </g>
        <g className="sb-deco" aria-hidden="true">
          {drawn.map(({ p: q, a, k }) => {
            const ed = q.node.kind === "more" || (p.metric === "cost" && !q.node.priced) ? null : edgeOf(q.node, avg);   // no edge on an unpriced sliver: its size means nothing
            return <g key={q.id}>
              {p.metric === "cost" && q.node.priced === 0 && <path d={arcPath(cx, cy, a.r0, a.r1, a.a0, a.a1)} fillRule="evenodd" style={{ fill: `url(#${uid}-hatch)` }} />}
              {ed && a.r1 - a.r0 > HEAT * 2 && <path className="sb-edge" data-edge={q.id} data-faded={ed.faded || undefined} d={arcPath(cx, cy, a.r1 - HEAT, a.r1 - 1, a.a0, a.a1)} fillRule="evenodd" style={{ fill: heatOf(ed.k) }} />}
              {k <= 1 && q.node.kind !== "more" && <path d={arcPath(cx, cy, a.r0 + 1, a.r0 + 4, a.a0, a.a1)} fillRule="evenodd" style={{ fill: srcColor(toolOf(q.node)) }} />}
            </g>;
          })}
        </g>
        <g className="sb-labels" aria-hidden="true">
          {drawn.map(({ p: q, a }, i) => {
            const name = q.node.kind === "more" ? `+${q.node.more ?? ""}` : p.nameOf(q.node), f = nameFit(cx, cy, a, name), cls = f?.small ? "sb-n sb-n-sm" : "sb-n";
            if (!f) return null;
            if (f.mode === "rad") {   // straight along the radius; a long name wraps onto a second line when the arc is wide enough
              const two = f.lines === 2 ? split2(name, f.chars) : null;
              return <g key={q.id}><text transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.rot.toFixed(1)})`} textAnchor="middle" dominantBaseline="central" className={cls}>
                {two ? <><tspan x="0" dy="-0.6em">{two[0]}</tspan><tspan x="0" dy="1.2em">{two[1]}</tspan></> : clip(name, f.chars)}
              </text></g>;
            }
            // curved: the name on the outer line (inner on the lower half, where the text runs the other way), the value under it
            const mr = (a.r0 + a.r1) / 2, two = f.lines === 2, s = f.flip ? -1 : 1, line = (r: number, j: number, cls: string | undefined, txt: string) => {
              const id = `${uid}-${i}-${j}`;
              return <g key={j}><path id={id} d={arcLine(cx, cy, r, a.a0, a.a1, f.flip)} fill="none" /><text dominantBaseline="central" className={cls}><textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{txt}</textPath></text></g>;
            };
            // the value gets the name's room at its own glyph width (digits 7px, conservative); a value that only fits clipped is dropped, not "$18.…"
            const val = two ? fitNum(p.fmt(q.node), Math.floor((f.chars * glyphW(name) * (f.small ? 0.875 : 1)) / CW)) : "";
            return <g key={q.id}>{val ? [line(mr + 8 * s, 0, cls, clip(name, f.chars)), line(mr - 8 * s, 1, undefined, val)] : line(mr, 0, cls, clip(name, f.chars))}</g>;
          })}
        </g>
        <g className="sb-over" aria-hidden="true">
          {[...p.hot.keys()].map((id) => { const d = byId.get(id); return d && <path key={id} className="sb-hot" d={arcPath(cx, cy, d.a.r0 + 1, d.a.r1 - 1, d.a.a0, d.a.a1)} />; })}
          {curD && <path className="sb-sel" d={arcPath(cx, cy, curD.a.r0, curD.a.r1, curD.a.a0, curD.a.a1)} />}
        </g>
        <g className="sb-calls" aria-hidden="true">
          {calls.map((c) => {
            const { lx, wide, x: { note } } = c, dir = c.right ? 1 : -1;
            return <g key={c.id} className="sb-call" onClick={() => p.onHot(c.id)}>
              <rect className="sb-hit" x={c.right ? lx - 4 : lx + 4 - wide} y={c.ey - 18} width={wide} height={36} />
              <polyline points={`${c.ax.toFixed(1)},${c.ay.toFixed(1)} ${c.ex.toFixed(1)},${c.ey.toFixed(1)} ${(lx - dir * 4).toFixed(1)},${c.ey.toFixed(1)}`} strokeDasharray={c.exact ? undefined : "3 3"} />
              <circle cx={c.ax} cy={c.ay} r={3} />
              <circle cx={lx + dir * 9} cy={c.ey} r={9} className="sb-badge" />
              <text x={lx + dir * 9} y={c.ey} textAnchor="middle" dominantBaseline="central" className="sb-rank">{c.x.rank}</text>
              <text x={lx + dir * 24} y={c.ey} textAnchor={c.right ? "start" : "end"}>
                <tspan x={lx + dir * 24} dy="-0.15em" className="sb-n">{clip(c.x.label, room)}</tspan>
                <tspan x={lx + dir * 24} dy="1.3em" className="sb-m">{note}</tspan>
              </text>
            </g>;
          })}
        </g>
        </g>
      </svg>
    </div>
  );
}
