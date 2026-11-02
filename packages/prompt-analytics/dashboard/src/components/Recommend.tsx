import { useStore } from "../state";
import { fmtInt, fmtValue } from "../lib/format";
import { Card, Empty, Section } from "./ui";
import "./govern.css";

/** Icon + hue per evidence chapter (stroke paths from the signed-off preview; hue = its nav group). */
const ICON: Record<string, [string, number]> = {
  footprint: ["M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 2-2-2z", 195],
  time: ["M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", 195],
  funnel: ["M3 4h18l-7 8v6l-4 2v-8z", 195],
  friction: ["M3 12l4-6 4 12 4-12 3 6h3", 195],
  works: ["M5 12l4 4 10-10", 295],
  recommend: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", 340],
};

export function Recommend() {
  const { d, apply } = useStore();
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  return (
    <Section id="s-recs" title="Recommendations" q="What should you change?">
      <Card title="Do next, in order" src="insights + recommendations" meta="each cites the insight behind it. whole export, ignores filters" span={12}>
        {d.recommendations.length === 0 ? <Empty>No recommendations yet</Empty> : (
          <ol className="todo">
            {d.recommendations.map((r, i) => {
              const e = byId.get(r.evidence_insight), [path, hue] = ICON[e?.chapter ?? "recommend"] ?? ICON.recommend;
              return (
                <li key={r.id} data-rec={r.id}>
                  <i className="ic" style={{ "--hue": hue } as React.CSSProperties}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg></i>
                  <div>
                    <h4>{r.title}</h4>
                    <p>{r.action}</p>
                    <div className="chips"><span className="tag good">{r.impact}</span>{e && <span className="tag">n={fmtInt(e.evidence.n)}</span>}</div>
                    {e && <p className="meta">{e.claim}. {e.metric}: {fmtValue(e.value, e.unit)}{e.evidence.ci ? ` · CI ${fmtValue(e.evidence.ci[0] * (e.unit === "%" ? 100 : 1), e.unit)} to ${fmtValue(e.evidence.ci[1] * (e.unit === "%" ? 100 : 1), e.unit)}` : ""} · {e.evidence.method}</p>}
                  </div>
                  {e && <button type="button" className={i ? "btn" : "btn primary"} aria-label={`Show evidence for: ${r.title}`} onClick={() => apply(e.drill.filter, { list: true })}>Show evidence</button>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </Section>
  );
}
