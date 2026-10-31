import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "./data/types";
import { headline, loadData, normalize, readInline } from "./data/load";
import { EnginePill } from "./components/Engine";
import { ChapterNav, SourceHealth } from "./components/Chrome";
import { Footprint } from "./components/Footprint";
import { Friction } from "./components/Friction";
import { Funnel } from "./components/Funnel";
import { Recommend } from "./components/Recommend";
import { Section } from "./components/Section";
import { Time } from "./components/Time";
import { Works } from "./components/Works";
import { gsap, ScrollTrigger, useGSAP, withMotion } from "./lib/motion";

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

export function App() {
  const [st, setSt] = useState<State>(initial);
  useEffect(() => {
    if (st.kind !== "loading") return;
    loadData().then((d) => setSt(d ? { kind: "ready", d } : { kind: "empty" })).catch((e) => setSt({ kind: "error", msg: String(e.message ?? e) }));
  }, [st.kind]);

  const [epoch, setEpoch] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const ready = st.kind === "ready";
  useGSAP(() => {
    if (!ready || !root.current) return;
    const off = withMotion(root.current, ({ root: r }) => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]", r).forEach((el) => {
        gsap.from(el, { opacity: 0, y: 28, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
      });
      gsap.utils.toArray<HTMLElement>("[data-stagger]", r).forEach((el) => {
        gsap.from(el.children, { opacity: 0, y: 18, duration: 0.6, ease: "power3.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
      });
    });
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    return () => { off(); window.removeEventListener("load", refresh); };
  }, { scope: root, dependencies: [ready, epoch] });

  if (st.kind !== "ready") {
    const msg = st.kind === "error" ? st.msg : st.kind === "empty" ? "No data embedded. Run prompt-analytics export, then open the dashboard." : "Loading";
    return <main id="main" className="status" role={st.kind === "error" ? "alert" : "status"}><h1 className="lede">{msg}</h1></main>;
  }
  const d = st.d;
  const h = (c: Parameters<typeof headline>[1]) => headline(d, c);
  const m = (c: Parameters<typeof headline>[1]) => d.engine.methods[c];
  return (
    <div ref={root}>
      <a className="skip" href="#main">Skip to content</a>
      {d.engine.mode === "basic" && <div className="banner" role="status">Basic mode: topics are grouped by keywords. {d.engine.upgrade ? <>Run <code>{d.engine.upgrade.command}</code> to cluster by meaning.</> : null}</div>}
      <ChapterNav />
      <main id="main" key={epoch}>
        <Section id="footprint" index={0} insight={h("footprint")} method={m("footprint")} hero><EnginePill d={d} onData={(nd) => { setSt({ kind: "ready", d: nd }); setEpoch((x) => x + 1); }} /><Footprint d={d} /></Section>
        <SourceHealth d={d} />
        <Section id="time" index={1} insight={h("time")} method={m("time")}><Time d={d} /></Section>
        <Section id="funnel" index={2} insight={h("funnel")} method={m("funnel")}><Funnel d={d} /></Section>
        <Section id="friction" index={3} insight={h("friction")} method={m("friction")}><Friction d={d} /></Section>
        <Section id="works" index={4} insight={h("works")} method={m("works")}><Works d={d} /></Section>
        <Section id="recommend" index={5} insight={h("recommend")} method={m("recommend")}><Recommend d={d} /></Section>
      </main>
    </div>
  );
}
