import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

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

/** Re-renders when the user flips light/dark so canvas code can re-read CSS variables. */
export function useScheme(): string {
  const [s, setS] = useState(() => (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setS(m.matches ? "dark" : "light");
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return s;
}
