import { useEffect, useRef, useState } from "react";
import { getApi } from "../data/api";
import type { AnalysisMode, DashboardData } from "../data/types";

type Pick = AnalysisMode | "auto";
const TIERS: { id: Pick; text: string }[] = [
  { id: "auto", text: "Auto" }, { id: "basic", text: "Basic" }, { id: "ml", text: "ML" }, { id: "deep", text: "Deep" },
];

export const TONE: Record<AnalysisMode, string> = {
  basic: "These are rule-based reads: counts and heuristics, not models.",
  ml: "These are statistically modeled: clusters and confidence intervals, with the caveats that implies.",
  deep: "These are semantic reads from local embeddings: meaning, not just keywords.",
};

export function pillText(e: DashboardData["engine"]): string {
  if (e.mode === "basic") return "Heuristics · no ML libs";
  if (e.mode === "ml") {
    const k = Object.keys(e.libs).find((x) => /scikit|sklearn/i.test(x));
    return `Analyzed with ML${k && e.libs[k] ? ` · scikit-learn ${e.libs[k]}` : ""}`;
  }
  return `Semantic · local embeddings · ${e.accel}`;
}

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="eng-copy" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
      {ok ? "Copied" : "Copy"}<span className="sr-only"> command {text}</span>
    </button>
  );
}

/** Engine pill + tier switch. `onData` receives re-analyzed data from POST /api/analyze. */
export function EnginePill({ d, onData }: { d: DashboardData; onData: (d: DashboardData) => void }) {
  const e = d.engine;
  const api = getApi();
  const canSwitch = !!api;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Pick | null>(null);
  const [err, setErr] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cmd = (m: string) => (e.upgrade && e.upgrade.mode === m ? e.upgrade.command : `prompt-analytics analyze --mode ${m}`);

  useEffect(() => {
    if (!open) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = (ev: PointerEvent) => { if (!box.current?.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); };
  }, [open]);

  const pick = async (m: Pick) => {
    if (!api || busy) return;
    setErr(""); setBusy(m);
    try { onData(await api.reanalyze(m)); setOpen(false); btn.current?.focus(); }
    catch (x) { setErr(x instanceof Error ? x.message : "Re-analysis failed"); }
    finally { setBusy(null); }
  };
  const avail = (m: Pick) => m === "auto" || e.available.includes(m);

  return (
    <div className="engine" ref={box}>
      <button ref={btn} type="button" className="pill" aria-expanded={open} aria-controls="eng-pop" onClick={() => setOpen((o) => !o)}>
        <span className="pill-dot" data-mode={e.mode} aria-hidden="true" />{pillText(e)}
      </button>
      {open && (
        <div id="eng-pop" className="pop" role="group" aria-label="Analysis engine">
          <p className="pop-reason">{e.reason || `Ran at the ${e.mode} tier.`} {TONE[e.mode]}</p>
          <div className="seg" role="group" aria-label="Analysis tier">
            {TIERS.map((t) => {
              const ok = canSwitch && avail(t.id) && !busy;
              const why = !canSwitch ? "Run prompt-analytics serve to switch" : !avail(t.id) ? `Not installed. ${cmd(t.id)}` : undefined;
              return <button key={t.id} type="button" aria-pressed={t.id === e.requested} disabled={!ok} title={why} onClick={() => pick(t.id)}>{t.text}</button>;
            })}
          </div>
          {busy && <p role="status" className="pop-busy"><span className="spin" aria-hidden="true" />Re-analyzing at the {busy} tier…</p>}
          {err && <p role="alert" className="pop-err">{err}</p>}
          <ul className="pop-cmds">
            {(["basic", "ml", "deep"] as const).filter((m) => !canSwitch || !e.available.includes(m)).map((m) => (
              <li key={m}><span>{canSwitch ? `${m.toUpperCase()} needs` : `${m.toUpperCase()}:`}</span> <code>{cmd(m)}</code> <Copy text={cmd(m)} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
