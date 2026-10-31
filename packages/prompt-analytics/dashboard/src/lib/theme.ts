import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "pa-theme";
const sys = (): Theme => (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** A stored choice wins; otherwise follow the system (light when unknown). Storage can throw (privacy mode, file://). */
export function readTheme(): Theme {
  try { const s = localStorage.getItem(KEY); if (s === "light" || s === "dark") return s; } catch { /* ignore */ }
  return sys();
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#F6F9FB" : "#081520");
}
export function useTheme(): [Theme, () => void] {
  const [t, setT] = useState<Theme>(readTheme);
  useLayoutEffect(() => { applyTheme(t); }, [t]);
  useEffect(() => {   // follow the system until the user picks one
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(prefers-color-scheme: dark)");
    const on = () => { try { if (localStorage.getItem(KEY)) return; } catch { /* ignore */ } setT(sys()); };
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const toggle = useCallback(() => setT((c) => {
    const n = c === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, n); } catch { /* ignore */ }
    return n;
  }), []);
  return [t, toggle];
}

/** True when the user asked for reduced motion; follows live changes. */
export function useReducedMotion(): boolean {
  const q = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [r, setR] = useState(q);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}
