import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state";
import { STAGES } from "../lib/filter";
import { fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import { SessionTable } from "./Sessions";

function Detail({ id }: { id: string }) {
  const { d, v, openSession, clusterLabel } = useStore();
  const r = useMemo(() => d.sessions.find((x) => x.id === id), [d.sessions, id]);
  if (!r) return <p className="empty">This session is not in the export.</p>;
  const i = v.rows.findIndex((x) => x.id === id), prev = i > 0 ? v.rows[i - 1] : null, next = i >= 0 && i < v.rows.length - 1 ? v.rows[i + 1] : null;
  const open = d.exposure.items.filter((x) => x.session === id && x.status === "open").length;
  const similar = r.cluster >= 0 ? d.sessions.filter((x) => x.id !== id && x.cluster === r.cluster && x.project === r.project).slice(0, 5) : [];
  const facts: [string, string][] = [
    ["Tool", srcLabel(r.source)], ["Project", r.project || "(none)"], ["Intent", r.intent], ["Date", fmtDate(r.date)], ["Prompts", fmtInt(r.prompts)], ["Tokens", fmtInt(r.tokens)],
    ["Cost", r.cost_usd === null ? "not priced" : fmtUSD(r.cost_usd)], ["Rephrase loops", String(r.loops)], ["Friction", r.friction.toFixed(2)], ["Applied", r.applied ? "yes" : "no"],
    ["Topic", r.cluster >= 0 ? clusterLabel(r.cluster) : "none"], ["Open findings", String(open)],
  ];
  return (
    <>
      <p className={`ti ${r.title ? "" : "none"}`}>{r.title || "Untitled session"}</p>
      <ol className="track" aria-label={`Reached ${STAGES[Math.max(0, r.reached_stage - 1)] ?? "no stage"} of ${STAGES.length} stages`}>
        {STAGES.map((s, k) => <li key={s} data-on={r.reached_stage >= k + 1 || undefined} aria-current={r.reached_stage === k + 1 || undefined}><i aria-hidden="true" />{s}</li>)}
      </ol>
      <dl className="facts">{facts.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{k === "Tool" ? <><span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />{x}</> : x}</dd></div>)}</dl>
      <div className="pn">
        <button type="button" className="btn" disabled={!prev} onClick={() => prev && openSession(prev.id)}>Previous in view</button>
        <button type="button" className="btn" disabled={!next} onClick={() => next && openSession(next.id)}>Next in view</button>
      </div>
      {similar.length > 0 && (
        <>
          <h4>Similar sessions</h4>
          <ul className="sim">{similar.map((x) => <li key={x.id}><button type="button" onClick={() => openSession(x.id)}><time dateTime={x.date}>{fmtDate(x.date)}</time> {x.title || "Untitled session"}</button></li>)}</ul>
          <p className="note">Same topic and project.</p>
        </>
      )}
    </>
  );
}

/** Right-hand panel (bottom sheet on phones): the session list under the current filter, or one session. */
export function Panel() {
  const { panel, sel, v, back, closePanel } = useStore();
  const head = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const was = useRef(false);
  useEffect(() => {
    const on = panel !== "none";
    if (on && !was.current) trigger.current = document.activeElement as HTMLElement | null;
    if (on) head.current?.focus();
    if (!on && was.current) { const t = trigger.current; if (t && document.contains(t)) t.focus(); trigger.current = null; }
    was.current = on;
  }, [panel, sel]);
  if (panel === "none") return null;
  return (
    <>
      <div className="scrim" onClick={closePanel} aria-hidden="true" />
      <aside className="panel" id="panel" aria-label={panel === "detail" ? "Session detail" : "Sessions in view"} data-mode={panel}>
        <span className="grab" aria-hidden="true" />
        <div className="panel-h">
          {panel === "detail" && <button type="button" className="btn" onClick={back}>Back</button>}
          <h2 ref={head} tabIndex={-1}>{panel === "detail" ? "Session" : "Sessions"} {panel === "list" && <span className="meta">{fmtInt(v.rows.length)} matching</span>}</h2>
          <button type="button" className="btn" onClick={closePanel}>Close</button>
        </div>
        <div className="panel-b">{panel === "detail" && sel ? <Detail id={sel} /> : v.legacy ? <p className="empty">This export has no per-session rows.</p> : <SessionTable rows={v.rows} compact />}</div>
      </aside>
    </>
  );
}
