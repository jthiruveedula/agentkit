import { Fragment, useEffect, useMemo, useState, type JSX } from "react";
import type { DashboardData } from "./data/types";
import { loadData, normalize, readInline, refreshData } from "./data/load";
import { shouldRefresh } from "./lib/live";
import { fxOn } from "./lib/hooks";
import { StoreProvider, useStore } from "./state";
import { views, type Filter } from "./lib/filter";
import { fromHash, sectionOf, spyLocked } from "./lib/hash";
import { attention } from "./lib/attention";
import { rankSections } from "./lib/rank";
import { Header, Nav, Rail, railCollapsed, titleOf } from "./components/Shell";
import { Overview } from "./components/Overview";
import { MindMap } from "./components/MindMap";
import { Tools } from "./components/Tools";
import { Time } from "./components/Time";
import { Funnel } from "./components/Funnel";
import { Friction } from "./components/Friction";
import { Works } from "./components/Works";
import { ModelFit } from "./components/ModelFit";
import { Exposure } from "./components/Exposure";
import { Recommend } from "./components/Recommend";
import { Sessions } from "./components/Sessions";
import { Panel } from "./components/Detail";
import { Palette } from "./components/Palette";
import { WrappedHost } from "./components/Wrapped";
import { Toaster } from "./components/Toaster";
import { useReveal } from "./lib/hooks";
import { FxHost } from "./components/Fx";
import { SOURCES, srcLabel } from "./lib/palette";
import { unlockText } from "./lib/capabilities";
import "./components/rank.css";

const COMP: Record<string, () => JSX.Element | null> = {
  "s-overview": Overview, "s-tools": Tools, "s-time": Time, "s-funnel": Funnel, "s-friction": Friction, "s-works": Works,
  "s-models": ModelFit, "s-exposure": Exposure, "s-recs": Recommend, "s-sessions": Sessions, "s-map": MindMap,
};

type State = { kind: "loading" } | { kind: "empty" } | { kind: "error"; msg: string } | { kind: "ready"; d: DashboardData };

function initial(): State {
  try {
    const raw = readInline();
    if (raw !== null) return { kind: "ready", d: normalize(raw) };
    return import.meta.env.DEV ? { kind: "loading" } : { kind: "empty" };
  } catch (e) {
    return { kind: "error", msg: e instanceof Error ? e.message : "Could not read data." };
  }
}

