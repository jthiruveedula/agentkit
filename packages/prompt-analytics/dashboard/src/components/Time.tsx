import { useMemo } from "react";
import { useStore } from "../state";
import { addDays, capZ, weekStart } from "../lib/filter";
import { fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { BarList, Cols, DataTable, Empty, Panel } from "./ui";

const WEEKS = 26;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Calendar() {
  const { v, f, drill, d } = useStore();
  const end = d.range.end || v.calendar.at(-1)?.date || "";
  const days = useMemo(() => {
    if (!end) return [];
    const last = weekStart(end);
    const first = addDays(last, -(WEEKS - 1) * 7);
    const by = new Map(v.calendar.map((c) => [c.date, c]));
    const peak = Math.max(...v.calendar.map((c) => c.sessions), 1);
    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const date = addDays(first, i);
      return { date, c: by.get(date), inRange: date <= end, v: (by.get(date)?.sessions ?? 0) / peak };
    });
  }, [v.calendar, end]);
  if (!days.length || v.calendar.length === 0) return <Empty />;
  const sel = f.from && f.from === f.to ? f.from : null;
  return (
    <>
      <div className="cal" role="group" aria-label="Sessions per day, last 26 weeks. Each cell opens that day">
        {days.map((x) => !x.inRange ? <span key={x.date} className="cell none" aria-hidden="true" /> : x.c ? (
          <button key={x.date} type="button" className="cell" style={{ "--v": Math.max(0.15, x.v) } as React.CSSProperties} aria-pressed={sel === x.date}
            aria-label={`${fmtDate(x.date)}: ${x.c.sessions} sessions, ${x.c.prompts} prompts. Open sessions`} title={`${fmtDate(x.date)}: ${x.c.sessions} sessions`}
            onClick={() => drill({ from: x.date, to: x.date })} />
        ) : <span key={x.date} className="cell none" aria-hidden="true" />)}
      </div>
      <DataTable caption="Sessions per active day" head={["Date", "Sessions", "Prompts"]} rows={v.calendar.map((c) => [c.date, c.sessions, c.prompts])} />
    </>
  );
}

function Weekly() {
  const { v, f, drill } = useStore();
  const weeks = v.weeks.slice(-WEEKS);
  const priced = weeks.some((w) => w.cost > 0);
  if (weeks.length === 0) return <Empty />;
  const sel = f.from && f.to && f.to === addDays(f.from, 6) ? f.from : null;
  return (
    <>
      <Cols label="Weekly cost, stacked by source. Each column opens that week" cols={weeks.map((w) => ({
        key: w.week, label: w.week, active: sel === w.week,
        segs: priced ? SOURCES.map((s) => ({ v: w.bySource[s] ?? 0, color: srcColor(s) })) : [{ v: w.sessions, color: "var(--accent)" }],
        aria: `Week of ${fmtDate(w.week)}: ${priced ? fmtUSD(w.cost) : `${w.sessions} sessions`}. Open sessions`,
        onClick: () => drill({ from: w.week, to: addDays(w.week, 6) }),
      }))} />
      <div className="axis"><span>{fmtDate(weeks[0].week)}</span><span>{priced ? "USD per week" : "sessions per week (no priced sources)"}</span><span>{fmtDate(weeks[weeks.length - 1].week)}</span></div>
      {priced && <ul className="legend">{SOURCES.filter((s) => weeks.some((w) => (w.bySource[s] ?? 0) > 0)).map((s) => <li key={s} style={{ "--c": srcColor(s) } as React.CSSProperties}>{srcLabel(s)}</li>)}</ul>}
      <DataTable caption="Weekly cost by source" head={["Week", "USD", "Sessions"]} rows={weeks.map((w) => [w.week, +w.cost.toFixed(2), w.sessions])} />
    </>
  );
}

function HourWeek() {
  const { d } = useStore();
  const hw = d.hour_week;
  if (hw.length === 0) return <Empty />;
  const peak = Math.max(...hw.map((x) => x.prompts), 1);
  const at = new Map(hw.map((x) => [`${x.dow}.${x.hour}`, x.prompts]));
  return (
    <>
      <div className="hw" aria-hidden="true">
        {DOW.map((n, dow) => (
          <div key={n} style={{ display: "contents" }}>
            <span>{n}</span>
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="cell" style={{ "--v": (at.get(`${dow}.${h}`) ?? 0) / peak } as React.CSSProperties} title={`${n} ${h}:00, ${at.get(`${dow}.${h}`) ?? 0} prompts`} />)}
          </div>
        ))}
      </div>
      <div className="axis"><span>00:00</span><span>12:00</span><span>23:00</span></div>
      <DataTable caption="Prompts by weekday and hour" head={["Weekday", "Hour", "Prompts"]} rows={hw.filter((x) => x.prompts > 0).map((x) => [DOW[x.dow] ?? x.dow, x.hour, x.prompts])} />
    </>
  );
}

export function Time() {
  const { d, f, drill } = useStore();
  const m = d.engine.methods.time;
  const an = d.anomalies;
  const ttr = d.ttr.filter((t) => (!f.source || t.source === f.source) && (!f.intent || t.intent === f.intent));
  const byIntent = new Map<string, { n: number; w: number }>();
  for (const t of ttr) { const x = byIntent.get(t.intent) ?? { n: 0, w: 0 }; x.n += t.n; x.w += t.n * t.median_min; byIntent.set(t.intent, x); }
  const tr = [...byIntent].map(([k, x]) => ({ k, n: x.n, min: x.n ? x.w / x.n : 0 })).sort((a, b) => b.min - a.min);
  return (
    <div className="grid">
      <Panel title="Activity" meta="sessions per day, darker is busier" span={8}><Calendar /></Panel>
      <Panel title="Anomalies" meta={m ?? "rolling median/MAD"} span={4}>
        {an.length === 0 ? <Empty>No unusual days</Empty> : (
          <ul className="rows cap">
            {an.map((a) => (
              <li key={`${a.date}${a.metric}`} className="rowb">
                <button type="button" className="link" style={{ textAlign: "left", padding: 0 }} aria-label={`${fmtDate(a.date)} ${a.metric} spike, z ${capZ(a.z)}. Open sessions`} onClick={() => drill({ from: a.date, to: a.date })}>{fmtDate(a.date)} · {a.metric}</button>
                <span className="tag">z {capZ(a.z)}</span>
                <p>{a.metric === "cost" ? fmtUSD(a.value) : `${fmtInt(a.value)} prompts`}{a.z >= 10 ? ", far above your normal range" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Cost by week" meta="USD, priced sources only" span={7}><Weekly /></Panel>
      <Panel title="Time to resolution" meta="median minutes, weighted by n" span={5}>
        {tr.length === 0 ? <Empty /> : (
          <BarList label="Median minutes to resolution by intent" rows={tr.map((x) => ({
            key: x.k, label: x.k, value: x.min, color: "var(--accent)", active: f.intent === x.k, text: `${x.min.toFixed(1)} min`, sub: `n=${fmtInt(x.n)}`,
            aria: `${x.k}: ${x.min.toFixed(1)} minutes median, n=${x.n}. Open sessions`, onClick: () => drill({ intent: x.k as never }),
          }))} />
        )}
      </Panel>
      <Panel title="Hour of week" meta="prompts, all sources (not filtered)" span={12}><HourWeek /></Panel>
    </div>
  );
}
