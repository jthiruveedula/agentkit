// Single source of colour truth for JS (canvas/d3). CSS tokens in styles.css mirror these.
// Validated by scripts/contrast.mjs (reads this file).
import type { Source } from "../data/types";

export const BG = "#0b0d12";
export const SURFACE = "#11141b";
export const TEXT = "#e8eaf0";
export const MUTED = "#9aa1b2";
export const GRID = "#5f6a82"; // outlines for empty/low cells, axis lines (>= 3:1 on BG)
export const CAT = ["#5ea8ff", "#ff8a65", "#4fd1a5", "#e6b84a", "#b794f6", "#f272a8", "#8fd14f", "#8aa0b8"];
export const SEQ = ["#1a2236", "#243b6b", "#3668b4", "#4a8fd6", "#7cc4f0", "#d4f1ff"];
export const HELPS = "#4fd1a5";
export const HURTS = "#f272a8";

export const SOURCE_COLOR: Record<Source, string> = {
  claude_code: "#ff8a65",
  copilot: "#5ea8ff",
  cursor: "#b794f6",
  opencode: "#4fd1a5",
  antigravity: "#e6b84a",
};
export const SOURCE_LABEL: Record<Source, string> = {
  claude_code: "Claude Code",
  copilot: "Copilot",
  cursor: "Cursor",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};
export const SOURCES = Object.keys(SOURCE_COLOR) as Source[];
export const srcColor = (s: string) => SOURCE_COLOR[s as Source] ?? "#8aa0b8";
export const srcLabel = (s: string) => SOURCE_LABEL[s as Source] ?? s;
