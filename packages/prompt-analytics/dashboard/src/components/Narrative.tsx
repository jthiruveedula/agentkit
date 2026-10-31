import { scaleLinear } from "d3-scale";
import type { DashboardData } from "../data/types";
import { fmtCompact, fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { gsap } from "../lib/motion";
import { BG, GRID, HELPS, MUTED, SEQ, TEXT, srcColor, srcLabel } from "../lib/palette";
import { Chart, DataTable } from "./Chart";
import { Trace } from "./Trace";

const MON = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

/** You versus your best self: latest month against your best month. */
export function BestSelf({ d }: { d: DashboardData }) {
  const m = new Map<string, { p: number; days: number; c: number }>();
  for (const c of d.calendar) { const k = c.date.slice(0, 7); const v = m.get(k) ?? { p: 0, days: 0, c: 0 }; v.p += c.prompts; v.days += 1; v.c += c.cost_usd; m.set(k, v); }
  const keys = [...m.keys()].sort();
  const cur = keys[keys.length - 1];
  const best = keys.reduce((a, k) => (m.get(k)!.p > m.get(a)!.p ? k : a), keys[0]);
  const rows = keys.length >= 2 ? [
    { l: "Prompts", a: m.get(cur)!.p, b: m.get(best)!.p, f: fmtCompact },
    { l: "Active days", a: m.get(cur)!.days, b: m.get(best)!.days, f: fmtInt },
    { l: "Spend", a: m.get(cur)!.c, b: m.get(best)!.c, f: fmtUSD },
  ] : [];
  const same = cur === best;
  return (
    <Chart title={same ? "This month is your best so far" : `${MON(cur ?? "2000-01")} against your best month, ${MON(best ?? "2000-01")}`} ratio={3} ratioSm={1.25} empty={rows.length === 0} emptyText="Needs two months of activity"
      label={rows.length ? `You versus your best self. Latest month ${MON(cur)}: ${rows.map((r) => `${r.l.toLowerCase()} ${r.f(r.a)}`).join(", ")}. Best month ${MON(best)}: ${rows.map((r) => `${r.l.toLowerCase()} ${r.f(r.b)}`).join(", ")}.` : ""}
      controls={<ul className="legend"><li style={{ "--c": SEQ[4] } as React.CSSProperties}><span className="sw" />{MON(cur ?? "2000-01")}</li><li style={{ "--c": HELPS } as React.CSSProperties}><span className="sw" />{MON(best ?? "2000-01")} (best)</li></ul>}
      table={<DataTable caption="Latest month against best month" head={["Metric", "Latest", "Best"]} rows={rows.map((r) => [r.l, r.f(r.a), r.f(r.b)])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".sb"), { scaleX: 0, transformOrigin: "0% 50%", stagger: 0.1, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}>
      {({ w, h }) => {
        const lw = w < 520 ? 74 : 110, vw = 64, gh = h / rows.length;
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {rows.map((r, i) => {
              const x = scaleLinear().domain([0, Math.max(r.a, r.b, 1)]).range([0, w - lw - vw]);
              const bh = Math.min(16, gh * 0.24), y = i * gh + gh / 2 - bh - 3;
              return (
                <g key={r.l}>
                  <text x={0} y={y + bh + 3} dy="0.35em" fill={TEXT} fontSize={12}>{r.l}</text>
                  <rect className="sb" x={lw} y={y} width={Math.max(2, x(r.a))} height={bh} rx={2} fill={SEQ[4]} />
                  <text x={lw + x(r.a) + 6} y={y + bh / 2} dy="0.35em" fill={TEXT} fontSize={11}>{r.f(r.a)}</text>
                  <rect className="sb" x={lw} y={y + bh + 6} width={Math.max(2, x(r.b))} height={bh} rx={2} fill={HELPS} />
                  <text x={lw + x(r.b) + 6} y={y + bh + 6 + bh / 2} dy="0.35em" fill={MUTED} fontSize={11}>{r.f(r.b)}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

/** Best tool per intent: fastest vs slowest median time-to-resolution. */
export function BestTool({ d }: { d: DashboardData }) {
  const by = new Map<string, DashboardData["ttr"]>();
  for (const t of d.ttr) if (t.n >= 5 && t.median_min > 0) by.set(t.intent, [...(by.get(t.intent) ?? []), t]);
  const rows = [...by.entries()].filter(([, v]) => v.length >= 2).map(([intent, v]) => {
    const s = [...v].sort((a, b) => a.median_min - b.median_min);
    return { intent, best: s[0], worst: s[s.length - 1] };
  }).sort((a, b) => b.worst.median_min / b.best.median_min - a.worst.median_min / a.best.median_min).slice(0, 6);
  const top = rows[0];
  return (
    <Chart title="Fastest tool for each intent" ratio={2.4} ratioSm={1.1} empty={rows.length === 0} emptyText="Not enough resolution-time data"
      label={top ? `Fastest versus slowest tool by median time to resolve. Biggest gap: ${top.intent}, ${srcLabel(top.best.source)} at ${top.best.median_min.toFixed(0)} minutes against ${srcLabel(top.worst.source)} at ${top.worst.median_min.toFixed(0)}.` : ""}
      table={<DataTable caption="Median minutes to resolve" head={["Intent", "Fastest tool", "Fastest min", "Slowest tool", "Slowest min"]} rows={rows.map((r) => [r.intent, srcLabel(r.best.source), +r.best.median_min.toFixed(1), srcLabel(r.worst.source), +r.worst.median_min.toFixed(1)])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".db"), { opacity: 0, x: -12, stagger: 0.09, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}>
      {({ w, h }) => {
        const lw = 66, rw = w < 520 ? 96 : 190, gh = h / rows.length;
        const x = scaleLinear().domain([0, Math.max(...rows.map((r) => r.worst.median_min))]).range([lw, w - rw]);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {rows.map((r, i) => {
              const y = i * gh + gh / 2;
              return (
                <g key={r.intent} className="db">
                  <text x={0} y={y} dy="0.35em" fill={MUTED} fontSize={12}>{r.intent}</text>
                  <line x1={x(r.best.median_min)} x2={x(r.worst.median_min)} y1={y} y2={y} stroke={GRID} strokeWidth={2} />
                  <circle cx={x(r.best.median_min)} cy={y} r={7} fill={srcColor(r.best.source)} stroke={BG} strokeWidth={2} />
                  <circle cx={x(r.worst.median_min)} cy={y} r={6} fill={BG} stroke={MUTED} strokeWidth={2} />
                  <text x={x(r.worst.median_min) + 14} y={y} dy="0.35em" fill={TEXT} fontSize={12}>{srcLabel(r.best.source)}{w < 520 ? "" : `, ${(r.worst.median_min / r.best.median_min).toFixed(1)}x faster`}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

/** Local, network-free summary card. */
export function Recap({ d }: { d: DashboardData }) {
  const t = d.totals;
  const days = d.range.start && d.range.end ? Math.round((Date.parse(d.range.end) - Date.parse(d.range.start)) / 864e5) + 1 : 0;
  const span = days >= 330 ? "year" : days >= 60 ? `${Math.round(days / 30)} months` : "time";
  const total = d.by_source.reduce((a, b) => a + b.prompts, 0) || 1;
  const stats = [
    { n: fmtInt(t.sessions), l: "sessions", tr: [`${fmtInt(t.projects)} projects`, "counted from session logs"] },
    { n: fmtCompact(t.prompts), l: "prompts", tr: [`${fmtInt(t.prompts)} exact`, "counted from session logs"] },
    { n: fmtCompact(t.tokens), l: "tokens", tr: [`${fmtInt(t.tokens)} exact`, "tools that do not log tokens count as 0"] },
    { n: fmtUSD(t.cost_usd), l: "spent", tr: [d.by_source.some((s) => s.cost_is_estimate) ? "includes estimates" : "reported by tools", "USD at list prices"] },
    { n: `${fmtInt(t.longest_streak)}d`, l: "longest streak", tr: [`${fmtInt(t.active_days)} active days`, `current streak ${fmtInt(t.current_streak)}d`] },
  ];
  return (
    <section className="recap" aria-labelledby="recap-h" data-reveal>
      <h3 id="recap-h" className="recap-t">Your {span} with AI coding assistants</h3>
      {d.by_source.length > 0 && (
        <div className="recap-bar" role="img" aria-label={`Prompt share by source: ${d.by_source.map((s) => `${srcLabel(s.source)} ${Math.round((s.prompts / total) * 100)}%`).join(", ")}`}>
          {d.by_source.map((s) => <span key={s.source} style={{ "--c": srcColor(s.source), flex: Math.max(0.01, s.prompts / total) } as React.CSSProperties} />)}
        </div>
      )}
      <div className="recap-stats" data-stagger>
        {stats.map((s) => (
          <div key={s.l} className="stat"><span className="stat-n">{s.n}</span><span className="stat-l">{s.l}</span><Trace lines={s.tr} /></div>
        ))}
      </div>
      {d.range.start && <p className="recap-foot">{fmtDate(d.range.start)} to {fmtDate(d.range.end)}, rendered locally. Nothing leaves this machine.</p>}
    </section>
  );
}
