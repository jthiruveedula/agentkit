// Per-week trend (last 12 Monday weeks) from briefing().weekly: one metric at a time, Area or Bars.
// ponytail: no 3D view or trailing-median band (the 3D canvas is ~2+ kB gz of projection code; add when budget allows).
import type { Week } from "../lib/briefing";
import { niceTicks } from "../lib/trend";
import { fmtCompact, fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { Segmented } from "./ui";

export type Metric = "struggled" | "sessions" | "prompts" | "spend";
export type View = "area" | "bars";
const NAME: Record<Metric, string> = { struggled: "Struggled", sessions: "Sessions", prompts: "Prompts", spend: "Spend" };
const FMT: Record<Metric, (n: number) => string> = { struggled: (n) => `${+n.toFixed(1)}%`, sessions: fmtInt, prompts: fmtCompact, spend: fmtUSD };
const pick = (w: Week, m: Metric): number | null => (m === "struggled" ? (w.struggled === null ? null : w.struggled * 100) : m === "spend" ? w.spend : w[m]);
const X0 = 46, X1 = 690, Y0 = 196, Y1 = 24;

/** Chart only; the card, toggles and headline number live in Overview. */
export function WeekChart({ weekly, metric, view }: { weekly: Week[]; metric: Metric; view: View }) {
  const vs = weekly.map((w) => pick(w, metric)), real = vs.filter((v): v is number => v !== null);
  if (!real.length) return <p className="empty">No weekly data for {NAME[metric].toLowerCase()} in this selection.</p>;
  const n = weekly.length, f = FMT[metric], { max, ticks } = niceTicks(Math.max(...real));
  const x = (i: number) => X0 + ((X1 - X0) * i) / Math.max(1, n - 1), y = (v: number) => Y0 - ((Y0 - Y1) * v) / max;
  const pts = vs.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as const])), line = pts.map((p) => p.join(",")).join(" ");
  const pk = vs.indexOf(Math.max(...real));
  const label = (i: number) => `${fmtDate(weekly[i].week)}: ${vs[i] === null ? "no data" : f(vs[i] as number)}`;
  return (
    <svg className="wk" viewBox="0 0 720 230" role="img" aria-label={`${NAME[metric]} per week. ${weekly.map((_, i) => label(i)).join("; ")}. Peak ${f(real.reduce((a, b) => Math.max(a, b)))}.`}>
      {ticks.map((t) => <g key={t}><line className="wk-g" x1={X0} x2={X1} y1={y(t)} y2={y(t)} /><text x={X0 - 6} y={y(t) + 4} textAnchor="end">{metric === "struggled" ? `${t}%` : fmtCompact(t)}</text></g>)}
      {view === "bars"
        ? vs.map((v, i) => v === null ? null : <rect key={i} className="wk-b" data-last={i === n - 1 || undefined} x={x(i) - 12} y={y(v)} width={24} height={Math.max(1, Y0 - y(v))} rx={4}><title>{label(i)}</title></rect>)
        : <>
            <polygon className="wk-a" points={`${pts[0][0]},${Y0} ${line} ${pts[pts.length - 1][0]},${Y0}`} />
            <polyline className="wk-l" points={line} />
            {vs.map((v, i) => v === null ? null : <circle key={i} className="wk-d" data-last={i === n - 1 || undefined} cx={x(i)} cy={y(v)} r={3.5}><title>{label(i)}</title></circle>)}
          </>}
      <text className="wk-pk" x={x(pk)} y={y(vs[pk] as number) - 10} textAnchor="middle">peak {f(vs[pk] as number)}</text>
      {weekly.map((w, i) => (i % 2 === (n - 1) % 2 ? <text key={w.week} x={x(i)} y={Y0 + 20} textAnchor="middle">{fmtDate(w.week)}</text> : null))}
    </svg>
  );
}

export const TrendToggles = ({ metric, setMetric, view, setView, hasCost }: { metric: Metric; setMetric: (m: Metric) => void; view: View; setView: (v: View) => void; hasCost: boolean }) => (
  <>
    <Segmented label="Metric" value={metric} onChange={setMetric} options={(["struggled", "sessions", "prompts", ...(hasCost ? ["spend"] : [])] as Metric[]).map((id) => ({ id, text: NAME[id] }))} />
    <Segmented quiet label="Chart type" value={view} onChange={setView} options={[{ id: "area", text: "Area" }, { id: "bars", text: "Bars" }]} />
  </>
);