function Body({ onData }: { onData: (d: DashboardData) => void }) {
  const { d, f, panel, section, setSection, secs, caps, capsAll } = useStore();
  useReveal();
  const [col, setCol] = useState(railCollapsed);
  const [menu, setMenu] = useState(false);

  useEffect(() => {   // liquid-glass specular follows the mouse over a card (html.fx only; one rAF per move)
    let raf = 0, e: PointerEvent | null = null;
    const frame = () => {
      raf = 0; const t = (e?.target as Element | null)?.closest?.<HTMLElement>(".card:not(.kcard), .kpi");   // the six-tile key numbers card stays still
      if (!e || !t || !fxOn()) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      t.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const move = (ev: PointerEvent) => { if (ev.pointerType !== "mouse" || !fxOn()) return; e = ev; if (!raf) raf = requestAnimationFrame(frame); };
    document.addEventListener("pointermove", move, { passive: true });
    return () => { document.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);

  // Rank on the date window only, so drilling never reshuffles the page.
  const wv = useMemo(() => views(d, { from: f.from, to: f.to }), [d, f.from, f.to]);
  const ranked = useMemo(() => rankSections(secs, attention(d, wv, { from: f.from, to: f.to }, null), d, wv.rows), [secs, d, wv, f.from, f.to]);
  const [open, setOpen] = useState(() => new Set([sectionOf(fromHash(typeof location === "undefined" ? "" : location.hash).sec)]));   // a shared link to a quiet section opens it
  const expand = (id: string) => {
    setOpen((s) => new Set(s).add(id));
    requestAnimationFrame(() => { const h = document.getElementById(`${id}-h`) ?? document.querySelector<HTMLElement>(`#${id} h2`); if (h) { h.tabIndex = -1; h.focus(); } });
  };
  useEffect(() => {   // rail, palette or a KPI "Details" jump to a quiet section opens it (goto locks the spy; plain scrolling does not)
    if (ranked.quiet.has(section) && !open.has(section) && spyLocked() === section) expand(section);
  }, [section]);   // eslint-disable-line react-hooks/exhaustive-deps
  const promoted = ranked.order.filter((id) => ranked.score[id] > 0);
  const shownKey = ranked.order.join();
  useEffect(() => {   // the nav highlights the last section whose top passed 30% of the viewport (or the last one at the page end): always exactly one
    let raf = 0;
    const spy = () => {
      raf = 0;
      const locked = spyLocked();
      if (locked) return setSection(locked);
      const ids = shownKey.split(",").filter(Boolean);
      if (!ids.length) return;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return setSection(ids[ids.length - 1]);
      const line = window.innerHeight * 0.3;
      let cur = ids[0];
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= line) cur = id; }
      setSection(cur);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(spy); };
    spy();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [setSection, shownKey]);

  return (
    <div className="app" data-panel={panel}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="shell" data-col={col || undefined}>
        <Rail col={col} setCol={setCol} open={menu} setOpen={setMenu} quiet={ranked.quiet} />
        <div className="content">
          <Header d={d} onData={onData} onMenu={() => setMenu(!menu)} menuOpen={menu} />
          {d.engine.mode === "basic" && !caps.empty && <div className="banner" role="status">Basic mode: topics are grouped by keywords; the Playbook and topic views need the ML engine. {d.engine.upgrade ? <>Run <code>{d.engine.upgrade.command}</code> to unlock them.</> : null}</div>}
          <div className="frame">
            <main id="main" tabIndex={-1}>
              {caps.empty ? <EmptyState /> : <>
                <OtherTools />
                {caps.tooSmall && <p className="hint unlock" role="status">{unlockText(caps, secs.has("s-time"))}</p>}
                {ranked.order.map((id) => {
                  const C = COMP[id], at = promoted.indexOf(id);
                  if (ranked.quiet.has(id) && !open.has(id)) return <Quiet key={id} id={id} title={titleOf(id, capsAll.multiTool)} expand={() => expand(id)} />;
                  return at < 0 ? <C key={id} /> : <Fragment key={id}><p className="why-tag"><b>#{at + 1}</b> {ranked.why[id]}</p><C /></Fragment>;
                })}
              </>}
            </main>
          </div>
        </div>
      </div>
      <Nav part="bar" />
      <Panel />
      <Palette /><WrappedHost /><Toaster /><FxHost />
    </div>
  );
}

/** A middle section with nothing flagged: one row, expanded on demand. */
function Quiet({ id, title, expand }: { id: string; title: string; expand: () => void }) {
  return (
    <section id={id} className="sec quiet" aria-labelledby={`${id}-qh`}>
      <h2 id={`${id}-qh`}>{title}</h2>
      <span className="meta">Quiet · nothing flagged</span>
      <button type="button" className="link" aria-expanded="false" aria-label={`Show the ${title} section`} onClick={expand}>Show</button>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="sec empty-state" id="s-overview" aria-labelledby="empty-h">
      <h2 id="empty-h">No sessions yet</h2>
      <p>Nothing to chart so far. Use Claude Code, Copilot, Cursor, OpenCode or Antigravity for a while, then run <code>prompt-analytics export</code> again; every tool found on this machine is picked up automatically.</p>
    </section>
  );
}

const HINT_KEY = "pa.hint.tools";
const hintGone = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
/** Only for one-tool exports: a one-time, dismissible pointer that other tools are detected too. Never shown under a filter. */
function OtherTools() {
  const { d, f } = useStore();
  const [gone, setGone] = useState(hintGone);
  const used = new Set(d.sessions.map((r) => r.source));
  if (gone || used.size !== 1 || Object.keys(f).length) return null;
  const others = SOURCES.filter((s) => !used.has(s)).map(srcLabel);
  const close = () => { setGone(true); try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private mode: dismiss for this visit only */ } };
  return (
    <p className="hint" role="note">
      <span>Using other tools too? {others.slice(0, -1).join(", ")} and {others.at(-1)} are detected automatically if present locally.</span>
      <button type="button" className="link" onClick={close} aria-label="Dismiss tip about other tools">Dismiss</button>
    </p>
  );
}

/** The dashboard for already-loaded data (also the unit-test entry point). */
export function Dashboard({ d, onData = () => {}, initialFilter }: { d: DashboardData; onData?: (d: DashboardData) => void; initialFilter?: Filter }) {
  return <StoreProvider d={d} initial={initialFilter}><Body onData={onData} /></StoreProvider>;
}

export function App() {
  const [st, setSt] = useState<State>(initial);
  useEffect(() => {
    if (st.kind !== "loading") return;
    loadData().then((d) => setSt(d ? { kind: "ready", d } : { kind: "empty" })).catch((e) => setSt({ kind: "error", msg: String(e.message ?? e) }));
  }, [st.kind]);
  const stamp = st.kind === "ready" ? st.d.generated_at : "";
  useEffect(() => {   // live feel: re-read dashboard.json when the tab regains focus (http only; file:// has nothing to fetch)
    if (!stamp) return;
    let last = Date.now(), busy = false;
    const go = async () => {
      if (busy || !shouldRefresh(location.protocol, document.visibilityState === "visible", Date.now(), last)) return;
      busy = true; last = Date.now();
      const d = await refreshData(stamp);
      busy = false;
      if (!d) return;
      setSt({ kind: "ready", d });   // same StoreProvider: filter, selection and scroll stay; useMorph glides the charts
      if (fxOn()) { const h = document.documentElement; h.setAttribute("data-pulse", ""); window.setTimeout(() => h.removeAttribute("data-pulse"), 1000); }
    };
    document.addEventListener("visibilitychange", go); window.addEventListener("focus", go);
    return () => { document.removeEventListener("visibilitychange", go); window.removeEventListener("focus", go); };
  }, [stamp]);
  if (st.kind !== "ready") {
    const msg = st.kind === "error" ? st.msg : st.kind === "empty" ? "No data embedded. Run prompt-analytics export, then open the dashboard." : "Loading";
    return <main id="main" className="status" role={st.kind === "error" ? "alert" : "status"}><h1>{msg}</h1></main>;
  }
  return <Dashboard d={st.d} onData={(d) => setSt({ kind: "ready", d })} />;
}
