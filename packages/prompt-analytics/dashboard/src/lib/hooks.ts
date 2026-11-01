import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKE, type RefObject } from "react";

export interface Size { w: number; h: number }

/** Roving tabindex for charts with many marks: one tab stop, arrows move between `[data-m]` marks.
 *  `start` is the first tab stop (pick a mark that exists). `h`/`v` are the index steps for Left/Right and Up/Down (a calendar uses h=7, v=1). */
export function useRoving(n: number, h = 1, v = 1, start = 0) {
  const [cur, setCur] = useState(start);
  const ref = useRef<HTMLElement | null>(null);
  const onKeyDown = (e: RKE<HTMLElement>) => {
    const step = e.key === "ArrowRight" ? h : e.key === "ArrowLeft" ? -h : e.key === "ArrowDown" ? v : e.key === "ArrowUp" ? -v : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : step ? Math.min(n - 1, Math.max(0, cur + step)) : -1;
    if (to < 0) return;
    const t = ref.current?.querySelector<HTMLElement>(`[data-m="${to}"]`);
    if (!t) return;   // a gap in the grid: stay put so the tab stop is never lost
    e.preventDefault(); setCur(to); t.focus();
  };
  const mark = (i: number) => ({ "data-m": i, tabIndex: i === Math.min(cur, n - 1) ? 0 : -1, onFocus: () => setCur(i) });
  return { group: { ref: ref as never, onKeyDown }, mark };
}

/** Enter / Space activate a non-button mark the same way a click does. */
export const press = (fn: () => void) => ({
  onClick: fn,
  onKeyDown: (e: RKE) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); fn(); } },
});

/** Measures an element once synchronously, then follows ResizeObserver (rAF-batched). */
export function useSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(read); });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ref]);
  return size;
}

// ---- motion -------------------------------------------------------------------------------------------------
// One IntersectionObserver reveals each `.sec` once (`data-in`); CSS keyframes wait (paused) until then. `html.fx` is only set
// when motion is allowed and real browser APIs exist, so jsdom and reduced-motion users see final values at once.
const waiting = new WeakMap<Element, Set<() => void>>();
export const fxOn = () => typeof document !== "undefined" && document.documentElement.classList.contains("fx");
export const reducedNow = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run `fn` once the section holding `el` has scrolled into view (never when motion is off: the final state is already shown). */
export function onReveal(el: Element | null, fn: () => void): () => void {
  const sec = el?.closest(".sec");
  if (!sec || !fxOn()) return () => {};
  if (sec.hasAttribute("data-in")) { fn(); return () => {}; }
  const set = waiting.get(sec) ?? new Set<() => void>();
  set.add(fn); waiting.set(sec, set);
  return () => { set.delete(fn); };
}

/** Pointer tilt for `.card` / `.kpi` (mouse only): sets --rx/--ry/--gx/--gy; flat over interactive marks so hit targets stay put. */
function tilt() {
  let cur: HTMLElement | null = null, raf = 0, ev: PointerEvent | null = null;
  const release = (el: HTMLElement) => {
    el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg");
    window.setTimeout(() => { if (el !== cur) el.removeAttribute("data-tilt"); }, 500);
  };
  const apply = () => {
    raf = 0; const e = ev; if (!e) return;
    const t = e.target as Element | null, el = (t?.closest?.(".card, .kpi") ?? null) as HTMLElement | null;
    if (el !== cur) { if (cur) release(cur); cur = el; }
    if (!el || !t) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const kpi = el.classList.contains("kpi"), max = kpi ? 7 : 4;
    const flat = !kpi && !!t.closest("button, [role=button], select, input, a, .cell, .cal-stage, .hit, .band, .dot, .bar-row, .col, .fr, .mm");
    el.setAttribute("data-tilt", "");
    el.style.setProperty("--rx", `${flat ? 0 : (0.5 - py) * 2 * max}deg`);
    el.style.setProperty("--ry", `${flat ? 0 : (px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--gx", `${px * 100}%`); el.style.setProperty("--gy", `${py * 100}%`);
  };
  const move = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; ev = e; if (!raf) raf = requestAnimationFrame(apply); };
  const out = (e: PointerEvent) => { if (!e.relatedTarget && cur) { release(cur); cur = null; } };
  document.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerout", out);
  return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerout", out); cancelAnimationFrame(raf); };
}

export function useReveal() {
  useEffect(() => {
    const real = typeof IntersectionObserver !== "undefined" && typeof matchMedia === "function" && !/jsdom/i.test(navigator.userAgent);
    if (!real || reducedNow()) return;
    document.documentElement.classList.add("fx");
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-in", ""); io.unobserve(e.target);
        waiting.get(e.target)?.forEach((fn) => fn()); waiting.delete(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".sec").forEach((s) => io.observe(s));
    const stop = tilt();
    return () => { io.disconnect(); stop(); document.documentElement.classList.remove("fx"); };
  }, []);
}

/** Eases a numeric array toward its target (~380 ms) so charts morph instead of snapping; snaps when motion is off or the length changes. */
export function useMorph(target: number[], ms = 380): number[] {
  const [v, setV] = useState(target);
  const cur = useRef(target), first = useRef(true), key = target.join(",");
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const to = target, from = cur.current;
    if (!fxOn() || to.length !== from.length) { cur.current = to; setV(to); return; }
    const t0 = performance.now(); let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - (1 - p) ** 3;
      const out = p < 1 ? to.map((x, i) => from[i] + (x - from[i]) * e) : to;
      cur.current = out; setV(out); if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps
  return !fxOn() || v.length !== target.length ? target : v;
}
