import { useStore } from "../state";
import { fmtInt, fmtValue } from "../lib/format";
import { Card, Empty, Section } from "./ui";

export function Recommend() {
  const { d, apply } = useStore();
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  return (
    <Section id="s-recs" title="Recommendations" q="What should you change?">
      <Card title="Suggested changes" meta="each cites the insight behind it. whole export, ignores filters" span={12}>
        {d.recommendations.length === 0 ? <Empty>No recommendations yet</Empty> : (
          <ul className="recs">
            {d.recommendations.map((r) => {
              const e = byId.get(r.evidence_insight);
              return (
                <li key={r.id} className="rec" data-rec={r.id}>
                  <h4>{r.title}</h4>
                  <p>{r.action}</p>
                  <p className="impact"><b>Impact</b> {r.impact}</p>
                  {e && (
                    <>
                      <p className="meta">{e.claim}. {e.metric}: {fmtValue(e.value, e.unit)} · n={fmtInt(e.evidence.n)}{e.evidence.ci ? ` · CI ${fmtValue(e.evidence.ci[0], e.unit)} to ${fmtValue(e.evidence.ci[1], e.unit)}` : ""} · {e.evidence.method}</p>
                      <button type="button" className="btn" aria-label={`Show evidence for: ${r.title}`} onClick={() => apply(e.drill.filter, { list: true })}>Show evidence</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Section>
  );
}
