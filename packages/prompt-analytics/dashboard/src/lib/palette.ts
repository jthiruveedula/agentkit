// Labels and CSS-variable handles. Colour values live only in styles.css (OKLCH, light + dark);
// canvas code resolves them at draw time with `cssVar`. Contrast is checked by scripts/contrast.mjs.
import type { Source } from "../data/types";

export const SOURCE_LABEL: Record<Source, string> = {
  claude_code: "Claude Code", copilot: "Copilot", cursor: "Cursor", opencode: "OpenCode", antigravity: "Antigravity",
};
export const SOURCES = Object.keys(SOURCE_LABEL) as Source[];
export const srcColor = (s: string) => `var(--src-${s in SOURCE_LABEL ? s : "other"})`;
export const srcLabel = (s: string) => SOURCE_LABEL[s as Source] ?? s;
/** Topic colours for the scatter and treemap. */
export const TOPIC_VARS = ["--t0", "--t1", "--t2", "--t3", "--t4", "--t5", "--t6", "--t7"];
export const cssVar = (name: string, el: Element = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
