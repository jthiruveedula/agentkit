// Current vs previous period: monotone line + area, dashed prior ghost (or trailing median band when there is no prior),
// hover/keyboard crosshair with a rich tooltip, spike markers, a labelled peak, a marked partial last bucket,
// and a brush (drag >= 6px, or Shift+arrows then Enter) that pushes from/to into the hash. A plain click never filters.
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKE, type PointerEvent as RPE } from "react";
import { useStore } from "../state";
import { pricingComparable } from "../lib/summary";
import { bucketSeries, buckets, delta, dayDiff, METRICS, MIN_PRIOR_N } from "../lib/compare";
import { alignPrior, costTick, brushRange, bucketDelta, bucketLabel, labelIdx, monotonePath, niceTicks, partialLast, peakIdx, rollingBand, spikes, topToolByBucket, unpricedCount } from "../lib/trend";
import { fmtCompact, fmtDate, fmtInt, fmtRange, fmtUSD } from "../lib/format";
import { srcLabel } from "../lib/palette";
import { useMorph, useSize } from "../lib/hooks";
import { barRects } from "../lib/motion";
import { Card, Count, DataTable, Delta, Empty, LowBase, Segmented } from "./ui";

export type Metric = "sessions" | "prompts" | "cost";
const FMT: Record<Metric, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };
const TICK: Record<Metric, (n: number) => string> = { sessions: fmtCompact, prompts: fmtCompact, cost: costTick };
const VAL: Record<Metric, (r: { prompts: number; cost_usd: number | null }) => number> = { sessions: () => 1, prompts: (r) => r.prompts, cost: (r) => r.cost_usd ?? 0 };
const PAD0 = { l: 40, r: 58, t: 22, b: 26 };
const NAME: Record<Metric, string> = { sessions: "Sessions", prompts: "Prompts", cost: "Cost" };
/** Pointer travel before a press becomes a brush; anything shorter is a click and never filters. */
const DRAG_PX = 6;
const pt = (xs: number[], x: (i: number) => number, y: (v: number) => number): [number, number][] => xs.map((v, i) => [x(i), y(v)]);

