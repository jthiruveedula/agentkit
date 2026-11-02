import { useEffect, useState } from "react";
import type { DashboardData } from "./data/types";
import { loadData, normalize, readInline, refreshData } from "./data/load";
import { shouldRefresh } from "./lib/live";
import { fxOn } from "./lib/hooks";
import { StoreProvider, useStore } from "./state";
import type { Filter } from "./lib/filter";
import { SECTIONS, spyLocked } from "./lib/hash";
import { Header, Nav, Rail, railCollapsed } from "./components/Shell";
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
  const { d, panel, crumbs, closePanel, clearAfter, setSection, secs, caps } = useStore();
  useReveal();
  const [col, setCol] = useState(railCollapsed);
  const [menu, setMenu] = useState(false);

  useEffect(() => {   // liquid-glass specular follows the mouse over a card (html.fx only; one rAF per move)
    let raf = 0, e: PointerEvent | null = null;
    const frame = () => {
      raf = 0; const t = (e?.target as Element | null)?.closest?.<HTMLElement>(".card, .kpi");
      if (!e || !t || !fxOn()) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      t.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const move = (ev: PointerEvent) => { if (ev.pointerType !== "mouse" || !fxOn()) return; e = ev; if (!raf) raf = requestAnimationFrame(frame); };
    document.addEventListener("pointermove", move, { passive: true });
    return () => { document.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {   // Esc: close the panel first, else drop the last selection
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as Element | null;
      if (t?.closest?.("select, input, .pop, .palette, .wrap, .menu") || document.querySelector(".mk.on")) return;
      if (panel !== "none") closePanel(); else if (crumbs.length) clearAfter(crumbs.length - 2);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [panel, crumbs.length, closePanel, clearAfter]);

  const shown = SECTIONS.filter((id) => secs.has(id));
  const shownKey = shown.join();
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
        <Rail col={col} setCol={setCol} open={menu} setOpen={setMenu} />
        <div className="content">
          <Header d={d} onData={onData} onMenu={() => setMenu(!menu)} menuOpen={menu} />
          {d.engine.mode === "basic" && !caps.empty && <div className="banner" role="status">Basic mode: topics are grouped by keywords; the Playbook and topic views need the ML engine. {d.engine.upgrade ? <>Run <code>{d.engine.upgrade.command}</code> to unlock them.</> : null}</div>}
          <div className="frame">
            <main id="main" tabIndex={-1}>
              {caps.empty ? <EmptyState /> : <>
                <OtherTools />
                {caps.tooSmall && <p className="hint unlock" role="status">{unlockText(caps, secs.has("s-time"))}</p>}
                {secs.has("s-overview") && <Overview />}{secs.has("s-tools") && <Tools />}{secs.has("s-time") && <Time />}{secs.has("s-funnel") && <Funnel />}
                {secs.has("s-friction") && <Friction />}{secs.has("s-works") && <Works />}{secs.has("s-models") && <ModelFit />}{secs.has("s-exposure") && <Exposure />}{secs.has("s-recs") && <Recommend />}
                {secs.has("s-sessions") && <Sessions />}{secs.has("s-map") && <MindMap />}
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
