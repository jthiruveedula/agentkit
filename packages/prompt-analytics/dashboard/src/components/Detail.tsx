import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { flipFrom } from "../lib/live";
import { fxOn } from "../lib/hooks";
import { useStore } from "../state";
import { STAGES } from "../lib/filter";
import { fmtDate, fmtInt, fmtUSD } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import { SessionList } from "./Sessions";
import { hasHabitData, missingHabits } from "../lib/habits";
import { playbook } from "../lib/playbook";
import type { SessionRow } from "../data/types";

/** Observations only: habits that went with wins in this topic or intent and that this session's prompts did not show. */
function Habits({ r }: { r: SessionRow }) {
  const { d } = useStore();
  const book = useMemo(() => playbook(d.what_works, d.galaxy.clusters, d.what_works_tested, d.sessions, 50), [d]);
  if (!hasHabitData(d)) return null;
  const hs = missingHabits(d, r, book);
  if (!hs.length) return null;
  return (
    <>
      <h4>Features common in successful sessions that this one didn't show</h4>
      <ul className="habits">{hs.map((h) => <li key={h.feature}><b>{h.feature}</b>: {h.play.line} <span className="meta">{h.play.pts >= 0 ? "+" : "-"}{Math.abs(Math.round(h.play.pts))} pts applied (95% CI {Math.round(h.play.lo)} to {Math.round(h.play.hi)}), {h.scope}, n={fmtInt(h.play.n)}</span></li>)}</ul>
      <p className="note">Correlation, not cause. Seen in your successful sessions; none of these is a rewrite of this one.</p>
    </>
  );
}

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
      <Habits r={r} />
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
  const hit = useRef<{ el: Element; t: number } | null>(null);
  useEffect(() => {   // remember what was clicked: it is the FLIP origin and the focus-return fallback
    const on = (e: Event) => { const el = e.target instanceof Element ? e.target : null; if (el && !el.closest(".panel")) hit.current = { el, t: performance.now() }; };
    document.addEventListener("click", on, true);
    return () => document.removeEventListener("click", on, true);
  }, []);
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {   // FLIP: the panel grows from the clicked row or mark; one WAAPI transform animation, no React state; skipped on phones (bottom sheet) and under reduced motion
    const on = panel !== "none", h = hit.current;
    if (!on || was.current || !h || !box.current || !fxOn() || innerWidth < 700 || performance.now() - h.t > 800 || !h.el.isConnected) return;
    const a = h.el.closest("tr,li,button,a") ?? h.el, f = a.getBoundingClientRect(), l = box.current.getBoundingClientRect();
    const { dx, dy, s } = flipFrom({ x: f.x, y: f.y, w: f.width, h: f.height }, { x: l.x, y: l.y, w: l.width, h: l.height });
    box.current.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" });
  }, [panel]);
  useEffect(() => {
    const on = panel !== "none";
    if (on && !was.current) {
      const ae = document.activeElement as HTMLElement | null, c = hit.current?.el.closest<HTMLElement>("button,a,[tabindex]");
      trigger.current = ae && ae !== document.body ? ae : c ?? null;
    }
    if (on) head.current?.focus();
    if (!on && was.current) { const t = trigger.current; if (t && document.contains(t)) t.focus(); trigger.current = null; }
    was.current = on;
  }, [panel, sel]);
  if (panel === "none") return null;
  return (
    <>
      <div className="scrim" onClick={closePanel} aria-hidden="true" />
      <aside ref={box} className="panel" id="panel" aria-label={panel === "detail" ? "Session detail" : "Sessions in view"} data-mode={panel}>
        <span className="grab" aria-hidden="true" />
        <div className="panel-h">
          {panel === "detail" && <button type="button" className="btn" onClick={back}>Back</button>}
          <h2 ref={head} tabIndex={-1}>{panel === "detail" ? "Session" : "Sessions"} {panel === "list" && <span className="meta">{fmtInt(v.rows.length)} matching</span>}</h2>
          <button type="button" className="btn" onClick={closePanel}>Close</button>
        </div>
        <div className="panel-b">{panel === "detail" && sel ? <Detail id={sel} /> : v.legacy ? <p className="empty">This export has no per-session rows.</p> : <SessionList rows={v.rows} />}</div>
      </aside>
    </>
  );
}
