import { useEffect, useRef, useState } from "react";
import { useStore } from "../state";
import { addDays } from "../lib/filter";
import { fmtDate, fmtInt } from "../lib/format";
import { INTENTS, SOURCES, srcLabel } from "../lib/palette";
import type { Cmp } from "../lib/compare";
import type { DashboardData } from "../data/types";
import { EnginePill } from "./Engine";
import { Segmented } from "./ui";

type Period = "30" | "90" | "all" | "custom";

export const NAV: { group: string; items: { id: string; text: string; go?: string }[] }[] = [
  { group: "Monitor", items: [{ id: "s-overview", text: "Overview" }, { id: "s-attention", text: "Needs attention" }] },
  { group: "Investigate", items: [{ id: "s-map", text: "Map" }, { id: "s-tools", text: "Tools" }, { id: "s-time", text: "Time" }, { id: "s-funnel", text: "Funnel" }, { id: "s-friction", text: "Friction" }] },
  { group: "Optimise", items: [{ id: "s-works", text: "What works" }, { id: "s-recs", text: "Recommendations" }] },
  { group: "Govern", items: [{ id: "s-exposure", text: "Exposure" }, { id: "s-sessions", text: "Sessions" }] },
];
const BAR = ["s-overview", "s-time", "s-funnel", "s-friction", "s-works", "s-exposure"];
const TEXT = new Map(NAV.flatMap((g) => g.items.map((i) => [i.id, i.text])));

export function Header({ d, onData }: { d: DashboardData; onData: (d: DashboardData) => void }) {
  const { f, set, v, cmp, setCmp, crumbs, clearAfter, clear, openList } = useStore();
  const ref = useRef<HTMLElement>(null);
  const [custom, setCustom] = useState(false);
  useEffect(() => {   // the sticky header's height drives scroll-margin-top for every section
    const el = ref.current; if (!el) return;
    const put = () => document.documentElement.style.setProperty("--hh", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const end = d.range.end;
  const period: Period = custom ? "custom" : f.from === undefined && f.to === undefined ? "all"
    : (f.to === undefined || f.to === end) && f.from === addDays(end, -29) ? "30" : (f.to === undefined || f.to === end) && f.from === addDays(end, -89) ? "90" : "custom";
  const pickPeriod = (p: Period) => {
    setCustom(p === "custom");
    if (p === "all") set({ from: undefined, to: undefined });
    else if (p !== "custom") set({ from: addDays(end, -(+p - 1)), to: undefined });
  };
  const projects = [...new Set(d.sessions.map((s) => s.project).filter(Boolean))].sort();
  const srcs = SOURCES.filter((s) => d.sessions.some((r) => r.source === s));
  const off = d.sessions.length === 0;
  const last = crumbs[crumbs.length - 1];
  return (
    <header className="top" ref={ref}>
      <div className="top-r1">
        <h1>Prompt Analytics</h1>
        <Segmented label="Period" value={period} onChange={pickPeriod} options={[{ id: "30", text: "30d" }, { id: "90", text: "90d" }, { id: "all", text: "All" }, { id: "custom", text: "Custom" }]} />
        <span className="grow" />
      </div>
      <form className="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label className="field"><span>Tool</span>
          <select value={f.source ?? ""} disabled={off} onChange={(e) => set({ source: (e.target.value || undefined) as never })}><option value="">All tools</option>{srcs.map((s) => <option key={s} value={s}>{srcLabel(s)}</option>)}</select></label>
        <label className="field"><span>Project</span>
          <select value={f.project ?? ""} disabled={off} onChange={(e) => set({ project: e.target.value || undefined })}><option value="">All projects</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="field"><span>Intent</span>
          <select value={f.intent ?? ""} disabled={off} onChange={(e) => set({ intent: (e.target.value || undefined) as never })}><option value="">All intents</option>{INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
        <label className="field"><span>Compare</span>
          <select value={cmp} disabled={off} onChange={(e) => setCmp(e.target.value as Cmp)}><option value="prev">Previous period</option><option value="yoy">Year ago</option><option value="off">Off</option></select></label>
        {period === "custom" && (
          <>
            <label className="field"><span>From</span><input type="date" value={f.from ?? ""} min={d.range.start} max={f.to ?? end} disabled={off} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
            <label className="field"><span>To</span><input type="date" value={f.to ?? ""} min={f.from ?? d.range.start} max={end} disabled={off} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
          </>
        )}
        {last && <span className="selchip"><span className="meta">Selected</span> <b>{last.label}</b> <button type="button" className="link" onClick={() => clear()}>Clear</button></span>}
      </form>
      <div className="top-r3">
        <nav className="crumbs" aria-label="Active selection">
          <button type="button" className="crumb" aria-current={crumbs.length === 0 || undefined} onClick={() => clearAfter(-1)}>All sessions</button>
          {crumbs.map((c, i) => <span key={c.id} className="crumb-w"><span aria-hidden="true">/</span><button type="button" className="crumb" aria-current={i === crumbs.length - 1 || undefined} aria-label={i === crumbs.length - 1 ? c.label : `Back to ${c.label}`} onClick={() => clearAfter(i)}>{c.label}</button></span>)}
        </nav>
        <span className="grow" />
        <span className="metaline">
          <span className="meta">Data as of {fmtDate(d.generated_at)}</span>
          <EnginePill d={d} onData={onData} />
          <button type="button" className="link" disabled={off} onClick={openList}>{fmtInt(v.rows.length)} sessions in view{v.rows.length !== d.sessions.length ? ` of ${fmtInt(d.sessions.length)}` : ""}</button>
        </span>
        {off && <span className="note">This export has no per-session rows, so filters are off. Re-run prompt-analytics export.</span>}
      </div>
    </header>
  );
}

export function Nav() {
  const { section, goto, href } = useStore();
  const [more, setMore] = useState(false);
  const link = (id: string, text: string, cls?: string) => (
    <a key={id} href={href(id === "s-attention" ? "s-overview" : id)} className={cls} aria-current={id === section ? "location" : undefined}
      onClick={(e) => { e.preventDefault(); setMore(false); goto(id); }}>{text}</a>
  );
  return (
    <>
      <nav className="side" aria-label="Sections">
        {NAV.map((g) => <div key={g.group} className="grp"><h2>{g.group}</h2>{g.items.map((i) => link(i.id, i.text))}</div>)}
      </nav>
      <nav className="bar" aria-label="Sections">
        {BAR.map((id) => link(id, TEXT.get(id) ?? id))}
        <button type="button" aria-expanded={more} aria-controls="more" onClick={() => setMore(!more)}>More</button>
        {more && <div id="more" className="morebox">{NAV.flatMap((g) => g.items).filter((i) => !BAR.includes(i.id)).map((i) => link(i.id, i.text))}</div>}
      </nav>
    </>
  );
}
