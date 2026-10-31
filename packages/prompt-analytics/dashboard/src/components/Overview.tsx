import { useMemo, useState } from "react";
import { useStore } from "../state";
import { attention, THRESHOLDS, type Item } from "../lib/attention";
import { bucketSeries, buckets, dayDiff, delta, isWide, METRICS, pointDelta, sparkSeries, wilson } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { Card, DataTable, Delta, Empty, Section, Segmented } from "./ui";
import { LineChart, Spark } from "./charts";

type Metric = "sessions" | "prompts" | "cost";
const FMT: Record<Metric, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };

function Kpis({ setMetric }: { setMetric: (m: Metric) => void }) {
  const { d, v, prior, win, exposed, goto } = useStore();
  const t = v.totals, p = prior?.v.totals, pn = p?.sessions ?? 0;
  const open = useMemo(() => new Set(d.exposure.items.filter((i) => i.status === "open" && i.session).map((i) => i.session as string)), [d]);
  const pExposed = prior ? prior.v.rows.filter((r) => open.has(r.id)).length : 0;
  const cap = prior ? `vs ${fmtDate(prior.win.from)} - ${fmtDate(prior.win.to)}` : "no earlier period";
  const rate = t.asked ? t.applied / t.asked : 0, prate = p && p.asked ? p.applied / p.asked : 0;
  const dPts = (cur: number, pr: number, digits: number, unit: string) => { const x = pointDelta(cur, pr, pn); return x === null ? null : { pct: x, text: `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(unit === "pp" ? x * 100 : x).toFixed(digits)} ${unit}`.trim() }; };
  const sp = (fn: (r: typeof v.rows) => number) => sparkSeries(v.rows, win, fn);
  const cards: { id: string; label: string; value: string; sub?: string; chip: React.ReactNode; spark: number[]; low?: boolean; go: () => void }[] = [
    { id: "sessions", label: "Sessions", value: fmtInt(t.sessions), chip: p && (() => { const x = delta(t.sessions, p.sessions, pn); return x && <Delta pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sp(METRICS.sessions), go: () => { setMetric("sessions"); goto("s-attention"); } },
    { id: "prompts", label: "Prompts", value: fmtCompact(t.prompts), sub: t.asked ? `${(t.prompts / t.asked).toFixed(1)} per session with prompts` : undefined, chip: p && (() => { const x = delta(t.prompts, p.prompts, pn); return x && <Delta pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sp(METRICS.prompts), go: () => { setMetric("prompts"); goto("s-attention"); } },
    { id: "cost", label: "Cost", value: t.cost === null ? "not priced" : fmtUSD(t.cost), sub: t.cost !== null && t.unpriced > 0 ? `${fmtInt(t.unpriced)} sessions unpriced` : undefined,
      chip: p && t.cost !== null && p.cost !== null && (() => { const x = delta(t.cost as number, p.cost as number, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sp(METRICS.cost), go: () => { setMetric("cost"); goto("s-time"); } },
    { id: "applied", label: "Applied", value: t.asked ? fmtPct(rate) : "0%", sub: t.asked ? (isWide(t.applied, t.asked) ? `n=${fmtInt(t.asked)}, wide CI ${fmtPct(wilson(t.applied, t.asked)[0])}-${fmtPct(wilson(t.applied, t.asked)[1])}` : `${fmtInt(t.applied)} of ${fmtInt(t.asked)}`) : undefined,
      chip: p && (() => { const x = dPts(rate, prate, 1, "pp"); return x && <Delta pct={x.pct} text={x.text} />; })(), spark: sp(METRICS.applied), low: t.asked > 0 && isWide(t.applied, t.asked), go: () => goto("s-funnel") },
    { id: "friction", label: "Friction", value: t.friction.toFixed(2), sub: "0 to 1, lower is better", chip: p && (() => { const x = dPts(t.friction, p.friction, 2, ""); return x && <Delta lowerBetter pct={x.pct} text={x.text} />; })(), spark: sp(METRICS.friction), go: () => goto("s-friction") },
    { id: "exposed", label: "Exposed", value: t.sessions ? fmtPct(exposed.size / t.sessions, 1) : "0%", sub: `${fmtInt(exposed.size)} sessions with open findings`,
      chip: p && (() => { const x = delta(exposed.size, pExposed, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sparkSeries(v.rows, win, (rs) => rs.filter((r) => open.has(r.id)).length), go: () => goto("s-exposure") },
  ];
  return (
    <ul className="kpis" aria-label="Totals for the current selection">
      {cards.map((c) => (
        <li key={c.id}>
          <button type="button" className="kpi" data-kpi={c.id} onClick={c.go} aria-label={`${c.label}: ${c.value}. Jump to details`}>
            <span className="lbl">{c.label}</span>
            <span className="val">{c.value}</span>
            <span className="chips">{c.chip}{c.sub ? <span className="sub" data-low={c.low || undefined}>{c.sub}</span> : null}</span>
            <Spark values={c.spark} />
            <span className="cap">{cap}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Trend({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  const { d, v, win, prior, apply } = useStore();
  const auto: 1 | 7 = win.days > 60 ? 7 : 1;
  const [pick, setPick] = useState<{ days: number; step: 1 | 7 } | null>(null);
  const step = pick && pick.days === win.days ? pick.step : auto;   // a new window re-picks the natural bucket
  const bks = useMemo(() => buckets(win, step), [win, step]);
  const cur = useMemo(() => bucketSeries(v.rows, win, step, METRICS[metric]), [v.rows, win, step, metric]);
  const prv = useMemo(() => (prior ? bucketSeries(prior.v.rows, prior.win, step, METRICS[metric]) : null), [prior, step, metric]);
  const rings = useMemo(() => (metric === "sessions" ? [] : d.anomalies.filter((a) => a.metric === (metric === "cost" ? "cost" : "prompts")).map((a) => Math.floor(dayDiff(win.from, a.date) / step)).filter((i) => i >= 0 && i < bks.length)), [d.anomalies, metric, win, step, bks.length]);
  const fmt = FMT[metric];
  const labels = bks.map((b) => (step === 1 || b.from === b.to ? fmtDate(b.from) : `${fmtDate(b.from)} - ${fmtDate(b.to)}`));
  const go = (a: number, b: number) => apply({ from: bks[a].from, to: bks[b].to });
  return (
    <Card id="s-trend" title="Current vs previous period" meta={prior ? `${fmtDate(win.from)} - ${fmtDate(win.to)} against ${fmtDate(prior.win.from)} - ${fmtDate(prior.win.to)}` : `${fmtDate(win.from)} - ${fmtDate(win.to)}, no earlier period`} span={8}
      actions={<>
        <Segmented label="Metric" value={metric} onChange={setMetric} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, { id: "cost", text: "Cost" }]} />
        <Segmented label="Bucket" value={String(step)} onChange={(s) => setPick({ days: win.days, step: s === "7" ? 7 : 1 })} options={[{ id: "1", text: "Daily" }, { id: "7", text: "Weekly" }]} />
      </>}>
      {v.totals.sessions === 0 || cur.length === 0 ? <Empty>No sessions in this period.</Empty> : (
        <>
          <LineChart label={`${metric} per ${step === 1 ? "day" : "week"}, click or drag to filter the period`} labels={labels} fmt={fmt} rings={rings}
            lines={[{ name: "This period", color: "var(--accent)", values: cur }, ...(prv ? [{ name: "Previous", color: "var(--prior)", values: prv, dashed: true }] : [])]}
            onPick={(i) => go(i, i)} onBrush={go} />
          <ul className="legend"><li style={{ "--c": "var(--accent)" } as React.CSSProperties}>This period</li>{prv && <li style={{ "--c": "var(--prior)" } as React.CSSProperties}>Previous period</li>}{rings.length > 0 && <li className="ringkey">Unusual day or week</li>}</ul>
          <DataTable caption={`${metric} by ${step === 1 ? "day" : "week"}`} head={["Bucket", "This period", ...(prv ? ["Previous"] : [])]} rows={bks.map((_, i) => [labels[i], +cur[i].toFixed(2), ...(prv ? [+(prv[i] ?? 0).toFixed(2)] : [])])} />
        </>
      )}
    </Card>
  );
}

const DOT: Record<Item["sev"], string> = { bad: "var(--bad)", warn: "var(--warn)", info: "var(--muted)" };

function Attention() {
  const { d, v, f, ids, apply, goto, setExCat } = useStore();
  const items = useMemo(() => attention(d, v, f, ids), [d, v, f, ids]);
  const run = (it: Item) => {
    const a = it.action;
    if (a.kind === "drill") apply(a.filter, { list: a.list });
    else { if (a.exCat) setExCat(a.exCat); goto(a.id); }
  };
  return (
    <Card id="s-attention" title="Needs attention" meta="ranked, one click to the cause" span={4}>
      {items.length === 0 ? <Empty>Nothing needs attention. Checked: {THRESHOLDS}.</Empty> : (
        <ol className="attn">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => run(it)} aria-label={`${it.headline}. ${it.action.kind === "drill" ? "Filter and open sessions" : "Jump to details"}`}>
                <i className="sev" style={{ background: DOT[it.sev] }} aria-hidden="true" />
                <span className="hl">{it.headline}</span>
                <b className="num">{it.num}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function Overview() {
  const { d } = useStore();
  const [metric, setMetric] = useState<Metric>("sessions");
  const t = d.totals;
  return (
    <Section id="s-overview" title="Overview" q="Is anything on fire?">
      <div className="s12"><Kpis setMetric={setMetric} /></div>
      <p className="s12 allt" aria-label="All-time totals, not filtered">
        <span className="meta">All time</span> {fmtInt(t.active_days)} active days · streak {t.longest_streak} longest, {t.current_streak} now · {fmtInt(t.projects)} projects · {fmtInt(t.commits_linked)} commits linked
      </p>
      <Trend metric={metric} setMetric={setMetric} />
      <Attention />
    </Section>
  );
}
