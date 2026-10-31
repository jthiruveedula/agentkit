import { useStore, TABS } from "../state";
import { fmtValue } from "../lib/format";
import { Empty, Panel } from "./ui";
import type { Chapter, Insight } from "../data/types";

const chName = (c: Chapter) => TABS.find((t) => t.id === c)?.name ?? c;

function Evidence({ ins }: { ins: Insight }) {
  const { drill } = useStore();
  return (
    <button type="button" className="btn" aria-label={`Evidence for: ${ins.claim}`} onClick={() => drill(ins.drill.filter, ins.drill.chapter)}>Evidence</button>
  );
}

export function Recommend() {
  const { d } = useStore();
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  const ins = [...d.insights].sort((a, b) => a.rank - b.rank || a.chapter.localeCompare(b.chapter));
  return (
    <div className="grid">
      <Panel title="Recommendations" meta="each cites an insight" span={6}>
        {d.recommendations.length === 0 ? <Empty>No recommendations yet</Empty> : (
          <ul className="rows">
            {d.recommendations.map((r) => {
              const e = byId.get(r.evidence_insight);
              return (
                <li key={r.id} className="rowb">
                  <strong>{r.title}</strong>
                  {e ? <Evidence ins={e} /> : <span />}
                  <p>{r.action}</p>
                  <p>Impact: {r.impact}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Insights" meta="strongest first, with sample size" span={6}>
        {ins.length === 0 ? <Empty>No insights yet</Empty> : (
          <ul className="rows">
            {ins.map((i) => (
              <li key={i.id} className="rowb">
                <span><span className="tag">{chName(i.chapter)}</span> {i.claim}</span>
                <Evidence ins={i} />
                <p>{i.metric}: {fmtValue(i.value, i.unit)} · n={i.evidence.n} · {i.evidence.method}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
