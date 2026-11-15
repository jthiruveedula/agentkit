// Inline-SVG charts. No chart library: marks are plain elements, every mark is keyboard-reachable (roving tabindex)
// and activates through the same callback a click does. Each chart is paired with an sr-only DataTable by its caller.
import type React from "react";
import { useId, useRef, useState, type KeyboardEvent as RKE, type PointerEvent as RPE, type RefObject } from "react";
import { useMorph, useRoving, useSize } from "../lib/hooks";
import { iqr } from "../lib/baseline";
import { niceTicks } from "../lib/trend";
import "./baseline.css";

/** Sparkline ceiling. `cap` clips at 2x the 75th percentile of non-zero values, so one spike day cannot flatten the rest. */
export function sparkTop(values: number[], cap = false): number {
  const top = Math.max(...values, 0);
  if (!cap) return top;
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length < 4) return top;
  return Math.min(top, 2 * nz[Math.floor((nz.length - 1) * 0.75)]);
}

/** Line path for a sparkline: a null breaks the line (a gap, never 0); a lone point between gaps is a zero-length dot (round cap). */
export function sparkPath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "", run = 0;
  values.forEach((v, i) => {
    if (v === null) { if (run === 1) d += "h0"; run = 0; return; }
    d += `${run ? "L" : "M"}${+x(i).toFixed(2)},${+y(v).toFixed(2)}`; run++;
  });
  return run === 1 ? `${d}h0` : d;
}

