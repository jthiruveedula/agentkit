import { useLayoutEffect, useRef, useState, type KeyboardEvent as RKE, type RefObject } from "react";

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
