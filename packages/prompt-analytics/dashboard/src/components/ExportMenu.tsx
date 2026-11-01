import { useEffect, useRef, useState } from "react";
import type { Fmt } from "../lib/export";

const ITEMS: [Fmt, string][] = [["csv", "CSV (.csv)"], ["json", "JSON (.json)"], ["xlsx", "Excel (.xlsx)"]];
const BYTES: Record<Fmt, number> = { csv: 200, json: 340, xlsx: 110 };   // rough bytes per row, for the size hint only
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} kB` : `${(n / 1048576).toFixed(1)} MB`);

/** "Export ▾" menu button: arrows move, Home/End jump, Esc or Tab closes, focus returns to the button. */
export function ExportMenu({ count, onPick }: { count: number; onPick: (f: Fmt) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null), wrap = useRef<HTMLSpanElement>(null);
  const items = () => [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const key = (e: React.KeyboardEvent) => {
    const els = items(), i = els.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? (i + 1) % els.length : e.key === "ArrowUp" ? (i - 1 + els.length) % els.length : e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); els[to]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
  };
  return (
    <span className="menu-wrap" ref={wrap} onKeyDown={open ? key : undefined}>
      <button ref={btn} type="button" className="btn" aria-haspopup="menu" aria-expanded={open} disabled={count === 0}
        onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>Export {count} rows ▾</button>
      {open && (
        <div className="menu" role="menu" aria-label={`Export ${count} sessions`} ref={box}>
          {ITEMS.map(([f, t]) => <button key={f} type="button" role="menuitem" tabIndex={-1} onClick={() => { close(); onPick(f); }}>{t}<small className="mi-s">~{size(count * BYTES[f])}</small></button>)}
          <p className="menu-n" aria-hidden="true">All {count} rows in view, current sort. Opens as a download.</p>
        </div>
      )}
    </span>
  );
}