/** Thin line in a card with a faint "normal" band (IQR of the non-null values) and a dot on the last point. Decorative: the value and delta beside it carry the meaning. */
export function Spark({ values, w = 120, h = 24, cap = false }: { values: (number | null)[]; w?: number; h?: number; cap?: boolean }) {
  const real = values.filter((v): v is number => v !== null), top = sparkTop(real, cap), n = values.length, band = iqr(values);
  const x = (i: number) => (n > 1 ? (i * w) / (n - 1) : w / 2), y = (v: number) => h - 2 - (top > 0 ? (Math.min(v, top) / top) * (h - 4) : 0);
  let last = n - 1;
  while (last >= 0 && values[last] === null) last--;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {band && <rect className="sp-band" x={0} width={w} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} />}
      <path className="sp-l" d={sparkPath(values, x, y)} vectorEffect="non-scaling-stroke" />
      {last >= 0 && <path className="sp-d" d={`M${+x(last).toFixed(2)},${+y(values[last] as number).toFixed(2)}h0`} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Weekly columns for a KPI tile: bars from index `from` on are the compared window (accent), earlier bars grey. A line marks each
 *  window's weekly average: `now` over the compared bars, `was` (dashed) over the earlier ones, or across the whole width when the
 *  earlier window is not drawn (a prior period). Decorative: the caption beside it carries the numbers. */
export function WeekCols({ values, from, now, was, h = 34 }: { values: number[]; from: number; now?: number | null; was?: number | null; h?: number }) {
  // 12-unit columns, 2 apart, stretched across the tile's width (the caller passes up to 12 weeks, so the columns stay thin)
  const n = values.length, P = 14, w = Math.max(1, n * P - 2), top = Math.max(...values, now ?? 0, was ?? 0, 1), y = (v: number) => +(h - (v / top) * (h - 2)).toFixed(2);
  const split = from > 0 && from < n, sx = from * P - 1;
  const bar = (x: number, t: number) => { const r = Math.min(2, h - t); return `M${x},${h}V${t + r}Q${x},${t} ${x + r},${t}H${x + 12 - r}Q${x + 12},${t} ${x + 12},${t + r}V${h}Z`; };
  return (
    <svg className="wc" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((v, i) => <path key={i} className={i >= from ? "wc-b wc-now" : "wc-b"} style={{ "--i": i } as React.CSSProperties} d={bar(i * P, y(v))} />)}
      <line className="wc-ax" x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} vectorEffect="non-scaling-stroke" />
      {was != null && <line className="wc-was" x1={0} x2={split ? sx : w} y1={y(was)} y2={y(was)} vectorEffect="non-scaling-stroke" />}
      {now != null && <line className="wc-avg" x1={split ? sx : 0} x2={w} y1={y(now)} y2={y(now)} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Horizontal bullet for a 0..1 rate: a 0-100% track, the likely range [lo, hi] as a band, a 2px marker at `p`, a short tick at the earlier value. Decorative: the text beside it carries the numbers. */
export function Bullet({ p, lo, hi, was }: { p: number; lo?: number; hi?: number; was?: number | null }) {
  const c01 = (x: number) => Math.min(1, Math.max(0, x)), at = (x: number) => `${+(c01(x) * 100).toFixed(2)}%`;
  return (
    <div className="bul" aria-hidden="true">
      {lo != null && hi != null && <i className="bu-ci" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} />}
      {was != null && <i className="bu-was" style={{ left: at(was) }} />}
      <i className="bu-now" style={{ left: at(p), "--d": was != null ? +(c01(was) - c01(p)).toFixed(4) : 0 } as React.CSSProperties} />
    </div>
  );
}

/** 270-degree gauge, gap at the bottom, on a 0..`max` scale: the fill is `p`, the tick the earlier value. Decorative; the caller labels it. */
export function Dial({ p, was, max }: { p: number; was?: number | null; max: number }) {
  const c = (x: number) => Math.min(1, Math.max(0, x / max)), R = 50;
  const at = (f: number, r: number) => { const a = ((135 + 270 * c(f)) * Math.PI) / 180; return [60 + r * Math.cos(a), 60 + r * Math.sin(a)].map((v) => +v.toFixed(2)); };
  const [x1, y1] = was != null ? at(was, R - 5) : [0, 0], [x2, y2] = was != null ? at(was, R + 5) : [0, 0];
  return (
    <svg className="ring dial" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="r-track" cx="60" cy="60" r={R} pathLength="100" strokeDasharray="75 100" />
      <circle className="r-fill" cx="60" cy="60" r={R} pathLength="100" strokeDasharray={`${Math.max(0.4, c(p) * 75)} 100`} />
      {was != null && <line className="r-was" x1={x1} y1={y1} x2={x2} y2={y2} />}
    </svg>
  );
}

export interface DonutSeg { key: string; value: number; color: string; hatch?: boolean; on?: boolean; title: string; onPick?: () => void }
/** Donut of shares, starting at 12 o'clock, clockwise. Slices are mouse targets only (`onPick`); the caller's legend carries the
 *  keyboard route and the numbers, so the SVG is hidden from assistive tech. `children` sit in the hole. */
export function Donut({ segs, children }: { segs: DonutSeg[]; children?: React.ReactNode }) {
  const pid = `dn-h${useId().replace(/:/g, "")}`, total = segs.reduce((a, s) => a + Math.max(0, s.value), 0);
  let acc = 0;
  return (
    <div className="dn">
      <svg viewBox="0 0 42 42" aria-hidden="true" focusable="false">
        <defs><pattern id={pid} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect className="dn-hb" width="2" height="2" /><rect className="dn-hl" width="0.8" height="2" /></pattern></defs>
        {total === 0 && <circle className="dn-track" cx={21} cy={21} r={15.915} />}
        {/* no track under the slices: each slice ends 0.4 units (1.6px at 168px) short, so the card surface shows between neighbours */}
        {total > 0 && segs.map((s) => {
          const len = (Math.max(0, s.value) / total) * 100, gap = len < 100 ? Math.min(0.4, len / 3) : 0, off = 25 - acc;
          acc += len;
          return len > 0 ? (
            <circle key={s.key} className="dn-s" data-pick={s.onPick ? "" : undefined} data-on={s.on || undefined} cx={21} cy={21} r={15.915} stroke={s.hatch ? `url(#${pid})` : s.color}
              strokeDasharray={`${+(len - gap).toFixed(3)} ${+(100 - len + gap).toFixed(3)}`} strokeDashoffset={+off.toFixed(3)} onClick={s.onPick}><title>{s.title}</title></circle>
          ) : null;
        })}
      </svg>
      {children && <div className="dn-hole">{children}</div>}
    </div>
  );
}

/** 0 to max colour key for the cell heatmaps (same mix as `.cell`). */
export function Ramp({ max, label, fmt = (n: number) => `${Math.round(n * 100)}%` }: { max: number; label: string; fmt?: (n: number) => string }) {
  return (
    <p className="ramp" aria-label={`${label} colour scale: lighter is lower, from ${fmt(0)} to ${fmt(max)}`}>
      <span className="meta">{label}</span><span>{fmt(0)}</span><i aria-hidden="true" /><span>{fmt(max)}</span>
    </p>
  );
}

const PAD0 = { l: 44, r: 10, t: 10, b: 22 };
/** Left gutter wide enough for the longest tick label (so a leading "$" never clips). */
const padFor = (tk: number[], fmt: (n: number) => string) => ({ ...PAD0, l: Math.max(PAD0.l, 14 + 6.6 * Math.max(...tk.map((t) => fmt(t).length))) });
const key = (fn: () => void) => (e: RKE) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
export interface Line { name: string; color: string; values: number[]; dashed?: boolean }
interface LineProps {
  lines: Line[]; labels: string[]; fmt: (n: number) => string; label: string; height?: number;
  /** Click or Enter on bucket i. */
  onPick: (i: number) => void;
  /** Drag across buckets i0..i1 (mouse only; the keyboard picks one bucket at a time). */
  onBrush?: (i0: number, i1: number) => void;
  /** Buckets with an anomaly (ringed). */
  rings?: number[];
}
/** Line chart on a shared x axis. Lines[0] is the primary series; a prior-period line is drawn grey and dashed. */
export function LineChart({ lines: target, labels, fmt, label, height = 190, onPick, onBrush, rings = [] }: LineProps) {
  const n = labels.length;
  const mv = useMorph(target.flatMap((l) => l.values));
  let o = 0;
  const lines = target.map((l) => ({ ...l, values: mv.slice(o, (o += l.values.length)) }));   // drawn (morphing) series; `target` feeds the labels
  const { group, mark } = useRoving(n);
  const { w, h } = useSize(group.ref as unknown as RefObject<HTMLElement>);
  const H = Math.max(height, Math.min(280, h));   // `height` is the floor: a stretched card's plot grows into its slack, up to 280px
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const swallow = useRef(false);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const { ticks: tk, max } = niceTicks(Math.max(...lines.flatMap((l) => l.values), 0));
  const PAD = padFor(tk, fmt);
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0.5) * iw;
  const y = (v: number) => PAD.t + (1 - v / max) * ih;
  const step = n > 1 ? iw / (n - 1) : iw;
  const at = (clientX: number, el: Element) => Math.min(n - 1, Math.max(0, Math.round(((clientX - el.getBoundingClientRect().left - PAD.l) / iw) * (n - 1))));
  const down = (e: RPE<SVGSVGElement>) => { if (!onBrush || e.button !== 0) return; swallow.current = false; drag.current = { x0: e.clientX, moved: false }; };
  const move = (e: RPE<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    if (Math.abs(e.clientX - d.x0) >= 4) { d.moved = true; setBrush([at(d.x0, e.currentTarget), at(e.clientX, e.currentTarget)]); }
  };
  const up = (e: RPE<SVGSVGElement>) => {
    const d = drag.current; drag.current = null;
    if (d?.moved && onBrush) { const a = at(d.x0, e.currentTarget), b = at(e.clientX, e.currentTarget); swallow.current = true; onBrush(Math.min(a, b), Math.max(a, b)); }
    setBrush(null);
  };
  return (
    <div className="chart" ref={group.ref as never} onKeyDown={group.onKeyDown} style={{ minHeight: height }}>
      {w > 0 && n > 0 && (
        <svg width={w} height={H} style={{ position: "absolute", left: 0, top: 0 }} role="group" aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { drag.current = null; setBrush(null); }}>
          {tk.map((t) => <g key={t}><line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} /><text className="ax" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
          {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i, k, a) => <text key={i} className="ax" x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === a.length - 1 ? "end" : "middle"}>{labels[i]}</text>)}
          {brush && <rect className="brush" x={x(Math.min(...brush)) - step / 2} y={PAD.t} width={Math.abs(x(brush[1]) - x(brush[0])) + step} height={ih} />}
          {[...lines].reverse().map((l) => <polyline key={l.name} className={l.dashed ? "line fade" : "line draw"} pathLength={l.dashed ? undefined : 1} fill="none" stroke={l.color} strokeDasharray={l.dashed ? "4 3" : undefined} points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />)}
          {n <= 40 && lines[0].values.map((v, i) => <circle key={i} className="dot pt" style={{ "--i": i } as React.CSSProperties} cx={x(i)} cy={y(v)} r={2.5} fill={lines[0].color} />)}
          {rings.map((i) => <circle key={`r${i}`} className="ring" cx={x(i)} cy={y(lines[0].values[i] ?? 0)} r={7} />)}
          {labels.map((l, i) => (
            <rect key={i} className="hit" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} role="button" aria-label={`${l}: ${target.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(", ")}${rings.includes(i) ? ", unusual" : ""}. Select`}
              {...mark(i)} onClick={() => { if (swallow.current) { swallow.current = false; return; } onPick(i); }} onKeyDown={key(() => onPick(i))}>
              <title>{`${l}: ${target.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(" · ")}`}</title>
            </rect>
          ))}
        </svg>
      )}
    </div>
  );
}

