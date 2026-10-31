import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface Size { w: number; h: number }

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

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/** Runs `loop(t)` via rAF only while the element is on screen and the tab is visible. */
export function useVisibleLoop(ref: RefObject<HTMLElement | null>, loop: (t: number) => void, enabled: boolean) {
  const fn = useRef(loop);
  fn.current = loop;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let raf = 0, inView = false;
    const tick = (t: number) => { fn.current(t); raf = requestAnimationFrame(tick); };
    const sync = () => {
      const run = inView && !document.hidden;
      if (run && !raf) raf = requestAnimationFrame(tick);
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); cancelAnimationFrame(raf); };
  }, [ref, enabled]);
}
