import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import "./investigate.css";
import { useStore } from "../state";
import { addDays, views, weekStart } from "../lib/filter";
import { bucketSeries, buckets, cumulative, median, METRICS, monthProjection } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { golden, GOLD_MIN_N } from "../lib/econ";
import { srcLabel } from "../lib/palette";
import { hasWebGL, useRoving } from "../lib/hooks";
import type { B3Cell } from "./Bars3D";
import { RELIEF, useTheme } from "../lib/theme";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";
import { LineChart } from "./charts";
import { CurveCard } from "./Curve";
import { tokensPerApplied } from "../lib/compare";
import { unpricedNote } from "../lib/capabilities";
import { ToolLogo } from "./Shell";
import type { SessionRow } from "../data/types";

export const toolName = (k: string) => <><ToolLogo source={k} size={18} />{srcLabel(k)}</>;

export interface DumbRow { k: string; label: ReactNode; a: number | null; b: number; fa: string; fb: string; bad?: boolean | null; name: string }
/** Median of the `now` values: Dumb's median rule. The `all` row is the total, not a member, so it is left out. */
export const dumbMedian = (rows: DumbRow[]) => median(rows.filter((r) => r.k !== "all").map((r) => r.b));
/** Dumbbell: grey dot = before, coloured dot = now. `a` null = no prior period, now only. bad: true red, false green, null neutral.
 *  `median` draws a thin rule at the median of the now values; `sort` orders rows by now, largest first, with the `all` row pinned first. */
export function Dumb({ rows, max, median: med = false, sort = false }: { rows: DumbRow[]; max: number; median?: boolean; sort?: boolean }) {
  const pm = med && rows.some((r) => r.k !== "all") ? (dumbMedian(rows) / max) * 100 : null;
  const cmp = rows.some((r) => r.a !== null);
  return (<>
    <div className="dbs">{pm !== null && <div className="dbm" aria-hidden="true"><span /><div><span style={{ left: `${pm}%` }}>median</span></div><span /></div>}
      {(sort ? [...rows].sort((x, y) => +(y.k === "all") - +(x.k === "all") || y.b - x.b) : rows).map((r) => {
      const tn = r.bad == null ? "" : r.bad ? "bad" : "good", pa = ((r.a ?? r.b) / max) * 100, pb = (r.b / max) * 100;
      return (
        <div key={r.k} className="db"><span>{r.label}</span>
          <div className="dbt" role="img" aria-label={r.a === null ? `${r.name}: ${r.fb}` : `${r.name}: ${r.fa} before, ${r.fb} now`}>
            {r.a !== null && <><i className={`seg ${tn}`} style={{ left: `${Math.min(pa, pb)}%`, width: `${Math.abs(pb - pa)}%` }} /><i className="p" style={{ left: `${pa}%` }} /></>}
            {pm !== null && <i className="md" style={{ left: `${pm}%` }} />}
            <i className={`c ${tn}${r.a !== null && !tn ? " n" : ""}`} style={{ left: `${pb}%` }} />
          </div>
          <b>{r.a === null ? r.fb : `${r.fa} \u2192 ${r.fb}`}</b>
        </div>
      );
    })}</div>
    {cmp && <p className="note">Grey = before, filled = now; red worse, green better, hollow = within noise.</p>}
  </>);
}

