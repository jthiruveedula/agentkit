import { useStore } from "../state";
import { MAX_LOOPS } from "../lib/filter";
import { fmtInt, fmtPct } from "../lib/format";
import { srcLabel } from "../lib/palette";
import { BarList, Cols, DataTable, Empty, Panel } from "./ui";
import { Exposure } from "./Exposure";

export function Friction() {
  const { d, v, f, drill } = useStore();
  const m = d.engine.methods.friction;
  const loops = v.loops;
  const any = loops.some((l) => l.sessions > 0);
  const rates = d.friction.rates.filter((r) => !f.source || r.source === f.source);
  return (
    <div className="grid">
      <Panel title="Friction by intent" meta={m ?? "mean friction score, 0 to 1"} span={5}>
        {v.frictionByIntent.length === 0 ? <Empty /> : (
          <BarList label="Friction by intent" max={1} rows={v.frictionByIntent.map((x) => ({
            key: x.intent, label: x.intent, value: x.friction, color: "var(--bad)", active: f.intent === x.intent, text: x.friction.toFixed(2), sub: `n=${fmtInt(x.n)}`,
            aria: `${x.intent}: friction ${x.friction.toFixed(2)}, n=${x.n}. Open sessions`, onClick: () => drill({ intent: x.intent as never }),
          }))} />
        )}
      </Panel>
      <Panel title="Rephrase loops" meta="sessions by loop count" span={7}>
        {!any ? <Empty /> : (
          <>
            <Cols label="Sessions by rephrase loop count. Each column opens those sessions" cols={loops.map((l) => ({
              key: String(l.loops), label: String(l.loops), segs: [{ v: l.sessions, color: "var(--accent)" }], active: f.loops === l.loops,
              aria: `${l.loops >= MAX_LOOPS ? `${MAX_LOOPS}+` : l.loops} loops: ${l.sessions} sessions. Open sessions`, onClick: l.sessions ? () => drill({ loops: l.loops }) : undefined,
            }))} />
            <div className="axis"><span>0 loops</span><span>{MAX_LOOPS}+ loops</span></div>
            <DataTable caption="Rephrase loops" head={["Loops", "Sessions"]} rows={loops.map((l) => [l.loops, l.sessions])} />
          </>
        )}
      </Panel>
      <Panel title="Signals by source" meta="share of prompts with each signal" span={12}>
        {rates.length === 0 ? <Empty /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Source</th><th scope="col">Correction</th><th scope="col">Frustration</th><th scope="col">Rephrase</th><th scope="col">Abandoned</th><th scope="col">Interrupted</th><th scope="col">n</th></tr></thead>
              <tbody>{rates.map((r) => (
                <tr key={r.source}>
                  <th scope="row"><button type="button" aria-label={`${srcLabel(r.source)}. Open sessions`} onClick={() => drill({ source: r.source })}>{srcLabel(r.source)}</button></th>
                  <td>{fmtPct(r.correction)}</td><td>{fmtPct(r.frustration)}</td><td>{fmtPct(r.rephrase)}</td><td>{fmtPct(r.abandoned)}</td><td>{fmtPct(r.interrupted)}</td><td>{fmtInt(r.n)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <Exposure />
    </div>
  );
}
