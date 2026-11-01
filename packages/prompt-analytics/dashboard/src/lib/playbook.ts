// Prompt playbook: turn the what-works effect tests into at most 5 "do more" and 5 "do less" cards.
// Every tested row gets a p-value (normal approximation from its 95% CI); Benjamini-Hochberg at q = 0.10 across all
// tests run (untested / unshipped ones count as p = 1) decides which survive, and a card also needs its CI clear of 0. Pure, no DOM.
import type { DashboardData, SessionRow } from "../data/types";

type Row = DashboardData["what_works"][number];
type Cluster = DashboardData["galaxy"]["clusters"][number];

import { FDR_Q } from "./thresholds";
export { FDR_Q };

export interface Play {
  key: string; feature: string; cluster: number; scope: string | null;
  /** "SQL migrations: state constraints" — scope first, then the action. */
  title: string;
  /** Effect on success rate in percentage points, with its 95% CI. */
  pts: number; lo: number; hi: number; n: number; p: number; pass: boolean;
  dir: "more" | "less"; line: string;
  /** The sign runs against common prompting advice: show "correlation, not cause". */
  counter: boolean;
  /** Do-more only: an already-redacted prompt from this topic that has the feature (<= 160 chars), or null. */
  snippet: string | null;
}

/** +1 = usually advised, -1 = usually discouraged. Unknown features get no counter-intuitive note. */
const EXPECT: Record<string, 1 | -1> = {
  "explicit constraints": 1, "acceptance criteria": 1, "file references": 1, "error message pasted": 1, "code block included": 1,
  "vague verbs": -1, "very short prompt": -1, "no context given": -1,
};
// [short do-more, short do-less, do-more line, do-less line]
const LINE: Record<string, [string, string, string, string]> = {
  "explicit constraints": ["state constraints", "drop extra constraints", "State the constraints up front (versions, limits, what not to touch).", "Drop constraints that do not change the answer."],
  "acceptance criteria": ["say how to check it", "skip long checklists", "Say how you will check the result.", "Skip long acceptance checklists here; ask for the change first."],
  "file references": ["name the files", "stop listing files", "Name the files and paths involved.", "Stop listing files the tool can already see."],
  "error message pasted": ["paste the error", "trim pasted errors", "Paste the exact error message.", "Trim pasted errors to the relevant lines."],
  "code block included": ["include the code", "point, don't paste code", "Include the code you mean.", "Point at the code instead of pasting large blocks."],
  "vague verbs": ["keep the ask open", "replace vague verbs", "Keep the ask open when you want options.", "Replace vague verbs (fix, improve, handle) with the exact change."],
  "very short prompt": ["keep it short", "add a line of context", "Keep prompts this short for these tasks.", "Add a sentence of context to short prompts."],
  "no context given": ["skip the background", "give one line of context", "Skip background the tool does not need.", "Give one line of context before the ask."],
};
/** Does a (redacted) prompt show the feature? Unknown features never match, so no example is offered. */
const HAS: Record<string, (t: string) => boolean> = {
  "explicit constraints": (t) => /\b(must|only|without|don't|do not|never|keep|limit|max|at most|version)\b/i.test(t),
  "acceptance criteria": (t) => /\b(should|so that|until|expect|passes|pass|verify|check that)\b/i.test(t),
  "file references": (t) => /\[path\]|\b[\w-]+\.(ts|tsx|js|py|go|rs|sql|md|json|ya?ml|css|html)\b|\w\/\w/i.test(t),
  "error message pasted": (t) => /\b(error|exception|traceback|failed|failing|stack)\b/i.test(t),
  "code block included": (t) => /```|`[^`]+`/.test(t),
  "vague verbs": (t) => /\b(fix|improve|handle|clean up|make it work|sort out)\b/i.test(t),
  "very short prompt": (t) => t.trim().length > 0 && t.trim().length < 40,
  "no context given": (t) => t.trim().split(/\s+/).length <= 6,
};
export const hasFeature = (text: string, feature: string) => !!HAS[feature.toLowerCase()]?.(text);

/** CI strictly on one side of zero. */
export const clearOfZero = (r: Pick<Row, "ci">) => r.ci[0] > 0 || r.ci[1] < 0;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
/** Two-sided p-value from an effect and its 95% CI (SE = width / 3.92). */
export function pValue(r: Pick<Row, "effect" | "ci">): number {
  const se = (r.ci[1] - r.ci[0]) / (2 * 1.96);
  if (!(se > 0)) return r.effect === 0 ? 1 : 0;
  return Math.min(1, 2 * (1 - phi(Math.abs(r.effect) / se)));
}
/** Benjamini-Hochberg: which of `ps` pass at FDR q, out of `m` tests in total (m >= ps.length; the rest count as p = 1). */
export function bh(ps: number[], q = FDR_Q, m = ps.length): boolean[] {
  const M = Math.max(m, ps.length), order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  let k = -1;
  order.forEach(([p], r) => { if (p <= ((r + 1) / M) * q) k = r; });
  const out = ps.map(() => false);
  for (let r = 0; r <= k; r++) out[order[r][1]] = true;
  return out;
}

export interface Book { more: Play[]; less: Play[]; all: Play[]; tested: number; pass: number }

export function playbook(rows: Row[], clusters: Cluster[], tested = rows.length, sessions: SessionRow[] = [], k = 5): Book {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const ps = rows.map(pValue), ok = bh(ps, FDR_Q, tested);
  const all = rows.map((r, i): Play => {
    const c = byId.get(r.cluster), dir = r.effect > 0 ? "more" : "less", f = r.feature.toLowerCase(), exp = EXPECT[f], L = LINE[f];
    const scope = c && r.cluster >= 0 ? c.label : null;
    const short = L ? L[dir === "more" ? 0 : 1] : `${dir === "more" ? "more" : "less"} ${r.feature}`;
    // exemplar first, then applied sessions in the topic; only a prompt that actually shows the feature is offered
    const pool = dir === "more" ? [c?.exemplar ?? "", ...sessions.filter((s) => s.cluster === r.cluster && s.applied).map((s) => s.title)] : [];
    const ex = pool.find((t) => t && hasFeature(t, f));
    return {
      key: `${r.cluster}:${r.feature}`, feature: r.feature, cluster: r.cluster, scope, title: scope ? `${scope}: ${short}` : short[0].toUpperCase() + short.slice(1),
      pts: r.effect * 100, lo: r.ci[0] * 100, hi: r.ci[1] * 100, n: r.n, p: ps[i], pass: ok[i], dir,
      line: L ? L[dir === "more" ? 2 : 3] : dir === "more" ? `Use ${r.feature} more often.` : `Use ${r.feature} less often.`,
      counter: exp !== undefined && Math.sign(r.effect) !== exp, snippet: ex ? ex.slice(0, 160) : null,
    };
  }).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts) || b.n - a.n);
  const cards = all.filter((p) => p.pass && (p.lo > 0 || p.hi < 0));
  return { more: cards.filter((p) => p.dir === "more").slice(0, k), less: cards.filter((p) => p.dir === "less").slice(0, k), all, tested: Math.max(tested, rows.length), pass: ok.filter(Boolean).length };
}

/** Fewer sessions than this in view: the playbook still shows (it is all-sessions evidence) but says the view is too thin to re-check. */
import { PLAYBOOK_MIN_SESSIONS } from "./thresholds";
export { PLAYBOOK_MIN_SESSIONS };
