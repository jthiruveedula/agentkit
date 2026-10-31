import { useId } from "react";
import type { Insight } from "../data/types";
import { fmtInt, fmtValue } from "../lib/format";

/** Focusable "evidence" affordance: hover or focus reveals metric, value, sample size and method. */
export function Trace({ lines, label = "Evidence" }: { lines: string[]; label?: string }) {
  const id = useId();
  return (
    <span className="trace">
      <button type="button" className="trace-b" aria-describedby={id}>{label}</button>
      <span role="tooltip" id={id} className="trace-t">{lines.map((l, i) => <span key={i}>{l}</span>)}</span>
    </span>
  );
}

export function InsightTrace({ i }: { i: Insight }) {
  const lines = [`${i.metric}: ${fmtValue(i.value, i.unit)}`];
  if (i.delta !== null) lines.push(`${i.delta >= 0 ? "+" : ""}${Math.round(i.delta * 100)}% vs comparison`);
  lines.push(`n=${fmtInt(i.evidence.n)}, ${i.evidence.method}`);
  if (i.evidence.ci) lines.push(`95% CI ${+i.evidence.ci[0].toFixed(2)} to ${+i.evidence.ci[1].toFixed(2)}`);
  return <Trace lines={lines} />;
}