const ttrMed = (rows: SessionRow[]) => { const xs = rows.filter((r) => r.applied && r.ttr_min != null).map((r) => r.ttr_min as number); return xs.length ? { m: median(xs), n: xs.length } : null; };
/** Median minutes to the last applied edit, resolved sessions only, now against the previous period. Slower = red. */
function TimeToResolve() {
  const { v, prior, caps } = useStore();
  const rows = useMemo(() => {
    const keys = caps.multiTool ? v.sources.map((t) => t.key) : [];
    return [{ k: "all", label: "All resolved", name: "All resolved", sel: (_: SessionRow) => true }, ...keys.map((k) => ({ k, label: toolName(k), name: srcLabel(k), sel: (r: SessionRow) => r.source === k }))]
      .map((x) => ({ ...x, now: ttrMed(v.rows.filter(x.sel)), was: prior ? ttrMed(prior.v.rows.filter(x.sel)) : null })).filter((x) => x.now);
  }, [v, prior, caps.multiTool]);
  const max = Math.max(...rows.flatMap((x) => [x.now!.m, x.was?.m ?? 0]), 1) * 1.15;
  const fast = rows.filter((x) => x.k !== "all").reduce<(typeof rows)[number] | null>((a, b) => (!a || b.now!.m < a.now!.m ? b : a), null) ?? rows[0];
  const so = fast ? <>{fast.k === "all" ? "Resolved sessions take" : `${fast.name} resolves fastest:`} <b className={fast.was && fast.now!.m > fast.was.m * 1.05 ? "bad" : undefined}>{fast.now!.m.toFixed(1)}</b> min typical{fast.was ? `, was ${fast.was.m.toFixed(1)}` : ""}.</> : "Nothing flagged in this window.";
  return (
    <Card so={so} thin={!fast} src={`sessions.ttr_min \u00b7 n ${rows[0]?.now?.n ?? 0}${rows[0]?.was ? ` vs ${rows[0].was.n}` : ""}`} title="Time to resolve" meta="median minutes, resolved sessions only" span={5}>
      {rows.length === 0 ? <Empty>No resolved session with a time in view.</Empty> : (
        <Dumb median sort max={max} rows={rows.map((x) => ({ k: x.k, label: x.label, name: x.name, a: x.was?.m ?? null, b: x.now!.m, fa: x.was ? x.was.m.toFixed(1) : "", fb: x.now!.m.toFixed(1),
          bad: x.was && Math.abs(x.now!.m - x.was.m) > x.was.m * 0.05 ? x.now!.m > x.was.m : null }))} />
      )}
    </Card>
  );
}

const Bars3D = lazy(() => import("./Bars3D"));
type M = "sessions" | "prompts" | "cost";
const WEEKS = 27;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PARTS = [["Night", "0–5h", 0, 6], ["Morning", "6–11h", 6, 12], ["Afternoon", "12–17h", 12, 18], ["Evening", "18–23h", 18, 24]] as const;
/** false under 481px: 3D is off at phone width and both cards fall back to their 2D grids */
export function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => { const q = matchMedia("(max-width: 480px)"), f = () => setWide(!q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return wide;
}
const FMT: Record<M, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };

