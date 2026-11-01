import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStore } from "../state";
import { addDays, weekStart } from "../lib/filter";
import { bucketSeries, buckets, cumulative, METRICS, monthProjection } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { golden, GOLD_MIN_N } from "../lib/econ";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { billboard, clampPitch, fitScale, DEFAULT_VIEW, describeView, edgeFade, inertia, nearestYaw, viewTransform, wrapYaw, zoomAround } from "../lib/calorbit";
import type { TCell } from "./Terrain";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";
import { LineChart, Ramp, River } from "./charts";
import { tokensPerApplied } from "../lib/compare";
import { unpricedNote } from "../lib/capabilities";

const Terrain = lazy(() => import("./Terrain"));
type M = "sessions" | "prompts" | "cost";
const WEEKS = 27;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FMT: Record<M, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };

/**
 * Free orbit for the 3D calendar: drag = yaw (360) + pitch (10-80), ctrl/cmd+wheel or pinch = zoom around the pointer,
 * inertia on release, keyboard on the focused stage. One rAF writes the transform; no React state per frame.
 * Touch: until the stage is tapped (data-active), one finger only yaws on horizontal drags and touch-action pan-y keeps
 * vertical swipes scrolling the page; once active, touch-action is none, one finger orbits and two fingers pinch + tilt.
 */
