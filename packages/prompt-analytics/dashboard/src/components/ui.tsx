import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from "react";
import { onReveal, reducedNow, useRoving } from "../lib/hooks";
import { fmtInt } from "../lib/format";
import { linkProps, type Ent } from "../lib/motion";

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
/** `half`: one of a pair that stays side by side (6 + 6) at a <=1000px container, where every other card goes full width. */
export function Card({ title, meta, span = 6, half, actions, children, id, src, so, thin }: { title: string; so?: ReactNode; thin?: boolean; meta?: ReactNode; span?: Span; half?: boolean; actions?: ReactNode; children: ReactNode; id?: string; src?: string }) {
  return (
    <div className={`card s${span}${half ? " half" : ""}`} id={id} role="group" aria-label={title} data-src={src}>
      <header className="card-h">
        <h3>{title}</h3>
        {meta ? <span className="meta">{meta}</span> : null}
        {actions ? <span className="card-acts">{actions}</span> : null}
      </header>
      {so ? <p className="so" data-thin={thin || undefined}>{so}</p> : null}
      {children}
    </div>
  );
}

/** Only plain counts tick up: "837", "12,400", "1.2k". Ratios, rates, money and signed deltas ("56%", "0.41", "$3.20", "+12%") always show at once. */
export const countable = (text: string) => /^\d[\d,]*(\.\d)?[kMB]?$/.test(text) && !/^0\.\d$/.test(text);

/** A count that ticks up (~800 ms, ease-out) once, the first time its section scrolls into view. Later values (a filter change) and tooltip values snap.
 *  The text node always holds the final string, so format is preserved and jsdom / reduced motion see it at once.
 *  `quick` marks a tooltip value: it never animates. */
/** Widget header icons (16-unit grid, drawn at 12px). */
const W_ICONS = {
  gauge: "M2.5 11a5.5 5.5 0 0 1 11 0M8 11l2.5-3.5",
  trend: "M1.5 11.5l3.5-4 3 3 3.5-5 3 2",
  heat: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z",
  cost: "M10.5 5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5M8 2v12",
  why: "M6 6a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5v.6M8 12.4v.1",
  terrain: "M3.5 13.5v-4M8 13.5v-9M12.5 13.5v-6",
} as const;
/** One Overview strip widget: icon chip and title, one body, one caption line. `n` (1-6) picks the hue and the rise-in order. */
export function W({ n, ic, t, cap, className, label, children }: { n: number; ic: keyof typeof W_ICONS; t: ReactNode; cap?: ReactNode; className?: string; label?: string; children: ReactNode }) {
  return (
    <div className={`w${className ? ` ${className}` : ""}`} data-w={n} style={{ "--i": n - 1 } as CSSProperties} {...(label ? { role: "group", "aria-label": label } : {})}>
      <p className="w-h"><span className="w-ic" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12" focusable="false"><path d={W_ICONS[ic]} /></svg></span><span className="w-t" title={typeof t === "string" ? t : undefined}>{t}</span></p>
      <div className="w-b">{children}</div>
      {cap != null && <div className="w-c">{cap}</div>}
    </div>
  );
}

export function Count({ text, className, as: Tag = "span", quick, tick }: { text: string; className?: string; as?: "span" | "b"; quick?: boolean; tick?: boolean }) {
  const ref = useRef<HTMLElement>(null), played = useRef(false), latest = useRef(text);
  latest.current = text;
  useLayoutEffect(() => {
    const node = ref.current?.firstChild, m = /^(.*?)(-?\d[\d,]*)(\.\d+)?(.*)$/.exec(text);
    if (!ref.current || !node || !m || quick || played.current || !(tick || countable(text)) || reducedNow()) return;
    const target = parseFloat(`${m[2].replace(/,/g, "")}${m[3] ?? ""}`), dec = m[3] ? m[3].length - 1 : 0, comma = m[2].includes(",");
    const fmt = (n: number) => `${m[1]}${comma ? n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : n.toFixed(dec)}${m[4]}`;
    let raf = 0, off = () => {};
    const run = () => {
      played.current = true;
      const t0 = performance.now();
      node.nodeValue = fmt(0);
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 800);
        node.nodeValue = p < 1 ? fmt(target * (1 - (1 - p) ** 3)) : text;
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (document.documentElement.classList.contains("fx")) off = onReveal(ref.current, run);   // the final text stays until the section reveals
    return () => { cancelAnimationFrame(raf); off(); node.nodeValue = latest.current; };   // never leave a half-counted value behind
  }, [text, quick]);
  const T = Tag as "span";
  return <T ref={ref as never} className={className}>{text}</T>;
}

export const Empty = ({ children = "Nothing in this selection" }: { children?: ReactNode }) => <p className="empty">{children}</p>;

