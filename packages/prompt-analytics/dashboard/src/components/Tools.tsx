import { useMemo, useState } from "react";
import { useStore } from "../state";
import { costPerApplied, sparkSeries, METRICS } from "../lib/compare";
import { router, ROUTER_MIN_N, type RouterCell } from "../lib/econ";
import { fmtCompact, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { INTENTS, SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { linkProps } from "../lib/motion";
import { BarList, Card, DataTable, Empty, Section } from "./ui";
import { Ramp, Spark } from "./charts";
import { MIN_N, ciText } from "../lib/stats";
import { unpricedNote } from "../lib/capabilities";

type Col = "sessions" | "prompts" | "tokens" | "cost" | "cpa" | "applied" | "friction" | "ttr";
const COLS: { id: Col; text: string; hide?: boolean }[] = [
  { id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts", hide: true }, { id: "tokens", text: "Tokens", hide: true }, { id: "cost", text: "Cost" },
  { id: "cpa", text: "$ / applied", hide: true }, { id: "applied", text: "Applied" }, { id: "friction", text: "Friction" }, { id: "ttr", text: "Median TTR", hide: true },
];

function Scorecard() {
  const { d, v, f, win, drill, caps } = useStore();
  const cols = COLS.filter((c) => (caps.hasCost || (c.id !== "cost" && c.id !== "cpa")) && (caps.hasTtr || c.id !== "ttr"));
  const on = (k: Col) => cols.some((c) => c.id === k);
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
            {cols.map((c) => <th key={c.id} scope="col" className={c.hide ? "hide-s" : ""} aria-sort={sort.k === c.id ? (sort.desc ? "descending" : "ascending") : "none"}>
              <button type="button" className="th-b" onClick={() => setSort({ k: c.id, desc: sort.k === c.id ? !sort.desc : true })}>{c.text}{sort.k === c.id ? (sort.desc ? " ▾" : " ▴") : ""}</button></th>)}
            <th scope="col" className="hide-s">Trend</th><th scope="col" className="hide-s">Status</th>
          </tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.key} {...linkProps(`tool:${r.key}`)} data-sel={f.source === r.key || undefined} style={{ "--i": sorted.indexOf(r) } as React.CSSProperties}>
              <th scope="row"><button type="button" aria-pressed={f.source === r.key} onClick={() => drill({ source: r.key as never })} aria-label={`${srcLabel(r.key)}: ${r.t.sessions} sessions. Filter to this tool`}>
                <span className="sw" style={{ "--c": srcColor(r.key) } as React.CSSProperties} />{srcLabel(r.key)}</button></th>
              <td>{fmtInt(r.t.sessions)}</td><td className="hide-s">{fmtInt(r.t.prompts)}</td><td className="hide-s">{fmtCompact(r.t.tokens)}</td>
              {on("cost") && <td>{r.t.cost === null ? <span className="tag">not priced</span> : <>{fmtUSD(r.t.cost)}{r.est ? <span className="tag">estimate</span> : null}</>}</td>}
              {on("cpa") && <td className="hide-s">{r.cpa === null ? "-" : fmtUSD(r.cpa)}</td>}
              <td data-low={r.t.asked < MIN_N || undefined} title={r.t.asked ? ciText(r.t.applied, r.t.asked) : undefined}>{r.t.asked ? <>{fmtPct(r.t.applied / r.t.asked)} <small className="n">n={fmtInt(r.t.asked)}{r.t.asked < MIN_N ? ", low" : ""}</small></> : "-"}</td><td>{r.t.asked ? r.t.friction.toFixed(2) : "-"}</td>
              {on("ttr") && <td className="hide-s">{r.ttr === null ? "-" : `${r.ttr.toFixed(1)} min`}</td>}
              <td className="hide-s"><Spark values={r.spark} w={64} h={18} /></td>
              <td className="hide-s"><span className="tag" data-st={r.status}>{r.status}</span></td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="note">{[on("ttr") && "Median TTR is an all-sessions aggregate and ignores filters.", on("cpa") && "$ / applied counts priced sessions only.", unpricedNote(caps)].filter(Boolean).join(" ")}</p>
      <DataTable caption="Tool scorecard" head={["Tool", "Sessions", ...(caps.hasCost ? ["Cost USD"] : []), "Applied %", "Friction"]} rows={sorted.map((r) => [srcLabel(r.key), r.t.sessions, ...(caps.hasCost ? [r.t.cost === null ? "not priced" : +r.t.cost.toFixed(2)] : []), r.t.asked ? fmtPct(r.t.applied / r.t.asked) : "-", r.t.friction.toFixed(2)])} />
    </>
  );
}

const PROJECT_COLS = 6;
const NO_PROJECT = "(no project)";
/** Tool router: for each kind of change, which tool lands it. With one tool in view it pivots to intent x project,
 *  so the question becomes "where does this kind of change land". Applied rate per cell, mean loops, Wilson-gated winner. */
function Router() {
  const { d, v, f, drill, caps, capsAll } = useStore();
  const byProject = !capsAll.multiTool;
  const colOf = useMemo(() => (byProject ? (r: { project: string }) => r.project || NO_PROJECT : undefined), [byProject]);
  const rt = useMemo(() => router(v.rows, d.ttr, ROUTER_MIN_N, colOf), [v.rows, d.ttr, colOf]);
  const tops = useMemo(() => (byProject ? v.projects.filter((p) => p.asked > 0).slice(0, PROJECT_COLS).map((p) => p.key) : SOURCES as string[]), [byProject, v.projects]);
  const srcs = tops.filter((s) => rt.sources.includes(s)), ints = INTENTS.filter((i) => rt.intents.includes(i));
  const colName = (c: string) => (byProject ? c : srcLabel(c));
  const peak = Math.max(...[...rt.cells.values()].filter((c) => c.enough && srcs.includes(c.source)).map((c) => c.rate), 1e-9);
  const { group, mark } = useRoving(ints.length * srcs.length, 1, Math.max(1, srcs.length));
  const best = ints.filter((i) => rt.best.has(i) && srcs.includes(rt.best.get(i)!.source)).map((i) => ({ i, c: rt.best.get(i)! }));
  const cellText = (c: RouterCell) => `${fmtPct(c.rate)} applied (${ciText(Math.round(c.rate * c.n), c.n)}), ${c.loops.toFixed(1)} mean loops, n=${c.n}`;
  const what = byProject ? "project" : "tool";
  const pair = caps.sourceCount === 2 ? `${srcLabel(caps.sources[0])} vs ${srcLabel(caps.sources[1])}` : "";
  const filterOf = (s: string, i: string) => (byProject ? { project: s === NO_PROJECT ? "" : s, intent: i as never } : { source: s as never, intent: i as never });
  const title = byProject ? "Where each kind of change lands" : pair ? `${pair}, by intent` : "Tool router";
  const meta = byProject ? `applied rate by intent and project in your ${caps.names} sessions${v.projects.length > PROJECT_COLS ? `, top ${PROJECT_COLS} projects` : ""}` : "applied rate by tool and intent, cross-filtered";
  return (
    <Card id="s-router" title={title} meta={meta} span={byProject || !caps.hasCost ? 12 : 7}>
      {srcs.length === 0 || ints.length === 0 ? <Empty /> : (
        <>
          <p className="rt-best">{best.length ? <>{byProject ? "Lands best in" : pair ? "Clear edge" : "Best tool"}: {best.map(({ i, c }, k) => <span key={i}>{k > 0 && "; "}<b>{i}</b> {colName(c.source)} {fmtPct(c.rate)}</span>)}.</>
            : <>No clear winner yet: no {what}'s lower bound beats the runner-up for any intent{srcs.length < 2 ? ` (needs two ${what}s with ${ROUTER_MIN_N}+ sessions)` : ""}.</>}</p>
          <div className="mx rt" role="group" aria-label={`Applied rate by ${what} and intent. Each cell filters that pair`} style={{ "--cols": srcs.length } as React.CSSProperties} {...group}>
            <span />{srcs.map((s) => <span key={s} className="mx-h" title={colName(s)}>{colName(s)}</span>)}
            {ints.map((i, r) => (
              <div key={i} style={{ display: "contents" }}>
                <span className="mx-l">{i}</span>
                {srcs.map((s, col) => {
                  const c = rt.cells.get(`${s}|${i}`);
                  if (!c) return <span key={s} className="cell none" title={`${colName(s)} / ${i}: no sessions`} />;
                  const fl = filterOf(s, i), on = Object.entries(fl).every(([k, x]) => (f as Record<string, unknown>)[k] === x), isBest = rt.best.get(i) === c;
                  return (
                    <button key={s} type="button" className="cell" data-low={!c.enough || undefined} data-thin={(c.enough && c.n < MIN_N) || undefined} data-best={isBest || undefined} aria-pressed={on} style={{ "--v": c.enough ? c.rate / peak : 0, "--d": r + col } as React.CSSProperties}
                      aria-label={`${colName(s)} on ${i}: ${c.enough ? cellText(c) : `not enough data, n=${c.n}`}${isBest ? `, best ${what} for this intent` : ""}. Filter`} title={`${colName(s)} / ${i}: ${c.enough ? cellText(c) : `not enough data (n=${c.n} < ${ROUTER_MIN_N})`}`}
                      onClick={() => drill(fl)} {...mark(r * srcs.length + col)}>
                      {c.enough ? <><b>{fmtPct(c.rate)}</b><small>{c.loops.toFixed(1)} mean loops</small></> : <small aria-hidden="true">–</small>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <Ramp max={peak} label="Applied rate" />
          <p className="note">Outlined = clear winner for that intent. Loops = mean rephrases per session. Blank = no sessions; – = fewer than {ROUTER_MIN_N} sessions.</p>
          <DataTable caption={`${title}: applied rate and mean loops by ${what} and intent`} head={["Intent", byProject ? "Project" : "Tool", "Sessions", "Applied", "Mean loops", ...(byProject ? [] : ["Median TTR"])]}
            rows={ints.flatMap((i) => srcs.map((s) => rt.cells.get(`${s}|${i}`)).filter(Boolean).map((c) => [i, colName(c!.source), c!.n, c!.enough ? fmtPct(c!.rate) : "not enough data", c!.loops.toFixed(1), ...(byProject ? [] : [c!.ttr === null ? "-" : `${Math.round(c!.ttr)} min`])]))} />
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
          ent: `tool:${t.key}`, aria: `${srcLabel(t.key)}: ${fmtUSD(t.cost as number)}. Filter to this tool`, onClick: () => drill({ source: t.key as never }),
        }))} />
      )}
      {unpriced.length > 0 && <p className="note">Not priced: {unpriced.map((t) => srcLabel(t.key)).join(", ")}. These record no price, so they are left out rather than shown as $0.</p>}
    </Card>
  );
}

export function Tools() {
  const { caps, capsAll } = useStore();
  // One tool in the export: no scorecard ("1 of 1") or cost split; the router pivots to projects.
  // (Filtering a multi-tool export to one tool keeps the table so the row can be toggled off.)
  if (!capsAll.multiTool) return (
    <Section id="s-tools" title="Projects" q={`Where do your ${caps.names} sessions land?`}>
      <Router />
    </Section>
  );
  if (!caps.multiTool) {   // a multi-tool export filtered to one tool: never a "1 of 1" scorecard; the row clears the filter
    const one = caps.names || "this tool";
    return (
      <Section id="s-tools" title="Tools" q={`How does ${one} land your work?`}>
        <Card title={`Tool: ${one}, click to clear`} meta="filtered to one tool" span={12}><Scorecard /></Card>
        <Router />
      </Section>
    );
  }
  const pair = caps.sourceCount === 2 ? `${srcLabel(caps.sources[0])} or ${srcLabel(caps.sources[1])}` : "";
  return (
    <Section id="s-tools" title="Tools" q={caps.hasCost ? (pair ? `${pair}: which earns its cost?` : "Which tool earns its cost?") : (pair ? `${pair}: which lands the work?` : "Which tool lands the work?")}>
      <Card title={pair ? `${pair}, side by side` : "Tool scorecard"} meta="click a row to filter" span={12}><Scorecard /></Card>
      <Router />
      {caps.hasCost && <CostShare />}
    </Section>
  );
}
