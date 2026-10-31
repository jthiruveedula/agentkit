import type { CSSProperties, ReactNode } from "react";
import { fmtInt } from "../lib/format";

export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12;

/** Titled block on the grid. `meta` is the one-line method/scope caption. */
export function Panel({ title, meta, span = 6, actions, children, id }: { title: string; meta?: ReactNode; span?: Span; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={`panel s${span}`} aria-labelledby={`${id ?? title}-h`.replace(/\W+/g, "-")}>
      <header className="panel-h">
        <h3 id={`${id ?? title}-h`.replace(/\W+/g, "-")}>{title}</h3>
        {meta ? <span className="meta">{meta}</span> : null}
        {actions ? <span className="panel-acts">{actions}</span> : null}
      </header>
      {children}
    </section>
  );
}

export const Empty = ({ children = "Nothing in this selection" }: { children?: ReactNode }) => <p className="empty">{children}</p>;

export interface BarRowData {
  key: string; label: ReactNode; value: number; text: ReactNode; sub?: ReactNode;
  active?: boolean; color?: string; onClick?: () => void; aria: string;
}

/** Horizontal bars, one button per row. The row is the drill target; numbers are always printed. */
export function BarList({ rows, max, label }: { rows: BarRowData[]; max?: number; label: string }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0) ?? 1;
  return (
    <ul className="bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" className="bar-row" aria-pressed={r.active} aria-label={r.aria} onClick={r.onClick} disabled={!r.onClick}
            style={{ "--w": top > 0 ? Math.max(r.value > 0 ? 0.01 : 0, r.value / top) : 0, ...(r.color ? { "--c": r.color } : {}) } as CSSProperties}>
            <span className="bar-l" title={typeof r.label === "string" ? r.label : undefined}>{r.label}</span>
            <span className="bar-t" aria-hidden="true"><i /></span>
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

export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;

export interface ColData { key: string; label: string; segs: { v: number; color: string }[]; active?: boolean; onClick?: () => void; aria: string }
/** Vertical stacked columns, one button each. Heights are relative to the tallest column. */
export function Cols({ cols, label, height }: { cols: ColData[]; label: string; height?: number }) {
  const top = Math.max(...cols.map((c) => c.segs.reduce((a, s) => a + s.v, 0)), 0);
  return (
    <div className="cols" role="group" aria-label={label} style={height ? { height } : undefined}>
      {cols.map((c) => (
        <button key={c.key} type="button" className="col" aria-pressed={c.active} aria-label={c.aria} title={c.aria} onClick={c.onClick} disabled={!c.onClick}>
          {c.segs.map((s, i) => (s.v > 0 ? <i key={i} style={{ height: `${top > 0 ? Math.max(2, (s.v / top) * 100) : 0}%`, "--c": s.color } as CSSProperties} /> : null))}
        </button>
      ))}
    </div>
  );
}
