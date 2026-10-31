import { useMemo, useState } from "react";
import { useStore } from "../state";
import { costPerApplied, crossTally, sparkSeries, METRICS } from "../lib/compare";
import { fmtCompact, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { INTENTS, SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { BarList, Card, DataTable, Empty, Section, Segmented } from "./ui";
import { Spark } from "./charts";

type Col = "sessions" | "prompts" | "tokens" | "cost" | "cpa" | "applied" | "friction" | "ttr";
const COLS: { id: Col; text: string; hide?: boolean }[] = [
  { id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts", hide: true }, { id: "tokens", text: "Tokens", hide: true }, { id: "cost", text: "Cost" },
  { id: "cpa", text: "$ / applied", hide: true }, { id: "applied", text: "Applied" }, { id: "friction", text: "Friction" }, { id: "ttr", text: "Median TTR", hide: true },
];

function Scorecard() {
  const { d, v, f, win, drill } = useStore();
  const [sort, setSort] = useState<{ k: Col; desc: boolean }>({ k: "sessions", desc: true });
  const rows = useMemo(() => v.sources.map((t) => {
    const mine = v.rows.filter((r) => r.source === t.key);
    const tt = d.ttr.filter((x) => x.source === t.key), n = tt.reduce((a, x) => a + x.n, 0);
    return {
      key: t.key, t, est: d.by_source.find((s) => s.source === t.key)?.cost_is_estimate ?? false, cpa: costPerApplied(mine).value,
      ttr: n ? tt.reduce((a, x) => a + x.n * x.median_min, 0) / n : null, status: d.sources.find((s) => s.source === t.key)?.status ?? "ok",
      spark: sparkSeries(mine, win, METRICS.sessions).slice(-8),
    };
  }), [d, v, win]);
  const val = (r: (typeof rows)[number], k: Col): number => (k === "applied" ? (r.t.asked ? r.t.applied / r.t.asked : 0) : k === "cpa" ? r.cpa ?? -1 : k === "ttr" ? r.ttr ?? -1 : k === "cost" ? r.t.cost ?? -1 : r.t[k]);
  const sorted = [...rows].sort((a, b) => (sort.desc ? -1 : 1) * (val(a, sort.k) - val(b, sort.k)) || a.key.localeCompare(b.key));
  if (rows.length === 0) return <Empty>No tool has sessions here.</Empty>;
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl sc">
          <thead><tr>
            <th scope="col">Tool</th>
            {COLS.map((c) => <th key={c.id} scope="col" className={c.hide ? "hide-s" : ""} aria-sort={sort.k === c.id ? (sort.desc ? "descending" : "ascending") : "none"}>
              <button type="button" className="th-b" onClick={() => setSort({ k: c.id, desc: sort.k === c.id ? !sort.desc : true })}>{c.text}{sort.k === c.id ? (sort.desc ? " ▾" : " ▴") : ""}</button></th>)}
            <th scope="col" className="hide-s">Trend</th><th scope="col" className="hide-s">Status</th>
          </tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.key} data-sel={f.source === r.key || undefined}>
              <th scope="row"><button type="button" aria-pressed={f.source === r.key} onClick={() => drill({ source: r.key as never })} aria-label={`${srcLabel(r.key)}: ${r.t.sessions} sessions. Filter to this tool`}>
                <span className="sw" style={{ "--c": srcColor(r.key) } as React.CSSProperties} />{srcLabel(r.key)}</button></th>
              <td>{fmtInt(r.t.sessions)}</td><td className="hide-s">{fmtInt(r.t.prompts)}</td><td className="hide-s">{fmtCompact(r.t.tokens)}</td>
              <td>{r.t.cost === null ? <span className="tag">not priced</span> : <>{fmtUSD(r.t.cost)}{r.est ? <span className="tag">estimate</span> : null}</>}</td>
              <td className="hide-s">{r.cpa === null ? "-" : fmtUSD(r.cpa)}</td>
              <td>{r.t.asked ? fmtPct(r.t.applied / r.t.asked) : "-"}</td><td>{r.t.asked ? r.t.friction.toFixed(2) : "-"}</td>
              <td className="hide-s">{r.ttr === null ? "-" : `${r.ttr.toFixed(1)} min`}</td>
              <td className="hide-s"><Spark values={r.spark} w={64} h={18} /></td>
              <td className="hide-s"><span className="tag" data-st={r.status}>{r.status}</span></td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="note">Median TTR is an all-sessions aggregate and ignores filters. $ / applied counts priced sessions only.</p>
      <DataTable caption="Tool scorecard" head={["Tool", "Sessions", "Cost USD", "Applied %", "Friction"]} rows={sorted.map((r) => [srcLabel(r.key), r.t.sessions, r.t.cost === null ? "not priced" : +r.t.cost.toFixed(2), r.t.asked ? fmtPct(r.t.applied / r.t.asked) : "-", r.t.friction.toFixed(2)])} />
    </>
  );
}

type M = "ttr" | "friction" | "applied";
const LOW_N = 5;

function Matrix() {
  const { d, v, f, drill } = useStore();
  const [m, setM] = useState<M>("friction");
  const cross = useMemo(() => crossTally(v.rows), [v.rows]);
  const srcs = SOURCES.filter((s) => v.sources.some((t) => t.key === s));
  const ints = INTENTS.filter((i) => v.intents.some((t) => t.key === i));
  const cell = (s: string, i: string) => {
    if (m === "ttr") { const t = d.ttr.find((x) => x.source === s && x.intent === i); return t ? { val: t.median_min, text: `${Math.round(t.median_min)}m`, n: t.n } : null; }
    const c = cross.get(`${s}|${i}`);
    return c && c.asked > 0 ? { val: m === "friction" ? c.friction : c.applied / c.asked, text: m === "friction" ? c.friction.toFixed(2) : fmtPct(c.applied / c.asked), n: c.asked } : null;
  };
  const all = ints.flatMap((i) => srcs.map((s) => cell(s, i)?.val ?? 0));
  const peak = Math.max(...all, 1e-9);
  const { group, mark } = useRoving(ints.length * srcs.length, 1, Math.max(1, srcs.length));
  const label = m === "ttr" ? "Median minutes to resolution" : m === "friction" ? "Mean friction" : "Applied rate";
  return (
    <Card title="Tool by intent" meta={m === "ttr" ? "median minutes, all sessions" : `${label.toLowerCase()}, cross-filtered`} span={7}
      actions={<Segmented label="Matrix metric" value={m} onChange={setM} options={[{ id: "ttr", text: "TTR" }, { id: "friction", text: "Friction" }, { id: "applied", text: "Applied" }]} />}>
      {srcs.length === 0 || ints.length === 0 ? <Empty /> : (
        <>
          <div className="mx" role="group" aria-label={`${label} by tool and intent. Each cell filters that pair`} style={{ "--cols": srcs.length } as React.CSSProperties} {...group}>
            <span />{srcs.map((s) => <span key={s} className="mx-h" title={srcLabel(s)}>{srcLabel(s).split(" ")[0]}</span>)}
            {ints.map((i, r) => (
              <div key={i} style={{ display: "contents" }}>
                <span className="mx-l">{i}</span>
                {srcs.map((s, c) => {
                  const x = cell(s, i);
                  if (!x) return <span key={s} className="cell none" aria-hidden="true" />;
                  const on = f.source === s && f.intent === i;
                  return (
                    <button key={s} type="button" className="cell" data-low={x.n < LOW_N || undefined} aria-pressed={on} style={{ "--v": x.val / peak } as React.CSSProperties}
                      aria-label={`${srcLabel(s)} on ${i}: ${label.toLowerCase()} ${x.text}, n=${x.n}${x.n < LOW_N ? ", low sample" : ""}. Filter`} title={`${srcLabel(s)} / ${i}: ${x.text}, n=${x.n}${x.n < LOW_N ? " (low n)" : ""}`}
                      onClick={() => drill({ source: s, intent: i as never })} {...mark(r * srcs.length + c)}>{x.text}</button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="note">Hatched = fewer than {LOW_N} sessions.</p>
        </>
      )}
    </Card>
  );
}

function CostShare() {
  const { v, f, drill } = useStore();
  const rows = v.sources.filter((t) => t.cost !== null);
  const unpriced = v.sources.filter((t) => t.cost === null);
  return (
    <Card title="Cost by tool" meta="priced tools only" span={5}>
      {rows.length === 0 ? <Empty>No priced sessions here.</Empty> : (
        <BarList label="Cost by tool. Each filters that tool" rows={rows.map((t) => ({
          key: t.key, label: srcLabel(t.key), value: t.cost as number, color: srcColor(t.key), active: f.source === t.key, text: fmtUSD(t.cost as number), sub: `${fmtInt(t.sessions)} sessions`,
          aria: `${srcLabel(t.key)}: ${fmtUSD(t.cost as number)}. Filter to this tool`, onClick: () => drill({ source: t.key as never }),
        }))} />
      )}
      {unpriced.length > 0 && <p className="note">Not priced: {unpriced.map((t) => srcLabel(t.key)).join(", ")}. These record no price, so they are left out rather than shown as $0.</p>}
    </Card>
  );
}

export function Tools() {
  return (
    <Section id="s-tools" title="Tools" q="Which tool earns its cost?">
      <Card title="Tool scorecard" meta="click a row to filter" span={12}><Scorecard /></Card>
      <Matrix />
      <CostShare />
    </Section>
  );
}