function CalGrid() {
  const { d, v, f, drill, apply, caps } = useStore();
  const pal = RELIEF[useTheme()];
  const [want, setM] = useState<M>("sessions");
  const m: M = want === "cost" && !caps.hasCost ? "sessions" : want;
  const [want3, setThree] = useState(false);
  const gl = useMemo(hasWebGL, []), wide3 = useWide();
  const three = want3 && gl && wide3;
  const [anchor, setAnchor] = useState<string | null>(null);
  const end = d.range.end;
  const first = addDays(weekStart(end), -(WEEKS - 1) * 7);
  // a date filter leaves only in-window days in v.calendar: draw the grid from every other filter, dim the days outside the window
  const dated = f.from !== undefined || f.to !== undefined;
  const wide = useMemo(() => (dated ? views(d, { ...f, from: undefined, to: undefined }).calendar : null), [d, f, dated]);
  const cal = wide ?? v.calendar;
  const byDay = useMemo(() => new Map(cal.map((c) => [c.date, c])), [cal]);
  const peak = Math.max(...cal.filter((c) => c.date >= first).map((c) => c[m]), 1e-9);
  const out = (dt: string) => dated && ((f.from !== undefined && dt < f.from) || (f.to !== undefined && dt > f.to));
  const { group, mark } = useRoving(WEEKS * 7, 7, 1, 0);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => ({ i, date: addDays(first, i) }));
  const inSel = (dt: string) => f.from !== undefined && f.to !== undefined && dt >= f.from && dt <= f.to;
  const pick = (dt: string, shift: boolean) => {
    if (shift && anchor) { const [a, b] = anchor < dt ? [anchor, dt] : [dt, anchor]; apply({ from: a, to: b }); } else { setAnchor(dt); drill({ from: dt, to: dt }); }
  };
  const busy = v.calendar.length ? v.calendar.reduce((a, b) => (b.sessions > a.sessions ? b : a)) : null;
  const months = days.filter((x) => x.i % 7 === 0 && x.date.slice(8, 10) <= "07");
  const monthAt = useMemo(() => new Map(months.map((x) => [x.i / 7, new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })])), [first]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 3D columns: with a date window, only its weeks plus 4 context weeks before it (9 columns at least), so the raised bars fill the floor
  const wk = (dt: string) => Math.min(WEEKS - 1, Math.max(0, Math.floor((Date.parse(dt) - Date.parse(first)) / 6048e5)));
  const w0 = wk(f.from ?? first), w1 = wk(f.to ?? end);
  const hi = dated ? Math.min(WEEKS - 1, Math.max(w1, 8)) : WEEKS - 1, lo = dated ? Math.max(0, Math.min(w0 - 4, hi - 8)) : 0, cols3 = hi - lo + 1;
  const monthLabel = useMemo(() => (c: number) => monthAt.get(c + lo) ?? "", [monthAt, lo]);
  const dowLabels = useMemo(() => DOW.map((x, i) => (i % 2 === 0 ? x : "")), []);
  const live3 = useMemo(() => days.filter((x) => x.date <= end && x.i >= lo * 7 && x.i < (hi + 1) * 7), [first, end, lo, hi]);   // eslint-disable-line react-hooks/exhaustive-deps
  const frame3 = useMemo(() => (dated && w1 >= w0 ? { c0: w0 - lo, c1: w1 - lo, label: `${fmtDate(f.from && f.from > first ? f.from : first)} to ${fmtDate(f.to && f.to < end ? f.to : end)}` } : undefined), [dated, w0, w1, lo, f.from, f.to, first, end]);
  const cells3 = useMemo(() => three ? live3.map((x): B3Cell => {
    const val = byDay.get(x.date)?.[m] ?? 0;
    return { c: Math.floor(x.i / 7) - lo, r: x.i % 7, v: val, mix: val / peak, off: out(x.date), sel: f.from !== undefined && f.from === f.to && x.date === f.from, tip: `${fmtDate(x.date)}: ${FMT[m](val)}${out(x.date) ? ", outside this view" : ""}` };
  }) : [], [three, live3, byDay, m, peak, f.from, f.to]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card so={busy && busy.sessions > 0 ? <>Busiest day was {fmtDate(busy.date)}: <b>{fmtInt(busy.sessions)}</b> sessions.</> : "Nothing flagged in this window."} thin={!busy || busy.sessions <= 0} src="calendar · sessions per day" title="Activity calendar" meta="click a day, shift-click to extend" span={6}
      actions={<><Segmented label="Calendar metric" value={m} onChange={setM} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, ...(caps.hasCost ? [{ id: "cost" as const, text: "Cost" }] : [])]} />
        {wide3 && <button type="button" className="btn tog3" aria-pressed={want3} onClick={() => setThree(!want3)} title="Raise each day into a column, height by value">3D</button>}</>}>
      {v.calendar.length === 0 ? <Empty /> : (
        <>
          {want3 && wide3 && !gl && <p className="meta">3D needs WebGL; showing 2D</p>}
          {three ? (
            <Suspense fallback={<div className="b3d" style={{ height: 300 }}><p className="meta">Loading 3D view</p></div>}>
              <Bars3D cells={cells3} cols={cols3} rows={7} colLabel={monthLabel} rowLabels={dowLabels} max={peak} zLabel={FMT[m]} hMin={260} hMax={360} ratio={cols3 <= 14 ? 2 : 2.5} frame={frame3} chips={dated ? [{ color: pal.off[1][1], text: "outside the window" }] : []}
                summary={`Daily ${m}, ${cols3 < WEEKS ? `${cols3} weeks around the selected dates` : `last ${WEEKS} weeks`}, bar height from zero.${busy && busy.sessions > 0 ? ` Busiest day ${fmtDate(busy.date)}, ${busy.sessions} sessions.` : ""}`}
                onPick={(i, shift) => pick(live3[i].date, shift)} />
            </Suspense>
          ) : (
          <div className="cal-stage">
          <div className="cal-wrap">
            <div className="cal-m" style={{ "--w": WEEKS } as React.CSSProperties}>{months.map((x) => <span key={x.date} style={{ gridColumn: x.i / 7 + 1 }}>{new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>)}</div>
            <div className="cal-d" aria-hidden="true">{DOW.map((x, i) => <span key={x}>{i % 2 === 0 ? x : ""}</span>)}</div>
            <div className="cal" role="group" aria-label={`Daily ${m}, last ${WEEKS} weeks. Each day filters to that date`} style={{ "--w": WEEKS } as React.CSSProperties} {...group}>
              {days.map((x) => {
                if (x.date > end) return <span key={x.i} className="cell none" aria-hidden="true" />;
                const c = byDay.get(x.date), val = c ? c[m] : 0;
                return (
                  <button key={x.i} type="button" className="cell" data-zero={!val || undefined} data-sel={inSel(x.date) || undefined} data-out={out(x.date) || undefined} aria-pressed={inSel(x.date)} style={{ "--v": val / peak, "--d": Math.floor(x.i / 7) + (x.i % 7), "--wk": Math.floor(x.i / 7) } as React.CSSProperties} data-w={Math.floor(x.i / 7)}
                    aria-label={`${fmtDate(x.date)}: ${FMT[m](val)} ${m}${out(x.date) ? ", outside this view" : ""}. Filter to this day`} title={`${fmtDate(x.date)}: ${FMT[m](val)}`}
                    onClick={(e) => pick(x.date, e.shiftKey)} {...mark(x.i)} />
                );
              })}
            </div>
          </div>
          </div>
          )}
          <DataTable caption={`Daily ${m}`} head={["Day", m]} rows={v.calendar.filter((c) => c.date >= first).map((c) => [c.date, +c[m].toFixed(2)])} />
        </>
      )}
    </Card>
  );
}