export interface BarRowData {
  key: string; label: ReactNode; value: number; text: ReactNode; sub?: ReactNode;
  active?: boolean; color?: string; onClick?: () => void; aria: string;
  /** Linked-hover entity: hovering or focusing the row highlights the same entity in every chart. */
  ent?: Ent;
  /** Reference tick as a fraction of the bar track (an overall mean, a top-tercile score). */
  mark?: number;
}

/** Horizontal bars, one button per row. The row is the drill target; numbers are always printed.
 *  When any row is active the others dim (Tableau highlight), but stay clickable so the selection can switch. */
export function BarList({ rows, max, label, cascade }: { rows: BarRowData[]; max?: number; label: string; cascade?: boolean }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  const sel = rows.some((r) => r.active);
  return (
    <ul className="bars" aria-label={label} data-sel={sel || undefined} data-cascade={cascade || undefined}>
      {rows.map((r, i) => (
        <li key={r.key} style={{ "--i": i } as CSSProperties} {...(r.ent ? linkProps(r.ent) : {})}>
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
export function Segmented<T extends string>({ label, options, value, onChange, quiet }: { label: string; options: { id: T; text: string }[]; value: T; onChange: (v: T) => void; quiet?: boolean }) {
  return (
    <div className={quiet ? "seg seg-q" : "seg"} role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.text}</button>)}
    </div>
  );
}

export const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

export interface ColData { ent?: Ent; key: string; label: string; segs: { v: number; color: string }[]; active?: boolean; onClick?: () => void; aria: string }
/** Vertical stacked columns, one button each (roving tabindex: one tab stop, arrows move). Heights are relative to the tallest column. */
export function Cols({ cols, label, height, max }: { cols: ColData[]; label: string; height?: number; max?: number }) {
  const sums = cols.map((c) => c.segs.reduce((a, s) => a + s.v, 0));
  const top = max ?? Math.max(...sums, 0);
  const first = Math.max(0, cols.findIndex((c) => c.onClick));
  const { group, mark } = useRoving(cols.length, 1, 1, first);
  const sel = cols.some((c) => c.active);
  return (
    <div className="cols" role="group" aria-label={label} style={height ? { height } : undefined} data-sel={sel || undefined} {...group}>
      {cols.map((c, i) => {
        const bars = c.segs.map((s, j) => (s.v > 0 ? <i key={j} style={{ height: `${top > 0 ? Math.max(2, (s.v / top) * 100) : 0}%`, "--c": s.color } as CSSProperties} /> : null));
        const lp = c.ent ? linkProps(c.ent) : null;
        // inert columns are plain divs: they may sit inside another button (funnel minis)
        return c.onClick
          ? <button key={c.key} type="button" className="col" style={{ "--i": i } as CSSProperties} aria-pressed={!!c.active} aria-label={c.aria} title={c.aria} onClick={c.onClick} {...mark(i)} {...lp} onFocus={(e) => { mark(i).onFocus(); lp?.onFocus(e); }}>{bars}</button>
          : <div key={c.key} className="col" style={{ "--i": i } as CSSProperties} {...lp} role="img" aria-label={c.aria} title={c.aria}>{bars}</div>;
      })}
    </div>
  );
}

export type Tone = "good" | "bad" | "flat";
/** Delta chip: arrow glyph + sign, tone by whether the change is good. `lowerBetter` inverts (cost, friction).
 *  `neutral` keeps volume metrics (sessions, prompts) grey: more of them is neither good nor bad. */
export function Delta({ pct: p, text, lowerBetter = false, neutral = false, still = false }: { pct: number | "new" | null; text?: string; lowerBetter?: boolean; neutral?: boolean; still?: boolean }) {
  if (p === null) return null;
  const flat = p !== "new" && +Math.abs(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0) === 0;
  const up = p === "new" || p > 0;
  const tone: Tone = flat || neutral ? "flat" : up !== lowerBetter ? "good" : "bad";
  const mag = p === "new" ? "" : Math.abs(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0);   // sign comes from the printed value, so no "-0%"
  const label = text ?? (p === "new" ? "new" : +mag === 0 ? "flat" : `${p > 0 ? "+" : "-"}${mag}%`);
  return <span className="delta" data-tone={tone} aria-label={`${label} versus the previous period`}><span aria-hidden="true">{flat ? "▬" : up ? "▲" : "▼"}</span> {still ? label : <Count text={label} />}</span>;
}

/** Shown instead of a delta when the comparison period has too few sessions to trust a percentage. */
export const LowBase = ({ n }: { n: number }) => <span className="delta" title={`previous period has ${n} sessions`}><span>low base</span></span>;
