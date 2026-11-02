import type { SessionRow } from "../data/types";
// Model tiers, provider-neutral: Small / Mid / Top. Pure; the user can override the map later.
export type Tier = 0 | 1 | 2;
export const TIERS = ["Small", "Mid", "Top"] as const;

// Order matters: first match wins, so the more specific names come first.
const RULES: [RegExp, Tier][] = [
  [/haiku|flash-?lite|nano|[-_ ]mini|small|gemma/i, 0],
  [/flash/i, 0],
  [/opus|ultra|(?:^|[-/_ ])o[13](?![a-z0-9]|-mini)|gpt-?5(?!.*mini)(?!.*nano)\.?\d*-?pro|gemini.*pro.*(deep|ultra)/i, 2],
  [/sonnet|gemini.*pro|gpt-?4o?(?!.*mini)|gpt-?5|codex|grok|deepseek|qwen|llama/i, 1],
];

/** Tier for a model id, or null when the id is missing or unknown. */
export function tierOf(model?: string | null): Tier | null {
  if (!model) return null;
  for (const [re, t] of RULES) if (re.test(model)) return t;
  return null;
}

// ---- Task size vs model tier ("Model fit"). Heuristic estimates, not ML, and not a quality judgement. ----
export type Size = 0 | 1 | 2;
export const SIZES = ["Light", "Mid", "Heavy"] as const;

/** Heuristic task size from what the session cost the user: Light = short and clean (<= 3 prompts, < 20k tokens, < 2 loops);
 *  Heavy = at least two of (>= 10 prompts, >= 60k tokens, >= 3 loops); everything else Mid. Thresholds are rough
 *  terciles of typical exports; a size is an estimate of effort, never a statement that a model was "wrong". */
export function taskSize(s: Pick<SessionRow, "prompts" | "tokens" | "loops">): Size {
  if (s.prompts <= 3 && s.tokens < 20_000 && s.loops < 2) return 0;
  const heavy = (s.prompts >= 10 ? 1 : 0) + (s.tokens >= 60_000 ? 1 : 0) + (s.loops >= 3 ? 1 : 0);
  return heavy >= 2 ? 2 : 1;
}

export interface Fit { m: number[][]; n: number; right: number; over: number; under: number }

/** 3x3 counts, rows = task size, columns = model tier, over sessions with a prompt and a known tier. */
export function fitMatrix(sessions: SessionRow[]): Fit {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let right = 0, over = 0, under = 0, n = 0;
  for (const s of sessions) {
    const t = tierOf(s.model);
    if (s.prompts <= 0 || t === null) continue;
    const z = taskSize(s);
    m[z][t]++; n++;
    if (t === z) right++; else if (t > z) over++; else under++;
  }
  return { m, n, right, over, under };
}

const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y), h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };

/** Lower-bound USD saved if oversized priced sessions had run one tier down at that tier's median cost per token
 *  (from the same data). Sessions whose lower tier has no priced sample are skipped. null when nothing can be estimated. */
export function estSaving(sessions: SessionRow[]): number | null {
  const per: number[][] = [[], [], []];
  for (const s of sessions) {
    const t = tierOf(s.model);
    if (t !== null && s.cost_usd !== null && s.tokens > 0) per[t].push(s.cost_usd / s.tokens);
  }
  const med = per.map((x) => (x.length ? median(x) : null));
  let total = 0, any = false;
  for (const s of sessions) {
    const t = tierOf(s.model);
    if (t === null || t === 0 || s.prompts <= 0 || s.cost_usd === null || s.tokens <= 0 || t <= taskSize(s)) continue;
    const lower = med[t - 1];
    if (lower === null) continue;
    any = true;
    total += Math.max(0, s.cost_usd - lower * s.tokens);
  }
  return any ? total : null;
}
