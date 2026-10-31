import { useStore } from "../state";
import { fmtCompact, fmtInt, fmtUSD } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { BarList, DataTable, Empty, Panel } from "./ui";

const TOP_PROJECTS = 8;

export function Footprint() {
  const { d, v, f, drill } = useStore();
  const m = d.engine.methods.footprint;
  const priced = (c: number | null) => (c === null ? "not priced" : fmtUSD(c));
  const health = d.sources.filter((s) => s.status !== "ok" || s.sessions > 0);
  return (
    <div className="grid">
      <Panel title="Sources" meta={m ?? "sessions per tool"} span={5}>
        {v.sources.length === 0 ? <Empty /> : (
          <BarList label="Sessions by source" rows={v.sources.map((s) => ({
            key: s.key, label: srcLabel(s.key), value: s.sessions, color: srcColor(s.key), active: f.source === s.key,
            text: `${fmtInt(s.sessions)}`, sub: `${fmtCompact(s.prompts)} prompts · ${priced(s.cost)}`,
            aria: `${srcLabel(s.key)}: ${s.sessions} sessions, ${s.prompts} prompts, ${priced(s.cost)}. Open sessions`,
            onClick: () => drill({ source: s.key as never }),
          }))} />
        )}
        <DataTable caption="Sessions by source" head={["Source", "Sessions", "Prompts", "Tokens", "Cost"]} rows={v.sources.map((s) => [srcLabel(s.key), s.sessions, s.prompts, s.tokens, priced(s.cost)])} />
      </Panel>
      <Panel title="Intent" meta="what you asked for" span={4}>
        {v.intents.length === 0 ? <Empty /> : (
          <BarList label="Sessions by intent" rows={v.intents.map((t) => ({
            key: t.key, label: t.key, value: t.sessions, active: f.intent === t.key, color: "var(--accent)", text: fmtInt(t.sessions),
            aria: `${t.key}: ${t.sessions} sessions. Open sessions`, onClick: () => drill({ intent: t.key as never }),
          }))} />
        )}
      </Panel>
      <Panel title="Projects" meta={`top ${TOP_PROJECTS}`} span={3}>
        {v.projects.length === 0 ? <Empty>No project data</Empty> : (
          <BarList label="Sessions by project" rows={v.projects.slice(0, TOP_PROJECTS).map((p) => ({
            key: p.key, label: p.key, value: p.sessions, active: f.project === p.key, color: "var(--accent)", text: fmtInt(p.sessions),
            aria: `${p.key}: ${p.sessions} sessions. Open sessions`, onClick: p.key === "(no project)" ? undefined : () => drill({ project: p.key }),
          }))} />
        )}
      </Panel>
      <Panel title="Source health" meta="what the importer found" span={12}>
        {health.length === 0 ? <Empty>No sources found</Empty> : (
          <ul className="rows">
            {SOURCES.map((s) => d.sources.find((x) => x.source === s)).filter((x): x is NonNullable<typeof x> => !!x).map((s) => (
              <li key={s.source} className="rowb">
                <span><span className="sw" style={{ "--c": srcColor(s.source) } as React.CSSProperties} />{srcLabel(s.source)}</span>
                <span className="tag">{s.status} · {fmtInt(s.sessions)} sessions</span>
                {s.note ? <p>{s.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
