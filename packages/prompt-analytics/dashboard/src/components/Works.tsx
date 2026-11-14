import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { playbook, PLAYBOOK_MIN_SESSIONS, type Play } from "../lib/playbook";
import { useStore } from "../state";
import { fmtInt, fmtPct, fmtSigned, fmtUSD } from "../lib/format";
import { intentColor, srcLabel } from "../lib/palette";
import { ToolLogo } from "./Shell";
import { BarList, Card, Cols, DataTable, Empty, Section, Segmented } from "./ui";
import { noGain, promptBuckets } from "../lib/insights";
import { MIN_N } from "../lib/thresholds";
import "./govern.css";
import "./investigate.css";
import "./polish.css";

const pts = (x: number) => `${fmtSigned(x * 100)} pts`;

/** Shared CI strip: fixed width, one scale for every card, zero tick always visible. */
function Ci({ p, lim }: { p: Play; lim: number }) {
  const pos = (x: number) => `${50 + (x / lim) * 50}%`;
  return <span className="play-ci" aria-hidden="true" style={{ "--a": pos(p.lo), "--b": pos(p.hi), "--d": pos(p.pts) } as CSSProperties}><i /><em /></span>;
}

function PlayCard({ p, lim, on, onPick, copySlot }: { p: Play; lim: number; on: boolean; onPick: () => void; copySlot: boolean }) {
  const [copied, setCopied] = useState(false);
  const tm = useRef(0);
  useEffect(() => () => clearTimeout(tm.current), []);
  const copy = () => { if (!p.snippet) return; navigator.clipboard?.writeText(p.snippet).then(() => { setCopied(true); clearTimeout(tm.current); tm.current = window.setTimeout(() => setCopied(false), 1500); }, () => {}); };
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
  const best = more.length ? more.reduce((a, b) => (b.pts > a.pts ? b : a)) : null;
  const so = best ? <>{((t) => t.charAt(0).toUpperCase() + t.slice(1))(best.title.split(": ").pop() ?? "")} lifts applied rate by <b>{fmtInt(best.pts)}</b> pts: do more of it.</> : <>Nothing flagged in this window.</>;
  return (
    <Card so={so} thin={!best} id="s-playbook" src="what_works · overlapping groups" title="Prompt playbook" meta={d.what_works_tested ? `${fmtInt(b.tested)} tested · ${fmtInt(b.pass)} pass FDR 10% · all sessions. Click a card to filter to its topic` : "all sessions"} span={12}>
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
  const big = rows[0];
  return (
    <Card so={big ? <>{big.k.label} is your biggest topic: <b>{fmtInt(big.n)}</b> sessions.</> : "Nothing flagged in this window."} thin={!big} title={flat ? "Topics, grouped by keywords" : "Topics"} src="galaxy.clusters · sessions per topic" span={5}
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

const at = (x: number) => `${Math.min(1, Math.max(0, x)) * 100}%`;

/** You against the top-outcome tercile, one dumbbell per quality axis, biggest gap first. Axis count follows the export. */
function Quality({ wide }: { wide: boolean }) {
  const { d, caps } = useStore();
  const { axes, you, top, by_source: bs, validation: val } = d.quality;
  const [tool, setTool] = useState("all");
  const mine = tool === "all" ? you : bs.find((b) => b.source === tool)?.values ?? you;
  if (!(you.length === axes.length && you.length > 0)) return null;
  const rows = axes.map((a, i) => ({ a, you: mine[i] ?? 0, top: top[i] ?? 0 })).map((x) => ({ ...x, gap: x.top - x.you })).sort((p, q) => q.gap - p.gap);
  const gap = rows[0];
  return (
    <Card so={gap && gap.gap > 0 ? <>Biggest gap to your best sessions: {gap.a}, <b>{fmtInt(gap.gap * 100)}</b> pts behind.</> : "You match your best sessions on every axis."} thin={!(gap && gap.gap > 0)} title="Quality profile" src="quality.you vs quality.top" meta="you against the top-outcome tercile, biggest gap first" span={wide ? 12 : 7}
      actions={caps.multiTool && bs.length > 1 ? <Segmented label="Quality by tool" value={tool} onChange={setTool} options={[{ id: "all", text: "All" }, ...bs.map((b) => ({ id: b.source as string, text: srcLabel(b.source) }))]} /> : undefined}>
      <div className="dbs" role="group" aria-label="Prompt quality: you against your top-outcome tercile, per axis">{rows.map((x) => (
        <div key={x.a} className="db"><span className="gap-l">{x.a}</span>
          <div className="dbt" role="img" aria-label={`${x.a}: you ${fmtPct(x.you)}, top tercile ${fmtPct(x.top)}, gap ${pts(x.gap)}`}>
            <i className="seg" style={{ left: at(Math.min(x.you, x.top)), width: `calc(${at(Math.max(x.you, x.top))} - ${at(Math.min(x.you, x.top))})` }} /><i className="p" style={{ left: at(x.top) }} /><i className="c" style={{ left: at(x.you) }} />
          </div>
          <b>{pts(x.gap)}</b>
        </div>
      ))}</div>
      <p className="note">Coloured dot = you, grey dot = your top-outcome tercile; the number is the gap to close. {val.spearman !== null ? `Score vs outcome: Spearman ${val.spearman.toFixed(2)}, n=${fmtInt(val.n)}.` : "Score validation unavailable."} Aggregate, ignores filters.</p>
      <DataTable caption="Prompt quality, you against the top tercile" head={["Axis", "You", "Top tercile", "Gap"]} rows={rows.map((x) => [x.a, fmtPct(x.you), fmtPct(x.top), pts(x.gap)])} />
    </Card>
  );
}

/** Applied rate by prompt count, change sessions only, on a 0-100% scale with a Wilson whisker per column.
 *  Says "no gain" only when past 10 prompts is not clearly above 6-10. */
function NoGain() {
  const { v } = useStore();
  const bs = useMemo(() => promptBuckets(v.rows), [v.rows]), g = useMemo(() => noGain(v.rows), [v.rows]);
  const n = bs.reduce((a, b) => a + b.n, 0);
  if (n === 0) return null;
  const so = !g ? <>Not enough sessions yet: {bs[2].n < bs[3].n + bs[4].n ? bs[2].n : bs[3].n + bs[4].n} of {MIN_N} needed.</>
    : g.over.rate! < g.mid.rate! && g.flat ? <>Past <b>10</b> prompts, applied rate falls to {fmtPct(g.over.rate ?? 0)}: start fresh.</>
    : g.flat ? <>Past <b>10</b> prompts, applied rate stays {fmtPct(g.over.rate ?? 0)}: longer does not help.</>
    : <>Past <b>10</b> prompts, applied rate rises to {fmtPct(g.over.rate ?? 0)}.</>;
  // whisker x = centre of column i in a flex row with a 3px gap (matches .cols)
  const cx = (i: number) => `calc(${i + 0.5} * (100% + 3px) / ${bs.length} - 1.5px)`;
  return (
    <Card so={so} thin={!g} id="s-nogain" src={`sessions.prompts \u00b7 n ${fmtInt(n)}`} title="Applied rate by session length" meta="change sessions (not explain), in view, 95% Wilson CI" span={12}>
      <div className="ng-plot">
        <Cols label="Applied rate by prompts per session" height={96} max={1} cols={bs.map((b) => ({ key: b.label, label: b.label, segs: [{ v: b.rate ?? 0, color: b.n >= MIN_N ? "var(--accent)" : "var(--line-2)" }],
          aria: b.n ? `${b.label} prompts: ${fmtPct(b.rate ?? 0)} applied, 95% CI ${fmtPct(b.lo)} to ${fmtPct(b.hi)}, n=${b.n}${b.n < MIN_N ? ", too few to read alone" : ""}` : `${b.label} prompts: no sessions` }))} />
        <div className="ng-ci" aria-hidden="true">
          <span className="ng-top">100%</span>
          {bs.map((b, i) => b.n > 0 && <i key={b.label} style={{ left: cx(i), bottom: `${b.lo * 100}%`, height: `${(b.hi - b.lo) * 100}%` }} />)}
        </div>
      </div>
      <div className="ng-x" aria-hidden="true">{bs.map((b) => <span key={b.label}><b>{b.label}</b>{b.n ? (b.n < MIN_N ? `n=${b.n}` : fmtPct(b.rate ?? 0)) : "none"}</span>)}</div>
      <p className="note">Prompts per session, 0 to 100% applied; whiskers are 95% CIs, grey columns have fewer than {MIN_N} sessions. Longer sessions are often harder tasks, so this is association, not cause.</p>
      <DataTable caption="Applied rate by prompts per session" head={["Prompts", "Sessions", "Applied", "Rate", "95% CI"]} rows={bs.map((b) => [b.label, b.n, b.k, b.n ? fmtPct(b.rate ?? 0) : "-", b.n ? `${fmtPct(b.lo)} to ${fmtPct(b.hi)}` : "-"])} />
    </Card>
  );
}

/** The cleanest resolved sessions in this view: applied, no retry loops, cheapest first. A copy-this shortlist. */
function Best() {
  const { v, openSession } = useStore();
  const top = useMemo(() => v.rows.filter((r) => r.prompts > 0 && r.applied && r.loops === 0 && r.cost_usd !== null).sort((a, b) => (a.cost_usd as number) - (b.cost_usd as number) || a.friction - b.friction).slice(0, 5), [v.rows]);
  if (top.length === 0) return null;
  return (
    <Card so={<><b>{top.length}</b> session{top.length === 1 ? "" : "s"} applied first try, from {fmtUSD(top[0].cost_usd as number)} each.</>} title="Best sessions to copy" src="sessions · top resolved" meta="applied, no retries, cheapest first" span={12}>
      <div className="tw"><table className="best">
        <thead><tr><th scope="col">Session</th><th scope="col">Project</th><th scope="col">Intent</th><th scope="col" className="n">Cost</th></tr></thead>
        <tbody>{top.map((r) => (
          <tr key={r.id}>
            <td><button type="button" className="link" aria-label={`Open session: ${r.title}`} onClick={() => openSession(r.id)}><ToolLogo source={r.source} size={16} />{r.title}</button></td>
            <td>{r.project}</td><td>{r.intent}</td><td className="n">{r.cost_usd === null ? "unpriced" : fmtUSD(r.cost_usd)}</td>
          </tr>
        ))}</tbody>
      </table></div>
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
      {topics && <Topics />}<Quality wide={!topics} /><NoGain /><Best />
    </Section>
  );
}
