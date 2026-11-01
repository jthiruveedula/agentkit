// Pure motion math plus the shared hover ("linked brushing") store. No React: charts publish the entity under the pointer or focus,
// one DOM pass tags every mark carrying `data-e` (`data-hl` = same entity, `data-dim` = another entity of the same kind). No per-frame state.
export const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
export const easeOut = (p: number) => 1 - (1 - clamp01(p)) ** 3;
/** Delay (ms) of the i-th mark in a staggered reveal; the cap keeps long lists from waiting. */
export const staggerDelay = (i: number, step = 60, cap = 480) => Math.min(Math.max(0, i) * step, cap);

export type Ent = `tool:${string}` | `week:${string}`;
export type LinkState = Ent | null;
export type LinkAct = { t: "enter"; e: Ent; kb?: boolean } | { t: "leave"; e: Ent } | { t: "clear" };
/** A leave only clears when it names the current entity, so a late leave from the mark just left never erases the new one. */
export function linkReducer(s: LinkState, a: LinkAct): LinkState {
  return a.t === "enter" ? a.e : a.t === "clear" ? null : s === a.e ? null : s;
}
export const linkKind = (e: Ent) => e.slice(0, e.indexOf(":"));
/** What `data-e` marks should show for `active`: highlighted (same entity), dimmed (same kind, other entity), or untouched. */
export const linkMark = (active: LinkState, e: string): "hl" | "dim" | null =>
  !active ? null : e === active ? "hl" : e.startsWith(`${linkKind(active)}:`) ? "dim" : null;

/** Rects for the bar view of a series, from the same y positions the line uses (so bars and line agree). `bw` is the bar width. */
export function barRects(ys: number[], x: (i: number) => number, base: number, bw: number) {
  return ys.map((y, i) => ({ x: x(i) - bw / 2, y: Math.min(y, base), w: bw, h: Math.max(0, base - y) }));
}

let state: LinkState = null, viaKb = false;
const subs = new Set<() => void>();
const tag = () => {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll<HTMLElement>("[data-e]")) {
    const m = linkMark(state, el.dataset.e ?? "");
    if (m === "hl") { el.setAttribute("data-hl", ""); el.removeAttribute("data-dim"); }
    else if (m === "dim") { el.setAttribute("data-dim", ""); el.removeAttribute("data-hl"); }
    else { el.removeAttribute("data-hl"); el.removeAttribute("data-dim"); }
  }
};
export function linkDispatch(a: LinkAct) {
  const next = linkReducer(state, a);
  if (next === state) return;
  state = next; viaKb = state !== null && a.t === "enter" && !!a.kb;
  tag();
  subs.forEach((f) => f());
}
/** Marks that mounted after the last dispatch (a re-render under an active highlight) get tagged again. */
export const linkRetag = () => { if (state) tag(); };
/** True when the active entity came from keyboard focus: only then is it announced to screen readers. */
export const linkViaKb = () => viaKb;
export const linkSubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const linkGet = () => state;
/** Keyboard focus (focus-visible), not a mouse or touch click. Unknown targets count as keyboard so a bare call still works. */
const kbFocus = (t: unknown) => { try { return !!(t as Element | undefined)?.matches?.(":focus-visible") || !(t as Element | undefined)?.matches; } catch { return true; } };
/** Spread on a mark (or a `<g>` around it): a MOUSE hover or keyboard focus publishes the entity (touch and pen never do).
 *  React's focus and pointer-over events bubble, so a wrapper works. */
export const linkProps = (e: Ent) => ({
  "data-e": e,
  onPointerOver: (ev?: { pointerType?: string }) => { if (!ev?.pointerType || ev.pointerType === "mouse") linkDispatch({ t: "enter", e }); },
  onPointerOut: (ev?: { pointerType?: string }) => { if (!ev?.pointerType || ev.pointerType === "mouse") linkDispatch({ t: "leave", e }); },
  onFocus: (ev?: { target?: unknown }) => { if (kbFocus(ev?.target)) linkDispatch({ t: "enter", e, kb: true }); },
  onBlur: () => linkDispatch({ t: "leave", e }),
});
export const linkLabel = (e: LinkState, name: (e: Ent) => string) => (e ? `Highlighting ${name(e)} in every chart` : "");
