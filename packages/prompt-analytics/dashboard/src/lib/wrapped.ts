// Weekly Wrapped: up to six cards about the last 7 days of the export. Pure; numbers come from the same views,
// capabilities and helpers as the Markdown summary (lib/summary.ts), so the two never disagree for one window.
// Reads aggregates only: never session titles or exposure previews. The one prompt shown is a redacted cluster exemplar.
import type { DashboardData } from "../data/types";
import { addDays, views, type Filter } from "./filter";
import { priorViews, windowOf, wilson } from "./compare";
import { capabilities, MIN_DAYS } from "./capabilities";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "./format";
import { costParts, tokensChg, type SummaryView } from "./summary";
import { findSecrets } from "./secrets";
import { hasHabitData, missingHabits } from "./habits";
import { playbook } from "./playbook";

import { WRAP_MIN_SESSIONS } from "./thresholds";
export { WRAP_MIN_SESSIONS };
export const WRAP_DAYS = 7;
export const WRAP_KEY = "pa.wrapped.week";

export interface WrapCard { id: "week" | "streak" | "intent" | "spend" | "prompt" | "habit"; kicker: string; big: string; line: string; note?: string }
export interface Wrap { view: SummaryView; cards: WrapCard[] }

const lastDate = (d: DashboardData) => d.range.end || d.sessions.reduce((m, r) => (r.date > m ? r.date : m), "");

/** The same SummaryView the Markdown summary takes, for the 7 days ending at the newest data. */
export function wrapView(d: DashboardData): SummaryView | null {
  const end = lastDate(d);
  if (!end) return null;
  const f: Filter = { from: addDays(end, -(WRAP_DAYS - 1)), to: end };
  const v = views(d, f), prior = priorViews(d, f, "prev");
  return { f, v, win: windowOf(d, f), caps: capabilities(d, v), prior, cmp: "prev" };
}

/** null = not offered: empty export, under MIN_DAYS of use, or fewer than 5 sessions in the week. */
export function wrapped(d: DashboardData): Wrap | null {
  const view = wrapView(d);
  if (!view || view.caps.empty || view.v.legacy) return null;
  const { v, caps, prior } = view, t = v.totals, p = prior?.v.totals, pn = p?.sessions ?? 0;
  if (t.sessions < WRAP_MIN_SESSIONS || capabilities(d, views(d, {})).days < MIN_DAYS) return null;
  const scope = caps.multiTool ? `across ${caps.names}` : `${caps.names} only`;
  const cards: WrapCard[] = [];

  const wkd = pn >= 5 ? (t.sessions - pn) / pn : null;
  const cost = caps.hasCost && t.cost !== null ? ` ${fmtUSD(t.cost)} spent.` : "";
  cards.push({ id: "week", kicker: "This week", big: `${fmtInt(t.sessions)} sessions`,
    line: `${fmtInt(t.sessions)} sessions over ${fmtInt(t.activeDays)} active days.${cost}${wkd === null ? "" : ` ${wkd >= 0 ? "Up" : "Down"} ${fmtPct(Math.abs(wkd))} vs the prior week.`}`, note: scope });

  const top = v.intents[0];
  if (top) cards.push({ id: "intent", kicker: "Top intent", big: top.key || "(none)", line: `${fmtInt(top.sessions)} of ${fmtInt(t.sessions)} sessions (${fmtPct(top.sessions / t.sessions)}).`, note: scope });

  const noPrior = !prior || pn < 5 ? "No earlier week with enough sessions to compare." : "";
  if (caps.hasCost && t.cost !== null) {
    const { dl, note } = costParts(t, p, pn);
    cards.push({ id: "spend", kicker: "Cost", big: fmtUSD(t.cost), line: dl || noPrior || note.replace(/^ \(|\)$/g, "") || "No comparison available.", note: `${scope}${dl ? note : ""}` });
  } else {
    const dl = tokensChg(t, p, pn);
    cards.push({ id: "spend", kicker: "Tokens", big: fmtCompact(t.tokens), line: dl || noPrior || "No comparison available.", note: `${scope}. ${caps.allUnpriced ? "No prices recorded, so tokens stand in for cost." : "Tokens, not cost."}` });
  }

  // Best prompt: only topics that have sessions in this week's view, ranked by the Wilson lower bound of the topic's success rate (whole-export rate; the exemplar is not one session).
  const week = new Set(v.rows.map((r) => r.cluster).filter((c) => c >= 0));
  const best = d.galaxy.clusters.filter((c) => week.has(c.id) && c.exemplar && c.size >= 30 && !c.exemplar.includes("[REDACTED") && findSecrets(c.exemplar).length === 0)
    .map((c) => ({ c, lb: wilson(Math.round(c.success * c.size), c.size)[0] })).sort((a, b) => b.lb - a.lb || b.c.size - a.c.size || a.c.id - b.c.id)[0]?.c;
  if (best?.exemplar) cards.push({ id: "prompt", kicker: "Best prompt", big: `“${trunc(best.exemplar, 160)}”`, line: `Typical of "${best.label}", a topic you used this week with ${fmtPct(best.success)} success across the whole export.`, note: "A topic exemplar, not one session." });

  const habit = weekHabit(d, view);
  if (habit) cards.push({ id: "habit", kicker: "One habit to try", big: habit.title, line: habit.line, note: "Correlation, not cause." });

  const all = views(d, {}).totals, end = view.f.to ?? "";
  cards.push({ id: "streak", kicker: "Day streak", big: fmtInt(all.current),
    line: `${fmtInt(all.current)}-day streak now, ${fmtInt(t.activeDays)} of ${WRAP_DAYS} days active.`, note: `As of ${fmtDate(end)}. Longest streak: ${fmtInt(all.longest)} days (all data).` });
  return { view, cards: cards.slice(0, 6) };
}