function Calendar() {
  const { d } = useStore();
  return d.range.end ? <CalGrid /> : <Card so="Nothing flagged in this window." thin src="calendar" title="Activity calendar" span={6}><Empty /></Card>;
}

function HourWeek() {
  const { d } = useStore();
  const theme = useTheme(), pal = RELIEF[theme];
  const grid = useMemo(() => { const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0)); for (const h of d.hour_week) g[h.dow][h.hour] = h.prompts; return g; }, [d.hour_week]);
  const gold = useMemo(() => golden(d.hour_week), [d.hour_week]);   // null on exports without hour_week[].applied (schema 1.0)
  const [mode, setMode] = useState<"prompts" | "success">("prompts");
  const [view, setView] = useState<"heatmap" | "terrain" | "daypart">("heatmap");   // one rhythm home: the same hour_week data as a grid, a 3D terrain, or four dayparts
  const wide = useWide(), gl = useMemo(hasWebGL, []);
  const three = view === "terrain" && wide && gl;
  const parts = useMemo(() => PARTS.map(([name, span, a, b]) => {
    const hs = d.hour_week.filter((h) => h.hour >= a && h.hour < b), has = hs.some((h) => h.sessions != null);
    const sessions = hs.reduce((x, h) => x + (h.sessions ?? 0), 0), applied = hs.reduce((x, h) => x + (h.applied ?? 0), 0);
    return { name, span, prompts: hs.reduce((x, h) => x + h.prompts, 0), sessions: has ? sessions : null, rate: has && sessions > 0 ? applied / sessions : null };
  }), [d.hour_week]);
  const allPrompts = parts.reduce((x, q) => x + q.prompts, 0);
  const succ = mode === "success" && gold !== null;
  const peak = Math.max(...grid.flat(), 1);
  const best = d.hour_week.reduce((a, b) => (b.prompts > a.prompts ? b : a), { dow: 0, hour: 0, prompts: 0 });
  const slot = (x: { dow: number; hour: number }) => `${DOW[x.dow]} ${x.hour}:00`;
  const rmax = useMemo(() => Math.max(...(gold?.rate.flat().map((x) => x ?? 0) ?? []), 0.01), [gold]);
  const hourTick = (h: number) => (h % 6 === 0 ? `${h}h` : "");   // no 23h: the last column sits under the height ticks at the front corner
  const terrain = (cells: B3Cell[], summary: string, max: number, zLabel: (v: number) => string, best = false) => (
    <Suspense fallback={<div className="b3d"><p className="meta">Loading 3D view</p></div>}>
      <Bars3D cells={cells} cols={24} rows={7} rowLabels={DOW} colLabel={hourTick} summary={summary} max={max} zLabel={zLabel} hMin={220} hMax={320} ratio={2} deep={1.4} chips={best ? [{ color: pal.mark, text: "best hours" }] : []} />
    </Suspense>
  );
  const so = best.prompts > 0 ? <>Most prompts land {DOW[best.dow]} {best.hour}:00: <b>{fmtInt(best.prompts)}</b>.</> : "Nothing flagged in this window.";
  return (
    <Card so={so} thin={best.prompts <= 0} src="hour_week · all sessions" id="s-golden" title={succ ? "Hours with the highest applied rate" : "Hour by weekday"} meta={<><span className="tag">all sessions</span> {succ ? "applied rate by hour" : "prompts per hour"}</>} span={6}
      actions={<>{gold && view !== "daypart" && <Segmented quiet label="Heatmap shows" value={mode} onChange={setMode} options={[{ id: "prompts", text: "Prompts" }, { id: "success", text: "Success" }]} />}
        <Segmented quiet label="Rhythm view" value={view} onChange={setView} options={[{ id: "heatmap", text: "Heatmap" }, { id: "terrain", text: "Terrain" }, { id: "daypart", text: "Daypart" }]} /></>}>
      {d.hour_week.length === 0 ? <Empty /> : view === "daypart" ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">Prompts, sessions and applied rate by part of the day, from the hour by weekday data</caption>
              <thead><tr><th scope="col">Part of day</th><th scope="col">Prompts</th><th scope="col">Share</th><th scope="col">Sessions</th><th scope="col">Applied</th></tr></thead>
              <tbody>{parts.map((q) => (
                <tr key={q.name}><th scope="row">{q.name} <small className="n">{q.span}</small></th><td>{fmtInt(q.prompts)}</td><td>{allPrompts ? fmtPct(q.prompts / allPrompts) : "–"}</td><td>{q.sessions === null ? "–" : fmtInt(q.sessions)}</td><td>{q.rate === null ? "–" : fmtPct(q.rate)}</td></tr>))}</tbody>
            </table>
          </div>
          <p className="note">Hours grouped into four parts of the day from the same data as the heatmap. Applied = share of sessions started in that part that applied a change. Ignores filters.</p>
        </>
      ) : succ ? (
        <>
          {view === "terrain" && !three && <p className="meta">The terrain needs WebGL and a wider screen; showing the heatmap</p>}
          {three ? terrain(gold.rate.flatMap((row, r) => row.map((x, h): B3Cell => {
            const n = gold.n[r][h], dv = gold.dev[r][h], up = dv !== null && dv >= 0, shade = gold.best.length > 0 && dv !== null;
            const t = `${slot({ dow: r, hour: h })}: ${x === null ? (n ? `not enough data, n=${n}` : "no sessions") : `${fmtPct(x)} applied, n=${n}`}`;
            return { c: h, r, v: x ?? 0, mix: shade ? Math.abs(dv as number) / Math.max(up ? gold.maxUp : gold.maxDown, 1e-9) : 0.3, tip: t, mark: gold.best.some((b) => b.dow === r && b.hour === h) };
          })), `Applied rate by hour and weekday, bar height from zero. ${theme === "atlas" ? "Brick-red" : "Amber"} bars are above the rest after the multiple-test correction.`, rmax, fmtPct, gold.best.length > 0) : (
          <div className="hw" role="img" aria-label={`Applied rate by hour and weekday. ${gold.best.length ? `Above the rest after adjusting for ${gold.tested} hours tested: ${gold.best.map((x) => `${slot(x)} ${fmtPct(x.rate)}`).join(", ")}` : `No hour is clearly above the rest (${fmtPct(gold.base)} overall)`}`}>
            {gold.rate.map((row, r) => <div key={r} style={{ display: "contents" }}><span className="hw-l">{DOW[r]}</span>{row.map((x, h) => {
              const n = gold.n[r][h], top = gold.best.some((b) => b.dow === r && b.hour === h);
              const dv = gold.dev[r][h], up = dv !== null && dv >= 0, shade = gold.best.length > 0 && dv !== null;   // nothing survives the multiple-test correction: neutral cells, no colour to over-read
              return <i key={h} className="cell" data-zero={!n || undefined} data-low={(n > 0 && x === null) || undefined} data-sel={top || undefined} data-dir={shade ? (up ? "up" : "down") : undefined} data-neutral={(!shade && n > 0 && x !== null) || undefined}
                style={{ "--v": shade ? Math.abs(dv as number) / Math.max(up ? gold.maxUp : gold.maxDown, 1e-9) : 0, "--d": r + h } as React.CSSProperties}
                title={`${slot({ dow: r, hour: h })}: ${x === null ? (n ? `not enough data, n=${n}` : "no sessions") : `${fmtPct(x)} applied, n=${n}, ${dv !== null && Math.round(dv * 100) !== 0 ? `${dv > 0 ? "+" : "-"}${Math.abs(Math.round(dv * 100))} pts vs other hours` : "same as other hours"}`}`} />;
            })}</div>)}
            <span /><span className="hw-x" style={{ gridColumn: "2 / -1" }}><b>0h</b><b>6h</b><b>12h</b><b>18h</b><b>23h</b></span>
          </div>)}
          {gold.best.length > 0
            ? <p className="ramp" aria-label={theme === "atlas" ? "Colour scale: sepia is below the rate of all other hours, ink blue is above" : "Colour scale: grey is below the rate of all other hours, blue is above"}><span className="meta">vs other hours</span><span>below</span><i className="div" aria-hidden="true" /><span>above</span></p>
            : <p className="ramp"><span className="meta">No hour clears the corrected bar, so every cell is neutral. Hatched = fewer than {GOLD_MIN_N} sessions.</span></p>}
          <p className="note">{gold.best.length ? <>Above all other hours even after adjusting for {gold.tested} hours tested (Bonferroni): {gold.best.map((x) => `${slot(x)} ${fmtPct(x.rate)} vs ${fmtPct(x.base)} for the rest (adjusted lower bound ${fmtPct(x.lb)}, n=${x.n})`).join("; ")}. Outlined on the grid.</> : <>No hour is clearly above the rest ({fmtPct(gold.base)} overall) once {gold.tested} hours tested are accounted for.</>} Applied rate is compared with all other hours; hatched = fewer than {GOLD_MIN_N} sessions. Descriptive: hour mix confounds with task mix. Ignores filters.</p>
          <DataTable caption="Applied rate by weekday and hour" head={["Weekday", ...Array.from({ length: 24 }, (_, h) => `${h}h`)]} rows={gold.rate.map((r, i) => [DOW[i], ...r.map((x) => (x === null ? "-" : fmtPct(x)))])} />
        </>
      ) : (
        <>
          {view === "terrain" && !three && <p className="meta">The terrain needs WebGL and a wider screen; showing the heatmap</p>}
          {three ? terrain(grid.flatMap((row, r) => row.map((p, h): B3Cell => ({ c: h, r, v: p, mix: p / peak, tip: `${DOW[r]} ${h}:00, ${fmtInt(p)} prompts` }))), `Prompts by hour and weekday, bar height from zero. Busiest: ${DOW[best.dow]} ${best.hour}:00, ${best.prompts} prompts.`, peak, fmtCompact) : (
          <div className="hw" role="img" aria-label={`Prompts by hour and weekday. Busiest: ${DOW[best.dow]} ${best.hour}:00, ${best.prompts} prompts`}>
            {grid.map((row, r) => <div key={r} style={{ display: "contents" }}><span className="hw-l">{DOW[r]}</span>{row.map((p, h) => <i key={h} className="cell" data-zero={!p || undefined} style={{ "--v": p / peak, "--d": r + h } as React.CSSProperties} title={`${DOW[r]} ${h}:00, ${p} prompts`} />)}</div>)}
            <span /><span className="hw-x" style={{ gridColumn: "2 / -1" }}><b>0h</b><b>6h</b><b>12h</b><b>18h</b><b>23h</b></span>
          </div>)}
          <p className="note">Busiest: {DOW[best.dow]} {best.hour}:00 ({fmtInt(best.prompts)} prompts). Hover only; ignores filters.{gold && " Switch to Success for golden hours."}</p>
          <DataTable caption="Prompts by weekday and hour" head={["Weekday", ...Array.from({ length: 24 }, (_, h) => `${h}h`)]} rows={grid.map((r, i) => [DOW[i], ...r])} />
        </>
      )}
    </Card>
  );
}

