import { useEffect, useRef, useState } from "react";
import { useStore } from "../state";
import { addDays } from "../lib/filter";
import { fmtDate, fmtInt, fmtRange } from "../lib/format";
import { INTENTS, SOURCES, srcLabel } from "../lib/palette";
import type { Cmp } from "../lib/compare";
import type { DashboardData } from "../data/types";
import { EnginePill } from "./Engine";
import { Segmented } from "./ui";
import { openPalette } from "./Palette";

type Period = "30" | "90" | "all" | "custom";

export const NAV: { group: string; items: { id: string; text: string; go?: string }[] }[] = [
  { group: "Monitor", items: [{ id: "s-overview", text: "Overview" }, { id: "s-attention", text: "Needs attention" }] },
  { group: "Investigate", items: [{ id: "s-tools", text: "Tools" }, { id: "s-time", text: "Time" }, { id: "s-funnel", text: "Funnel" }, { id: "s-friction", text: "Friction" }] },
  { group: "Optimise", items: [{ id: "s-works", text: "What works" }, { id: "s-recs", text: "Recommendations" }] },
  { group: "Govern", items: [{ id: "s-exposure", text: "Exposure" }, { id: "s-sessions", text: "Sessions" }] },
  { group: "Explore", items: [{ id: "s-map", text: "Mind map" }] },
];
/** Mobile bottom bar: five sections plus More, short labels so nothing truncates at 320px. */
const BAR: [string, string][] = [["s-overview", "Home"], ["s-time", "Time"], ["s-friction", "Friction"], ["s-works", "Works"], ["s-exposure", "Risk"]];
const BAR_IDS = BAR.map(([id]) => id);

/** Nav groups holding only the sections this data can show; empty groups drop out. */
export const navFor = (secs: Set<string>, multiTool = true) => NAV.map((g) => ({
  ...g, items: g.items.filter((i) => secs.has(i.id)).map((i) => (i.id === "s-tools" && !multiTool ? { ...i, text: "Projects" } : i)),
})).filter((g) => g.items.length);
const textOf = (id: string) => NAV.flatMap((g) => g.items).find((i) => i.id === id)?.text ?? id;

/** Brand mark: a filled blue tile, a white orbit and node, one amber dot (the only warm accent in the chrome). */
const Glyph = () => (
  <svg className="glyph" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <ellipse className="g-orb" pathLength={1} cx="16" cy="16" rx="10.5" ry="4.2" transform="rotate(-24 16 16)" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
    <circle cx="16" cy="16" r="4.2" fill="#fff" />
    <circle className="g-dot" cx="23.6" cy="11.2" r="2.7" fill="var(--amber)" />
  </svg>
);

