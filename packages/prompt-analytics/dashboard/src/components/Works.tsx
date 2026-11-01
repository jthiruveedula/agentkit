import { useMemo, useState, type CSSProperties } from "react";
import { playbook, PLAYBOOK_MIN_SESSIONS, type Play } from "../lib/playbook";
import { useStore } from "../state";
import { fmtInt, fmtPct, fmtSigned } from "../lib/format";
import { intentColor, srcLabel } from "../lib/palette";
import { BarList, Card, DataTable, Empty, Section, Segmented } from "./ui";

const pts = (x: number) => `${fmtSigned(x * 100)} pts`;

/** Shared CI strip: fixed width, one scale for every card, zero tick always visible. */
function Ci({ p, lim }: { p: Play; lim: number }) {
  const pos = (x: number) => `${50 + (x / lim) * 50}%`;
  return <span className="play-ci" aria-hidden="true" style={{ "--a": pos(p.lo), "--b": pos(p.hi), "--d": pos(p.pts) } as CSSProperties}><i /><em /></span>;
}

function PlayCard({ p, lim, on, onPick, copySlot }: { p: Play; lim: number; on: boolean; onPick: () => void; copySlot: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { if (!p.snippet) return; navigator.clipboard?.writeText(p.snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); };
  return (
    <li className="play" data-dir={p.dir} data-on={on || undefined} data-copy={copySlot || undefined}>
      <button type="button" className="play-b" aria-pressed={on} onClick={onPick}
        aria-label={`${p.dir === "more" ? "Do more" : "Do less"}: ${p.title}, ${pts(p.pts / 100)} on success, 95% CI ${pts(p.lo / 100)} to ${pts(p.hi / 100)}, n=${p.n}. ${p.line}${p.counter ? " Correlation, not cause." : ""} Filter to this topic`}>
        <span className="play-h"><b>{p.title}</b><span className="play-e">{pts(p.pts / 100)}</span></span>
        <Ci p={p} lim={lim} />
        <span className="meta">{p.feature} · n={fmtInt(p.n)} · CI {fmtSigned(p.lo)} to {fmtSigned(p.hi)}</span>
        <span className="play-l">{p.line}</span>
        {p.counter && <span className="play-c">Correlation, not cause: this runs against the usual advice.</span>}
      </button>
      {copySlot && (p.snippet ? <button type="button" className="chip play-copy" onClick={copy} aria-label={`Copy example prompt: ${p.snippet}`}>{copied ? "Copied" : "Copy example"}</button>
        : <span className="play-copy meta">No example with this feature</span>)}
    </li>
  );
}

function Playbook() {
  const { d, v, f, drill } = useStore();
  const b = useMemo(() => playbook(d.what_works, d.galaxy.clusters, d.what_works_tested, d.sessions), [d]);
  const { more, less } = b, cards = [...more, ...less];
  const lim = Math.max(...b.all.flatMap((p) => [Math.abs(p.lo), Math.abs(p.hi)]), 1);
  const col = (title: string, ps: Play[], copySlot: boolean) => (
    <div className="play-col">
      <h4>{title}</h4>
      {ps.length === 0 ? <p className="note">No effect in this direction passes the FDR check.</p> : <ul className="plays">{ps.map((p) => <PlayCard key={p.key} p={p} lim={lim} copySlot={copySlot} on={f.cluster === p.cluster} onPick={() => drill({ cluster: p.cluster })} />)}</ul>}
    </div>
  );
  return (
    <Card id="s-playbook" title="Prompt playbook" meta={d.what_works_tested ? `${fmtInt(b.tested)} tested · ${fmtInt(b.pass)} pass FDR 10% · all sessions. Click a card to filter to its topic` : "all sessions"} span={12}>
      {d.what_works_tested === 0 ? <Empty>No prompt effects were tested yet. The ml or deep analysis tier runs them once there are enough sessions.</Empty>
        : cards.length === 0 ? <Empty>{`None of the ${fmtInt(b.tested)} tested effects passes the false-discovery check (Benjamini-Hochberg, 10%), so there is no advice to give yet.`}</Empty> : (
          <>
            {v.rows.length < PLAYBOOK_MIN_SESSIONS && <p className="note">Not enough sessions in this view ({fmtInt(v.rows.length)} of {PLAYBOOK_MIN_SESSIONS} needed) to re-check these effects; the cards use all sessions.</p>}
            <div className="play-grid">{col("Do more", more, true)}{col("Do less", less, false)}</div>
            <p className="note">Bar = 95% CI on one shared scale, {pts(-lim / 100)} to {pts(lim / 100)}; the tick is zero.</p>
          </>
        )}
      {b.all.length > 0 && <AllTests all={b.all} lim={lim} tested={b.tested} />}
    </Card>
  );
}

/** Every shipped test as a forest plot, folded under the playbook. */
function AllTests({ all, lim, tested }: { all: Play[]; lim: number; tested: number }) {
  const { f, drill } = useStore();
  return (
    <details className="ftests">
      <summary>All {fmtInt(tested)} tests</summary>
      <ul className="forest" aria-label="Prompt feature effects on success" data-sel={f.cluster !== undefined || undefined}>
        {all.map((p) => {
          const on = f.cluster === p.cluster;
          return (
            <li key={p.key}>
              <button type="button" className="fr" data-on={on || undefined} data-cross={!p.pass || undefined} data-dir={p.dir} aria-pressed={on}
                aria-label={`${p.title}: ${pts(p.pts / 100)}, CI ${pts(p.lo / 100)} to ${pts(p.hi / 100)}, n=${p.n}, ${p.pass ? "passes" : "fails"} FDR 10%. Filter to this topic`} onClick={() => drill({ cluster: p.cluster })}>
                <span className="fr-l"><b>{p.feature}</b><span className="meta">{p.scope ?? "all topics"} · n={fmtInt(p.n)} · p={p.p < 0.001 ? "<0.001" : p.p.toFixed(3)}</span></span>
                <Ci p={p} lim={lim} />
                <span className="fr-n">{pts(p.pts / 100)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="note">Grey = does not pass FDR 10%.{tested > all.length ? ` ${fmtInt(tested - all.length)} more tests ran but were not exported (they failed the analysis gates and count as p = 1).` : ""}</p>
      <DataTable caption="Prompt feature effects" head={["Feature", "Topic", "Effect", "CI low", "CI high", "n", "p", "FDR 10%"]} rows={all.map((p) => [p.feature, p.scope ?? "all", pts(p.pts / 100), pts(p.lo / 100), pts(p.hi / 100), p.n, p.p.toFixed(4), p.pass ? "pass" : "fail"])} />
    </details>
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

function Quality({ wide }: { wide: boolean }) {
  const { d, caps } = useStore();
  const { axes, you, top, by_source: bs, validation: val } = d.quality;
  const [tool, setTool] = useState("all");
  const mine = tool === "all" ? you : bs.find((b) => b.source === tool)?.values ?? you;
  if (!(you.length === axes.length && you.length > 0)) return null;
  return (
    <Card title="Prompt quality" meta="you against the top-outcome tercile" span={wide ? 12 : 7}
      actions={caps.multiTool && bs.length > 1 ? <Segmented label="Quality by tool" value={tool} onChange={setTool} options={[{ id: "all", text: "All" }, ...bs.map((b) => ({ id: b.source as string, text: srcLabel(b.source) }))]} /> : undefined}>
      <BarList label="Prompt quality sub-scores" max={1} rows={axes.map((a, i) => ({
        key: a, label: a, value: mine[i] ?? 0, color: "var(--accent)", mark: top[i] ?? 0, text: fmtPct(mine[i] ?? 0), sub: `top ${fmtPct(top[i] ?? 0)}`,
        aria: `${a}: you ${fmtPct(mine[i] ?? 0)}, top tercile ${fmtPct(top[i] ?? 0)}`,
      }))} />
      <p className="note">Tick = top tercile. {val.spearman !== null ? `Score vs outcome: Spearman ${val.spearman.toFixed(2)}, n=${fmtInt(val.n)}.` : "Score validation unavailable."} Aggregate, ignores filters.</p>
    </Card>
  );
}

export function Works() {
  const { d, caps } = useStore();
  const up = d.engine.upgrade;
  const topics = d.galaxy.clusters.some((k) => k.size > 0);
  return (
    <Section id="s-works" title="What works" q="Which habits pay off?">
      {caps.hasWhatWorks ? <Playbook /> : (
        <p className="s12 note unlock" id="s-playbook">{caps.hasModel
          ? "The prompt playbook appears once enough sessions exist to test prompt habits against outcomes."
          : <>The prompt playbook and topic map need the ML engine.{up ? <> Run <code>{up.command}</code> to unlock them.</> : null}</>}</p>
      )}
      {topics && <Topics />}<Quality wide={!topics} />
    </Section>
  );
}
