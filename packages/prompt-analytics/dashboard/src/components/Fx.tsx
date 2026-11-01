// Pointer micro-interactions, all event-driven and delegated from one place: KPI-card tilt (max 3 degrees, mouse only, never over a plot,
// measured from the untransformed box, reset on scroll), press ripple, and the aria-live line for linked hover (keyboard focus only, debounced).
// Chart cards only lift (CSS). Nothing runs under reduced motion (html.fx absent, also when the preference flips at runtime) or on touch, and nothing loops.
import { useEffect, useState, useSyncExternalStore } from "react";
import { fxOn, ripple, setFx } from "../lib/hooks";
import { linkDispatch, linkGet, linkLabel, linkRetag, linkSubscribe, linkViaKb, type Ent } from "../lib/motion";
import { srcLabel } from "../lib/palette";
import { fmtDate } from "../lib/format";
import { useStore } from "../state";

const MAX = 3, RIPPLE = ".btn, .kpi, .bar-row, .wh-b, .seg button, button.col, .mini-h", PLOT = ".tr, .cols, .lb, .mm, .cal-stage, .river, .strips, .map";
const SAY_MS = 400;
export function tiltOf(px: number, py: number, max = MAX) {   // px, py in 0..1 across the card
  const c = (n: number) => Math.min(max, Math.max(-max, n));
  return { rx: c((0.5 - py) * 2 * max), ry: c((px - 0.5) * 2 * max) };
}
const entName = (e: Ent) => (e.startsWith("week:") ? `the week of ${fmtDate(e.slice(5))}` : srcLabel(e.slice(5) as never));

export function FxHost() {
  const ent = useSyncExternalStore(linkSubscribe, linkGet, linkGet);
  const { f } = useStore();
  const [say, setSay] = useState("");
  // a filter change rebuilds the charts: drop the highlight so nothing stays dimmed on marks that no longer match the pointer
  useEffect(() => { linkDispatch({ t: "clear" }); }, [f]);
  // announce only for keyboard focus, and only once it settles (a hover sweep never talks)
  useEffect(() => {
    if (!ent || !linkViaKb()) { setSay(""); return; }
    const t = setTimeout(() => setSay(linkLabel(ent, entName)), SAY_MS);
    return () => clearTimeout(t);
  }, [ent]);
  // marks that mount while a highlight is active (a re-render, a lifted "+N more") get tagged too
  useEffect(() => {
    if (!ent || typeof MutationObserver === "undefined") return;
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(linkRetag); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [ent]);
  // motion on/off follows the OS preference live
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)"), on = () => setFx(!mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  useEffect(() => {
    let cur: HTMLElement | null = null, rect: DOMRect | null = null, raf = 0, last: PointerEvent | null = null;
    const reset = () => { if (cur) { cur.removeAttribute("data-tilt"); cur.style.removeProperty("--rx"); cur.style.removeProperty("--ry"); } cur = null; rect = null; };
    const frame = () => {
      raf = 0; const e = last; if (!e || !fxOn()) return;
      const t = e.target as Element | null, kpi = t?.closest?.<HTMLElement>(".kpi") ?? null;
      if (!kpi || t?.closest?.(PLOT)) { reset(); return; }
      if (kpi !== cur) { reset(); cur = kpi; rect = kpi.getBoundingClientRect(); }   // measured before any transform is applied, so tilt never feeds back into its own geometry
      const r = rect as DOMRect, o = tiltOf((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      kpi.setAttribute("data-tilt", ""); kpi.style.setProperty("--rx", `${o.rx.toFixed(2)}deg`); kpi.style.setProperty("--ry", `${o.ry.toFixed(2)}deg`);
    };
    const move = (e: PointerEvent) => { if (!fxOn() || e.pointerType !== "mouse" || e.buttons) { reset(); return; } last = e; if (!raf) raf = requestAnimationFrame(frame); };
    const down = (e: PointerEvent) => { if (!fxOn()) return; const t = (e.target as Element).closest(RIPPLE); if (t && !(t as HTMLButtonElement).disabled) ripple(t, e.clientX, e.clientY); };
    const out = (e: PointerEvent) => { if (!e.relatedTarget) reset(); };
    const scroll = () => reset();
    document.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerdown", down, { passive: true }); document.addEventListener("pointerout", out);
    addEventListener("scroll", scroll, { passive: true, capture: true });
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerdown", down); document.removeEventListener("pointerout", out); removeEventListener("scroll", scroll, true); cancelAnimationFrame(raf); reset(); };
  }, []);
  return <p className="sr-only" role="status" aria-live="polite">{say}</p>;
}
