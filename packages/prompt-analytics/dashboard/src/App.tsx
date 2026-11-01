import { useEffect, useState } from "react";
import type { DashboardData } from "./data/types";
import { loadData, normalize, readInline } from "./data/load";
import { StoreProvider, useStore } from "./state";
import type { Filter } from "./lib/filter";
import { SECTIONS } from "./lib/hash";
import { Header, Nav } from "./components/Shell";
import { Overview } from "./components/Overview";
import { MindMap } from "./components/MindMap";
import { Tools } from "./components/Tools";
import { Time } from "./components/Time";
import { Funnel } from "./components/Funnel";
import { Friction } from "./components/Friction";
import { Works } from "./components/Works";
import { Exposure } from "./components/Exposure";
import { Recommend } from "./components/Recommend";
import { Sessions } from "./components/Sessions";
import { Panel } from "./components/Detail";
import { useReveal } from "./lib/hooks";
import { Caustic } from "./components/Caustic";

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
  const { d, panel, crumbs, closePanel, clearAfter, setSection } = useStore();
  useReveal();

  useEffect(() => {   // Esc: close the panel first, else drop the last selection
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as Element | null;
      if (t?.closest?.("select, input, .pop") || document.querySelector(".rq-box")) return;
      if (panel !== "none") closePanel(); else if (crumbs.length) clearAfter(crumbs.length - 2);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [panel, crumbs.length, closePanel, clearAfter]);

  useEffect(() => {   // the nav highlights the section under the header
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setSection(e.target.id); }, { rootMargin: "-25% 0px -65% 0px" });
    SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [setSection]);

  return (
    <div className="app" data-panel={panel}>
      <Caustic />
      <a className="skip" href="#main">Skip to content</a>
      <Header d={d} onData={onData} />
      {d.engine.mode === "basic" && <div className="banner" role="status">Basic mode: topics are grouped by keywords. {d.engine.upgrade ? <>Run <code>{d.engine.upgrade.command}</code> to cluster by meaning.</> : null}</div>}
      <div className="frame">
        <Nav />
        <main id="main" tabIndex={-1}>
          <Overview /><MindMap /><Tools /><Time /><Funnel /><Friction /><Works /><Exposure /><Recommend /><Sessions />
        </main>
      </div>
      <Panel />
    </div>
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
  if (st.kind !== "ready") {
    const msg = st.kind === "error" ? st.msg : st.kind === "empty" ? "No data embedded. Run prompt-analytics export, then open the dashboard." : "Loading";
    return <main id="main" className="status" role={st.kind === "error" ? "alert" : "status"}><h1>{msg}</h1></main>;
  }
  return <Dashboard d={st.d} onData={(d) => setSt({ kind: "ready", d })} />;
}
