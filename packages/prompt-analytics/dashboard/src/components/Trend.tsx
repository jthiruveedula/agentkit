// Per-week trend (last 12 Monday weeks) from briefing().weekly: one metric at a time, Area or Bars.
// ponytail: no 3D view or trailing-median band (the 3D canvas is ~2+ kB gz of projection code; add when budget allows).
import { useRef } from "react";
import type { Week } from "../lib/briefing";
import { niceTicks } from "../lib/trend";
import { addDays } from "../lib/filter";
import { dayDiff } from "../lib/compare";
import { useSize } from "../lib/hooks";
import { WEEK_MIN_N } from "../lib/thresholds";
import { fmtCompact, fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { Segmented } from "./ui";

export type Metric = "struggled" | "sessions" | "prompts" | "spend";
export type View = "area" | "bars";
const NAME: Record<Metric, string> = { struggled: "Struggled", sessions: "Sessions", prompts: "Prompts", spend: "Spend" };
const FMT: Record<Metric, (n: number) => string> = { struggled: (n) => `${+n.toFixed(1)}%`, sessions: fmtInt, prompts: fmtCompact, spend: fmtUSD };
const pick = (w: Week, m: Metric): number | null => (m === "struggled" ? (w.struggled === null ? null : w.struggled * 100) : m === "spend" ? w.spend : w[m]);
/** Fixed pixel geometry: the viewBox is as wide as the box (measured), so 11px text stays 11px on a phone. 720 until measured (and in tests). */
const H = 230, X0 = 46, Y0 = 196, Y1 = 40, CH = 6.2;   // CH: rough width of one 11px character

/** The comparison baseline (lib/brief verdict): the earlier struggled rate `p` (0-1) over the `was` days; `now` = the compared days (shaded, labelled `tag`). */
export interface Ref { p: number; was?: [string, string]; now?: [string, string]; tag?: string }

/** Chart only; the card, toggles and headline number live in Overview. Null weeks are gaps, never 0. */
export function WeekChart({ weekly, metric, view, base }: { weekly: Week[]; metric: Metric; view: View; base?: Ref | null }) {
  const box = useRef<HTMLDivElement>(null), { w } = useSize(box);
  const W = w > 0 ? w : 720, X1 = W - 30;
  const vs = weekly.map((w) => pick(w, metric)), real = vs.filter((v): v is number => v !== null);
  if (!real.length) return <p className="empty">No weekly data for {NAME[metric].toLowerCase()} in this selection.</p>;
  const ref = metric === "struggled" && base ? base.p * 100 : null;
  const n = weekly.length, f = FMT[metric], { max, ticks } = niceTicks(Math.max(...real, ref ?? 0));
  const step = (X1 - X0) / Math.max(1, n - 1), bw = Math.min(24, step * 0.6);
  const x = (i: number) => X0 + step * i, y = (v: number) => Y0 - ((Y0 - Y1) * v) / max;
  const runs: [number, number][][] = [];
  vs.forEach((v, i) => { if (v === null) return; if (i === 0 || vs[i - 1] === null) runs.push([]); runs[runs.length - 1].push([x(i), y(v)]); });
  const pk = vs.indexOf(Math.max(...real));
  const low = (i: number) => metric === "struggled" && weekly[i].n < WEEK_MIN_N;
  const anyLow = vs.some((v, i) => v !== null && low(i));
  const label = (i: number) => `${fmtDate(weekly[i].week)}: ${vs[i] === null ? "no data" : f(vs[i] as number)}${vs[i] !== null && low(i) ? ` · n=${weekly[i].n}, too few to read alone` : ""}`;
  // a day's left edge: week i spans x(i) ± step/2 (Monday to Sunday), clamped to the plot, so a mid-week cut clips the shading instead of shading a 5th week
  const dx = (iso: string) => Math.min(X1, Math.max(X0, X0 + (step * (dayDiff(weekly[0].week, iso) - 3.5)) / 7));
  const span = (r?: [string, string]): [number, number] | null => { if (!r) return null; const a = dx(r[0]), b = dx(addDays(r[1], 1)); return b - a >= 1 ? [a, b] : null; };
  const shade = ref === null ? null : span(base?.now);
  const line = ref === null ? null : span(base?.was) ?? [X0, X1];   // earlier days off the chart (a year ago): a reference across the plot
  // "earlier X%": try the line's right end, left end and middle, above then below; if the series crosses every slot, it moves to the key under the chart
  const lt = ref === null ? "" : `earlier ${f(ref)}`, lw = lt.length * CH;
  const marks = vs.flatMap((v, i): [number, number, number, number][] => (v === null ? [] : view === "bars" ? [[x(i) - bw / 2, x(i) + bw / 2, y(v), Y0]] : [[x(i) - 5, x(i) + 5, y(v) - 5, y(v) + 5]]));
  // the series line crosses the label box? (line view: interpolate each segment over the label's x-range)
  const crosses = (lx: number, ty: number) => view !== "bars" && runs.some((r) => r.slice(1).some(([x2, y2], k) => {
    const [x1, y1] = r[k], xa = Math.max(x1, lx - lw), xb = Math.min(x2, lx);
    if (xa > xb || x2 === x1) return false;
    const at = (xx: number) => y1 + ((y2 - y1) * (xx - x1)) / (x2 - x1), ya = at(xa), yb = at(xb);
    return Math.min(ya, yb) <= ty + 3 && Math.max(ya, yb) >= ty - 10;
  }));
  const clear = (lx: number, ty: number) => ty - 10 >= 4 && ty + 3 <= Y0 - 2 && !crosses(lx, ty) && !marks.some(([a, b, c, d]) => a <= lx && b >= lx - lw && c <= ty + 3 && d >= ty - 10);
  const slot = ref === null || !line ? null : [line[1] - 4, line[0] + lw + 4, (line[0] + line[1] + lw) / 2].filter((lx) => lx - lw >= line[0] - 1 && lx <= line[1] + 1)
    .flatMap((lx) => [[lx, y(ref) - 6], [lx, y(ref) + 15]]).find(([lx, ty]) => clear(lx, ty)) ?? null;
  const tw = (base?.tag?.length ?? 0) * CH;
  const every = Math.max(2, Math.ceil(48 / step));   // x labels: every 2nd week, sparser when weeks are narrow
  return (
    <div ref={box} className="wk-box">
      <svg className="wk" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${NAME[metric]} per week. ${weekly.map((_, i) => label(i)).join("; ")}. Peak ${f(real.reduce((a, b) => Math.max(a, b)))}.${ref === null ? "" : ` Earlier rate ${f(ref)}.`}${shade && base?.tag ? ` Shaded: ${base.tag}.` : ""}`}>
        {shade && <rect className="wk-cmp" x={shade[0]} y={4} width={shade[1] - shade[0]} height={Y0 - 4} />}
        {shade && base?.tag && <text className="wk-tag" x={Math.min(shade[0] + 6, W - 4 - tw)} y={16}>{base.tag}</text>}
        {ticks.map((t) => <g key={t}><line className="wk-g" x1={X0} x2={X1} y1={y(t)} y2={y(t)} /><text x={X0 - 6} y={y(t) + 4} textAnchor="end">{metric === "struggled" ? `${t}%` : fmtCompact(t)}</text></g>)}
        {ref !== null && line && <g className="wk-ref"><line x1={line[0]} x2={line[1]} y1={y(ref)} y2={y(ref)} />{slot && <text x={slot[0]} y={slot[1]} textAnchor="end">{lt}</text>}</g>}
        {view === "bars"
          ? vs.map((v, i) => v === null ? null : <rect key={i} className="wk-b" data-last={i === n - 1 || undefined} data-low={low(i) || undefined} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(1, Y0 - y(v))} rx={Math.min(4, bw / 4)}><title>{label(i)}</title></rect>)
          : <>
              {runs.map((r, k) => <g key={k}>
                {r.length > 1 && <polygon className="wk-a" points={`${r[0][0]},${Y0} ${r.map((p) => p.join(",")).join(" ")} ${r[r.length - 1][0]},${Y0}`} />}
                <polyline className="wk-l" points={r.map((p) => p.join(",")).join(" ")} />
              </g>)}
              {vs.map((v, i) => v === null ? null : <circle key={i} className="wk-d" data-last={i === n - 1 || undefined} data-low={low(i) || undefined} cx={x(i)} cy={y(v)} r={3.5}><title>{label(i)}</title></circle>)}
            </>}
        <text className="wk-pk" x={x(pk) + (pk === n - 1 && n > 1 ? 6 : pk === 0 && n > 1 ? -6 : 0)} y={y(vs[pk] as number) - 10} textAnchor={n > 1 && pk === n - 1 ? "end" : n > 1 && pk === 0 ? "start" : "middle"}>peak {f(vs[pk] as number)}</text>
        {weekly.map((w, i) => ((n - 1 - i) % every === 0 ? <text key={w.week} x={x(i)} y={Y0 + 20} textAnchor="middle">{fmtDate(w.week)}</text> : null))}
      </svg>
      {((ref !== null && line && !slot) || anyLow) && <p className="wk-key">
        {ref !== null && line && !slot && <span className="wk-key-ref">earlier {f(ref)}</span>}
        {anyLow && <span>{view === "bars" ? "Hollow bar" : "\u25cb"} = under {WEEK_MIN_N} sessions with a prompt</span>}
      </p>}
    </div>
  );
}

export const TrendToggles = ({ metric, setMetric, view, setView, hasCost }: { metric: Metric; setMetric: (m: Metric) => void; view: View; setView: (v: View) => void; hasCost: boolean }) => (
  <>
    <Segmented label="Metric" value={metric} onChange={setMetric} options={(["struggled", "sessions", "prompts", ...(hasCost ? ["spend"] : [])] as Metric[]).map((id) => ({ id, text: NAME[id] }))} />
    <Segmented quiet label="Chart type" value={view} onChange={setView} options={[{ id: "area", text: "Area" }, { id: "bars", text: "Bars" }]} />
  </>
);
