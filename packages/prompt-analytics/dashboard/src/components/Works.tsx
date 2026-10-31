import { useState } from "react";
import { useStore } from "../state";
import { fmtInt, fmtPct, fmtSigned } from "../lib/format";
import { intentColor, srcLabel } from "../lib/palette";
import { BarList, Card, DataTable, Empty, Section, Segmented } from "./ui";

const pts = (x: number) => `${fmtSigned(x * 100)} pts`;

function Forest() {
  const { d, f, drill, clusterLabel } = useStore();
  const rows = [...d.what_works].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 10);
  const lim = Math.max(...rows.flatMap((r) => [Math.abs(r.ci[0]), Math.abs(r.ci[1]), Math.abs(r.effect)]), 0.01);
  const pos = (x: number) => `${50 + (x / lim) * 50}%`;
  const passed = d.what_works.length;
  return (
    <Card title="What moves success" meta={`${fmtInt(d.what_works_tested)} tested, ${fmtInt(passed)} passed. Effect on success rate, 95% CI`} span={7}>
      {rows.length === 0 ? <Empty>{d.what_works_tested > 0 ? `No effect passed FDR correction (${fmtInt(d.what_works_tested)} tested)` : "No prompt effects measured yet"}</Empty> : (
        <>
          <ul className="forest" aria-label="Prompt feature effects on success" data-sel={f.cluster !== undefined || undefined}>
            {rows.map((r) => {
              const cross = r.ci[0] <= 0 && r.ci[1] >= 0, on = f.cluster === r.cluster, name = clusterLabel(r.cluster);
              return (
                <li key={`${r.feature}${r.cluster}`}>
                  <button type="button" className="fr" data-on={on || undefined} data-cross={cross || undefined} data-dir={r.direction} aria-pressed={on}
                    aria-label={`${r.feature} in ${name}: ${r.direction} by ${pts(Math.abs(r.effect))}, CI ${pts(r.ci[0])} to ${pts(r.ci[1])}, n=${r.n}${cross ? ", interval crosses zero" : ""}. Filter to this topic`} onClick={() => drill({ cluster: r.cluster })}>
                    <span className="fr-l"><b>{r.feature}</b><span className="meta">{name} · n={fmtInt(r.n)}</span></span>
                    <span className="fr-t" aria-hidden="true"><i className="fr-w" style={{ left: pos(r.ci[0]), width: `${((r.ci[1] - r.ci[0]) / lim) * 50}%` }} /><i className="fr-d" style={{ left: pos(r.effect) }} /></span>
                    <span className="fr-n">{pts(r.effect)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="note">Dot = effect, line = 95% CI. Grey = interval crosses zero. Scale {pts(-lim)} to {pts(lim)}.</p>
          <DataTable caption="Prompt feature effects" head={["Feature", "Topic", "Effect", "CI low", "CI high", "n"]} rows={rows.map((r) => [r.feature, clusterLabel(r.cluster), pts(r.effect), pts(r.ci[0]), pts(r.ci[1]), r.n])} />
        </>
      )}
    </Card>
  );
}

function Topics() {
  const { d, f, drill, v } = useStore();
  const cl = d.galaxy.clusters.filter((k) => k.size > 0);
  const flat = d.galaxy.points.x.length === 0, up = d.engine.upgrade;
  const rows = cl.map((k) => ({ k, n: v.legacy ? k.size : v.clusterCounts.get(k.id) ?? 0 })).sort((a, b) => b.n - a.n).slice(0, 12);
  return (
    <Card title={flat ? "Topics, grouped by keywords" : "Topics"} span={5}
      meta={flat ? <>Install the ml extra to cluster by meaning.{up ? <> <code>{up.command}</code></> : null}</> : "sessions per topic, live"}>
      {rows.length === 0 ? <Empty>No topics yet</Empty> : (
        <BarList label="Topics. Each filters its sessions" rows={rows.map(({ k, n }) => ({
          key: String(k.id), label: k.label, value: n, color: intentColor(k.intent), active: f.cluster === k.id, text: fmtInt(n), sub: `${fmtPct(k.success)} success · ${k.intent}`,
          aria: `${k.label}: ${n} sessions, ${fmtPct(k.success)} success, ${k.intent}. Filter to this topic`, onClick: () => drill({ cluster: k.id }),
        }))} />
      )}
      <DataTable caption="Topics" head={["Topic", "Intent", "Prompts", "Success"]} rows={cl.map((k) => [k.label, k.intent, k.size, fmtPct(k.success)])} />
    </Card>
  );
}

function Quality() {
  const { d } = useStore();
  const { axes, you, top, by_source: bs, validation: val } = d.quality;
  const [tool, setTool] = useState("all");
  const mine = tool === "all" ? you : bs.find((b) => b.source === tool)?.values ?? you;
  if (!(you.length === axes.length && you.length > 0)) return <Card title="Prompt quality" span={5}><Empty>No prompt-quality scores yet</Empty></Card>;
  return (
    <Card title="Prompt quality" meta="you against the top-outcome tercile" span={12}
      actions={bs.length > 1 ? <Segmented label="Quality by tool" value={tool} onChange={setTool} options={[{ id: "all", text: "All" }, ...bs.map((b) => ({ id: b.source as string, text: srcLabel(b.source).split(" ")[0] }))]} /> : undefined}>
      <BarList label="Prompt quality sub-scores" max={1} rows={axes.map((a, i) => ({
        key: a, label: a, value: mine[i] ?? 0, color: "var(--accent)", mark: top[i] ?? 0, text: fmtPct(mine[i] ?? 0), sub: `top ${fmtPct(top[i] ?? 0)}`,
        aria: `${a}: you ${fmtPct(mine[i] ?? 0)}, top tercile ${fmtPct(top[i] ?? 0)}`,
      }))} />
      <p className="note">Tick = top tercile. {val.spearman !== null ? `Score vs outcome: Spearman ${val.spearman.toFixed(2)}, n=${fmtInt(val.n)}.` : "Score validation unavailable."} Aggregate, ignores filters.</p>
    </Card>
  );
}

export function Works() {
  return (
    <Section id="s-works" title="What works" q="Which habits pay off?">
      <Forest /><Topics /><Quality />
    </Section>
  );
}