function Cumulative() {
  const { v, prior, win, apply, caps } = useStore();
  const bks = useMemo(() => buckets(win, 1), [win]);
  const cur = useMemo(() => cumulative(bucketSeries(v.rows, win, 1, METRICS.cost)), [v.rows, win]);
  const prv = useMemo(() => (prior ? cumulative(bucketSeries(prior.v.rows, prior.win, 1, METRICS.cost)) : null), [prior]);
  const proj = useMemo(() => monthProjection(v.rows, win.to), [v.rows, win.to]);
  const labels = bks.map((b) => fmtDate(b.from));
  const priced = cur.length > 0 && cur[cur.length - 1] > 0;
  const nowC = cur[cur.length - 1] ?? 0, prevAt = prv ? prv[cur.length - 1] ?? prv[prv.length - 1] : null;
  const dPct = prevAt ? Math.round(((nowC - prevAt) / prevAt) * 100) : null;
  const so = !priced ? "Nothing flagged in this window." : <><b>{fmtUSD(nowC)}</b> so far{dPct === null ? "." : dPct === 0 ? ", level with last period at this point." : <>, <span className={dPct > 0 ? "bad" : undefined}>{Math.abs(dPct)}% {dPct > 0 ? "above" : "below"}</span> last period at this point.</>}</>;
  return (
    <Card so={so} thin={!priced} src="cost_usd · priced only" title="Cumulative cost" meta="this period against the previous one" span={caps.hasTtrRows ? 7 : 12}>
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

/** Nothing priced in view: efficiency in tokens per applied change, weekly, instead of a cost river. */
function TokenEfficiency() {
  const { v, win, apply, caps } = useStore();
  const bks = useMemo(() => buckets(win, 7), [win]);
  const cur = useMemo(() => bucketSeries(v.rows, win, 7, (rs) => tokensPerApplied(rs) ?? 0), [v.rows, win]);
  const labels = bks.map((b) => fmtDate(b.from));
  const wk = cur.filter((x) => x > 0), tNow = wk[wk.length - 1], tFirst = wk[0];
  const tPct = wk.length > 1 ? Math.round(((tNow - tFirst) / tFirst) * 100) : null;
  const so = !wk.length ? "Nothing flagged in this window." : <>Each applied change costs <b>{fmtCompact(tNow)}</b> tokens{tPct === null ? "." : <>, <span className={tPct > 0 ? "bad" : undefined}>{Math.abs(tPct)}% {tPct >= 0 ? "more" : "less"}</span> than the first week.</>}</>;
  return (
    <Card so={so} thin={!wk.length} src="tokens ÷ applied" id="s-tokens" title="Tokens per applied change, weekly" meta={`${unpricedNote(caps) || "No prices recorded."} Tokens stand in for cost.`} span={caps.hasTtrRows ? 7 : 12}>
      {cur.every((x) => x === 0) ? <Empty>No session applied a change in this period.</Empty> : (
        <>
          <LineChart label="Tokens per applied change by week. Click a week to filter it" labels={labels} fmt={fmtCompact} height={180}
            lines={[{ name: "Tokens per applied change", color: "var(--accent)", values: cur }]} onPick={(i) => apply({ from: bks[i].from, to: bks[i].to })} />
          <p className="note">Weeks with no applied change read 0. Lower is better.</p>
          <DataTable caption="Tokens per applied change by week" head={["Week of", "Tokens per applied change"]} rows={bks.map((_, i) => [labels[i], Math.round(cur[i])])} />
        </>
      )}
    </Card>
  );
}

export function Time() {
  const { caps } = useStore();
  return (
    <Section id="s-time" title="Time" q={caps.hasCost ? "When and how much?" : "When does the work happen?"}>
      <Calendar /><HourWeek /><CurveCard id="time.daypart" />{caps.hasCost ? <Cumulative /> : <TokenEfficiency />}{caps.hasTtrRows && <TimeToResolve />}
    </Section>
  );
}