export function Trend({ metric: want, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  const { d, v, f, win, prior, apply, caps } = useStore();
  const metric: Metric = want === "cost" && !caps.hasCost ? "sessions" : want;   // nothing priced: no cost series to draw
  const auto: 1 | 7 = win.days > 60 ? 7 : 1;
  const [pick, setPick] = useState<{ days: number; step: 1 | 7 } | null>(null);
  const step = pick && pick.days === win.days ? pick.step : auto;   // a new window re-picks the natural bucket
  const bks = useMemo(() => buckets(win, step), [win, step]);
  const cur = useMemo(() => bucketSeries(v.rows, win, step, METRICS[metric]), [v.rows, win, step, metric]);
  const prvRaw = useMemo(() => (prior ? bucketSeries(prior.v.rows, prior.win, step, METRICS[metric]) : null), [prior, step, metric]);
  const prv = alignPrior(cur, prvRaw);
  const band = useMemo(() => (prv ? null : rollingBand(cur, 7)), [prv, cur]);
  const tools = useMemo(() => topToolByBucket(v.rows, win, step, VAL[metric] as never), [v.rows, win, step, metric]);
  const unpB = useMemo(() => (metric === "cost" ? bucketSeries(v.rows, win, step, unpricedCount) : null), [v.rows, win, step, metric]);
  const n = cur.length;
  const part = n > 1 && partialLast(bks, step, d.generated_at), full = part ? n - 1 : n;   // the partial bucket is drawn but never judged
  const hot = useMemo(() => spikes(cur.slice(0, full)), [cur, full]);
  const known = useMemo(() => (metric === "sessions" ? [] : d.anomalies.filter((a) => a.metric === (metric === "cost" ? "cost" : "prompts")).map((a) => Math.floor(dayDiff(win.from, a.date) / step)).filter((i) => i >= 0 && i < full)), [d.anomalies, metric, win, step, full]);
  const marks = useMemo(() => [...new Set([...hot, ...known])], [hot, known]);
  const peak = peakIdx(cur, full);
  const fmt = FMT[metric];
  const unit = step === 1 ? "day" : "week";
  const labelOf = (i: number) => bucketLabel(bks[i], step);

  const box = useRef<HTMLDivElement>(null);
  const { w } = useSize(box);
  const H = w > 0 && w < 420 ? 210 : 270;
  const [view, setView] = useState<"area" | "bars">("area");   // same data, two marks: they crossfade and the bars grow from the baseline
  const [hov, setHov] = useState<number | null>(null);
  const [kb, setKb] = useState(false);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);   // keyboard brush start (Shift+arrows)
  const down = useRef<{ x0: number; moved: boolean } | null>(null);
  const [undo, setUndo] = useState<{ from?: string; to?: string; brushed: { from: string; to: string } } | null>(null);

  const top = Math.max(...cur, ...(prv ?? []).map((x) => x ?? 0), ...(band?.hi ?? []), 0);
  const { max, ticks } = niceTicks(top * 1.1);   // ~10% headroom so the peak label never hits the top edge
  const PAD = { ...PAD0, l: Math.max(PAD0.l, 14 + 6.6 * Math.max(...ticks.map((t) => TICK[metric](t).length))) };   // gutter follows the longest tick label, so a leading "$" never clips
  const iw = Math.max(1, w - PAD.l - PAD.r), ih = H - PAD.t - PAD.b, base = PAD.t + ih;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0.5) * iw;
  const y = (val: number) => PAD.t + (1 - val / max) * ih;
  const at = (cx: number, el: Element) => Math.min(n - 1, Math.max(0, Math.round(((cx - el.getBoundingClientRect().left - PAD.l) / iw) * (n - 1))));

  const total = METRICS[metric](v.rows), pTotal = prior ? METRICS[metric](prior.v.rows) : null;
  const unp = metric === "cost" ? unpricedCount(v.rows) : 0, allUnpriced = metric === "cost" && v.rows.length > 0 && unp === v.rows.length;
  const pn = prior?.v.totals.sessions ?? 0;
  const priceGap = metric === "cost" && prior !== null && !pricingComparable(v.totals, prior.v.totals);   // different priced shares: no delta, say why
  const dl = pTotal === null || priceGap ? null : delta(total, pTotal, pn);
  const lowBase = prior !== null && pn < MIN_PRIOR_N;
  const brushed = undo && f.from === undo.brushed.from && f.to === undo.brushed.to ? undo : null;
  const commit = (a: number, b: number) => {
    const r = brushRange(bks, a, b);
    setUndo({ from: f.from, to: f.to, brushed: r }); setAnchor(null);
    apply(r);
  };

  const onDown = (e: RPE<SVGSVGElement>) => { if (e.button !== 0) return; down.current = { x0: e.clientX, moved: false }; };
  const onMove = (e: RPE<SVGSVGElement>) => {
    const i = at(e.clientX, e.currentTarget); setHov(i); setKb(false);
    const dr = down.current; if (dr && Math.abs(e.clientX - dr.x0) >= DRAG_PX) { dr.moved = true; setDrag([at(dr.x0, e.currentTarget), i]); }
  };
  const onUp = (e: RPE<SVGSVGElement>) => {
    const dr = down.current; down.current = null; setDrag(null);
    if (dr?.moved) commit(at(dr.x0, e.currentTarget), at(e.clientX, e.currentTarget));   // a plain click only inspects
  };
  const onKey = (e: RKE) => {
    const i = hov ?? n - 1;
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to !== null) {
      e.preventDefault(); setKb(true);
      if (e.shiftKey) setAnchor((a) => a ?? i); else setAnchor(null);
      setHov(Math.min(n - 1, Math.max(0, to)));
    } else if (e.key === "Enter" && hov !== null && anchor !== null) { e.preventDefault(); commit(anchor, hov); }
    else if (e.key === "Escape" && anchor !== null) { e.preventDefault(); e.stopPropagation(); setAnchor(null); }
  };
  const sel: [number, number] | null = drag ?? (anchor !== null && hov !== null ? [anchor, hov] : null);

  const ysM = useMorph(cur.map(y));   // marks glide to their new pixel positions on a filter change; snaps when the bucket count changes
  const ym = (i: number) => ysM[i] ?? y(cur[i]);   // every overlay reads the morphed y, so dots, rings, crosshair and peak ride the line instead of detaching
  const line: [number, number][] = ysM.map((yy, i) => [x(i), yy]);
  const bw = Math.max(2, Math.min(40, (n > 1 ? iw / (n - 1) : iw) * 0.7));
  const lp = n > 1 ? monotonePath(part ? line.slice(0, n - 1) : line) : "";
  const tail = part ? monotonePath(line.slice(n - 2)) : "";
  const area = n > 1 && !band ? `${monotonePath(line)} L${x(n - 1)},${base} L${x(0)},${base} Z` : "";
  const pp = prv && n > 1 ? (() => { const seg: [number, number][][] = []; let c: [number, number][] = []; prv.forEach((q, i) => { if (q === null) { if (c.length) seg.push(c); c = []; } else c.push([x(i), y(q)]); }); if (c.length) seg.push(c); return seg.filter((s) => s.length > 1).map(monotonePath); })() : [];
  const bandPath = band && n > 1 ? `${monotonePath(pt(band.hi, x, y))} L${[...pt(band.lo, x, y)].reverse().map(([a, b]) => `${a},${b}`).join(" L")} Z` : "";
  const midPath = band && n > 1 ? monotonePath(pt(band.mid, x, y)) : "";
  const lx = hov === null ? 0 : x(hov);
  const tip = (() => {
    if (hov === null || !bks[hov]) return null;
    const pr = prv?.[hov] ?? null, dd = bucketDelta(cur[hov], pr), tt = tools[hov];
    const pb = prior ? buckets(prior.win, step)[hov] : null;
    return { pr, dd, tt, pl: pb ? bucketLabel(pb, step) : "" };
  })();
  const left = Math.min(Math.max(lx + 12, 4), Math.max(4, w - 190));
  const flip = lx + 12 + 190 > w;
  const isPart = (i: number) => part && i === n - 1;
  const announce = hov !== null && bks[hov] ? `${labelOf(hov)}${isPart(hov) ? `, partial ${unit}` : ""}: ${fmt(cur[hov])} ${metric}${prv && prv[hov] !== null ? `, previous ${fmt(prv[hov] as number)}` : ""}${marks.includes(hov) ? ", unusual" : ""}${anchor !== null ? `. Range from ${labelOf(anchor)}, Enter to filter` : `. Shift and arrows select a range`}.` : "";
  const last = full - 1;   // the end label sits on the last complete bucket
  const endLabel = last >= 0 && last !== peak;
  const deltaEl = lowBase ? <LowBase n={pn} /> : priceGap ? <span className="meta">no change shown: priced share differs</span> : dl && <Delta neutral={metric !== "cost"} lowerBetter={metric === "cost"} pct={dl.kind === "new" ? "new" : dl.pct} />;
  const tx = (px: number, wd: number) => (px + wd / 2 > w - 4 ? "end" : px - wd / 2 < PAD.l ? "start" : "middle");

  return (
    <Card id="s-trend" title={prior ? "Current vs previous period" : `${NAME[metric]} per ${unit}`} meta={prior ? `${fmtRange(win.from, win.to)} against ${fmtRange(prior.win.from, prior.win.to)}` : fmtRange(win.from, win.to)} span={8}
      actions={<>
        <Segmented label="Metric" value={metric} onChange={setMetric} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, ...(caps.hasCost ? [{ id: "cost" as const, text: "Cost" }] : [])]} />
        <Segmented quiet label="Chart type" value={view} onChange={setView} options={[{ id: "area", text: "Area" }, { id: "bars", text: "Bars" }]} />
        <Segmented quiet label="Bucket" value={String(step)} onChange={(s) => setPick({ days: win.days, step: s === "7" ? 7 : 1 })} options={[{ id: "1", text: "Daily" }, { id: "7", text: "Weekly" }]} />
      </>}>
      {v.totals.sessions === 0 || n === 0 ? <Empty>No sessions in this period.</Empty> : !caps.enoughForTrend ? <Empty>A trend needs at least a week of data; this view spans {caps.days} day{caps.days === 1 ? "" : "s"}. {caps.moreDays} more day{caps.moreDays === 1 ? "" : "s"} unlock it.</Empty> : (
        <>
          <div className="tr-head">
            <b className="tr-total">{allUnpriced ? "not priced" : `${unp > 0 ? "≥ " : ""}${fmt(total)}`}</b>
            <span className="tr-unit">{metric} in period{unp > 0 && !allUnpriced ? `, ${fmtInt(unp)} unpriced` : ""}</span>
            {deltaEl}
            {pTotal !== null && !lowBase && <span className="meta">vs {fmt(pTotal)} before</span>}
            <span className="grow" />
            {brushed && <button type="button" className="btn tr-reset" onClick={() => { apply({ from: undo?.from, to: undo?.to }); setUndo(null); }}>Reset range</button>}
          </div>
          <div className="tr" ref={box} style={{ height: H }}>
            {w > 0 && (
              <svg width={w} height={H} role="group" aria-label={`${metric} per ${unit}. Arrow keys inspect, Shift and arrows select a range, Enter filters to it, or drag across the chart`} tabIndex={0} data-kb={kb || undefined} data-view={view}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { down.current = null; setDrag(null); if (!kb) setHov(null); }} onKeyDown={onKey} onBlur={() => { setKb(false); setHov(null); setAnchor(null); }}>
                <defs><linearGradient id="tr-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.14" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
                {ticks.map((t) => <g key={t}><line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} /><text className="ax" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{TICK[metric](t)}</text></g>)}
                {labelIdx(n, w < 420 ? 3 : w < 640 ? 5 : 7).map((i, k, a) => <text key={i} className="ax" x={x(i)} y={H - 7} textAnchor={k === 0 ? "start" : k === a.length - 1 ? "end" : "middle"}>{fmtDate(bks[i].from)}</text>)}
                <text className="ax ax-cap" x={w - 4} y={H - 7} textAnchor="end">{step === 7 ? "Weekly" : "Daily"}</text>
                {bandPath && <path className="tr-band" d={bandPath} />}
                {midPath && <path className="tr-mid" d={midPath} fill="none" />}
                {area && <path className="tr-area" d={area} fill="url(#tr-fill)" />}
                <g className="tr-bars" aria-hidden="true" pointerEvents="none">{barRects(ysM, x, base, bw).map((r, i) => <rect key={i} className={part && i === n - 1 ? "tr-pbar" : undefined} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} />)}</g>
                {pp.map((p, i) => <path key={i} className="tr-prior" d={p} fill="none" />)}
                {lp && <path className="tr-line line draw" pathLength={1} d={lp} fill="none" />}
                {tail && <path className="tr-line tr-part line fade" d={tail} fill="none" />}
                {step === 7 && n > 1 && cur.map((_, i) => <circle key={`w${i}`} className="tr-pt" cx={x(i)} cy={ym(i)} r={2.5} pointerEvents="none" />)}
                {band && n > 7 && <g pointerEvents="none"><line className="tr-warm" x1={x(6)} x2={x(6)} y1={PAD.t} y2={base} /><text className="ax" x={x(6) + 4} y={PAD.t + 9}>full window</text></g>}
                {n === 1 && <circle cx={x(0)} cy={ym(0)} r={4} fill="var(--accent)" />}
                {marks.map((i) => <circle key={`m${i}`} className="ring" cx={x(i)} cy={ym(i)} r={7} />)}
                {peak >= 0 && n > 1 && <g pointerEvents="none"><circle className="tr-dot tr-peakdot" cx={x(peak)} cy={ym(peak)} r={5} /><text className="tr-end tr-peak" x={x(peak)} y={ym(peak) - 9} textAnchor={tx(x(peak), 70)}>peak {fmt(cur[peak])}</text></g>}
                {sel && <rect className="brush" x={x(Math.min(...sel))} y={PAD.t} width={Math.max(2, Math.abs(x(sel[1]) - x(sel[0])))} height={ih} />}
                {hov !== null && !drag && <g className="tr-cross" pointerEvents="none"><line x1={lx} x2={lx} y1={PAD.t} y2={base} />{prv?.[hov] != null && <circle className="tr-pdot" cx={lx} cy={y(prv[hov] as number)} r={3.5} />}<circle className={isPart(hov) ? "tr-dot tr-hollow" : "tr-dot"} cx={lx} cy={ym(hov)} r={5} /></g>}
                {part && hov !== n - 1 && <circle className="tr-dot tr-hollow" cx={x(n - 1)} cy={ym(n - 1)} r={4} pointerEvents="none" />}
                {hov === null && endLabel && <g pointerEvents="none"><circle className="tr-dot" cx={x(last)} cy={ym(last)} r={4} /><text className="tr-end" x={Math.min(x(last) + 8, w - 4)} y={ym(last) + 4} textAnchor={x(last) + 8 + 30 > w ? "end" : "start"}>{fmt(cur[last])}</text></g>}
                <rect className="tr-hit" x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" />
              </svg>
            )}
            {n > 1 && <span className="tr-hint" aria-hidden="true">Drag to zoom</span>}
            {tip && hov !== null && !drag && (
              <div className="tr-tip" role="presentation" style={{ left: flip ? undefined : left, right: flip ? Math.max(4, w - lx + 12) : undefined, top: 8 } as CSSProperties}>
                <b>{labelOf(hov)}</b>
                {isPart(hov) && <span className="meta">Partial {unit}, data to {fmtDate(bks[hov].to < d.generated_at.slice(0, 10) ? bks[hov].to : d.generated_at)}</span>}
                <div className="r"><i style={{ background: "var(--accent)" }} />This period <Count quick as="b" text={fmt(cur[hov])} /></div>
                {tip.pr !== null && <div className="r"><i style={{ background: "var(--prior)" }} />{tip.pl} <Count quick as="b" text={fmt(tip.pr)} /></div>}
                {tip.dd !== null && !isPart(hov) && <div className="r"><span className="meta">Change</span> <Delta still neutral={metric !== "cost"} lowerBetter={metric === "cost"} pct={tip.dd} /></div>}
                {unpB && unpB[hov] > 0 && <div className="r"><span className="meta">Unpriced</span> <b>{fmtInt(unpB[hov])} sessions</b></div>}
                {tip.tt && caps.multiTool && <div className="r"><span className="meta">Top tool</span> <b>{srcLabel(tip.tt.src as never)}</b> {Math.round(tip.tt.share * 100)}%</div>}
                {marks.includes(hov) && <div className="r bad">Unusual {unit}</div>}
              </div>
            )}
          </div>
          <p className="sr-only" aria-live="polite">{kb ? announce : ""}</p>
          <ul className="legend">
            <li style={{ "--c": "var(--accent)" } as CSSProperties}>This period</li>
            {prv && <li style={{ "--c": "var(--prior)" } as CSSProperties}>Previous period, aligned by day offset</li>}
            {!prior && <li className="bandkey">Trailing 7-{unit} median, 25th to 75th percentile band{n > 7 ? `; the first 6 ${unit}s use fewer values` : ""}</li>}
            {part && <li className="partkey">Hollow end, dashed: partial {unit}</li>}
            {marks.length > 0 && <li className="ringkey">Unusual {unit}</li>}
          </ul>
          {unp > 0 && !allUnpriced && <p className="note">{fmtInt(unp)} sessions unpriced, excluded from cost (not counted as $0).</p>}
          <DataTable caption={`${metric} by ${unit}`} head={["Bucket", "This period", ...(prv ? ["Previous"] : [])]} rows={bks.map((_, i) => [`${labelOf(i)}${isPart(i) ? " (partial)" : ""}`, +cur[i].toFixed(2), ...(prv ? [+((prv[i] ?? 0) as number).toFixed(2)] : [])])} />
        </>
      )}
    </Card>
  );
}