/** Cut at a word boundary, with an ellipsis when shortened. */
export function trunc(t: string, max: number): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max), sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Most common missing habit among this week's unapplied sessions, else the top "do more" playbook card. */
function weekHabit(d: DashboardData, view: SummaryView): { title: string; line: string } | null {
  const book = playbook(d.what_works, d.galaxy.clusters, d.what_works_tested, d.sessions, 50);
  if (hasHabitData(d)) {
    const tally = new Map<string, { n: number; line: string; title: string }>();
    for (const r of view.v.rows) for (const h of missingHabits(d, r, book)) {
      const x = tally.get(h.feature) ?? { n: 0, line: h.play.line, title: h.feature };
      x.n++; tally.set(h.feature, x);
    }
    const top = [...tally.values()].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title))[0];
    if (top) return { title: top.title, line: `${top.line} ${fmtInt(top.n)} of this week's unapplied sessions lacked it.` };
  }
  const week = new Set(view.v.rows.map((r) => r.cluster));   // same restriction as Best prompt: topics seen this week
  const p = book.more.find((x) => week.has(x.cluster));
  return p ? { title: p.feature, line: p.line } : null;
}

// ---- once per ISO week ----
/** ISO 8601 week id, "2026-W44". */
export function isoWeek(now: Date): string {
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
type Store = Pick<Storage, "getItem" | "setItem">;
/** A secret open finding is the one thing Wrapped must never sit on top of. */
export const hasCritical = (d: DashboardData) => d.exposure.items.some((i) => i.status === "open" && i.category === "secret");
/** true = this week already marked. null = storage blocked (never auto-show). */
export function seen(now: Date, st?: Store): boolean | null {
  try { return (st ?? localStorage).getItem(WRAP_KEY) === isoWeek(now); } catch { return null; }
}
/** false when storage refused the write. */
export function markSeen(now: Date, st?: Store): boolean {
  try { (st ?? localStorage).setItem(WRAP_KEY, isoWeek(now)); return true; } catch { return false; }
}
/** The "Wrapped is ready" chip (never an auto-opened dialog): at most once per ISO week, only when offered and storage works. */
export function autoShow(d: DashboardData, now: Date, st?: Store): boolean {
  if (wrapped(d) === null) return false;
  return seen(now, st) === false;
}
