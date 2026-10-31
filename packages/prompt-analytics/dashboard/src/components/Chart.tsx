import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSize } from "../lib/hooks";
import { useGSAP, withMotion, type MotionFn } from "../lib/motion";

export interface TipApi { show: (x: number, y: number, body: ReactNode) => void; hide: () => void }
export interface Box { w: number; h: number }

interface TipState { x: number; y: number; body: ReactNode }

interface ChartProps {
  title: string;
  label: string;                       // role="img" aria-label: describes the insight
  ratio: number;                       // width / height on desktop
  ratioSm?: number;                    // width / height under 640px
  table: ReactNode;                    // visually hidden data table
  empty?: boolean;                     // render the quiet empty state instead of the chart
  emptyText?: string;
  className?: string;
  id?: string;
  children: (box: Box, tip: TipApi) => ReactNode;
  overlay?: (box: Box, tip: TipApi) => ReactNode;   // focusable marks, kept outside role=img
  controls?: ReactNode;
  scrub?: boolean;                     // marks the chart as the chapter's signature (scrubbed) chart
  motion?: MotionFn;                   // runs once the chart has size, only without reduced motion
}

/** Frame shared by every chart: reserved aspect ratio, role=img, hidden table, tooltip, empty state. */
export function Chart({ title, label, ratio, ratioSm, table, empty, emptyText, className = "", id, children, overlay, controls, scrub, motion }: ChartProps) {
  const fig = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(stage);
  const [tip, setTip] = useState<TipState | null>(null);
  const api: TipApi = {
    show: useCallback((x, y, body) => setTip({ x, y, body }), []),
    hide: useCallback(() => setTip(null), []),
  };
  useGSAP(() => {
    if (!motion || !fig.current || w === 0 || empty) return;
    return withMotion(fig.current, motion);
  }, { scope: fig, dependencies: [w > 0, !!empty] });
  const style = { "--r": ratio, "--rs": ratioSm ?? ratio } as CSSProperties;
  const flip = tip ? tip.x > w * 0.6 : false;
  return (
    <figure id={id} ref={fig} className={`chart ${className}`} data-reveal data-scrub={scrub ? "" : undefined}>
      <figcaption><h3 className="chart-title">{title}</h3></figcaption>
      {controls}
      {empty ? (
        <p className="empty" style={style}>{emptyText ?? "Not enough data yet"}</p>
      ) : (
        <div className="stage" ref={stage} style={style} onPointerLeave={api.hide}>
          <div className="stage-in" role="img" aria-label={label}>{w > 0 && children({ w, h }, api)}</div>
          {w > 0 && overlay?.({ w, h }, api)}
          {tip && (
            <div className="tip" aria-hidden="true" style={{ transform: `translate(${tip.x}px, ${tip.y}px)` }}>
              <div className="tip-in" style={{ transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)` }}>{tip.body}</div>
            </div>
          )}
        </div>
      )}
      <div className="sr-only">{table}</div>
    </figure>
  );
}

export interface HitItem { key: string; x: number; y: number; w: number; h: number; label: string; body?: ReactNode }

/** Focusable, invisible hit areas over sparse marks. Enter/Space pins the tooltip, Escape dismisses it. */
export function Hits({ items, tip }: { items: HitItem[]; tip: TipApi }) {
  return (
    <div className="hits">
      {items.map((it) => {
        const show = () => tip.show(it.x + it.w / 2, it.y + it.h / 2, it.body ?? it.label);
        return (
          <button key={it.key} type="button" className="hit" aria-label={it.label}
            style={{ transform: `translate(${it.x}px, ${it.y}px)`, width: Math.max(it.w, 24), height: Math.max(it.h, 24) }}
            onFocus={show} onBlur={tip.hide} onPointerEnter={show} onClick={show}
            onKeyDown={(e) => { if (e.key === "Escape") tip.hide(); }} />
        );
      })}
    </div>
  );
}

export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
    </table>
  );
}

/** Segmented toggle used to step a chart through views. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.text}</button>
      ))}
    </div>
  );
}
