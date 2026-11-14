// Plain-language lines for the analyzer's matched-uplift, recent-weeks and struggle fields. Pure; null when the field is absent.
import type { DashboardData, SessionRow } from "../data/types";

type Row = DashboardData["what_works"][number];

export function upliftLine(habit: string, u?: Row["uplift"]): string | null {
  if (!u) return null;
  const pts = Math.round(Math.abs(u.pts)), n = u.n_with + u.n_without;
  if (pts === 0) return `Sessions that ${habit} land a change about as often as similar ones that don't (${n} sessions, same task and tool).`;
  return `Sessions that ${habit} land a change ${pts} points ${u.pts < 0 ? "less" : "more"} often than similar ones that don't (${n} sessions, same task and tool).`;
}
export function holdoutLine(h?: Row["holdout"]): string | null {
  if (!h) return null;
  return h.held ? `Held up in your last ${h.weeks} weeks.` : "Did not hold up in recent weeks, treat it as a hunch.";
}
export function struggleLine(p?: SessionRow["struggle_p"]): string | null {
  return p === undefined ? null : `About ${Math.round(p * 100)}% of sessions like this one ended with nothing applied.`;
}
