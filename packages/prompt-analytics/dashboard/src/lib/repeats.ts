// Repeated prompts -> a draft Claude Code slash command. Pure; the scan before copying lives in secrets.ts.
import type { Repeat, SessionRow } from "../data/types";

/** "run the linter and fix every warning" -> "run-the-linter-and-fix". Lowercase, [a-z0-9-], at most 5 words, never empty. */
/** Cut a hyphenated name to 40 chars at a word boundary, never mid-word. */
const atWord = (t: string) => (t.length <= 40 ? t : t.slice(0, 40).replace(/-[^-]*$/, "")).replace(/-+$/, "");

export function slugOf(text: string): string {
  const words = text.toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return atWord(words.slice(0, 5).join("-")) || "repeated-prompt";
}

export interface Draft { path: string; text: string }

/** `.claude/commands/<slug>.md`: frontmatter description, then the exemplar followed by $ARGUMENTS. `slug` overrides the derived name. */
export function draftCommand(r: Pick<Repeat, "exemplar" | "count">, slug = slugOf(r.exemplar)): Draft {
  const body = r.exemplar.trim();
  const desc = body.length > 70 ? `${body.slice(0, 67).trimEnd()}...` : body;
  return { path: `.claude/commands/${slug}.md`, text: `---\ndescription: ${JSON.stringify(desc)}\n---\n\n${body}\n\n$ARGUMENTS\n` };
}

/** File-name part of a command: lowercase [a-z0-9-], never empty. */
export const cleanSlug = (s: string) => atWord(s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-")) || "repeated-prompt";

/** One slug per exemplar, unique within the list: a second "run-the-tests" becomes "run-the-tests-2". */
export function uniqueSlugs(exemplars: string[]): string[] {
  const seen = new Map<string, number>();
  return exemplars.map((e) => {
    const s = slugOf(e), n = (seen.get(s) ?? 0) + 1;
    seen.set(s, n);
    return n === 1 ? s : `${s}-${n}`;
  });
}

/** Tokens and (priced sessions only) dollars across the sessions where a prompt was repeated. cost is null when none of them is priced. */
export function repeatCost(ids: string[], byId: Map<string, Pick<SessionRow, "tokens" | "cost_usd">>): { tokens: number; cost: number | null; priced: number } {
  let tokens = 0, cost: number | null = null, priced = 0;
  for (const i of ids) { const r = byId.get(i); if (!r) continue; tokens += r.tokens; if (r.cost_usd !== null) { cost = (cost ?? 0) + r.cost_usd; priced++; } }
  return { tokens, cost, priced };
}

/** Repeats worth showing: the exemplar is non-empty and it spans at least one known session. Strongest first; each repeat's sessions newest first when `dates` is given. */
export const shownRepeats = (rs: Repeat[] | undefined, known: Set<string>, dates?: Map<string, string>): Repeat[] =>
  (rs ?? []).map((r) => ({ ...r, sessions: r.sessions.filter((s) => known.has(s)).sort((a, b) => (dates ? (dates.get(b) ?? "").localeCompare(dates.get(a) ?? "") : 0)) }))
    .filter((r) => r.sessions.length > 0).sort((a, b) => b.count - a.count || a.exemplar.localeCompare(b.exemplar));
