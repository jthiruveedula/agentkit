// "Habits from your wins this session lacked": what_works features that help (BH-FDR passing, CI clear of 0, via playbook())
// in this session's topic or intent, minus the ones the session's prompts already showed. Observations, never a rewrite.
import type { DashboardData, SessionRow } from "../data/types";
import { playbook, type Play } from "./playbook";

export interface Habit { feature: string; play: Play; /** where the winning sessions were: this session's topic, or "other topics, same intent" when the effect is borrowed */ scope: string }

/** Can the checklist be offered at all? Needs the session tags and tested effects. */
export const hasHabitData = (d: DashboardData) => d.what_works.length > 0 && d.what_works_tested > 0 && d.sessions.some((s) => s.features !== undefined);

/** Empty when the session is applied, untagged, or lacks nothing. Sorted by effect size, one entry per feature. */
export function missingHabits(d: DashboardData, r: SessionRow, book = playbook(d.what_works, d.galaxy.clusters, d.what_works_tested, d.sessions, 50)): Habit[] {
  if (r.applied || r.features === undefined) return [];
  const have = new Set(r.features.map((f) => f.toLowerCase()));
  const intentOf = new Map(d.galaxy.clusters.map((c) => [c.id, c.intent]));
  const out = new Map<string, Habit>();
  for (const p of book.more) {
    const inTopic = r.cluster >= 0 && p.cluster === r.cluster, inIntent = intentOf.get(p.cluster) === r.intent;
    const f = p.feature.toLowerCase();
    if ((!inTopic && !inIntent) || have.has(f) || out.has(f)) continue;
    out.set(f, { feature: p.feature, play: p, scope: inTopic ? p.scope ?? "this topic" : "other topics, same intent" });
  }
  return [...out.values()].slice(0, 4);
}
