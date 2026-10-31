import { type CSSProperties, type ReactNode } from "react";
import { useRoving } from "../lib/hooks";
import { fmtInt } from "../lib/format";

export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12;

/** One page section: title, the question it answers, right-aligned toggles, then a 12-column grid of cards. */
export function Section({ id, title, q, actions, children }: { id: string; title: string; q: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="sec" aria-labelledby={`${id}-h`}>
      <header className="sec-h">
        <div><h2 id={`${id}-h`}>{title}</h2><p className="q">{q}</p></div>
        {actions ? <div className="acts">{actions}</div> : null}
      </header>
      <div className="grid">{children}</div>
    </section>
  );
}

/** Titled block on the grid. `meta` is the one-line method/scope caption ("all sessions" marks aggregates that ignore filters). */
export function Card({ title, meta, span = 6, actions, children, id }: { title: string; meta?: ReactNode; span?: Span; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className={`card s${span}`} id={id} role="group" aria-label={title}>
      <header className="card-h">
        <h3>{title}</h3>
        {meta ? <span className="meta">{meta}</span> : null}
        {actions ? <span className="card-acts">{actions}</span> : null}
      </header>
      {children}
    </div>
  );
}

export const Empty = ({ children = "Nothing in this selection" }: { children?: ReactNode }) => <p className="empty">{children}</p>;
export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;

export interface BarRowData {
  key: string; label: ReactNode; value: number; text: ReactNode; sub?: ReactNode;
  active?: boolean; color?: string; onClick?: () => void; aria: string;
  /** Reference tick as a fraction of the bar track (an overall mean, a top-tercile score). */
  mark?: number;
}

/** Horizontal bars, one button per row. The row is the drill target; numbers are always printed.
 *  When any row is active the others dim (Tableau highlight), but stay clickable so the selection can switch. */
export function BarList({ rows, max, label }: { rows: BarRowData[]; max?: number; label: string }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  const sel = rows.some((r) => r.active);
  return (
    <ul className="bars" aria-label={label} data-sel={sel || undefined}>
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" className="bar-row" aria-pressed={r.onClick ? !!r.active : undefined} aria-label={r.aria} onClick={r.onClick} disabled={!r.onClick}
            style={{ "--w": top > 0 ? Math.max(r.value > 0 ? 0.01 : 0, r.value / top) : 0, ...(r.color ? { "--c": r.color } : {}), ...(r.mark !== undefined ? { "--m": r.mark } : {}) } as CSSProperties}>
            <span className="bar-l" title={typeof r.label === "string" ? r.label : undefined}>{r.label}</span>
            <span className="bar-t" aria-hidden="true" data-mark={r.mark !== undefined || undefined}><i /></span>
            <span className="bar-n">{r.text}</span>
            {r.sub ? <span className="bar-s">{r.sub}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Visually hidden table that mirrors a chart (kept for screen readers). */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Segmented toggle. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.text}</button>)}
    </div>
  );
}

export const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");
export const nOf = (n: number) => `n=${fmtInt(n)}`;

export interface ColData { key: string; label: string; segs: { v: number; color: string }[]; active?: boolean; onClick?: () => void; aria: string }
/** Vertical stacked columns, one button each (roving tabindex: one tab stop, arrows move). Heights are relative to the tallest column. */
export function Cols({ cols, label, height, max }: { cols: ColData[]; label: string; height?: number; max?: number }) {
  const top = max ?? Math.max(...cols.map((c) => c.segs.reduce((a, s) => a + s.v, 0)), 0);
  const first = Math.max(0, cols.findIndex((c) => c.onClick));
  const { group, mark } = useRoving(cols.length, 1, 1, first);
  const sel = cols.some((c) => c.active);
  return (
    <div className="cols" role="group" aria-label={label} style={height ? { height } : undefined} data-sel={sel || undefined} {...group}>
      {cols.map((c, i) => {
        const bars = c.segs.map((s, j) => (s.v > 0 ? <i key={j} style={{ height: `${top > 0 ? Math.max(2, (s.v / top) * 100) : 0}%`, "--c": s.color } as CSSProperties} /> : null));
        // inert columns are plain divs: they may sit inside another button (funnel minis)
        return c.onClick
          ? <button key={c.key} type="button" className="col" aria-pressed={!!c.active} aria-label={c.aria} title={c.aria} onClick={c.onClick} {...mark(i)}>{bars}</button>
          : <div key={c.key} className="col" role="img" aria-label={c.aria} title={c.aria}>{bars}</div>;
      })}
    </div>
  );
}

export type Tone = "good" | "bad" | "flat";
/** Delta chip: arrow glyph + sign, tone by whether the change is good. `lowerBetter` inverts (cost, friction). */
export function Delta({ pct: p, text, lowerBetter = false }: { pct: number | "new" | null; text?: string; lowerBetter?: boolean }) {
  if (p === null) return null;
  const flat = p !== "new" && Math.abs(p) < 0.005;
  const up = p === "new" || p > 0;
  const tone: Tone = flat ? "flat" : up !== lowerBetter ? "good" : "bad";
  const label = text ?? (p === "new" ? "new" : `${p > 0 ? "+" : p < 0 ? "-" : ""}${Math.abs(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0)}%`);
  return <span className="delta" data-tone={tone} aria-label={`${label} versus the previous period`}><span aria-hidden="true">{flat ? "▬" : up ? "▲" : "▼"}</span> {label}</span>;
}
