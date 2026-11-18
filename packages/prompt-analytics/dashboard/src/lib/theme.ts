/** Hex palettes for the echarts-gl terrain (zrender cannot parse oklch or var()). Matte ATLAS shaded relief. */
type Stops = [number, string][];
export interface ReliefPal { ramp: Stops; off: Stops; zero: string; mark: string; pulse: string; sel: string; hover: string; frame: string; muted: string; axis: string; split: string; splitMini: string; tipBg: string; tipLine: string; tipInk: string; tipCss: string; light: { main: { intensity: number; alpha: number; beta: number; shadow: false }; ambient: { intensity: number } }; bevel: number }
export const RELIEF: ReliefPal = {
  ramp: [[0, "#dfe3c4"], [0.25, "#cdd2a1"], [0.5, "#d9c184"], [0.75, "#c99a5b"], [1, "#a8683a"]], off: [[0, "#e6dcc3"], [0.5, "#d3c7a8"], [1, "#bfb18d"]],
  zero: "#e9e1c9", mark: "#a83a26", pulse: "#c4533d", sel: "#a83a26", hover: "#2b2118", frame: "#2b2118", muted: "#62523f", axis: "#8f7a52", split: "#d8c9a6", splitMini: "#e6dcc3",
  tipBg: "#fbf6e9", tipLine: "#c9b78f", tipInk: "#2b2118", tipCss: "border-radius: 2px;",
  light: { main: { intensity: 0.55, alpha: 38, beta: -45, shadow: false }, ambient: { intensity: 0.62 } }, bevel: 0,
};
