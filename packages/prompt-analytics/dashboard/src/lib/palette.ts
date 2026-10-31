// Labels and CSS-variable handles. Colour values live only in styles.css (OKLCH, light + dark);
// canvas code resolves them at draw time with `cssVar`. Contrast is checked by scripts/contrast.mjs.
import type { Intent, Source } from "../data/types";

export const SOURCE_LABEL: Record<Source, string> = {
  claude_code: "Claude Code", copilot: "Copilot", cursor: "Cursor", opencode: "OpenCode", antigravity: "Antigravity",
};
export const SOURCES = Object.keys(SOURCE_LABEL) as Source[];
export const srcColor = (s: string) => `var(--src-${s in SOURCE_LABEL ? s : "other"})`;
export const srcLabel = (s: string) => SOURCE_LABEL[s as Source] ?? s;
/** One colour per intent (topic bars); always printed next to its text label. */
const INTENT_VAR: Record<string, string> = { bugfix: "t0", feature: "t1", refactor: "t2", explain: "t3", test: "t4", docs: "t5", devops: "t6", data: "t8", other: "t7" };
export const intentColor = (i: string) => `var(--${INTENT_VAR[i] ?? "t7"})`;
export const cssVar = (name: string, el: Element = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

export const INTENTS: Intent[] = ["bugfix", "feature", "refactor", "explain", "test", "docs", "devops", "data", "other"];
