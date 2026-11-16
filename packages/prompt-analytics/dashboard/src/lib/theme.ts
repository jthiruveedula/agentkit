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

/** Hex palettes for the echarts-gl terrain (zrender cannot parse oklch or var()). Classic = the signed-off blue; ATLAS = matte shaded relief. */
type Stops = [number, string][];
export interface ReliefPal { ramp: Stops; off: Stops; zero: string; mark: string; pulse: string; sel: string; hover: string; frame: string; muted: string; axis: string; split: string; splitMini: string; tipBg: string; tipLine: string; tipInk: string; tipCss: string; light: { main: { intensity: number; alpha: number; beta: number; shadow: false }; ambient: { intensity: number } }; bevel: number }
export const RELIEF: Record<Theme, ReliefPal> = {
  classic: {
    ramp: [[0, "#d2dff5"], [0.25, "#b3caf1"], [0.5, "#95b5ec"], [0.75, "#789fe7"], [1, "#5b8ae1"]], off: [[0, "#e1e4e8"], [0.5, "#c8cbd0"], [1, "#b0b4b9"]],
    zero: "#dde7f7", mark: "#f5af20", pulse: "#ffc94d", sel: "#1957d2", hover: "#003db7", frame: "#1957d2", muted: "#575e69", axis: "#b9bec6", split: "#dadee3", splitMini: "#eceff2",
    tipBg: "rgba(255,255,255,0.85)", tipLine: "#dadee3", tipInk: "#11161f", tipCss: "backdrop-filter: blur(12px) saturate(1.4); box-shadow: 0 8px 24px -12px rgba(40,55,90,0.35); border-radius: 12px;",
    light: { main: { intensity: 0.7, alpha: 50, beta: 30, shadow: false }, ambient: { intensity: 0.45 } }, bevel: 0.15,
  },
  atlas: {
    ramp: [[0, "#dfe3c4"], [0.25, "#cdd2a1"], [0.5, "#d9c184"], [0.75, "#c99a5b"], [1, "#a8683a"]], off: [[0, "#e6dcc3"], [0.5, "#d3c7a8"], [1, "#bfb18d"]],
    zero: "#e9e1c9", mark: "#a83a26", pulse: "#c4533d", sel: "#2e4a7a", hover: "#1b2c4d", frame: "#2b2118", muted: "#62523f", axis: "#8f7a52", split: "#d8c9a6", splitMini: "#e6dcc3",
    tipBg: "#fbf6e9", tipLine: "#c9b78f", tipInk: "#2b2118", tipCss: "border-radius: 2px;",
    light: { main: { intensity: 0.55, alpha: 38, beta: -45, shadow: false }, ambient: { intensity: 0.62 } }, bevel: 0,
  },
};
