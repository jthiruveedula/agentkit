import { useRef, useState } from "react";
import { useStore } from "../state";
import { addView, loadViews, removeView, storeViews, viewSummary, type SavedView } from "../lib/palette-actions";
import { toast } from "../lib/toast";

/** Visible twin of the palette's saved-view actions: apply, delete, and save the current filters, range and section. */

export function SavedViews() {
  const { go } = useStore();
  const [views, setViews] = useState<SavedView[]>(loadViews), [name, setName] = useState("");
  const box = useRef<HTMLDetailsElement>(null);
  const persist = (n: SavedView[], msg: string) => { setViews(n); toast(storeViews(n) ? msg : "Storage is blocked: view not saved"); };
  return (
    <details className="menu-wrap sv" ref={box} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (box.current) box.current.open = false; (box.current?.querySelector("summary") as HTMLElement | null)?.focus(); } }}>
      <summary className="btn">Saved views{views.length > 0 && <b className="badge">{views.length}</b>} ▾</summary>
      <div className="menu sv-box">
        {views.length === 0 && <p className="menu-n sv-none">No saved views yet.</p>}
        {views.map((v) => (
          <div key={v.name} className="sv-row">
            <button type="button" onClick={() => { if (box.current) box.current.open = false; go(v.hash); }}><b>{v.name}</b><small>{viewSummary(v.hash)}</small></button>
            <button type="button" className="sv-x" aria-label={`Delete view ${v.name}`} onClick={() => persist(removeView(views, v.name), `Deleted view "${v.name}"`)}>&times;</button>
          </div>))}
        <form className="sv-new" onSubmit={(e) => { e.preventDefault(); const n = addView(views, name, location.hash || "#/s-overview"); if (n !== views) { persist(n, `Saved view "${name.trim()}"`); setName(""); } }}>
          <input aria-label="Name for the current view" placeholder="Name this view" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim()}>Save</button>
        </form>
      </div>
    </details>
  );
}
