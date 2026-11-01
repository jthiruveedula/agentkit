import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "../state";
import { addDays } from "../lib/filter";
import { INTENTS, srcLabel } from "../lib/palette";
import { buildActions, loadViews, rank, removeView, addView, sessionActions, titleAction, groupName, storeViews, type Action, type SavedView } from "../lib/palette-actions";
import { toast } from "../lib/toast";
import { NAV } from "./Shell";
import { useExporter } from "./Sessions";
import { useCopySummary } from "./CopySummary";
import { openWrapped } from "./Wrapped";
import { wrapped } from "../lib/wrapped";

export const OPEN_EVENT = "pa:palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));
const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable); };

/** Cmd/Ctrl+K (or "/" outside fields) opens a focus-trapped dialog. Every action here also exists as a visible control. */
export function Palette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector(".wrap-scrim")) return;   // Weekly Wrapped is modal: shortcuts do nothing behind it
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !document.querySelector(".palette")) { e.preventDefault(); setOpen(true); }
    };
    const on = () => setOpen(true);
    window.addEventListener("keydown", key); window.addEventListener(OPEN_EVENT, on);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener(OPEN_EVENT, on); };
  }, []);
  return open ? <Dialog close={() => setOpen(false)} /> : null;
}

function Dialog({ close }: { close: () => void }) {
  const s = useStore(), { d, f, v, secs, caps, capsAll, goto, set, clear, openSession, go } = s;
  const exp = useExporter(), copy = useCopySummary();
  const [q, setQ] = useState(""), [cur, setCur] = useState(0), [naming, setNaming] = useState(false);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  const [from] = useState(() => document.activeElement as HTMLElement | null);   // captured at first render, before the input takes focus
  const id = useId();
  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".app");   // the page behind the dialog is inert: no tab stop, no screen-reader reach
    app?.setAttribute("inert", ""); input.current?.focus();
    return () => {
      app?.removeAttribute("inert");
      const back = from && from !== document.body && document.contains(from) ? from : document.getElementById("main");   // fallback when the opener is gone
      back?.focus?.();
    };
  }, [from]);
  const ctx = useMemo(() => ({
    sections: NAV.flatMap((g) => g.items).filter((i) => secs.has(i.id)).map((i) => ({ id: i.id, text: i.id === "s-tools" && !capsAll.multiTool ? "Projects" : i.text })),
    sources: caps.multiTool ? caps.sources.map((x) => ({ id: x, text: srcLabel(x) })) : [],
    intents: INTENTS.filter((i) => d.sessions.some((r) => r.intent === i)),
    projects: [...new Set(d.sessions.map((r) => r.project).filter(Boolean))].sort(),
    hasFilters: Object.keys(f).length > 0, hasRows: v.rows.length > 0, views, hasWrapped: wrapped(d) !== null,
  }), [secs, caps, capsAll.multiTool, d, f, v.rows.length, views]);
  const items = useMemo(() => naming ? [] : [...rank(buildActions(ctx), q), ...titleAction(q), ...sessionActions(v.rows, q)], [ctx, q, naming, v.rows]);
  const at = Math.min(cur, Math.max(0, items.length - 1));
  useEffect(() => { list.current?.children[at]?.scrollIntoView?.({ block: "nearest" }); }, [at]);

  const run = (a: Action) => {
    const r = a.run;
    if (r.t === "view-save") { setNaming(true); setQ(""); return; }
    close();
    if (r.t === "goto") goto(r.id);
    else if (r.t === "filter") set(r.p);
    else if (r.t === "range") { const end = d.range.end; set(r.days ? { from: addDays(end, -(r.days - 1)), to: undefined } : { from: undefined, to: undefined }); }
    else if (r.t === "copy") void copy();
    else if (r.t === "wrapped") openWrapped();
    else if (r.t === "export") exp(r.fmt);
    else if (r.t === "clear") clear();
    else if (r.t === "session") openSession(r.id);
    else if (r.t === "view-apply") go(r.hash);
    else if (r.t === "view-del") { const n = removeView(views, r.name); storeViews(n); toast(`Deleted view "${r.name}"`); }
  };
  const save = () => {
    const n = addView(views, q, location.hash || "#/s-overview");
    if (n === views) return;
    setViews(n); close();
    toast(storeViews(n) ? `Saved view "${q.trim()}"` : "Storage is blocked: view not saved");
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }   // trap: the input is the only tab stop
    else if (e.key === "ArrowDown") { e.preventDefault(); setCur(items.length ? (at + 1) % items.length : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur(items.length ? (at - 1 + items.length) % items.length : 0); }
    else if (e.key === "Enter") { e.preventDefault(); if (naming) save(); else if (items[at]) run(items[at]); }
  };
  return createPortal(
    <div className="palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={key}>
        <input ref={input} className="palette-in" type="text" role="combobox" aria-expanded={!naming && items.length > 0} aria-controls={naming ? undefined : `${id}-l`} aria-activedescendant={items[at] ? `${id}-${at}` : undefined} aria-autocomplete="list" autoComplete="off" spellCheck={false}
          placeholder={naming ? "Name this view, then Enter" : "Search actions, or type 2+ letters to find a session"} aria-label={naming ? "View name" : "Command"} value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }} />
        {naming ? <p className="palette-empty">Saves the current filters, range and section in this browser.</p> : (
          <ul id={`${id}-l`} ref={list} className="palette-list" role="listbox" aria-label="Commands">
            {items.map((a, i) => (
              <li key={a.id} id={`${id}-${i}`} role="option" aria-selected={i === at} data-on={i === at || undefined} onMouseMove={() => setCur(i)} onClick={() => run(a)} aria-label={`${a.label}${a.sub ? `, ${a.sub}` : ""}, ${groupName(a.group)}`}>
                <span aria-hidden="true">{a.label}{a.sub && <small className="palette-sub">{a.sub}</small>}</span><span className="palette-g" aria-hidden="true">{groupName(a.group)}</span>
              </li>))}
          </ul>)}
        {!naming && items.length === 0 && <p className="palette-empty">No matching command.</p>}
        <p className="sr-only" role="status" aria-live="polite">{naming ? "" : `${items.length} result${items.length === 1 ? "" : "s"}`}</p>
        <p className="palette-foot" aria-hidden="true">↑↓ move, Enter run, Esc close</p>
      </div>
    </div>, document.body);
}
