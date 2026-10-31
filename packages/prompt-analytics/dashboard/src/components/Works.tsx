import { useStore } from "../state";
import { fmtInt, fmtPct, fmtSigned } from "../lib/format";
import { TOPIC_VARS } from "../lib/palette";
import { BarList, DataTable, Empty, Panel } from "./ui";
import type { DashboardData } from "../data/types";

const MAX_POINTS = 1500; // scatter is a glance; the topic list is the drill target
const colorOf = (c: number) => (c < 0 ? "var(--t7)" : `var(${TOPIC_VARS[c % TOPIC_VARS.length]})`);

function Scatter({ d }: { d: DashboardData }) {
  const { f, drill } = useStore();
  const { x, y, c } = d.galaxy.points;
  const step = Math.max(1, Math.ceil(x.length / MAX_POINTS));
  const idx: number[] = [];
  for (let i = 0; i < x.length; i += step) idx.push(i);
  return (
    <svg className="scatter" viewBox="0 0 400 200" role="img" aria-label={`Scatter of ${fmtInt(x.length)} prompts in ${d.galaxy.clusters.length} topics. Use the topic list to open sessions.`}>
      {idx.map((i) => <circle key={i} cx={8 + x[i] * 384} cy={8 + y[i] * 184} r={1.6} fill={colorOf(c[i])} opacity={f.cluster === undefined || f.cluster === c[i] ? 0.8 : 0.12} onClick={() => drill({ cluster: c[i] })} />)}
    </svg>
  );
}

export function Topics({ d }: { d: DashboardData }) {
  const { f, drill, v } = useStore();
  const cl = d.galaxy.clusters.filter((k) => k.size > 0).sort((a, b) => b.size - a.size);
  const up = d.engine.upgrade;
  const flat = d.galaxy.points.x.length === 0;
  const count = (id: number) => (v.legacy ? undefined : v.clusterCounts.get(id) ?? 0);
  if (cl.length === 0) return <Panel title="Topics" span={12}><Empty>No topics yet</Empty></Panel>;
  return (
    <Panel title={flat ? "Topics, grouped by keywords" : "Topics"} span={12}
      meta={flat ? <>Install the ml extra to cluster by meaning.{up ? <> <code>{up.command}</code></> : null}</> : d.engine.methods.works ?? "clustered by meaning, shaded by success rate"}>
      {!flat && <Scatter d={d} />}
      <div className="tm" role="group" aria-label="Topics. Each opens its sessions">
        {cl.map((k, i) => {
          const n = count(k.id);
          return (
            <button key={k.id} type="button" aria-pressed={f.cluster === k.id} style={{ "--c": colorOf(i), "--v": 0.12 + 0.3 * k.success } as React.CSSProperties}
              aria-label={`${k.label}: ${fmtPct(k.success)} success, ${fmtInt(k.size)} prompts, ${k.intent}. Open sessions`} onClick={() => drill({ cluster: k.id })}>
              <b title={k.label}>{k.label}</b>
              <span className="meta">{fmtPct(k.success)} success · {fmtInt(k.size)} prompts{n === undefined ? "" : ` · ${fmtInt(n)} sessions`}</span>
            </button>
          );
        })}
      </div>
      <DataTable caption="Topics" head={["Topic", "Intent", "Prompts", "Success"]} rows={cl.map((k) => [k.label, k.intent, k.size, fmtPct(k.success)])} />
    </Panel>
  );
}

function Quality({ d }: { d: DashboardData }) {
  const { axes, you, top } = d.quality;
  const ok = you.length === axes.length && you.length > 0;
  if (!ok) return <Panel title="Prompt quality" span={5}><Empty>No prompt-quality scores yet</Empty></Panel>;
  const v = d.quality.validation;
  return (
    <Panel title="Prompt quality" meta="you vs top-outcome tercile" span={5}>
      <BarList label="Prompt quality sub-scores" max={1} rows={axes.flatMap((a, i) => [
        { key: `${a}y`, label: a, value: you[i] ?? 0, color: "var(--accent)", text: fmtPct(you[i] ?? 0), aria: `${a}: you ${fmtPct(you[i] ?? 0)}` },
        { key: `${a}t`, label: <span className="meta">top tercile</span>, value: top[i] ?? 0, color: "var(--good)", text: fmtPct(top[i] ?? 0), aria: `${a}: top tercile ${fmtPct(top[i] ?? 0)}` },
      ])} />
      {v.spearman !== null && <p className="meta">Score vs outcome: Spearman {v.spearman.toFixed(2)}, n={fmtInt(v.n)}</p>}
    </Panel>
  );
}

function Effects({ d }: { d: DashboardData }) {
  const { drill } = useStore();
  const rows = [...d.what_works].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 8);
  const lab = new Map(d.galaxy.clusters.map((k) => [k.id, k.label]));
  const pts = (x: number) => `${fmtSigned(x * 100)} pts`;
  const top = Math.max(...rows.map((r) => Math.abs(r.effect)), 0);
  return (
    <Panel title="What moves success" meta="effect on success rate, 95% CI" span={7}>
      {rows.length === 0 ? <Empty>No prompt effects measured yet</Empty> : (
        <BarList label="Prompt feature effects on success" max={top} rows={rows.map((r) => ({
          key: `${r.feature}${r.cluster}`, label: r.feature, value: Math.abs(r.effect), color: r.direction === "helps" ? "var(--good)" : "var(--bad)", text: pts(r.effect),
          sub: `${lab.get(r.cluster) ?? `topic ${r.cluster}`} · CI ${pts(r.ci[0])} to ${pts(r.ci[1])} · n=${fmtInt(r.n)}`,
          aria: `${r.feature} in ${lab.get(r.cluster) ?? r.cluster}: ${r.direction} by ${pts(Math.abs(r.effect))}, CI ${pts(r.ci[0])} to ${pts(r.ci[1])}, n=${r.n}. Open sessions`,
          onClick: () => drill({ cluster: r.cluster }),
        }))} />
      )}
    </Panel>
  );
}

export function Works() {
  const { d } = useStore();
  return (
    <div className="grid">
      <Topics d={d} />
      <Quality d={d} />
      <Effects d={d} />
    </div>
  );
}