function useCalOrbit(stage: RefObject<HTMLDivElement | null>, wrap: RefObject<HTMLDivElement | null>, live: RefObject<HTMLParagraphElement | null>, on: boolean) {
  const reset = useRef(() => {});
  useEffect(() => {
    const st = stage.current, w = wrap.current;
    if (!on || !st || !w) return;
    const [days, months] = [st.querySelector<HTMLElement>(".cal-d"), st.querySelector<HTMLElement>(".cal-m")];
    const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const v = { ...DEFAULT_VIEW };
    let vel = { yaw: 0, pitch: 0 }, raf = 0, last = 0, active = false, drag = false, moved = 0, lastMove = 0, suppress = false, wheelT = 0;
    const pts = new Map<number, { x: number; y: number }>();
    const flag = (k: string, b: boolean) => (b ? st.setAttribute(k, "") : st.removeAttribute(k));
    let fit = 0;
    const write = () => {
      // fit to the stage box (layout sizes are untransformed, so reading them does not depend on the current view)
      fit = fitScale(v.yaw, v.pitch, w.offsetWidth, w.offsetHeight, st.clientWidth * 0.84, st.clientHeight * 0.8);
      w.style.transform = viewTransform(v, fit);
      const bb = billboard(v, fit);
      days?.style.setProperty("--bb", bb); days?.style.setProperty("--fa", edgeFade(v.yaw, v.pitch, 180).toFixed(2));
      months?.style.setProperty("--bb", bb); months?.style.setProperty("--fa", edgeFade(v.yaw, v.pitch, 270).toFixed(2));
    };
    const frame = (t: number) => {
      raf = 0;
      if (vel.yaw || vel.pitch) {
        const dt = Math.min(64, Math.max(0, t - last)); last = t;
        v.yaw = wrapYaw(v.yaw + vel.yaw * dt); v.pitch = clampPitch(v.pitch + vel.pitch * dt);
        vel = { yaw: inertia(vel.yaw, dt), pitch: inertia(vel.pitch, dt) };
        if (vel.yaw || vel.pitch) kick(); else flag("data-live", false);
      }
      write();
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const say = (s: string) => { if (live.current) live.current.textContent = s; };
    // CSS transitions (900ms, motion-safe only) animate key steps and the reset; data-live turns them off for direct manipulation
    const step = (f: () => void) => { vel = { yaw: 0, pitch: 0 }; flag("data-live", false); f(); kick(); say(describeView(v)); };
    reset.current = () => step(() => Object.assign(v, DEFAULT_VIEW, { yaw: nearestYaw(v.yaw, DEFAULT_VIEW.yaw) }));
    const activate = (b: boolean) => { active = b; flag("data-active", b); st.dispatchEvent(new CustomEvent("cal-active", { detail: b })); };
    /** Pointer position relative to the wrap's transform origin (50% 40%), in px. */
    const rel = (x: number, y: number) => {
      const r = st.getBoundingClientRect();
      return { x: x - (r.left + st.clientLeft + w.offsetLeft + w.offsetWidth * 0.5), y: y - (r.top + st.clientTop + w.offsetTop + w.offsetHeight * 0.4) };
    };
    const down = (e: PointerEvent) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || (e.target as Element).closest?.(".cal-ctl")) return;
      suppress = false; if (e.pointerType !== "touch") activate(true);   // touch turns on only through the visible Tap to rotate toggle
      
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      vel = { yaw: 0, pitch: 0 }; moved = 0; lastMove = e.timeStamp;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (!drag && moved > 5) { drag = true; try { st.setPointerCapture(e.pointerId); } catch { /* synthetic or gone pointer */ } flag("data-live", true); }
        if (drag) {
          const dyaw = dx * 0.45, dp = e.pointerType === "touch" && !active ? 0 : -dy * 0.3, dt = Math.max(8, e.timeStamp - lastMove);
          v.yaw = wrapYaw(v.yaw + dyaw); v.pitch = clampPitch(v.pitch + dp);
          vel = { yaw: 0.7 * (dyaw / dt) + 0.3 * vel.yaw, pitch: 0.7 * (dp / dt) + 0.3 * vel.pitch };
          lastMove = e.timeStamp; kick();
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.entries()].map(([id, q]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : q));
        const [a0, b0] = [...pts.values()];
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
        const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (d0 > 0) Object.assign(v, zoomAround(m, v, v.zoom * (d1 / d0)));
        v.pitch = clampPitch(v.pitch - dy * 0.15);
        drag = true; flag("data-live", true); vel = { yaw: 0, pitch: 0 }; kick();
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId) || pts.size) return;
      suppress = drag; drag = false;
      const coast = e.type === "pointerup" && !reduce() && e.timeStamp - lastMove < 90 && (vel.yaw || vel.pitch);
      if (coast) { last = performance.now(); kick(); } else { vel = { yaw: 0, pitch: 0 }; flag("data-live", false); }
    };
    // a drag that started on a day must not also filter to it
    const click = (e: MouseEvent) => { if (suppress) { suppress = false; e.stopPropagation(); e.preventDefault(); } };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || active)) return;   // plain scroll keeps scrolling the page
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015));
      Object.assign(v, zoomAround(rel(e.clientX, e.clientY), v, v.zoom * k));
      flag("data-live", true); clearTimeout(wheelT); wheelT = window.setTimeout(() => { if (!pts.size && !vel.yaw && !vel.pitch) flag("data-live", false); }, 160);
      kick();
    };
    const key = (e: KeyboardEvent) => {
      const self = e.target === st, k = e.key;
      if (k === "Escape" && active) { activate(false); return; }
      if (self && k.startsWith("Arrow")) {
        e.preventDefault();
        step(() => { if (k === "ArrowLeft") v.yaw -= 15; else if (k === "ArrowRight") v.yaw += 15; else v.pitch = clampPitch(v.pitch + (k === "ArrowUp" ? -5 : 5)); });
      } else if (k === "+" || k === "=" || k === "-" || k === "_") {
        e.preventDefault(); step(() => Object.assign(v, zoomAround({ x: 0, y: 0 }, v, v.zoom * (k === "+" || k === "=" ? 1.25 : 0.8))));
      } else if (k === "0") { e.preventDefault(); reset.current(); }
    };
    const dbl = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".cell, .cal-ctl")) reset.current(); };   // a day keeps its own click (drill toggles)
    const toggle = () => activate(!active);
    const outside = (e: PointerEvent) => { if (!st.contains(e.target as Node)) activate(false); };
    const blur = (e: FocusEvent) => { if (!st.contains(e.relatedTarget as Node | null) && e.relatedTarget) activate(false); };
    const opts = { passive: false } as const;
    st.addEventListener("pointerdown", down); st.addEventListener("pointermove", move); st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    st.addEventListener("click", click, true); st.addEventListener("wheel", wheel, opts); st.addEventListener("keydown", key); st.addEventListener("dblclick", dbl); st.addEventListener("focusout", blur); st.addEventListener("cal-toggle", toggle);
    document.addEventListener("pointerdown", outside);
    write();
    return () => {
      cancelAnimationFrame(raf); clearTimeout(wheelT);
      st.removeEventListener("pointerdown", down); st.removeEventListener("pointermove", move); st.removeEventListener("pointerup", up); st.removeEventListener("pointercancel", up);
      st.removeEventListener("click", click, true); st.removeEventListener("wheel", wheel); st.removeEventListener("keydown", key); st.removeEventListener("dblclick", dbl); st.removeEventListener("focusout", blur); st.removeEventListener("cal-toggle", toggle);
      document.removeEventListener("pointerdown", outside);
      w.style.transform = ""; for (const el of [days, months]) { el?.style.removeProperty("--bb"); el?.style.removeProperty("--fa"); }
      flag("data-live", false); flag("data-active", false); reset.current = () => {};
    };
  }, [on, stage, wrap, live]);
  return reset;
}

