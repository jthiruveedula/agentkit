import { useEffect, useRef, useState } from "react";
import { useStore } from "../state";
import { fmtCompact, fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import { clampPage, pageCount, pageSlice, rangeText, SIZES, sizeLabel, DEFAULT_SIZE, parseSort, sortToken, type SortKey } from "../lib/paging";
import type { SessionRow } from "../data/types";
import { Card, Section } from "./ui";
import { ExportMenu } from "./ExportMenu";
import { SavedViews } from "./SavedViews";
import { fileName, MIME, saveFile, serialize, type Fmt } from "../lib/export";
import { toast } from "../lib/toast";

export type { SortKey };
const PAGE = 100;
const val = (r: SessionRow, k: SortKey) => (k === "date" ? r.date : k === "cost" ? r.cost_usd ?? -1 : r[k]);   // unpriced sorts below $0
/** A brushed range (both ends set, unlike the 30d / 90d presets) asks "what drove this spike?": open it sorted by cost. */
export const defaultSort = (f: { from?: string; to?: string }): { k: SortKey; desc: boolean } => ({ k: f.from && f.to ? "cost" : "date", desc: true });

export function sortRows(rows: SessionRow[], k: SortKey, desc: boolean): SessionRow[] {
  return [...rows].sort((a, b) => {
    const x = val(a, k), y = val(b, k);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (desc ? -c : c) || a.id.localeCompare(b.id);
  });
}

const COLS: { k: SortKey | null; text: string; cls?: string; id: string }[] = [
  { id: "date", k: "date", text: "Date" }, { id: "tool", k: null, text: "Tool", cls: "hide-s" }, { id: "project", k: null, text: "Project", cls: "hide-s" }, { id: "intent", k: null, text: "Intent", cls: "hide-s" }, { id: "title", k: null, text: "Title" },
  { id: "prompts", k: "prompts", text: "Prompts", cls: "cx num" }, { id: "tokens", k: "tokens", text: "Tokens", cls: "hide-s num" }, { id: "loops", k: "loops", text: "Loops", cls: "hide-s num" }, { id: "cost", k: "cost", text: "Cost", cls: "num" }, { id: "friction", k: "friction", text: "Friction", cls: "cx num" }, { id: "applied", k: null, text: "Applied", cls: "hide-s" },
];

/** Card list for the side panel: "Show more" paging, newest first. */
export function SessionList({ rows, current }: { rows: SessionRow[]; current?: string | null }) {
  const { openSession, sel, f } = useStore();
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [f]);
  const sorted = sortRows(rows, "date", true);
  if (rows.length === 0) return <p className="empty">No sessions match.</p>;
  const more = sorted.length > shown && <div className="more"><button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, sorted.length - shown)} more</button></div>;
  return (
    <>
        <ul className="srows">
          {sorted.slice(0, shown).map((r) => (
            <li key={r.id}>
              <button type="button" className="srow" aria-current={sel === r.id || current === r.id || undefined} aria-label={`Open session: ${r.title || "Untitled"}, ${fmtDate(r.date)}`} onClick={() => openSession(r.id)}>
                <span className="l1"><time dateTime={r.date}>{fmtDate(r.date)}</time><span><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{srcLabel(r.source)}</span><span className="tag">{r.intent}</span></span>
                <span className={`ti ${r.title ? "" : "none"}`}>{r.title || "Untitled session"}</span>
                <span className="l3"><span>{fmtInt(r.prompts)} prompts</span><span>{r.cost_usd === null ? "not priced" : fmtUSD(r.cost_usd)}</span><span>{r.applied ? "applied" : "not applied"}</span><span>friction {r.friction.toFixed(2)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      {more}
    </>
  );
}

/** The sort in force: the hash token, else the default; Cost falls back to Date when nothing is priced (its column is hidden). */
export function useSort() {
  const { f, view, setView, caps } = useStore();
  const raw = parseSort(view.so) ?? defaultSort(f);
  const sort = raw.k === "cost" && !caps.hasCost ? { k: "date" as SortKey, desc: true } : raw;
  return { sort, setSort: (k: SortKey) => setView({ so: sortToken(k, sort.k === k ? !sort.desc : true), pg: undefined }) };
}

/** Paged, sortable table. Sorting spans every row; the page is just a window onto it. */
export function SessionTable({ rows }: { rows: SessionRow[] }) {
  const { openSession, sel, view, setView, caps } = useStore();
  const { sort, setSort } = useSort();
  const size = view.pgs ?? DEFAULT_SIZE, dense = view.dens === "c";
  const sorted = sortRows(rows, sort.k, sort.desc);
  const pg = clampPage(view.pg, sorted.length, size), last = pageCount(sorted.length, size);
  const priced = rows.some((r) => r.cost_usd !== null);   // rows in view: no Cost column or "not priced" tags without a price
  const cols = COLS.filter((c) => (c.id !== "tool" || caps.multiTool) && (c.id !== "cost" || priced));
  const [said, setSaid] = useState("");
  const wrap = useRef<HTMLDivElement>(null), [more, setMore] = useState(false);
  const measure = () => { const e = wrap.current; if (e) setMore(e.scrollWidth - e.scrollLeft - e.clientWidth > 2); };   // right-edge fade only while more columns sit off-screen
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); });
  const go = (n: number) => { setView({ pg: n > 1 ? n : undefined }); setSaid(`Page ${n} of ${last}, ${rangeText(sorted.length, n, size)}`); };
  if (rows.length === 0) return <p className="empty">No sessions match.</p>;
  return (
    <>
      <div className="tbl-wrap" ref={wrap} data-more={more || undefined} onScroll={measure}>
        <table className="tbl sess" data-dens={dense ? "c" : undefined}>
          <thead><tr>{cols.map((c) => (
            <th key={c.id} scope="col" className={c.cls} aria-sort={c.k && sort.k === c.k ? (sort.desc ? "descending" : "ascending") : undefined}>
              {c.k ? <button type="button" className="th-b" onClick={() => setSort(c.k as SortKey)}>{c.text}{sort.k === c.k ? (sort.desc ? " ▾" : " ▴") : ""}</button> : c.text}
            </th>))}</tr></thead>
          <tbody>{pageSlice(sorted, pg, size).map((r) => (
            <tr key={r.id} data-sel={sel === r.id || undefined} onClick={() => openSession(r.id)}>
              <td><time dateTime={r.date}>{fmtDate(r.date)}</time></td>
              {caps.multiTool && <td className="hide-s"><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{srcLabel(r.source)}</td>}
              <td className="hide-s">{r.project || "-"}</td><td className="hide-s"><span className="tag">{r.intent}</span></td>
              <th scope="row" className="ti" title={r.title || undefined}><button type="button" aria-label={`Open session: ${r.title || "Untitled"}, ${fmtDate(r.date)}`} onClick={(e) => { e.stopPropagation(); openSession(r.id); }}>{r.title || "Untitled session"}</button>
                {caps.multiTool && <span className="ti-tool"><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{srcLabel(r.source)}</span>}</th>
              <td className="cx num">{fmtInt(r.prompts)}</td><td className="hide-s num">{fmtCompact(r.tokens)}</td><td className="hide-s num">{fmtInt(r.loops)}</td>
              {priced && <td className="num">{r.cost_usd === null ? <span className="tag">not priced</span> : fmtUSD(r.cost_usd)}</td>}
              <td className="cx num" data-hi={r.friction > 0.5 || undefined}>{r.friction > 0.5 && <i className="fbar" aria-hidden="true" style={{ "--w": r.friction } as React.CSSProperties} />}{r.friction.toFixed(2)}</td><td className="hide-s">{r.applied ? "yes" : "no"}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="pager">
        <nav aria-label="Sessions pages" className="pager-nav">
          <button type="button" className="btn" disabled={pg <= 1} onClick={() => go(pg - 1)}>Prev</button>
          <span className="pager-r">{rangeText(sorted.length, pg, size)}</span>
          <button type="button" className="btn" disabled={pg >= last} onClick={() => go(pg + 1)}>Next</button>
          <button type="button" className="btn" disabled={pg >= last} onClick={() => go(last)} aria-label={`Go to last page, ${last}`}>Last</button>
          <span className="sr-only" role="status" aria-live="polite">{said}</span>
        </nav>
        <label className="field inl"><span>Rows</span>
          <select value={size} onChange={(e) => { setView({ pgs: +e.target.value === DEFAULT_SIZE ? undefined : +e.target.value, pg: undefined }); setSaid(`Showing ${sizeLabel(+e.target.value)} rows per page`); }}>
            {SIZES.map((n) => <option key={n} value={n}>{sizeLabel(n)}</option>)}</select></label>
        <div className="seg" role="group" aria-label="Row density">
          {([["x", "Comfortable"], ["c", "Compact"]] as const).map(([id, t]) => <button key={id} type="button" aria-pressed={(id === "c") === dense} onClick={() => setView({ dens: id === "c" ? "c" : undefined })}>{t}</button>)}
        </div>
      </div>
    </>
  );
}

/** Export every row in view (current filters and sort), not just the visible page. */
export function useExporter() {
  const { v, f } = useStore();
  const { sort } = useSort();
  return (fmt: Fmt) => {
    const rows = sortRows(v.rows, sort.k, sort.desc);
    try { saveFile(fileName(fmt), serialize(fmt, rows, { ...f }), MIME[fmt]); toast(`Exported ${fmtInt(rows.length)} sessions as ${fmt.toUpperCase()}`); }
    catch { toast("Export failed in this browser"); }
  };
}

export function Sessions() {
  const { v, f, set } = useStore();
  const exp = useExporter();
  return (
    <Section id="s-sessions" title="Sessions" q="Which sessions are behind these numbers?">
      <Card title="All sessions in view" meta={`${fmtInt(v.rows.length)} sessions, click one for detail`} span={12}
        actions={<><SavedViews /><ExportMenu count={v.rows.length} onPick={exp} /></>}>
        {!v.legacy && <label className="field s-search"><span>Search titles</span>
          <input type="search" value={f.q ?? ""} placeholder="Type to filter sessions by title" autoComplete="off" onChange={(e) => set({ q: e.target.value || undefined })} /></label>}
        {v.legacy ? <p className="empty">This export has no per-session rows.</p> : <SessionTable rows={v.rows} />}
      </Card>
    </Section>
  );
}
