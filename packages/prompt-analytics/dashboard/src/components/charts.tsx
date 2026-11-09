// Inline-SVG charts. No chart library: marks are plain elements, every mark is keyboard-reachable (roving tabindex)
// and activates through the same callback a click does. Each chart is paired with an sr-only DataTable by its caller.
import type React from "react";
import { useId, useRef, useState, type KeyboardEvent as RKE, type PointerEvent as RPE, type RefObject } from "react";
import { press, useMorph, useRoving, useSize } from "../lib/hooks";
import { linkProps } from "../lib/motion";
import { fmtDate } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import type { Week } from "../lib/filter";
import { Empty } from "./ui";
import { iqr } from "../lib/baseline";
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
  const n = values.length, w = Math.max(1, n * 4), top = Math.max(...values, now ?? 0, was ?? 0, 1), y = (v: number) => +(h - (v / top) * (h - 2)).toFixed(2);
  const split = from > 0 && from < n;
  return (
    <svg className="wc" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((v, i) => <rect key={i} className={i >= from ? "wc-b wc-now" : "wc-b"} x={i * 4 + 0.5} width={3} y={y(v)} height={h - y(v)} />)}
      <line className="wc-ax" x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} vectorEffect="non-scaling-stroke" />
      {was != null && <line className="wc-was" x1={0} x2={split ? from * 4 : w} y1={y(was)} y2={y(was)} vectorEffect="non-scaling-stroke" />}
      {now != null && <line className="wc-avg" x1={split ? from * 4 : 0} x2={w} y1={y(now)} y2={y(now)} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Semicircle gauge for a 0..1 rate: a thin 0-100 track, the fill to `p` (haloed so it reads apart from the band), a wider band for
 *  its interval [lo, hi], a dashed tick at the earlier value, 0 and 100 at the ends. Decorative. */
export function gaugeArc(a: number, b: number, r = 40, cx = 48, cy = 48): string {
  const at = (f: number) => `${+(cx - r * Math.cos(Math.PI * f)).toFixed(2)},${+(cy - r * Math.sin(Math.PI * f)).toFixed(2)}`;
  return `M${at(a)}A${r},${r} 0 0 1 ${at(b)}`;
}
export function Gauge({ p, lo, hi, was }: { p: number; lo?: number; hi?: number; was?: number | null }) {
  const c = (x: number) => Math.min(1, Math.max(0, x)), tick = (f: number, r: number) => [48 - r * Math.cos(Math.PI * c(f)), 48 - r * Math.sin(Math.PI * c(f))].map((v) => +v.toFixed(2));
  const [x1, y1] = was != null ? tick(was, 31) : [0, 0], [x2, y2] = was != null ? tick(was, 49) : [0, 0];
  return (
    <svg className="gauge" viewBox="0 0 96 66" aria-hidden="true" focusable="false">
      <path className="g-track" d={gaugeArc(0, 1)} />
      {lo != null && hi != null && <path className="g-ci" d={gaugeArc(c(lo), c(hi))} />}
      <path className="g-halo" d={gaugeArc(0, Math.max(0.002, c(p)))} />
      <path className="g-fill" d={gaugeArc(0, Math.max(0.002, c(p)))} />
      <text className="g-end" x={8} y={65} textAnchor="middle">0</text><text className="g-end" x={88} y={65} textAnchor="middle">100</text>
      {was != null && <line className="g-was" x1={x1} y1={y1} x2={x2} y2={y2} />}
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
const padFor = (max: number, fmt: (n: number) => string) => ({ ...PAD0, l: Math.max(PAD0.l, 14 + 6.6 * Math.max(...[0, 0.5, 1].map((t) => fmt(max * t).length))) });
const key = (fn: () => void) => (e: RKE) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
const ticks = (max: number, fmt: (n: number) => string) => [0, 0.5, 1].map((t) => ({ t, text: fmt(max * t) }));

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
  const { w } = useSize(group.ref as unknown as RefObject<HTMLElement>);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const swallow = useRef(false);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const max = Math.max(...lines.flatMap((l) => l.values), 0) || 1;
  const PAD = padFor(max, fmt);
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
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
    <div className="chart" ref={group.ref as never} onKeyDown={group.onKeyDown} style={{ height }}>
      {w > 0 && n > 0 && (
        <svg width={w} height={height} role="group" aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { drag.current = null; setBrush(null); }}>
          {ticks(max, fmt).map((k) => <g key={k.t}><line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(max * k.t)} y2={y(max * k.t)} /><text className="ax" x={PAD.l - 6} y={y(max * k.t) + 4} textAnchor="end">{k.text}</text></g>)}
          {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i, k, a) => <text key={i} className="ax" x={x(i)} y={height - 6} textAnchor={k === 0 ? "start" : k === a.length - 1 ? "end" : "middle"}>{labels[i]}</text>)}
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

/** Stacked weekly cost by tool. Click a band to filter the tool, a week to filter that week. Unpriced tools never draw ($0 is not "not priced"). */
export function River({ weeks, sel, onBand, onWeek, activeWeek, fmt, label, height = 190 }: {
  weeks: Week[]; sel?: string; onBand: (s: string) => void; onWeek: (i: number) => void; activeWeek?: (i: number) => boolean; fmt: (n: number) => string; label: string; height?: number;
}) {
  const srcs = SOURCES.filter((s) => weeks.some((w) => (w.bySource[s] ?? 0) > 0));
  const n = weeks.length, m = srcs.length + n;
  const { group, mark } = useRoving(m);
  const { w } = useSize(group.ref as unknown as RefObject<HTMLElement>);
  const mv = useMorph(srcs.flatMap((s) => weeks.map((x) => x.bySource[s] ?? 0)));
  const ser = srcs.map((_, k) => mv.slice(k * n, (k + 1) * n));   // per-tool weekly values, morphing toward the data
  const total = weeks.map((_, i) => ser.reduce((a, v) => a + (v[i] ?? 0), 0));
  const max = Math.max(...total, 0) || 1;
  const PAD = { ...padFor(max, fmt), b: 36 };   // room for the week strip under the plot
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0.5) * iw;
  const y = (v: number) => PAD.t + (1 - v / max) * ih;
  const step = n > 1 ? iw / (n - 1) : iw;
  const base = weeks.map(() => 0);
  const bands = srcs.map((s, k) => {
    const lo = [...base], hi = weeks.map((_, i) => (base[i] += ser[k][i] ?? 0));
    return { s, d: `M${hi.map((v, i) => `${x(i)},${y(v)}`).join("L")}L${lo.map((v, i) => `${x(i)},${y(v)}`).reverse().join("L")}Z` };
  });
  const ok = n >= 2 && srcs.length > 0;
  return (
    <div className="chart" ref={group.ref as never} onKeyDown={group.onKeyDown} style={{ height }}>
      {!ok && <Empty>{srcs.length === 0 ? "No priced tool has sessions here" : "Needs at least two weeks of data"}</Empty>}
      {ok && w > 0 && (
        <svg width={w} height={height} role="group" aria-label={label}>
          {ticks(max, fmt).map((k) => <g key={k.t}><line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(max * k.t)} y2={y(max * k.t)} /><text className="ax" x={PAD.l - 6} y={y(max * k.t) + 4} textAnchor="end">{k.text}</text></g>)}
          <text className="ax" x={PAD.l} y={height - 6}>{fmtDate(weeks[0].week)}</text><text className="ax" x={w - PAD.r} y={height - 6} textAnchor="end">{fmtDate(weeks[n - 1].week)}</text>
          {/* week columns sit under the bands: a band wins the pointer where it is drawn (tool), the column catches the empty space above it (week) */}
          {weeks.map((wk, i) => (
            <g key={wk.week} {...linkProps(`week:${wk.week}`)}><rect className="hit" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} role="button" aria-label={`Week of ${fmtDate(wk.week)}: ${fmt(total[i])}. Filter to this week`}
              {...mark(srcs.length + i)} {...press(() => onWeek(i))} /></g>
          ))}
          <g className="rise" data-sel={sel ? "1" : undefined}>
            {bands.map((b, i) => (
              <g key={b.s} {...linkProps(`tool:${b.s}`)}>
                <path className="band" d={b.d} fill={srcColor(b.s)} data-on={sel === b.s || undefined} role="button" aria-label={`${srcLabel(b.s)} cost band. Filter to this tool`} aria-pressed={sel === b.s}
                  {...mark(i)} {...press(() => onBand(b.s))}><title>{srcLabel(b.s)}</title></path>
              </g>
            ))}
          </g>
          {/* the strip is the mouse route to a week: the bands cover the columns, so each week also gets a thin target below the plot */}
          {weeks.map((wk, i) => (
            <g key={`s${wk.week}`} {...linkProps(`week:${wk.week}`)} aria-hidden="true"><rect className="wk-strip" data-on={activeWeek?.(i) || undefined} x={x(i) - Math.max(step, 2) / 2 + 1} y={PAD.t + ih + 4} width={Math.max(step - 2, 2)} height={10} rx={2} onClick={() => onWeek(i)}><title>{`Week of ${fmtDate(wk.week)}: ${fmt(total[i])}. Click to filter`}</title></rect></g>
          ))}
          {activeWeek && weeks.map((_, i) => (activeWeek(i) ? <rect key={i} className="sel-band" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} /> : null))}
        </svg>
      )}
    </div>
  );
}
