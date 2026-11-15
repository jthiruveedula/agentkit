// Curve insights (friction.retry_cliff, works.prompt_length, time.daypart): the analyzer's applied rate per ordered bin with its
// 95% Wilson interval, the bin(s) the claim is about, and the rate of all other sessions as a dashed line. Whole export, ignores filters.
import { Fragment } from "react";
import { useStore } from "../state";
import type { Insight } from "../data/types";
import { fmtInt, fmtPct } from "../lib/format";
import { pts } from "../lib/stats";
import { sparkPath } from "./charts";
import { Card, DataTable } from "./ui";

const H = 120;

/** The plot alone. Draws nothing without `evidence.curve` (older exports). x is one unit per bin, stretched to the card; strokes do not scale. */
export function CurveChart({ ins }: { ins: Insight }) {
  const e = ins.evidence, c = e.curve;
  if (!c?.length) return null;
  const n = c.length, pick = e.pick ?? -1, on = (i: number) => pick >= 0 && (e.cumulative ? i >= pick : i === pick);
  const y = (r: number) => +((1 - Math.min(1, Math.max(0, r))) * H).toFixed(2), x = (i: number) => i + 0.5;
  const rates = c.map((b) => (b.n ? b.rate : null));   // an empty bin has no rate: the line breaks there
  const ci = (b: { lo: number; hi: number }) => `${fmtPct(b.lo)} to ${fmtPct(b.hi)}`;
  const gap = e.ci && e.baseline != null && pick >= 0 ? ` The claim's bins sit ${pts(ins.value / 100 - e.baseline)} from that (95% CI ${pts(e.ci[0]).replace(" pts", "")} to ${pts(e.ci[1])}).` : "";
  return (
    <div className="cv-w">
      <div className="cv" role="img" aria-label={`${ins.claim}. Chart of ${ins.metric}${e.baseline != null ? `; all other sessions ${fmtPct(e.baseline)}` : ""}.`}>
        {[1, 0.5, 0].map((t) => <span key={t} className="cv-ax" style={{ top: y(t) }}>{fmtPct(t)}</span>)}
        <svg viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {pick >= 0 && pick < n && <rect className="cv-on" x={pick} width={e.cumulative ? n - pick : 1} y={0} height={H} />}
          {[0, 0.5, 1].map((t) => <line key={t} className="grid-l" x1={0} x2={n} y1={y(t)} y2={y(t)} vectorEffect="non-scaling-stroke" />)}
          {c.map((b, i) => b.n > 0 && <rect key={i} className="cv-band" x={i + 0.2} width={0.6} y={y(b.hi)} height={Math.max(1, y(b.lo) - y(b.hi))} />)}
          {e.baseline != null && <line className="cv-base" x1={0} x2={n} y1={y(e.baseline)} y2={y(e.baseline)} vectorEffect="non-scaling-stroke" />}
          <path className="cv-l" d={sparkPath(rates, x, y)} vectorEffect="non-scaling-stroke" />
          <path className="cv-d" d={c.map((b, i) => (b.n ? `M${x(i)},${y(b.rate)}h0` : "")).join("")} vectorEffect="non-scaling-stroke" />
          {c.map((b, i) => <rect key={i} x={i} width={1} y={0} height={H} fill="transparent"><title>{b.n ? `${b.label}: ${fmtPct(b.rate)} applied, 95% Wilson CI ${ci(b)}, n=${fmtInt(b.n)}` : `${b.label}: no sessions`}</title></rect>)}
        </svg>
      </div>
      <div className="ng-x cv-x" aria-hidden="true">
        {c.map((b, i) => (
          <span key={i} data-on={on(i) || undefined}>
            <b>{b.label.split("-").map((p, j) => <Fragment key={j}>{j ? <>-<wbr /></> : null}{p}</Fragment>)}</b>
            {b.n ? <>{fmtPct(b.rate)}<small>n={fmtInt(b.n)}</small></> : "none"}
          </span>
        ))}
      </div>
      <p className="note">Bars: 95% Wilson interval per bin. Marked bins: what the claim covers.{e.baseline != null ? ` Dashed line: all other sessions, ${fmtPct(e.baseline)}.` : ""}{gap} Association, not cause.</p>
      <DataTable caption={ins.metric} head={["Bin", "Sessions", "Rate", "95% CI", "In claim"]}
        rows={c.map((b, i) => [b.label, b.n, b.n ? fmtPct(b.rate) : "-", b.n ? ci(b) : "-", on(i) ? "yes" : "no"])} />
    </div>
  );
}

const TITLE = { "friction.retry_cliff": "Applied rate by retries", "works.prompt_length": "Applied rate by opening prompt length", "time.daypart": "Applied rate by start time" };

/** One card per curve insight, in its chapter's section. Nothing when the export has no such insight or no curve. */
export function CurveCard({ id }: { id: keyof typeof TITLE }) {
  const ins = useStore().d.insights.find((i) => i.id === id);
  if (!ins?.evidence.curve?.length) return null;
  return (
    <Card title={TITLE[id]} so={<>{ins.claim}.</>} meta={<><span className="tag">all sessions</span> {ins.metric}</>} src={`insights · ${id} · n ${fmtInt(ins.evidence.n)}`} span={12}>
      <CurveChart ins={ins} />
    </Card>
  );
}
