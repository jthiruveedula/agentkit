import { useSyncExternalStore } from "react";

/** Presentation theme: Classic (default, no attribute) or the opt-in ATLAS map-paper look (`data-theme="atlas"` on <html>).
 *  Presentation only: every chart reads the same data; canvas charts read `useTheme()` to pick their hex ramps. */
export type Theme = "classic" | "atlas";
const KEY = "pa.theme";
const subs = new Set<() => void>();

export function loadTheme(): Theme {
  try { return localStorage.getItem(KEY) === "atlas" ? "atlas" : "classic"; } catch { return "classic"; }
}
export function getTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "atlas" ? "atlas" : "classic";
}
export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  if (t === "atlas") document.documentElement.dataset.theme = "atlas"; else delete document.documentElement.dataset.theme;
  subs.forEach((f) => f());
}
export function setTheme(t: Theme) {
  applyTheme(t);
  try { localStorage.setItem(KEY, t); } catch { /* private mode: lasts this visit */ }
}
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useTheme = () => useSyncExternalStore(sub, getTheme, () => "classic" as Theme);