export function Header({ d, onData }: { d: DashboardData; onData: (d: DashboardData) => void }) {
  const { f, set, v, win, cmp, setCmp, crumbs, clearAfter, clear, openList, caps } = useStore();
  const ref = useRef<HTMLElement>(null);
  const [custom, setCustom] = useState(false);
  const [compact, setCompact] = useState(false);
  const [fopen, setFopen] = useState(false);
  const [slot, setSlot] = useState(0);
  useEffect(() => {   // compact on scroll with hysteresis, so the height change cannot flip the state back
    const on = () => { const y = window.scrollY; setCompact((c) => (c ? y > 16 : y > 72)); };
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {   // --hh drives sticky offsets and scroll-margin; the slot keeps the expanded height so nothing jumps when compacting
    const el = ref.current; if (!el) return;
    const put = () => { const h = Math.ceil(el.getBoundingClientRect().height); document.documentElement.style.setProperty("--hh", `${h}px`); if (!el.dataset.compact) setSlot(h); };
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!fopen) return; const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setFopen(false); } }; window.addEventListener("keydown", on, true); return () => window.removeEventListener("keydown", on, true); }, [fopen]);
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
  const scoped = (["source", "project", "intent"] as const).filter((k) => f[k] !== undefined).length;
  return (
    <div className="top-slot" style={{ "--slot": slot ? `${slot}px` : "auto" } as React.CSSProperties}>
      <header className="top" ref={ref} data-compact={compact || undefined} data-fopen={fopen || undefined}>
        <div className="top-r1">
          <div className="brand">
            <Glyph />
            <div className="brand-t">
              <h1>Prompt Analytics</h1>
              <div className="sub-row">
                {!caps.empty && <p className="sub">{fmtRange(win.from, win.to)}<span aria-hidden="true"> · </span><span className="asof">data as of {fmtDate(d.generated_at)}</span></p>}
                {!caps.empty && <EnginePill d={d} onData={onData} />}
              </div>
            </div>
          </div>
          <span className="grow" />
          <button type="button" className="link count" disabled={off} onClick={openList} aria-label={`${fmtInt(v.rows.length)} sessions in view${v.rows.length !== d.sessions.length ? ` of ${fmtInt(d.sessions.length)}` : ""}. Open the list`}>
            {fmtInt(v.rows.length)}{v.rows.length !== d.sessions.length ? ` of ${fmtInt(d.sessions.length)}` : ""} sessions
          </button>
          <div className="top-tools">
          <Segmented label="Period" value={period} onChange={pickPeriod} options={[{ id: "30", text: "30d" }, { id: "90", text: "90d" }, { id: "all", text: "All" }, { id: "custom", text: "Custom" }]} />
          <button type="button" className="btn fbtn" aria-expanded={fopen} aria-controls="hdr-filters" onClick={() => setFopen(!fopen)}>Filters{scoped > 0 && <b className="badge">{scoped}</b>}</button>
          <button type="button" className="btn kbd" aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" onClick={openPalette}>{/Mac|iP/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</button>
          </div>
        </div>
        <form className="filters" id="hdr-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
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
        </form>
        <div className="top-r3">
          <nav className="crumbs" aria-label="Active filters">
            {crumbs.map((c, i) => (
              <button key={c.id} type="button" className="crumb fchip" aria-label={`Remove filter: ${c.label}`} onClick={() => (c.keys === "sel" ? clearAfter(i - 1) : clear(c.keys))}>
                <span className="fchip-t">{c.label}</span><span aria-hidden="true" className="x">&times;</span>
              </button>
            ))}
            {crumbs.length > 1 && <button type="button" className="link" onClick={() => clear()}>Clear all</button>}
          </nav>
          <span className="grow" />
          {off && !caps.empty && <span className="note">This export has no per-session rows, so filters are off. Re-run prompt-analytics export.</span>}
        </div>
      </header>
    </div>
  );
}

/** True when the active section is only reachable from the mobile "More" menu (so More carries the active state). */
export const underMore = (section: string) => !BAR_IDS.includes(section);

export function Nav() {
  const { section, goto, href, secs, f, capsAll } = useStore();
  const groups = navFor(secs, capsAll.multiTool);
  const bar = BAR.filter(([id]) => secs.has(id));
  const rest = groups.flatMap((g) => g.items).filter((i) => !BAR_IDS.includes(i.id));
  const scoped = (["source", "project", "intent"] as const).filter((k) => f[k] !== undefined).length;
  const here = underMore(section);
  const [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {   // open menu: focus its first item; Esc, an outside click or a scroll closes it
    if (!more) return;
    box.current?.querySelector<HTMLElement>("a")?.focus();
    const close = (refocus: boolean) => { setMore(false); if (refocus) btn.current?.focus(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(true); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close(false); };
    const scroll = () => close(false);
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down); window.addEventListener("scroll", scroll, { passive: true });
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); window.removeEventListener("scroll", scroll); };
  }, [more]);
  const link = (id: string, text: string, cls?: string) => (
    <a key={id} href={href(id)} className={cls} aria-current={id === section ? "location" : undefined}
      onClick={(e) => { e.preventDefault(); setMore(false); goto(id); }}>{text}</a>
  );
  return (
    <>
      <nav className="side" aria-label="Sections">
        {groups.map((g) => <div key={g.group} className="grp"><h2>{g.group}</h2>{g.items.map((i) => link(i.id, i.text))}</div>)}
      </nav>
      <nav className="bar" aria-label="Sections">
        {bar.map(([id, text]) => link(id, text))}
        {rest.length > 0 && <button ref={btn} type="button" aria-expanded={more} aria-controls={more ? "more" : undefined} data-here={here || undefined}
          aria-label={`More${here ? `, current: ${textOf(section)}` : ""}${scoped ? `, ${scoped} filter${scoped === 1 ? "" : "s"} on` : ""}`} onClick={() => setMore(!more)}>
          <span>More{scoped > 0 && <b className="badge" aria-hidden="true">{scoped}</b>}</span></button>}
        {more && <div id="more" ref={box} className="morebox">{rest.map((i) => link(i.id, i.text))}</div>}
      </nav>
    </>
  );
}