function CalGrid() {
  const { d, v, f, drill, apply, caps } = useStore();
  const [want, setM] = useState<M>("sessions");
  const m: M = want === "cost" && !caps.hasCost ? "sessions" : want;
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
  const wrap = useRef<HTMLDivElement | null>(null), live = useRef<HTMLParagraphElement | null>(null);
  const reset = useCalOrbit(stage, wrap, live, three);
  const [act, setAct] = useState(false);
  useEffect(() => { const st = stage.current; if (!st) return; const on = (e: Event) => setAct((e as CustomEvent<boolean>).detail); st.addEventListener("cal-active", on); return () => { st.removeEventListener("cal-active", on); setAct(false); }; }, [three]);
  const months = days.filter((x) => x.i % 7 === 0 && x.date.slice(8, 10) <= "07");
  return (
    <Card title="Activity calendar" meta="click a day, shift-click to extend" span={8}
      actions={<><Segmented label="Calendar metric" value={m} onChange={setM} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, ...(caps.hasCost ? [{ id: "cost" as const, text: "Cost" }] : [])]} />
        <button type="button" className="btn tog3" aria-pressed={three} onClick={() => setThree(!three)} title="Raise each day into a column, height by value">3D</button></>}>
      {v.calendar.length === 0 ? <Empty /> : (
        <>
          <div className="cal-stage" ref={stage} data-3d={three || undefined} onPointerOver={lift} onPointerLeave={unlift} onFocus={lift} onBlur={unlift}
            {...(three ? { tabIndex: 0, role: "group", "aria-label": "3D calendar view. Drag or arrow keys to orbit, plus and minus to zoom, 0 or double-click to reset" } : {})}>
          {three && <>
            <div className="cal-ctl"><button type="button" className="btn cal-touch" aria-pressed={act} onClick={() => stage.current?.dispatchEvent(new Event("cal-toggle"))}>{act ? "Done" : "Tap to rotate"}</button><button type="button" className="btn" onClick={() => reset.current()}>Reset view</button></div>
            <span className="cal-hint" aria-hidden="true"><span className="cal-hint-f">⌘/Ctrl + scroll to zoom · drag to orbit</span><span className="cal-hint-t">Tap to rotate, then drag; pinch to zoom</span></span>
          </>}
          <p className="sr-only" aria-live="polite" ref={live} />
          <div className="cal-wrap" ref={wrap}>
            <div className="cal-m" style={{ "--w": WEEKS } as React.CSSProperties}>{months.map((x) => <span key={x.date} style={{ gridColumn: x.i / 7 + 1 }}>{new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>)}</div>
            <div className="cal-d" aria-hidden="true">{DOW.map((x, i) => <span key={x}>{i % 2 === 0 ? x : ""}</span>)}</div>
            <div className="cal" role="group" aria-label={`Daily ${m}, last ${WEEKS} weeks. Each day filters to that date`} style={{ "--w": WEEKS } as React.CSSProperties} {...group}>
              {days.map((x) => {
                if (x.date > end) return <span key={x.i} className="cell none" aria-hidden="true" />;
                const c = byDay.get(x.date), val = c ? c[m] : 0;
                return (
                  <button key={x.i} type="button" className="cell" data-zero={!val || undefined} data-sel={inSel(x.date) || undefined} aria-pressed={inSel(x.date)} style={{ "--v": val / peak, "--d": Math.floor(x.i / 7) + (x.i % 7), "--wk": Math.floor(x.i / 7) } as React.CSSProperties} data-w={Math.floor(x.i / 7)}
                    aria-label={`${fmtDate(x.date)}: ${FMT[m](val)} ${m}. Filter to this day`} title={`${fmtDate(x.date)}: ${FMT[m](val)}`}
                    onClick={(e) => pick(x.date, e.shiftKey)} {...mark(x.i)}>{three && val > 0 && <i aria-hidden="true" />}</button>
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
  const gold = useMemo(() => golden(d.hour_week), [d.hour_week]);   // null on exports without hour_week[].applied (schema 1.0)
  const [mode, setMode] = useState<"prompts" | "success">("prompts");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [wide, setWide] = useState(true);   // 3D is off at phone width: falls back to the 2D grid
  useEffect(() => { const q = matchMedia("(min-width: 481px)"), f = () => setWide(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  const three = view === "3d" && wide;
  const succ = mode === "success" && gold !== null;
  const peak = Math.max(...grid.flat(), 1);
  const best = d.hour_week.reduce((a, b) => (b.prompts > a.prompts ? b : a), { dow: 0, hour: 0, prompts: 0 });
  const slot = (x: { dow: number; hour: number }) => `${DOW[x.dow]} ${x.hour}:00`;
  const rmax = useMemo(() => Math.max(...(gold?.rate.flat().map((x) => x ?? 0) ?? []), 0.01), [gold]);
  const hours = (h: number) => `${h}h`;
  const terrain = (cells: TCell[], max: number, maxText: string, summary: string) => (
    <Suspense fallback={<div className="ter"><p className="meta">Loading 3D view</p></div>}>
      <Terrain cells={cells} max={max} maxText={maxText} rows={DOW} cols={24} colLabel={hours} summary={summary} />
    </Suspense>
  );
  return (
    <Card id="s-golden" title={succ ? "Hours with the highest applied rate" : "Hour by weekday"} meta={<><span className="tag">all sessions</span> {succ ? "applied rate by hour" : "prompts per hour"}</>} span={4}
      actions={<>{gold && <Segmented quiet label="Heatmap shows" value={mode} onChange={setMode} options={[{ id: "prompts", text: "Prompts" }, { id: "success", text: "Success" }]} />}
        <span className="tog3d"><Segmented quiet label="Heatmap view" value={view} onChange={setView} options={[{ id: "2d", text: "2D" }, { id: "3d", text: "3D" }]} /></span></>}>
      {d.hour_week.length === 0 ? <Empty /> : succ ? (
        <>
          {three ? terrain(gold.rate.flatMap((row, r) => row.map((x, h): TCell => {
            const n = gold.n[r][h], dv = gold.dev[r][h], up = dv !== null && dv >= 0, shade = gold.best.length > 0 && dv !== null;
            const t = `${slot({ dow: r, hour: h })}: ${x === null ? (n ? `not enough data, n=${n}` : "no sessions") : `${fmtPct(x)} applied, n=${n}`}`;
            return { v: x ?? 0, tone: x === null ? "none" : shade ? (up ? "accent" : "muted") : "accent", mix: shade ? Math.abs(dv as number) / Math.max(up ? gold.maxUp : gold.maxDown, 1e-9) : 0.3, tip: t, mark: gold.best.some((b) => b.dow === r && b.hour === h) };
          })), rmax, fmtPct(rmax), `Applied rate by hour and weekday, bar height from zero. Outlined bars are above the rest after the multiple-test correction.`) : (
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
            ? <p className="ramp" aria-label="Colour scale: grey is below the rate of all other hours, blue is above"><span className="meta">vs other hours</span><span>below</span><i className="div" aria-hidden="true" /><span>above</span></p>
            : <p className="ramp"><span className="meta">No hour clears the corrected bar, so every cell is neutral. Hatched = fewer than {GOLD_MIN_N} sessions.</span></p>}
          <p className="note">{gold.best.length ? <>Above all other hours even after adjusting for {gold.tested} hours tested (Bonferroni): {gold.best.map((x) => `${slot(x)} ${fmtPct(x.rate)} vs ${fmtPct(x.base)} for the rest (adjusted lower bound ${fmtPct(x.lb)}, n=${x.n})`).join("; ")}. Outlined on the grid.</> : <>No hour is clearly above the rest ({fmtPct(gold.base)} overall) once {gold.tested} hours tested are accounted for.</>} Applied rate is compared with all other hours; hatched = fewer than {GOLD_MIN_N} sessions. Descriptive: hour mix confounds with task mix. Ignores filters.</p>
          <DataTable caption="Applied rate by weekday and hour" head={["Weekday", ...Array.from({ length: 24 }, (_, h) => `${h}h`)]} rows={gold.rate.map((r, i) => [DOW[i], ...r.map((x) => (x === null ? "-" : fmtPct(x)))])} />
        </>
      ) : (
        <>
          {three ? terrain(grid.flatMap((row, r) => row.map((p, h): TCell => ({ v: p, tone: p ? "accent" : "none", mix: p / peak, tip: `${DOW[r]} ${h}:00, ${fmtInt(p)} prompts` }))), peak, fmtCompact(peak), `Prompts by hour and weekday, bar height from zero. Busiest: ${DOW[best.dow]} ${best.hour}:00, ${best.prompts} prompts.`) : (
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

function Spend() {
  const { v, f, drill, caps } = useStore();
  const unpriced = SOURCES.filter((s) => v.sources.some((t) => t.key === s && t.cost === null));
  const weeks = v.weeks;
  return (
    <Card title={caps.multiTool ? "Cost by tool, weekly" : "Cost, weekly"} meta={caps.multiTool ? "priced tools only" : `your ${caps.names} sessions`} span={7}>
      <River weeks={weeks} sel={f.source} label="Weekly cost by tool. Click a band to filter a tool, a column to filter a week" fmt={fmtUSD} height={200}
        onBand={(s) => drill({ source: s as never })} onWeek={(i) => drill({ from: weeks[i].week, to: addDays(weeks[i].week, 6) })} activeWeek={(i) => f.from === weeks[i].week} />
      {caps.multiTool && <ul className="legend">
        {SOURCES.filter((s) => weeks.some((w) => (w.bySource[s] ?? 0) > 0)).map((s) => <li key={s} style={{ "--c": srcColor(s) } as React.CSSProperties}>{srcLabel(s)}</li>)}
        {unpriced.length > 0 && <li className="hatch">{unpriced.map(srcLabel).join(", ")}: not priced</li>}
      </ul>}
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

/** Nothing priced in view: efficiency in tokens per applied change, weekly, instead of a cost river. */
function TokenEfficiency() {
  const { v, win, apply, caps } = useStore();
  const bks = useMemo(() => buckets(win, 7), [win]);
  const cur = useMemo(() => bucketSeries(v.rows, win, 7, (rs) => tokensPerApplied(rs) ?? 0), [v.rows, win]);
  const labels = bks.map((b) => fmtDate(b.from));
  return (
    <Card id="s-tokens" title="Tokens per applied change, weekly" meta={`${unpricedNote(caps) || "No prices recorded."} Tokens stand in for cost.`} span={12}>
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
      <Calendar /><HourWeek />{caps.hasCost ? <><Spend /><Cumulative /></> : <TokenEfficiency />}
    </Section>
  );
}
