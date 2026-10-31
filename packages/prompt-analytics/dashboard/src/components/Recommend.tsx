import type { DashboardData } from "../data/types";
import { fmtInt } from "../lib/format";
import { Recap } from "./Narrative";
import { CHAPTERS } from "./Section";
import { InsightTrace } from "./Trace";

/** Three habit cards from recommendations, then the sensitive-data hygiene card, then the recap. */
export function Recommend({ d }: { d: DashboardData }) {
  const recs = d.recommendations.slice(0, 3);
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  const ex = d.exposure;
  const worst = [...ex.by_category].sort((a, b) => b.sessions - a.sessions)[0];
  return (
    <>
      {recs.length === 0 ? <p className="empty">No recommendations yet. Keep working and check back.</p> : null}
      <ol className="recs" data-stagger>
        {recs.map((r, i) => {
          const ev = byId.get(r.evidence_insight);
          const ch = ev ? CHAPTERS.find((c) => c.id === ev.drill.chapter) : undefined;
          return (
            <li key={r.id}>
              <span className="rec-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="rec-t">{r.title}</h3>
                {d.engine.mode === "deep" && r.evidence_insight === "works.dupes" && <span className="rec-tag">Near-duplicate prompts</span>}
                <p className="rec-a">{r.action}</p>
                <span className="rec-i">{r.impact}</span>
              </div>
              {ev && (
                <p className="rec-e">
                  {ev.claim}<InsightTrace i={ev} />
                  {ch && <><br /><a href={`#${ch.id}`}>See evidence in {ch.name.toLowerCase()}</a></>}
                </p>
              )}
            </li>
          );
        })}
        <li className="hygiene">
          <span className="rec-n" aria-hidden="true">+</span>
          <div>
            <h3 className="rec-t">Sensitive-data hygiene</h3>
            <p className="rec-a">{ex.sessions > 0 && worst?.advice ? worst.advice : "Nothing sensitive was found in your prompts. Keep it that way."}</p>
            <span className="rec-i">{ex.sessions > 0 ? `${fmtInt(ex.sessions)} sessions flagged` : "0 sessions flagged"}</span>
          </div>
          {ex.sessions > 0 && <p className="rec-e"><a href="#friction">Review the findings in friction hotspots</a></p>}
        </li>
      </ol>
      <Recap d={d} />
    </>
  );
}
