import { useMemo } from "react";
import { useStore } from "../state";
import { fitMatrix, estSaving, tierOf, taskSize, TIERS, SIZES } from "../lib/models";
import { fmtPct, fmtUSD } from "../lib/format";
import { srcLabel } from "../lib/palette";
import { Card, Empty, Section } from "./ui";
import { ToolLogo } from "./Shell";
import "./modelfit.css";

const MIN_TOOL_N = 15;
const FIT = { ok: "matched", over: "oversized", under: "undersized" } as const;

export function ModelFit() {
  const { v } = useStore();
  const rows = v.rows;
  const fit = useMemo(() => fitMatrix(rows), [rows]);
  const saving = useMemo(() => estSaving(rows), [rows]);
  const tools = useMemo(() => {
    const by = new Map<string, { n: number; over: number; under: number }>();
    for (const s of rows) {
      const t = tierOf(s.model);
      if (t === null || s.prompts <= 0) continue;
      const z = taskSize(s), e = by.get(s.source) ?? { n: 0, over: 0, under: 0 };
      e.n++; if (t > z) e.over++; else if (t < z) e.under++;
      by.set(s.source, e);
    }
    return [...by].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);

  const n = fit.n, p = (x: number) => (n ? fmtPct(x / n) : "–");
  const kpis: [string, string, string][] = [
    ["Right-sized", p(fit.right), "matched tier"],
    ["Overkill", p(fit.over), "more model than needed"],
    ["Underpowered", p(fit.under), "smaller than needed"],
    ["Est. saving", saving === null ? "–" : `≥ ${fmtUSD(saving)}`, saving === null || !v.totals.cost ? "no priced data" : `${fmtPct(saving / v.totals.cost)} of spend`],
  ];
  const light = fit.m[0].reduce((a, x) => a + x, 0);
  const soMx = light ? <><b>{Math.round((fit.m[0][2] / light) * 100)}%</b> of light tasks ran on the top tier.</> : "Nothing flagged in this window.";
  const soChg = saving ? <>Move light tasks to a smaller model: saves at least <b>{fmtUSD(saving)}</b> (estimate).</> : "Nothing flagged in this window.";
  return (
    <Section id="s-models" title="Model fit" q="Is the model sized to the task?">
      {n === 0 ? <div className="s12"><Empty>No sessions with a known model</Empty></div> : <>
        <ul className="mf-kpis">
          {kpis.map(([l, val, sub]) => (
            <li key={l} className="kpi"><span className="lbl">{l}</span><b className="val">{val}</b><span className="sub">{sub}</span></li>
          ))}
        </ul>
        <Card so={soMx} thin={!light} title="Task size × model tier" span={6} half src={`model fit (offline model) · n ${n} · estimate`}>
          <table className="mf-mx" aria-label="Task size against model tier, session counts">
            <thead><tr><td aria-hidden="true" style={{ border: 0 }} />{TIERS.map((t) => <th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>{SIZES.map((sz, z) => (
              <tr key={sz}><th scope="row">{sz}</th>{TIERS.map((t, i) => {
                const k = i === z ? "ok" : i > z ? "over" : "under";
                return <td key={t} data-fit={k}><b>{fit.m[z][i]}</b><span>{FIT[k]}</span></td>;
              })}</tr>
            ))}</tbody>
          </table>
        </Card>
        <Card so={soChg} thin={!saving} title="What to change" span={6} half src="model fit · estimate, untested">
          <ul className="mf-recs">{tools.map(([src, e]) => {
            const msg = e.n < MIN_TOOL_N ? "too few sessions"
              : e.over / e.n >= 0.3 ? `Use a smaller model on light tasks (${e.over}/${e.n} oversized).`
              : e.under / e.n >= 0.2 ? `Use a stronger model on heavy work (${e.under}/${e.n} undersized).`
              : "Mostly right-sized.";
            return (
              <li key={src}>
                <span className="nm"><ToolLogo source={src} /><span>{srcLabel(src)}<span className="meta">{e.n} sessions</span></span></span>
                <span>{msg}</span>
              </li>
            );
          })}</ul>
        </Card>
      </>}
    </Section>
  );
}
