import { useMemo, useRef, useState } from "react";
import { useStore } from "../state";
import { addDays, weekStart } from "../lib/filter";
import { bucketSeries, buckets, cumulative, METRICS, monthProjection } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";
import { LineChart, River } from "./charts";

type M = "sessions" | "prompts" | "cost";
const WEEKS = 27;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FMT: Record<M, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };

function CalGrid() {
  const { d, v, f, drill, apply } = useStore();
  const [m, setM] = useState<M>("sessions");
  const [three, setThree] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const end = d.range.end;
  const first = addDays(weekStart(end), -(WEEKS - 1) * 7);
  const byDay = useMemo(() => new Map(v.calendar.map((c) => [c.date, c])), [v.calendar]);
  const peak = Math.max(...v.calendar.filter((c) => c.date >= first).map((c) => c[m]), 1e-9);
  const { group, mark } = useRoving(WEEKS * 7, 7, 1, 0);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => ({ i, date: addDays(first, i) }));
  const inSel = (dt: string) => f.from !== undefined && f.to !== undefined && dt >= f.from && dt <= f.to;
  const pick = (dt: string, shift: boolean) => {
    if (shift && anchor) { const [a, b] = anchor < dt ? [anchor, dt] : [dt, anchor]; apply({ from: a, to: b }); } else { setAnchor(dt); drill({ from: dt, to: dt }); }
  };
  // the hovered or focused day's week column lifts a little (direct DOM: no re-render of 189 buttons)
  const stage = useRef<HTMLDivElement | null>(null);
  const unlift = () => stage.current?.querySelectorAll("[data-wk]").forEach((e) => e.removeAttribute("data-wk"));
  const lift = (e: React.SyntheticEvent) => {
    const c = (e.target as Element).closest?.<HTMLElement>(".cal .cell");
    unlift(); if (c?.dataset.w) stage.current?.querySelectorAll(`.cal [data-w="${c.dataset.w}"]`).forEach((x) => x.setAttribute("data-wk", ""));
  };
  const months = days.filter((x) => x.i % 7 === 0 && x.date.slice(8, 10) <= "07");
  return (
    <Card title="Activity calendar" meta="click a day, shift-click to extend" span={8}
      actions={<><Segmented label="Calendar metric" value={m} onChange={setM} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, { id: "cost", text: "Cost" }]} />
        <button type="button" className="btn tog3" aria-pressed={three} onClick={() => setThree(!three)} title="Raise each day into a column, height by value">3D</button></>}>
      {v.calendar.length === 0 ? <Empty /> : (
        <>
          <div className="cal-stage" ref={stage} data-3d={three || undefined} onPointerOver={lift} onPointerLeave={unlift} onFocus={lift} onBlur={unlift}>
          <div className="cal-wrap">
            <div className="cal-m" style={{ "--w": WEEKS } as React.CSSProperties}>{months.map((x) => <span key={x.date} style={{ gridColumn: x.i / 7 + 1 }}>{new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>)}</div>
            <div className="cal-d" aria-hidden="true">{DOW.map((x, i) => <span key={x}>{i % 2 === 0 ? x : ""}</span>)}</div>
            <div className="cal" role="group" aria-label={`Daily ${m}, last ${WEEKS} weeks. Each day filters to that date`} style={{ "--w": WEEKS } as React.CSSProperties} {...group}>
              {days.map((x) => {
                if (x.date > end) return <span key={x.i} className="cell none" aria-hidden="true" />;
                const c = byDay.get(x.date), val = c ? c[m] : 0;
                return (
                  <button key={x.i} type="button" className="cell" data-zero={!val || undefined} data-sel={inSel(x.date) || undefined} aria-pressed={inSel(x.date)} style={{ "--v": val / peak, "--d": Math.floor(x.i / 7) + (x.i % 7), "--wk": Math.floor(x.i / 7) } as React.CSSProperties} data-w={Math.floor(x.i / 7)}
                    aria-label={`${fmtDate(x.date)}: ${FMT[m](val)} ${m}. Filter to this day`} title={`${fmtDate(x.date)}: ${FMT[m](val)}`}
                    onClick={(e) => pick(x.date, e.shiftKey)} {...mark(x.i)} />
                );
              })}
            </div>
          </div>
          </div>
          <DataTable caption={`Daily ${m}`} head={["Day", m]} rows={v.calendar.filter((c) => c.date >= first).map((c) => [c.date, +c[m].toFixed(2)])} />
        </>
      )}
    </Card>
  );
}

function Calendar() {
  const { d } = useStore();
  return d.range.end ? <CalGrid /> : <Card title="Activity calendar" span={8}><Empty /></Card>;
}

