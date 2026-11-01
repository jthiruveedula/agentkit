import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state";
import { autoShow, markSeen, wrapped } from "../lib/wrapped";

export const WRAPPED_EVENT = "pa:wrapped";
export const openWrapped = () => window.dispatchEvent(new Event(WRAPPED_EVENT));

/** Visible entry point (Overview header). Not offered when the week is too thin to say anything. */
export function WrappedButton() {
  const { d } = useStore();
  const ok = useMemo(() => wrapped(d) !== null, [d]);
  return ok ? <button type="button" className="btn" onClick={openWrapped}>Weekly Wrapped</button> : null;
}

/** Mounted once. Never opens by itself: at most once per ISO week a dismissible chip offers it (auto-dismisses after 6 s). The button and palette open the modal. */
export function WrappedHost() {
  const { d } = useStore();
  const [open, setOpen] = useState(false), [chip, setChip] = useState(false);
  useEffect(() => {
    const now = new Date();
    if (autoShow(d, now)) { markSeen(now); setChip(true); }
  }, [d]);
  useEffect(() => {
    if (!chip) return;
    const t = setTimeout(() => setChip(false), 6000);
    return () => clearTimeout(t);
  }, [chip]);
  useEffect(() => {
    const on = () => { markSeen(new Date()); setChip(false); setOpen(true); };
    window.addEventListener(WRAPPED_EVENT, on);
    return () => window.removeEventListener(WRAPPED_EVENT, on);
  }, []);
  const w = useMemo(() => (open ? wrapped(d) : null), [d, open]);
  return (
    <>
      {chip && !open && (
        <div className="wrap-chip" role="status">
          <button type="button" onClick={openWrapped}>Your weekly Wrapped is ready</button>
          <button type="button" aria-label="Dismiss weekly Wrapped reminder" onClick={() => setChip(false)}>&times;</button>
        </div>
      )}
      {open && w && <Dialog w={w} close={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ w, close }: { w: NonNullable<ReturnType<typeof wrapped>>; close: () => void }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [from] = useState(() => document.activeElement as HTMLElement | null);
  const n = w.cards.length, c = w.cards[i];
  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".app"), prev = document.body.style.overflow;
    app?.setAttribute("inert", ""); document.body.style.overflow = "hidden"; box.current?.focus();
    const raf = requestAnimationFrame(() => { if (!box.current?.contains(document.activeElement)) box.current?.focus(); });   // the browser drops focus from the newly inert page one frame later
    return () => {
      cancelAnimationFrame(raf);
      app?.removeAttribute("inert"); document.body.style.overflow = prev;
      (from && from !== document.body && document.contains(from) ? from : document.getElementById("main"))?.focus?.();
    };
  }, [from]);
  useEffect(() => {   // a button that just became disabled (Next on the last card) drops focus: bring it back to the dialog
    const a = document.activeElement as HTMLButtonElement | null;
    if (!box.current?.contains(a) || a?.disabled || a === document.body) box.current?.focus();
  }, [i]);
  useEffect(() => {   // window listener: keys work wherever focus is while the dialog is open
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented || document.querySelector(".palette")) return;   // the palette's own Esc comes first
        e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, n - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
      else if (e.key === "Tab") {   // trap: cycle through the dialog's enabled buttons
        const bs = [...(box.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        if (!bs.length) return;
        const at = bs.indexOf(document.activeElement as HTMLButtonElement), next = e.shiftKey ? (at <= 0 ? bs.length - 1 : at - 1) : (at + 1) % bs.length;
        e.preventDefault(); bs[next].focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [n, close]);
  return createPortal(
    <div className="wrap-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="wrap" ref={box} role="dialog" aria-modal="true" aria-labelledby="wrap-t" tabIndex={-1}>
        <h2 id="wrap-t" className="wrap-t">Your week, {w.view.f.from} to {w.view.f.to}</h2>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{`Card ${i + 1} of ${n}: ${c.kicker}. ${c.big}. ${c.line}`}</div>
        <div key={c.id} className="wrap-card">
          <p className="wrap-k">{c.kicker}</p>
          <p className={`wrap-big${c.big.length > 18 ? " wrap-big-t" : ""}`}>{c.big}</p>
          <p className="wrap-l">{c.line}</p>
          {c.note && <p className="note">{c.note}</p>}
        </div>
        <div className="wrap-dots" aria-hidden="true">{w.cards.map((x, k) => <span key={x.id} data-on={k <= i ? "" : undefined} data-cur={k === i ? "" : undefined} />)}</div>
        <div className="wrap-nav">
          <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
          <button type="button" className="btn" disabled={i >= n - 1} onClick={() => setI(i + 1)}>Next</button>
          <button type="button" className="btn" onClick={close}>Close</button>
        </div>
      </div>
    </div>, document.body);
}
