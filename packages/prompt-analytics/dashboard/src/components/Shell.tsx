import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useStore, TABS } from "../state";
import { chips, type FilterKey } from "../lib/filter";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import type { Intent, SessionRow } from "../data/types";
import { Segmented } from "./ui";

const INTENTS: Intent[] = ["bugfix", "feature", "refactor", "explain", "test", "docs", "devops", "data", "other"];

export function FilterBar() {
  const { d, f, set, clear, clusterLabel, setOpen, v, open } = useStore();
  const projects = [...new Set(d.sessions.map((s) => s.project).filter(Boolean))].sort();
  const srcs = SOURCES.filter((s) => d.sessions.some((r) => r.source === s));
  const cs = chips(f, clusterLabel);
  const off = d.sessions.length === 0;
  return (
    <>
      <form className="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label className="field"><span>Source</span>
          <select value={f.source ?? ""} disabled={off} onChange={(e) => set({ source: (e.target.value || undefined) as never })}>
            <option value="">All sources</option>{srcs.map((s) => <option key={s} value={s}>{srcLabel(s)}</option>)}
          </select></label>
        <label className="field"><span>Intent</span>
          <select value={f.intent ?? ""} disabled={off} onChange={(e) => set({ intent: (e.target.value || undefined) as never })}>
            <option value="">All intents</option>{INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select></label>
        <label className="field"><span>Project</span>
          <select value={f.project ?? ""} disabled={off} onChange={(e) => set({ project: e.target.value || undefined })}>
            <option value="">All projects</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select></label>
        <label className="field"><span>From</span><input type="date" value={f.from ?? ""} min={d.range.start} max={f.to ?? d.range.end} disabled={off} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="field"><span>To</span><input type="date" value={f.to ?? ""} min={f.from ?? d.range.start} max={d.range.end} disabled={off} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
        <button type="button" className="btn primary" aria-expanded={open} aria-controls="drawer" onClick={() => setOpen(!open)} disabled={off}>{open ? "Hide sessions" : `Sessions (${fmtInt(v.rows.length)})`}</button>
      </form>
      <div className="crumbs" aria-label="Active filters">
        {cs.map((c) => <button key={c.keys.join()} type="button" className="crumb" aria-label={`Clear filter ${c.label}`} onClick={() => clear(c.keys as FilterKey[])}>{c.label} <span aria-hidden="true">×</span></button>)}
        {cs.length > 1 && <button type="button" className="link" onClick={() => clear()}>Clear all</button>}
        {off && <span className="note">This export has no per-session rows, so filters are off. Re-run prompt-analytics export.</span>}
      </div>
    </>
  );
}

export function Kpis() {
  const { v } = useStore();
  const t = v.totals;
  const cost = t.cost === null ? "not priced" : fmtUSD(t.cost);
  return (
    <dl className="kpis" aria-label="Totals for the current selection">
      <div className="kpi"><dt>Sessions</dt><dd>{fmtInt(t.sessions)}</dd></div>
      <div className="kpi"><dt>Prompts</dt><dd>{fmtCompact(t.prompts)}<small>{fmtInt(t.prompts)} total</small></dd></div>
      <div className="kpi"><dt>Tokens</dt><dd>{fmtCompact(t.tokens)}</dd></div>
      <div className="kpi"><dt>Cost</dt><dd>{cost}{t.cost !== null && t.unpriced > 0 ? <small>{fmtInt(t.unpriced)} sessions not priced</small> : null}</dd></div>
      <div className="kpi"><dt>Applied</dt><dd>{t.sessions ? fmtPct(t.applied / t.sessions) : "0%"}<small>{fmtInt(t.applied)} sessions</small></dd></div>
      <div className="kpi"><dt>Active days</dt><dd>{fmtInt(t.activeDays)}<small>streak {t.longest} longest, {t.current} now</small></dd></div>
      <div className="kpi"><dt>Projects</dt><dd>{fmtInt(t.projects)}</dd></div>
    </dl>
  );
}

export function Tabs() {
  const { tab, setTab } = useStore();
  const key = (e: KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    const t = TABS[(n + TABS.length) % TABS.length];
    setTab(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Areas">
      {TABS.map((t, i) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" className="tab" aria-selected={tab === t.id} aria-controls="panel" tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)} onKeyDown={(e) => key(e, i)}>{t.name}</button>
      ))}
    </div>
  );
}

type SortKey = "date" | "prompts" | "cost" | "friction";
const SORTS: { id: SortKey; text: string }[] = [{ id: "date", text: "Date" }, { id: "prompts", text: "Prompts" }, { id: "cost", text: "Cost" }, { id: "friction", text: "Friction" }];
const PAGE = 100;
const val = (r: SessionRow, k: SortKey) => (k === "date" ? r.date : k === "prompts" ? r.prompts : k === "cost" ? r.cost_usd ?? -1 : r.friction);

export function sortRows(rows: SessionRow[], k: SortKey, desc: boolean): SessionRow[] {
  return [...rows].sort((a, b) => {
    const x = val(a, k), y = val(b, k);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (desc ? -c : c) || a.id.localeCompare(b.id);
  });
}

export function Drawer() {
  const { v, f, open, setOpen, clear, clusterLabel } = useStore();
  const [sort, setSort] = useState<SortKey>("date");
  const [desc, setDesc] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setShown(PAGE); }, [f]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    head.current?.focus();
    return () => { if (prev && document.contains(prev)) prev.focus(); };
  }, [open]);
  if (!open) return null;
  const rows = sortRows(v.rows, sort, desc);
  const cs = chips(f, clusterLabel);
  return (
    <aside id="drawer" className="drawer" aria-label="Sessions" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <div className="drawer-h">
        <h2 ref={head} tabIndex={-1}>Sessions <span className="meta">{fmtInt(rows.length)} matching</span></h2>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="drawer-t">
        {cs.map((c) => <button key={c.keys.join()} type="button" className="crumb" aria-label={`Clear filter ${c.label}`} onClick={() => clear(c.keys as FilterKey[])}>{c.label} <span aria-hidden="true">×</span></button>)}
        <Segmented label="Sort by" options={SORTS} value={sort} onChange={setSort} />
        <button type="button" className="btn" aria-label={desc ? "Descending, switch to ascending" : "Ascending, switch to descending"} onClick={() => setDesc(!desc)}>{desc ? "Desc" : "Asc"}</button>
      </div>
      <div className="drawer-b">
        {v.legacy ? <p className="empty" style={{ padding: 16 }}>This export has no per-session rows.</p> : rows.length === 0 ? <p className="empty" style={{ padding: 16 }}>No sessions match.</p> : (
          <ul>
            {rows.slice(0, shown).map((r) => (
              <li key={r.id} className="srow">
                <div className="l1">
                  <time dateTime={r.date}>{fmtDate(r.date)}</time>
                  <span><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{srcLabel(r.source)}</span>
                  <span className="meta">{r.project || "(no project)"}</span>
                  <span className="tag">{r.intent}</span>
                </div>
                <p className={`ti ${r.title ? "" : "none"}`}>{r.title || "Untitled session"}</p>
                <div className="l3">
                  <span>{fmtInt(r.prompts)} prompts</span>
                  <span>{r.cost_usd === null ? "not priced" : fmtUSD(r.cost_usd)}</span>
                  <span>{r.applied ? "applied" : "not applied"}</span>
                  <span>friction {r.friction.toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length > shown && <div style={{ padding: 12 }}><button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button></div>}
      </div>
    </aside>
  );
}
