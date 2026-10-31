import { useStore } from "../state";
import { STAGES } from "../lib/filter";
import { fmtInt, fmtPct } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import { BarList, Cols, DataTable, Empty, Panel, pct } from "./ui";

export function Funnel() {
  const { d, v, f, drill } = useStore();
  const m = d.engine.methods.funnel;
  const top = v.funnel[0] ?? 0;
  const sw = d.tool_switch.filter((t) => !f.source || t.from === f.source || t.to === f.source);
  return (
    <div className="grid">
      <Panel title="Funnel" meta={m ?? "sessions reaching each stage"} span={6}>
        {top === 0 ? <Empty /> : (
          <BarList label="Sessions reaching each funnel stage" rows={STAGES.map((s, i) => {
            const n = v.funnel[i] ?? 0, prev = i ? v.funnel[i - 1] ?? 0 : n;
            return {
              key: s, label: s, value: n, color: "var(--accent)", active: f.stage === i + 1, text: `${fmtInt(n)} · ${pct(n, top)}`,
              sub: i ? `${pct(n, prev)} of ${STAGES[i - 1].toLowerCase()}` : undefined,
              aria: `${s}: ${n} sessions, ${pct(n, top)} of all. Open sessions that reached ${s.toLowerCase()}`, onClick: () => drill({ stage: i + 1 }),
            };
          })} />
        )}
        <DataTable caption="Funnel stages" head={["Stage", "Sessions"]} rows={STAGES.map((s, i) => [s, v.funnel[i] ?? 0])} />
      </Panel>
      <Panel title="Applied rate by intent" meta="sessions that reached Applied" span={6}>
        {v.funnelByIntent.length === 0 ? <Empty /> : (
          <BarList label="Applied rate by intent" max={1} rows={v.funnelByIntent.map((x) => {
            const r = (x.counts[0] ?? 0) > 0 ? (x.counts[4] ?? 0) / (x.counts[0] ?? 1) : 0;
            return { key: x.key, label: x.key, value: r, color: "var(--accent)", active: f.intent === x.key, text: fmtPct(r), sub: `n=${fmtInt(x.counts[0] ?? 0)}`,
              aria: `${x.key}: ${fmtPct(r)} applied, n=${x.counts[0]}. Open sessions`, onClick: () => drill({ intent: x.key as never }) };
          })} />
        )}
      </Panel>
      <Panel title="Funnel by source" meta="one column per stage, relative to Intent" span={8}>
        {v.funnelBySource.length === 0 ? <Empty /> : (
          <div className="minis">
            {v.funnelBySource.map((x) => {
              const t = x.counts[0] ?? 0;
              return (
                <button key={x.key} type="button" className="mini" aria-pressed={f.source === x.key} onClick={() => drill({ source: x.key as never })}
                  aria-label={`${srcLabel(x.key)}: ${t} sessions, ${pct(x.counts[4] ?? 0, t)} applied. Open sessions`}>
                  <b><span className="sw" style={{ "--c": srcColor(x.key) } as React.CSSProperties} />{srcLabel(x.key)}</b>
                  <Cols label={`${srcLabel(x.key)} funnel`} height={40} cols={STAGES.map((s, i) => ({ key: s, label: s, segs: [{ v: t ? (x.counts[i] ?? 0) / t : 0, color: srcColor(x.key) }], aria: `${s}: ${x.counts[i] ?? 0}` }))} />
                  <span className="meta">{fmtInt(t)} sessions · {pct(x.counts[4] ?? 0, t)} applied</span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title="Tool switches" meta="consecutive, same project, < 24h" span={4}>
        {sw.length === 0 ? <Empty>No switches</Empty> : (
          <BarList label="Tool switches" rows={sw.slice(0, 6).map((t) => ({ key: `${t.from}${t.to}`, label: `${srcLabel(t.from)} to ${srcLabel(t.to)}`, value: t.count, color: "var(--accent)", text: fmtInt(t.count), aria: `${srcLabel(t.from)} to ${srcLabel(t.to)}: ${t.count}` }))} />
        )}
      </Panel>
    </div>
  );
}
