import { useEffect, useState } from "react";
import type { DashboardData } from "./data/types";
import { loadData, normalize, readInline } from "./data/load";
import { StoreProvider, useStore } from "./state";
import type { Filter } from "./lib/filter";
import { EnginePill } from "./components/Engine";
import { Drawer, FilterBar, Kpis, Tabs } from "./components/Shell";
import { Footprint } from "./components/Footprint";
import { Time } from "./components/Time";
import { Funnel } from "./components/Funnel";
import { Friction } from "./components/Friction";
import { Works } from "./components/Works";
import { Recommend } from "./components/Recommend";
import { fmtDate } from "./lib/format";

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

const VIEWS = { footprint: Footprint, time: Time, funnel: Funnel, friction: Friction, works: Works, recommend: Recommend } as const;

function Body({ onData }: { onData: (d: DashboardData) => void }) {
  const { d, tab, open } = useStore();
  const View = VIEWS[tab];
  return (
    <div className="app" data-drawer={open ? "open" : "closed"}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <h1>Prompt Analytics</h1>
        <span className="range">{d.range.start && d.range.end ? `${fmtDate(d.range.start)} to ${fmtDate(d.range.end)}` : ""}</span>
        <span className="grow" />
        <EnginePill d={d} onData={onData} />
      </header>
      {d.engine.mode === "basic" && <div className="banner" role="status">Basic mode: topics are grouped by keywords. {d.engine.upgrade ? <>Run <code>{d.engine.upgrade.command}</code> to cluster by meaning.</> : null}</div>}
      <FilterBar />
      <Kpis />
      <Tabs />
      <main id="main" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}><div id="panel"><View /></div></main>
      <Drawer />
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
