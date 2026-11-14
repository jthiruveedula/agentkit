import { useMemo, useState } from "react";
import { useStore } from "../state";
import { STAGES } from "../lib/filter";
import { MIN_PRIOR_N } from "../lib/thresholds";
import { fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { netValue } from "../lib/insights";
import { intentColor, SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { linkProps } from "../lib/motion";
import { BarList, Card, Cols, DataTable, Empty, Section, Segmented, pct } from "./ui";
import "./investigate.css";
import "./polish.css";

type By = "all" | "tool" | "intent";

/** Share lost from stage i-1 to stage i; null when stage i-1 is empty. */
const lost = (fn: number[], i: number) => (fn[i - 1] ? 1 - (fn[i] ?? 0) / fn[i - 1] : null);
const dropTxt = (x: number) => `\u2212${Math.round(x * 100)}%`;

/** Bars per stage; the sub line is the drop-off into each stage, with the previous period's drop when there is one (this replaced the Step rates card). */
function Stages() {
  const { v, f, drill, prior } = useStore();
  const top = v.funnel[0] ?? 0;
  return top === 0 ? <Empty /> : (
    <>
      <BarList cascade label="Sessions reaching each funnel stage" rows={STAGES.map((s, i) => {
        const n = v.funnel[i] ?? 0, d = i ? lost(v.funnel, i) : null, pf = prior?.v.funnel, was = d !== null && pf && (pf[0] ?? 0) >= MIN_PRIOR_N ? lost(pf, i) : null;   // same base guard as delta()
        const sub = d === null ? undefined : `${dropTxt(d)} at ${s.toLowerCase()}${was === null ? "" : `, was ${dropTxt(was)}`}`;
        return { key: s, label: s, value: n, color: "var(--accent)", active: f.stage === i + 1, text: `${fmtInt(n)} · ${pct(n, top)}`, sub,
          aria: `${s}: ${n} sessions, ${pct(n, top)} of all${sub ? `, ${sub}` : ""}. Filter to sessions that reached ${s.toLowerCase()}`, onClick: () => drill({ stage: i + 1 }) };
      })} />
      <ul className="drops" aria-label="Where sessions stop">
        {STAGES.slice(0, -1).map((s, i) => {
          const lost = (v.funnel[i] ?? 0) - (v.funnel[i + 1] ?? 0);
          return (
            <li key={s}><button type="button" className="chip" aria-pressed={f.stageExact === i + 1} disabled={lost <= 0} onClick={() => drill({ stageExact: i + 1 })}
              aria-label={`${fmtInt(lost)} sessions stopped after ${s.toLowerCase()}. Filter to them`}>{s} to {STAGES[i + 1]}: -{fmtInt(lost)}</button></li>
          );
        })}
      </ul>
    </>
  );
}

function Minis({ by }: { by: By }) {
  const { v, f, drill } = useStore();
  const rows = by === "tool" ? v.funnelBySource : v.funnelByIntent;
  if (rows.length === 0) return <Empty />;
  return (
    <div className="minis">
      {rows.map((x) => {
        const t = x.counts[0] ?? 0, color = by === "tool" ? srcColor(x.key) : intentColor(x.key), label = by === "tool" ? srcLabel(x.key) : x.key;
        const on = by === "tool" ? f.source === x.key : f.intent === x.key;
        return (
          <div key={x.key} className="mini" data-on={on || undefined} {...(by === "tool" ? linkProps(`tool:${x.key}`) : {})}>
            <button type="button" className="mini-h" aria-pressed={on} onClick={() => drill(by === "tool" ? { source: x.key as never } : { intent: x.key as never })}
              aria-label={`${label}: ${t} sessions, ${pct(x.counts[4] ?? 0, t)} applied. Filter`}><span className="sw" style={{ "--c": color } as React.CSSProperties} />{label}</button>
            <Cols label={`${label} funnel`} height={44} cols={STAGES.map((s, i) => ({ key: s, label: s, segs: [{ v: t ? (x.counts[i] ?? 0) / t : 0, color }], aria: `${s}: ${x.counts[i] ?? 0}` }))} />
            <span className="meta">{fmtInt(t)} sessions · {pct(x.counts[4] ?? 0, t)} applied</span>
          </div>
        );
      })}
    </div>
  );
}

/** Outcome per intent: what a session of each kind costs per applied change. Cheapest first; a row filters to the intent. */
function NetValue() {
  const { v, f, drill } = useStore();
  const rows = useMemo(() => netValue(v.rows), [v.rows]);
  if (rows.length === 0) return null;
  const dear = rows.filter((r) => r.cpa !== null).reduce<(typeof rows)[number] | null>((a, b) => (!a || (b.cpa as number) > (a.cpa as number) ? b : a), null);
  return (
    <Card so={dear ? <>{dear.intent} is dearest: <b>{fmtUSD(dear.cpa as number)}</b> per applied change.</> : "Nothing flagged in this window."} thin={!dear} src={`sessions by intent \u00b7 n ${fmtInt(rows.reduce((a, r) => a + r.n, 0))}`} title="Net value per intent" meta="cost per applied change counts priced sessions only; cheapest first" span={12}>
      <div className="tbl-wrap"><table className="tbl nv">
        <thead><tr><th scope="col">Intent</th><th scope="col" className="n">Sessions</th><th scope="col" className="n">Applied</th><th scope="col" className="n">Cost per applied</th><th scope="col" className="n">Median prompts</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.intent} data-sel={f.intent === r.intent || undefined}>
            <th scope="row"><button type="button" className="link" aria-pressed={f.intent === r.intent} aria-label={`${r.intent}: ${r.n} sessions, ${fmtPct(r.rate)} applied, ${r.cpa === null ? "no priced applied change" : `${fmtUSD(r.cpa)} per applied change`}. Filter to this intent`}
              onClick={() => drill({ intent: r.intent })}><span className="sw" style={{ "--c": intentColor(r.intent) } as React.CSSProperties} />{r.intent}</button></th>
            <td className="n">{fmtInt(r.n)}</td><td className="n">{fmtPct(r.rate)}</td><td className="n">{r.cpa === null ? "\u2014" : fmtUSD(r.cpa)}</td><td className="n">{+r.medPrompts.toFixed(1)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

/** Header text with a break hint, so a narrow column wraps the name instead of truncating it ("Antigr…"). */
const WRAP: Record<string, string> = { opencode: "Open\u200bCode", antigravity: "Anti\u00adgravity" };

function Switches() {
  const { d, drill, f } = useStore();
  const srcs = SOURCES.filter((s) => d.tool_switch.some((t) => t.from === s || t.to === s));
  const get = (a: string, b: string) => d.tool_switch.find((t) => t.from === a && t.to === b)?.count ?? 0;
  const peak = Math.max(...d.tool_switch.map((t) => t.count), 1);
  const { group, mark } = useRoving(srcs.length * srcs.length, 1, Math.max(1, srcs.length));
  const moves = d.tool_switch.filter((t) => t.from !== t.to && srcs.includes(t.from) && srcs.includes(t.to));
  const topMove = moves.reduce<(typeof moves)[number] | null>((a, b) => (!a || b.count > a.count ? b : a), null);
  return (
    <Card so={topMove ? <><b>{fmtInt(moves.reduce((a, t) => a + t.count, 0))}</b> switches, most often {srcLabel(topMove.from)} to {srcLabel(topMove.to)}.</> : "Nothing flagged in this window."} thin={!topMove} src="tool_switch \u00b7 all sessions" title="Tool switches" meta="all sessions: same project, under 24 h apart" span={6}>
      {srcs.length === 0 ? <Empty>No switches</Empty> : (
        <>
          <div className="mx" role="group" aria-label="Tool switches, from row to column. Each cell filters by the tool switched from" style={{ "--cols": srcs.length } as React.CSSProperties} {...group}>
            <span className="mx-h" />{srcs.map((s) => <span key={s} className="mx-h" title={`to ${srcLabel(s)}`}>{WRAP[s] ?? srcLabel(s)}</span>)}
            {srcs.map((a, r) => (
              <div key={a} style={{ display: "contents" }}>
                <span className="mx-l" title={`from ${srcLabel(a)}`}>{srcLabel(a)}</span>
                {srcs.map((b, c) => {
                  const n = get(a, b);
                  return n === 0 ? <span key={b} className="cell none" aria-hidden="true" /> : (
                    <button key={b} type="button" className="cell" aria-pressed={f.source === a} style={{ "--v": n / peak, "--d": r + c } as React.CSSProperties} title={`${srcLabel(a)} to ${srcLabel(b)}: ${n}`}
                      aria-label={`${srcLabel(a)} to ${srcLabel(b)}: ${n} switches. Filter to sessions that started in ${srcLabel(a)}`} onClick={() => drill({ source: a })} {...mark(r * srcs.length + c)}>{n}</button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="note">Rows are the tool left, columns the tool moved to. A click filters by the origin tool only.</p>
          <DataTable caption="Tool switches" head={["From", "To", "Count"]} rows={d.tool_switch.map((t) => [srcLabel(t.from), srcLabel(t.to), t.count])} />
        </>
      )}
    </Card>
  );
}

export function Funnel() {
  const { d, v, caps } = useStore();
  const [want, setBy] = useState<By>("all");
  const by: By = want === "tool" && !caps.multiTool ? "intent" : want;   // one tool: break down by intent instead
  const switches = caps.multiTool && d.tool_switch.some((t) => t.from !== t.to && caps.sources.includes(t.from) && caps.sources.includes(t.to));
  const drops = STAGES.slice(0, -1).map((s, i) => ({ s, to: STAGES[i + 1], lost: (v.funnel[i] ?? 0) - (v.funnel[i + 1] ?? 0) }));
  const big = drops.reduce((a, b) => (b.lost > a.lost ? b : a), drops[0]), top = v.funnel[0] ?? 0;
  const so = top > 0 && big.lost > 0 ? <>Biggest drop is {big.s.toLowerCase()} to {big.to.toLowerCase()}: <b>{Math.round((big.lost / top) * 100)}%</b> of sessions stop there.</> : "Nothing flagged in this window.";
  return (
    <Section id="s-funnel" title="Funnel" q="Where do sessions stop?">
      <Card so={so} thin={!(top > 0 && big.lost > 0)} src={`funnel.stages \u00b7 n ${fmtInt(v.funnel[0] ?? 0)}`} title="Session to resolved" meta={d.engine.methods.funnel ?? "sessions reaching each stage"} span={switches ? 6 : 12}
        actions={<Segmented label="Break funnel down by" value={by} onChange={setBy} options={[{ id: "all", text: "All" }, ...(caps.multiTool ? [{ id: "tool" as const, text: "Tool" }] : []), { id: "intent", text: "Intent" }]} />}>
        {by === "all" ? <Stages /> : <Minis by={by} />}
        <DataTable caption="Funnel stages" head={["Stage", "Sessions"]} rows={STAGES.map((s, i) => [s, v.funnel[i] ?? 0])} />
      </Card>
      {switches && <Switches />}
      <NetValue />
    </Section>
  );
}
