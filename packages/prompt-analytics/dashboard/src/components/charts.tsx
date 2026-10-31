// Inline-SVG charts. No chart library: marks are plain elements, every mark is keyboard-reachable (roving tabindex)
// and activates through the same callback a click does. Each chart is paired with an sr-only DataTable by its caller.
import { useRef, useState, type KeyboardEvent as RKE, type PointerEvent as RPE, type RefObject } from "react";
import { press, useRoving, useSize } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import type { Week } from "../lib/filter";
import { Empty } from "./ui";

/** 24 mini bars in a card. Decorative: the value and delta beside it carry the meaning. */
export function Spark({ values, w = 120, h = 24 }: { values: number[]; w?: number; h?: number }) {
  const top = Math.max(...values, 0), bw = w / Math.max(values.length, 1);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((v, i) => { const bh = top > 0 && v > 0 ? Math.max(1.5, (v / top) * (h - 1)) : 0; return <rect key={i} x={i * bw + 0.5} y={h - bh} width={Math.max(1, bw - 1)} height={bh} />; })}
    </svg>
  );
}

const PAD = { l: 44, r: 10, t: 10, b: 22 };
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
export function LineChart({ lines, labels, fmt, label, height = 190, onPick, onBrush, rings = [] }: LineProps) {
  const n = labels.length;
  const { group, mark } = useRoving(n);
  const { w } = useSize(group.ref as unknown as RefObject<HTMLElement>);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const swallow = useRef(false);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const max = Math.max(...lines.flatMap((l) => l.values), 0) || 1;
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
          {[...lines].reverse().map((l) => <polyline key={l.name} className="line" fill="none" stroke={l.color} strokeDasharray={l.dashed ? "4 3" : undefined} points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />)}
          {n <= 40 && lines[0].values.map((v, i) => <circle key={i} className="dot" cx={x(i)} cy={y(v)} r={2.5} fill={lines[0].color} />)}
          {rings.map((i) => <circle key={`r${i}`} className="ring" cx={x(i)} cy={y(lines[0].values[i] ?? 0)} r={7} />)}
          {labels.map((l, i) => (
            <rect key={i} className="hit" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} role="button" aria-label={`${l}: ${lines.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(", ")}${rings.includes(i) ? ", unusual" : ""}. Select`}
              {...mark(i)} onClick={() => { if (swallow.current) { swallow.current = false; return; } onPick(i); }} onKeyDown={key(() => onPick(i))}>
              <title>{`${l}: ${lines.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(" · ")}`}</title>
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
  const total = weeks.map((x) => srcs.reduce((a, s) => a + (x.bySource[s] ?? 0), 0));
  const max = Math.max(...total, 0) || 1;
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0.5) * iw;
  const y = (v: number) => PAD.t + (1 - v / max) * ih;
  const step = n > 1 ? iw / (n - 1) : iw;
  const base = weeks.map(() => 0);
  const bands = srcs.map((s) => {
    const lo = [...base], hi = weeks.map((wk, i) => (base[i] += wk.bySource[s] ?? 0));
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
          <g data-sel={sel ? "1" : undefined}>
            {bands.map((b, i) => (
              <path key={b.s} className="band" d={b.d} fill={srcColor(b.s)} data-on={sel === b.s || undefined} role="button" aria-label={`${srcLabel(b.s)} cost band. Filter to this tool`} aria-pressed={sel === b.s}
                {...mark(i)} {...press(() => onBand(b.s))}><title>{srcLabel(b.s)}</title></path>
            ))}
          </g>
          {activeWeek && weeks.map((_, i) => (activeWeek(i) ? <rect key={i} className="sel-band" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} /> : null))}
          {weeks.map((wk, i) => (
            <rect key={wk.week} className="hit" x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 2)} height={ih} role="button" aria-label={`Week of ${fmtDate(wk.week)}: ${fmt(total[i])}. Filter to this week`}
              {...mark(srcs.length + i)} {...press(() => onWeek(i))}><title>{`Week of ${fmtDate(wk.week)}: ${fmt(total[i])}`}</title></rect>
          ))}
        </svg>
      )}
    </div>
  );
}
