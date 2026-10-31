import { useId } from "react";
import { extent, max } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut } from "d3-shape";
import type { DashboardData, Source } from "../data/types";
import { fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { gsap } from "../lib/motion";
import { GRID, MUTED, SEQ, SOURCES, TEXT, BG, srcColor, srcLabel } from "../lib/palette";
import { Chart, DataTable, Hits } from "./Chart";
import { BestSelf } from "./Narrative";

const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const bucket = (v: number, top: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / Math.max(1, top)) * 4.999)));

function CalendarHeat({ d }: { d: DashboardData }) {
  const cal = d.calendar;
  const days = new Map(cal.map((c) => [c.date.slice(0, 10), c]));
  const t0 = d.range.start ? ms(d.range.start) : cal.length ? Math.min(...cal.map((c) => ms(c.date))) : 0;
  const t1 = d.range.end ? ms(d.range.end) : cal.length ? Math.max(...cal.map((c) => ms(c.date))) : 0;
  const monday = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
  const w0 = monday(t0);
  const totalWeeks = Math.max(1, Math.floor((t1 - w0) / (7 * DAY)) + 1);
  const top = max(cal, (c) => c.prompts) ?? 1;
  const months = new Map<string, { s: number; p: number; c: number }>();
  for (const c of cal) { const k = c.date.slice(0, 7); const m = months.get(k) ?? { s: 0, p: 0, c: 0 }; m.s += c.sessions; m.p += c.prompts; m.c += c.cost_usd; months.set(k, m); }
  return (
    <Chart title="Activity calendar" ratio={6.2} ratioSm={2.6} empty={cal.length === 0} emptyText="No active days in this range"
      label={`Calendar heatmap of prompts per day across ${cal.length} active days from ${fmtDate(d.range.start)} to ${fmtDate(d.range.end)}.`}
      table={<DataTable caption="Activity by month" head={["Month", "Sessions", "Prompts", "Cost USD"]} rows={[...months].map(([k, m]) => [k, m.s, m.p, +m.c.toFixed(2)])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".wk"), { opacity: 0, stagger: { amount: 1.1 }, duration: 0.5, scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}>
      {({ w, h }, tip) => {
        const lw = 30, topPad = 16, gap = 2;
        const vis = Math.max(4, Math.min(totalWeeks, Math.floor((w - lw) / 10)));
        const first = totalWeeks - vis;
        const cell = Math.max(4, Math.min((w - lw) / vis - gap, (h - topPad) / 7 - gap));
        const weeks = Array.from({ length: vis }, (_, i) => first + i);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {[0, 2, 4].map((r) => <text key={r} x={0} y={topPad + r * (cell + gap) + cell * 0.8} fill={MUTED} fontSize={10}>{DOW[r]}</text>)}
            {weeks.map((wk, i) => {
              const ws = w0 + wk * 7 * DAY;
              const dd = new Date(ws);
              return (
                <g key={wk} className="wk" transform={`translate(${lw + i * (cell + gap)},0)`}>
                  {dd.getUTCDate() <= 7 && <text y={10} fill={MUTED} fontSize={10}>{dd.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</text>}
                  {DOW.map((_, r) => {
                    const date = new Date(ws + r * DAY).toISOString().slice(0, 10);
                    if (ms(date) > t1 || ms(date) < t0) return null;
                    const c = days.get(date);
                    const b = c ? bucket(c.prompts, top) : 0;
                    return (
                      <rect key={r} y={topPad + r * (cell + gap)} width={cell} height={cell} rx={2} fill={SEQ[b]} stroke={b === 0 ? GRID : "none"} strokeWidth={0.5}
                        onPointerEnter={(e) => { const r2 = e.currentTarget.getBoundingClientRect(); const s = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); tip.show(r2.left - s.left + cell / 2, r2.top - s.top, `${fmtDate(date)}: ${c ? `${fmtInt(c.prompts)} prompts, ${c.sessions} sessions, ${fmtUSD(c.cost_usd)}` : "no activity"}`); }} />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

function HourWeek({ d }: { d: DashboardData }) {
  const hw = d.hour_week;
  const top = max(hw, (x) => x.prompts) ?? 1;
  const peak = hw.reduce((a, b) => (b.prompts > a.prompts ? b : a), hw[0] ?? { dow: 0, hour: 0, prompts: 0 });
  const grid = new Map(hw.map((x) => [`${x.dow}-${x.hour}`, x.prompts]));
  return (
    <Chart title="Hour by weekday" ratio={3} ratioSm={1.5} empty={hw.length === 0} emptyText="No hourly activity yet"
      label={`Heatmap of prompts by hour and weekday. Busiest slot is ${DOW[peak.dow]} at ${peak.hour}:00 with ${fmtInt(peak.prompts)} prompts.`}
      table={<DataTable caption="Prompts by weekday and hour" head={["Weekday", "Hour", "Prompts"]} rows={hw.map((x) => [DOW[x.dow] ?? x.dow, x.hour, x.prompts])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".hc"), { opacity: 0, stagger: { amount: 0.9, from: "start" }, duration: 0.4, scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}>
      {({ w, h }, tip) => {
        const lw = 32, bh = 16, gap = 2;
        const cw = (w - lw) / 24, ch = (h - bh) / 7;
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {DOW.map((n, r) => <text key={n} x={0} y={r * ch + ch * 0.65} fill={MUTED} fontSize={10}>{n}</text>)}
            {[0, 6, 12, 18, 23].map((hr) => <text key={hr} x={lw + hr * cw} y={h - 3} fill={MUTED} fontSize={10}>{hr}h</text>)}
            {DOW.map((_, r) => Array.from({ length: 24 }, (_, c) => {
              const v = grid.get(`${r}-${c}`) ?? 0;
              const b = bucket(v, top);
              return (
                <rect key={`${r}-${c}`} className="hc" x={lw + c * cw} y={r * ch} width={Math.max(1, cw - gap)} height={Math.max(1, ch - gap)} rx={2} fill={SEQ[b]} stroke={b === 0 ? GRID : "none"} strokeWidth={0.5}
                  onPointerEnter={() => tip.show(lw + c * cw + cw / 2, r * ch, `${DOW[r]} ${c}:00: ${fmtInt(v)} prompts`)} />
              );
            }))}
          </svg>
        );
      }}
    </Chart>
  );
}

function CostRiver({ d }: { d: DashboardData }) {
  const uid = useId().replace(/:/g, "");
  const rows = d.cost_river;
  const keys = SOURCES.filter((s) => rows.some((r) => (r.values[s] ?? 0) > 0));
  const total = rows.reduce((a, r) => a + keys.reduce((b, k) => b + (r.values[k] ?? 0), 0), 0);
  return (
    <Chart title="Cost river" ratio={2.6} ratioSm={1.3} scrub empty={rows.length < 2 || keys.length === 0} emptyText="Not enough weekly cost data"
      label={`Weekly cost by source as a streamgraph, ${fmtUSD(total)} in total across ${keys.map(srcLabel).join(", ")}. ${d.anomalies.length} anomalies marked.`}
      controls={<ul className="legend">{keys.map((k) => <li key={k} style={{ "--c": srcColor(k) } as React.CSSProperties}><span className="sw" />{srcLabel(k)}</li>)}</ul>}
      table={<DataTable caption="Weekly cost USD by source" head={["Week", ...keys.map(srcLabel)]} rows={rows.map((r) => [r.date, ...keys.map((k) => +(r.values[k] ?? 0).toFixed(2))])} />}
      motion={({ root, wide }) => {
        const clip = root.querySelector(".reveal-clip");
        if (clip) gsap.fromTo(clip, { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", ease: "none", scrollTrigger: { trigger: root, start: "top 85%", end: wide ? "top 30%" : "top 40%", scrub: 0.6 } });
      }}
      overlay={({ w, h }, tip) => {
        const m = geom(w, h);
        const xs = scaleUtc().domain([ms(rows[0].date), ms(rows[rows.length - 1].date)]).range([m.l, w - m.r]);
        return <Hits tip={tip} items={d.anomalies.filter((a) => ms(a.date) >= xs.domain()[0].getTime() && ms(a.date) <= xs.domain()[1].getTime()).map((a, i) => {
          const label = `Anomaly on ${fmtDate(a.date)}: ${a.metric} ${a.metric === "cost" ? fmtUSD(a.value) : fmtInt(a.value)}, ${a.z.toFixed(1)} standard deviations above normal`;
          return { key: `${a.date}${i}`, x: xs(ms(a.date)) - 12, y: m.t - 4, w: 24, h: 24, label };
        })} />;
      }}>
      {({ w, h }) => {
        const m = geom(w, h);
        const xs = scaleUtc().domain([ms(rows[0].date), ms(rows[rows.length - 1].date)]).range([m.l, w - m.r]);
        const series = stack<(typeof rows)[number], Source>().keys(keys).value((r, k) => r.values[k] ?? 0).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows);
        const [lo, hi] = extent(series.flatMap((s) => s.flatMap((p) => [p[0], p[1]]))) as [number, number];
        const ys = scaleLinear().domain([lo, hi]).range([h - m.b, m.t]);
        const ar = area<(typeof series)[number][number]>().x((_, i) => xs(ms(rows[i].date))).y0((p) => ys(p[0])).y1((p) => ys(p[1])).curve(curveBasis);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <defs><clipPath id={`rc${uid}`}><rect className="reveal-clip" x={0} y={0} width={w} height={h} /></clipPath></defs>
            <g clipPath={`url(#rc${uid})`}>
              {series.map((s) => <path key={s.key} d={ar(s) ?? ""} fill={srcColor(s.key)} fillOpacity={0.92} stroke={BG} strokeWidth={0.75} />)}
              {d.anomalies.filter((a) => ms(a.date) >= xs.domain()[0].getTime() && ms(a.date) <= xs.domain()[1].getTime()).map((a, i) => (
                <g key={`${a.date}${i}`} transform={`translate(${xs(ms(a.date))},0)`}>
                  <line y1={m.t + 8} y2={h - m.b} stroke={TEXT} strokeOpacity={0.5} strokeDasharray="3 3" />
                  <path d={`M0 ${m.t - 2} l6 8 l-6 8 l-6 -8z`} fill={BG} stroke={TEXT} strokeWidth={1.5} />
                </g>
              ))}
            </g>
            {(() => {
              const top = [...d.anomalies].sort((a, b) => b.z - a.z)[0];
              if (!top || ms(top.date) < xs.domain()[0].getTime() || ms(top.date) > xs.domain()[1].getTime()) return null;
              const x = xs(ms(top.date)), right = x > w * 0.62;
              return (
                <text className="callout" x={x + (right ? -12 : 12)} y={m.t + 16} textAnchor={right ? "end" : "start"} fill={TEXT} stroke={BG} strokeWidth={4} paintOrder="stroke" fontSize={12} fontWeight={600}>
                  {fmtDate(top.date)}: {top.metric === "cost" ? fmtUSD(top.value) : `${fmtInt(top.value)} prompts`}, {top.z >= 10 ? "far above your normal range" : `${top.z.toFixed(1)} sigma above normal`}
                </text>
              );
            })()}
            {[0, Math.floor(rows.length / 2), rows.length - 1].map((i) => (
              <text key={i} x={xs(ms(rows[i].date))} y={h - 4} fill={MUTED} fontSize={10} textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}>{fmtDate(rows[i].date)}</text>
            ))}
          </svg>
        );
      }}
    </Chart>
  );
}
const geom = (w: number, h: number) => ({ l: 8, r: 8, t: 22, b: 20, w, h });

export function Time({ d }: { d: DashboardData }) {
  return (
    <div className="stack">
      <CostRiver d={d} />
      <CalendarHeat d={d} />
      <HourWeek d={d} />
      <BestSelf d={d} />
    </div>
  );
}
