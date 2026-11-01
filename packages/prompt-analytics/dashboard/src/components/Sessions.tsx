import { useEffect, useState } from "react";
import { useStore } from "../state";
import { fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import type { SessionRow } from "../data/types";
import { Card, Section } from "./ui";

export type SortKey = "date" | "prompts" | "cost" | "friction";
const PAGE = 100;
const val = (r: SessionRow, k: SortKey) => (k === "date" ? r.date : k === "prompts" ? r.prompts : k === "cost" ? r.cost_usd ?? -1 : r.friction);

export function sortRows(rows: SessionRow[], k: SortKey, desc: boolean): SessionRow[] {
  return [...rows].sort((a, b) => {
    const x = val(a, k), y = val(b, k);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (desc ? -c : c) || a.id.localeCompare(b.id);
  });
}

/** CSV cell: quote everything, and neutralise leading = + - @ so a spreadsheet never runs a title as a formula. */
const cell = (x: string | number | boolean | null) => { const s = x === null ? "" : String(x); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
export function toCsv(rows: SessionRow[]): string {
  const head = ["date", "tool", "project", "intent", "title", "prompts", "tokens", "cost_usd", "friction", "applied"];
  return [head.map(cell).join(","), ...rows.map((r) => [r.date, r.source, r.project, r.intent, r.title, r.prompts, r.tokens, r.cost_usd, r.friction.toFixed(2), r.applied].map(cell).join(","))].join("\n");
}
function download(rows: SessionRow[]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "sessions.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const COLS: { k: SortKey | null; text: string; cls?: string }[] = [
  { k: "date", text: "Date" }, { k: null, text: "Tool" }, { k: null, text: "Project", cls: "hide-s" }, { k: null, text: "Intent", cls: "hide-s" }, { k: null, text: "Title" },
  { k: "prompts", text: "Prompts" }, { k: "cost", text: "Cost" }, { k: "friction", text: "Friction" }, { k: null, text: "Applied", cls: "hide-s" },
];

/** Sortable session list. `compact` renders cards (mobile and the side panel). */
export function SessionTable({ rows, compact = false }: { rows: SessionRow[]; compact?: boolean }) {
  const { openSession, sel, f } = useStore();
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "date", desc: true });
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [f]);
  const sorted = sortRows(rows, sort.k, sort.desc);
  if (rows.length === 0) return <p className="empty">No sessions match.</p>;
  const more = sorted.length > shown && <div className="more"><button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, sorted.length - shown)} more</button></div>;
  if (compact) {
    return (
      <>
        <ul className="srows">
          {sorted.slice(0, shown).map((r) => (
            <li key={r.id}>
              <button type="button" className="srow" aria-current={sel === r.id || undefined} aria-label={`Open session: ${r.title || "Untitled"}, ${fmtDate(r.date)}`} onClick={() => openSession(r.id)}>
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
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl sess">
          <thead><tr>{COLS.map((c) => (
            <th key={c.text} scope="col" className={c.cls} aria-sort={c.k && sort.k === c.k ? (sort.desc ? "descending" : "ascending") : undefined}>
              {c.k ? <button type="button" className="th-b" onClick={() => setSort({ k: c.k as SortKey, desc: sort.k === c.k ? !sort.desc : true })}>{c.text}{sort.k === c.k ? (sort.desc ? " ▾" : " ▴") : ""}</button> : c.text}
            </th>))}</tr></thead>
          <tbody>{sorted.slice(0, shown).map((r) => (
            <tr key={r.id} data-sel={sel === r.id || undefined} onClick={() => openSession(r.id)}>
              <td><time dateTime={r.date}>{fmtDate(r.date)}</time></td>
              <td><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{srcLabel(r.source)}</td>
              <td className="hide-s">{r.project || "-"}</td><td className="hide-s"><span className="tag">{r.intent}</span></td>
              <th scope="row" className="ti"><button type="button" aria-label={`Open session: ${r.title || "Untitled"}, ${fmtDate(r.date)}`} onClick={(e) => { e.stopPropagation(); openSession(r.id); }}>{r.title || "Untitled session"}</button></th>
              <td>{fmtInt(r.prompts)}</td><td>{r.cost_usd === null ? <span className="tag">not priced</span> : fmtUSD(r.cost_usd)}</td><td>{r.friction.toFixed(2)}</td><td className="hide-s">{r.applied ? "yes" : "no"}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {more}
    </>
  );
}

export function Sessions() {
  const { v } = useStore();
  return (
    <Section id="s-sessions" title="Sessions" q="Which sessions are behind these numbers?">
      <Card title="All sessions in view" meta={`${fmtInt(v.rows.length)} sessions, click one for detail`} span={12}
        actions={<button type="button" className="btn" disabled={v.rows.length === 0} onClick={() => download(v.rows)}>Export CSV</button>}>
        {v.legacy ? <p className="empty">This export has no per-session rows.</p> : <SessionTable rows={v.rows} />}
      </Card>
    </Section>
  );
}