/** One dot per session with a prompt, struggled first (filled `.ud-on`), the rest outlined: 7px dots, 3px apart, 12 to a row so they never
 *  shrink in a narrow column. Decorative: the row's label and count carry the numbers. */
export function UnitDots({ k, n }: { k: number; n: number }) {
  const W = 10, C = Math.max(1, Math.min(n, 12)), w = C * W, h = 16 + (Math.ceil(n / C) - 1) * W;
  return (
    <svg className="ud" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      {Array.from({ length: n }, (_, i) => <circle key={i} className={i < k ? "ud-on" : undefined} style={i < k ? { "--i": i } as React.CSSProperties : undefined} cx={(i % C) * W + 5} cy={8 + Math.floor(i / C) * W} r={3.5} />)}
    </svg>
  );
}

export interface Flow { from: string; to: string; n: number }
/** Flow ladder: the same names in two columns (left = from, right = to) and one straight ribbon per pair, width = count (14px at the largest).
 *  The three largest are accent, the rest grey; each end of a ribbon has its own slot on its name, so ribbons never share a pixel there.
 *  Only the three largest print their count (every count is in the ribbon's tooltip and the caller's DataTable). A from-name is a button (`onPick`). */
export function FlowLadder({ names, flows, on, onPick, label }: { names: { key: string; text: string }[]; flows: Flow[]; on?: string; onPick: (key: string) => void; label: string }) {
  const ix = new Map(names.map((x, i) => [x.key, i])), text = (k: string) => names[ix.get(k) ?? 0].text;
  const fs = flows.filter((x) => x.n > 0 && ix.has(x.from) && ix.has(x.to)), peak = Math.max(...fs.map((x) => x.n), 1), GAP = 2;
  const wd = (n: number) => Math.max(1.5, (n / peak) * 14);
  const side = (k: string, end: "from" | "to") => fs.filter((x) => x[end] === k).sort((a, b) => ix.get(a[end === "from" ? "to" : "from"])! - ix.get(b[end === "from" ? "to" : "from"])!);
  const stack = (xs: Flow[]) => xs.reduce((a, x) => a + wd(x.n), 0) + Math.max(0, xs.length - 1) * GAP;
  const rh = Math.ceil(Math.max(28, ...names.flatMap((x) => [stack(side(x.key, "from")), stack(side(x.key, "to"))]).map((h) => h + 8)));
  // y of one ribbon end: its slot in the stack centred on the name's row
  const yOf = (x: Flow, end: "from" | "to") => { const xs = side(x[end], end); let y = (ix.get(x[end])! + 0.5) * rh - stack(xs) / 2; for (const o of xs) { if (o === x) return +(y + wd(o.n) / 2).toFixed(1); y += wd(o.n) + GAP; } return y; };
  const ranked = [...fs].sort((a, b) => b.n - a.n), top = ranked.slice(0, 3), H = names.length * rh;
  const sum = (k: string, end: "from" | "to") => side(k, end).reduce((a, x) => a + x.n, 0);
  return (
    <div className="fl" role="group" aria-label={label} style={{ "--rh": `${rh}px` } as React.CSSProperties}>
      <span className="fl-h" aria-hidden="true">From</span><span /><span className="fl-h" aria-hidden="true">To</span>
      <ul className="fl-from">
        {names.map((x) => { const out = side(x.key, "from"), big = out.reduce<Flow | null>((a, b) => (!a || b.n > a.n ? b : a), null);
          return (
            <li key={x.key}><button type="button" aria-pressed={on === x.key} title={`from ${x.text}`} onClick={() => onPick(x.key)}
              aria-label={`${x.text}: ${big ? `${sum(x.key, "from")} switches away, most to ${text(big.to)} (${big.n})` : "no switches away"}. Filter to sessions that started in ${x.text}`}>{x.text}<small>{sum(x.key, "from") || "–"}</small></button></li>
          ); })}
      </ul>
      <div className="fl-mid" style={{ height: H }} aria-hidden="true">
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" focusable="false">
          {[...ranked].reverse().map((x) => <line key={`${x.from}>${x.to}`} className={top.includes(x) ? "fl-top" : undefined} x1={0} x2={100} y1={yOf(x, "from")} y2={yOf(x, "to")} strokeWidth={+wd(x.n).toFixed(1)} vectorEffect="non-scaling-stroke"><title>{`${text(x.from)} to ${text(x.to)}: ${x.n}`}</title></line>)}
        </svg>
        {top.map((x, i) => { const t = [0.3, 0.5, 0.7][i], a = yOf(x, "from"), b = yOf(x, "to"); return <span key={`${x.from}>${x.to}`} className="fl-n" style={{ left: `${t * 100}%`, top: +(a + (b - a) * t).toFixed(1) }}>{x.n}</span>; })}
      </div>
      <ul className="fl-to">
        {names.map((x) => <li key={x.key} className="fl-to-i" title={`to ${x.text}`}><small>{sum(x.key, "to") || "–"}</small>{x.text}</li>)}
      </ul>
    </div>
  );
}