function HourWeek() {
  const { d } = useStore();
  const grid = useMemo(() => { const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0)); for (const h of d.hour_week) g[h.dow][h.hour] = h.prompts; return g; }, [d.hour_week]);
  const peak = Math.max(...grid.flat(), 1);
  const best = d.hour_week.reduce((a, b) => (b.prompts > a.prompts ? b : a), { dow: 0, hour: 0, prompts: 0 });
  return (
    <Card title="Hour by weekday" meta="prompts, all sessions" span={4}>
      {d.hour_week.length === 0 ? <Empty /> : (
        <>
          <div className="hw" role="img" aria-label={`Prompts by hour and weekday. Busiest: ${DOW[best.dow]} ${best.hour}:00, ${best.prompts} prompts`}>
            {grid.map((row, r) => <div key={r} style={{ display: "contents" }}><span className="hw-l">{DOW[r]}</span>{row.map((p, h) => <i key={h} className="cell" data-zero={!p || undefined} style={{ "--v": p / peak, "--d": r + h } as React.CSSProperties} title={`${DOW[r]} ${h}:00, ${p} prompts`} />)}</div>)}
            <span /><span className="hw-x" style={{ gridColumn: "2 / -1" }}><b>0h</b><b>6h</b><b>12h</b><b>18h</b><b>23h</b></span>
          </div>
          <p className="note">Busiest: {DOW[best.dow]} {best.hour}:00 ({fmtInt(best.prompts)} prompts). Hover only; ignores filters.</p>
          <DataTable caption="Prompts by weekday and hour" head={["Weekday", ...Array.from({ length: 24 }, (_, h) => `${h}h`)]} rows={grid.map((r, i) => [DOW[i], ...r])} />
        </>
      )}
    </Card>
  );
}

function Spend() {
  const { v, f, drill } = useStore();
  const unpriced = SOURCES.filter((s) => v.sources.some((t) => t.key === s && t.cost === null));
  const weeks = v.weeks;
  return (
    <Card title="Cost by tool, weekly" meta="priced tools only" span={7}>
      <River weeks={weeks} sel={f.source} label="Weekly cost by tool. Click a band to filter a tool, a column to filter a week" fmt={fmtUSD} height={200}
        onBand={(s) => drill({ source: s as never })} onWeek={(i) => drill({ from: weeks[i].week, to: addDays(weeks[i].week, 6) })} activeWeek={(i) => f.from === weeks[i].week} />
      <ul className="legend">
        {SOURCES.filter((s) => weeks.some((w) => (w.bySource[s] ?? 0) > 0)).map((s) => <li key={s} style={{ "--c": srcColor(s) } as React.CSSProperties}>{srcLabel(s)}</li>)}
        {unpriced.length > 0 && <li className="hatch">{unpriced.map(srcLabel).join(", ")}: not priced</li>}
      </ul>
      <DataTable caption="Weekly cost by tool" head={["Week", ...SOURCES.map(srcLabel)]} rows={weeks.map((w) => [w.week, ...SOURCES.map((s) => +(w.bySource[s] ?? 0).toFixed(2))])} />
    </Card>
  );
}

function Cumulative() {
  const { v, prior, win, apply } = useStore();
  const bks = useMemo(() => buckets(win, 1), [win]);
  const cur = useMemo(() => cumulative(bucketSeries(v.rows, win, 1, METRICS.cost)), [v.rows, win]);
  const prv = useMemo(() => (prior ? cumulative(bucketSeries(prior.v.rows, prior.win, 1, METRICS.cost)) : null), [prior]);
  const proj = useMemo(() => monthProjection(v.rows, win.to), [v.rows, win.to]);
  const labels = bks.map((b) => fmtDate(b.from));
  const priced = cur.length > 0 && cur[cur.length - 1] > 0;
  return (
    <Card title="Cumulative cost" meta="this period against the previous one" span={5}>
      {!priced ? <Empty>No priced sessions in this period.</Empty> : (
        <>
          <LineChart label="Cumulative cost by day. Click a day to filter it" labels={labels} fmt={fmtUSD} height={170}
            lines={[{ name: "This period", color: "var(--accent)", values: cur }, ...(prv ? [{ name: "Previous", color: "var(--prior)", values: prv, dashed: true }] : [])]} onPick={(i) => apply({ from: bks[i].from, to: bks[i].to })} />
          <ul className="legend"><li style={{ "--c": "var(--accent)" } as React.CSSProperties}>This period</li>{prv && <li style={{ "--c": "var(--prior)" } as React.CSSProperties}>Previous period</li>}</ul>
          {proj && <p className="note">Month to date {fmtUSD(proj.mtd)} over {proj.elapsed} of {proj.dim} days. At {fmtUSD(proj.perDay)} a day this lands near {fmtUSD(proj.projected)}. A straight-line run rate, not a forecast.</p>}
          <DataTable caption="Cumulative cost" head={["Day", "This period", ...(prv ? ["Previous"] : [])]} rows={bks.map((_, i) => [labels[i], +cur[i].toFixed(2), ...(prv ? [+(prv[i] ?? 0).toFixed(2)] : [])])} />
        </>
      )}
    </Card>
  );
}

export function Time() {
  return (
    <Section id="s-time" title="Time" q="When and how much?">
      <Calendar /><HourWeek /><Spend /><Cumulative />
    </Section>
  );
}
