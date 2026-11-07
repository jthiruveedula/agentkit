import { useEffect, useRef, useState } from "react";
import { useStore } from "../state";
import { addDays } from "../lib/filter";
import { fmtDate, fmtInt, fmtRange } from "../lib/format";
import { INTENTS, SOURCES, srcLabel } from "../lib/palette";
import type { Cmp } from "../lib/compare";
import type { DashboardData } from "../data/types";
import { EnginePill } from "./Engine";
import { Pulse } from "./Pulse";
import { Segmented } from "./ui";
import { openPalette } from "./Palette";
import { ACCENTS, GLASS, applySettings, loadSettings, saveSettings, type Settings } from "../lib/settings";

type Period = "30" | "90" | "all" | "custom";

export const NAV: { group: string; items: { id: string; text: string; go?: string }[] }[] = [
  { group: "Monitor", items: [{ id: "s-overview", text: "Overview" }, { id: "s-attention", text: "Needs attention" }] },
  { group: "Investigate", items: [{ id: "s-tools", text: "Tools" }, { id: "s-time", text: "Time" }, { id: "s-funnel", text: "Funnel" }, { id: "s-friction", text: "Friction" }] },
  { group: "Optimise", items: [{ id: "s-works", text: "What works" }, { id: "s-models", text: "Model fit" }, { id: "s-recs", text: "Recommendations" }] },
  { group: "Govern", items: [{ id: "s-exposure", text: "Exposure" }, { id: "s-sessions", text: "Sessions" }] },
  { group: "Explore", items: [{ id: "s-map", text: "Mind map" }] },
];
/** Mobile bottom bar: five sections plus More, short labels so nothing truncates at 320px. */
const BAR: [string, string][] = [["s-overview", "Home"], ["s-time", "Time"], ["s-friction", "Friction"], ["s-works", "Works"], ["s-exposure", "Risk"]];
const BAR_IDS = BAR.map(([id]) => id);

/** Nav groups holding only the sections this data can show; empty groups drop out. */
export const navFor = (secs: Set<string>, multiTool = true) => NAV.map((g) => ({
  ...g, items: g.items.filter((i) => secs.has(i.id)).map((i) => (i.id === "s-tools" && !multiTool ? { ...i, text: "Projects" } : i)),
})).filter((g) => g.items.length);
const textOf = (id: string) => NAV.flatMap((g) => g.items).find((i) => i.id === id)?.text ?? id;
/** Section title for the top bar (a one-tool export calls Tools "Projects", as the nav does). */
export const titleOf = (id: string, multiTool = true) => (id === "s-tools" && !multiTool ? "Projects" : textOf(id));

/** Model fit shows whenever the export carries per-session models and the full section set is unlocked (s-works marks that). */

/** 24px stroke icons per section (paths from the signed-off preview) and one hue per nav group. */
const ICON: Record<string, string> = {
  "s-overview": "M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z",
  "s-attention": "M12 3l9 16H3zM12 10v4M12 17h.01",
  "s-tools": "M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 2-2-2z",
  "s-time": "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  "s-funnel": "M3 4h18l-7 8v6l-4 2v-8z",
  "s-friction": "M3 12l4-6 4 12 4-12 3 6h3",
  "s-works": "M5 12l4 4 10-10",
  "s-models": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "s-recs": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  "s-exposure": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "s-sessions": "M4 6h16M4 12h16M4 18h16",
  "s-map": "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 5h.01M19 5h.01M5 19h.01M19 19h.01M6 6l4 4M18 6l-4 4M6 18l4-4M18 18l-4-4",
};
const HUE = [255, 195, 295, 55, 340];

/** Tool brand marks: simple-icons paths shared with site/assets/logos-raw (OpenCode has none upstream, so a plain mark). Decorative: always next to the tool's name. */
const LOGO: Record<string, [string, string, string]> = {
  claude_code: ["0 0 24 24", "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z", "#D97757"],
  copilot: ["0 0 24 24", "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z", "var(--ink)"],
  cursor: ["0 0 24 24", "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23", "var(--ink)"],
  antigravity: ["0 0 115 113", "M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z", "#4285f4"],
};
export function ToolLogo({ source, size = 16 }: { source: string; size?: number }) {
  const m = LOGO[source];
  return (
    <svg className="lg" width={size} height={size} viewBox={m ? m[0] : "0 0 24 24"} aria-hidden="true" focusable="false">
      {m ? <path d={m[1]} fill={m[2]} /> : source === "opencode"
        ? <><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="var(--ink)" strokeWidth="2.5" /><rect x="8" y="9" width="8" height="8" fill="var(--muted)" /></>
        : <circle cx="12" cy="12" r="6" fill="var(--muted)" />}
    </svg>
  );
}

/** Brand mark: a filled blue tile, a white orbit and node, one amber dot (the only warm accent in the chrome). */
const Glyph = () => (
  <svg className="glyph" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <ellipse className="g-orb" pathLength={1} cx="16" cy="16" rx="10.5" ry="4.2" transform="rotate(-24 16 16)" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
    <circle cx="16" cy="16" r="4.2" fill="#fff" />
    <circle className="g-dot" cx="23.6" cy="11.2" r="2.7" fill="var(--amber)" />
  </svg>
);

export function Header({ d, onData, onMenu, menuOpen }: { d: DashboardData; onData: (d: DashboardData) => void; onMenu: () => void; menuOpen: boolean }) {
  const { f, set, v, win, cmp, setCmp, crumbs, clearAfter, clear, openList, caps, capsAll, section } = useStore();
  const ref = useRef<HTMLElement>(null);
  const [custom, setCustom] = useState(false);
  const [fopen, setFopen] = useState(false);
  useEffect(() => {   // --hh drives sticky offsets and scroll-margin
    const el = ref.current; if (!el) return;
    const put = () => { const h = Math.ceil(el.getBoundingClientRect().height); document.documentElement.style.setProperty("--hh", `${h}px`); };
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!fopen) return; const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setFopen(false); } }; window.addEventListener("keydown", on, true); return () => window.removeEventListener("keydown", on, true); }, [fopen]);
  const end = d.range.end;
  const period: Period = custom ? "custom" : f.from === undefined && f.to === undefined ? "all"
    : (f.to === undefined || f.to === end) && f.from === addDays(end, -29) ? "30" : (f.to === undefined || f.to === end) && f.from === addDays(end, -89) ? "90" : "custom";
  const pickPeriod = (p: Period) => {
    setCustom(p === "custom");
    if (p === "all") set({ from: undefined, to: undefined });
    else if (p !== "custom") set({ from: addDays(end, -(+p - 1)), to: undefined });
  };
  const projects = [...new Set(d.sessions.map((s) => s.project).filter(Boolean))].sort();
  const srcs = SOURCES.filter((s) => d.sessions.some((r) => r.source === s));
  const off = d.sessions.length === 0;
  const scoped = (["source", "project", "intent"] as const).filter((k) => f[k] !== undefined).length;
  return (
    <div className="top-slot">
      <header className="top" ref={ref} data-fopen={fopen || undefined}>
        <div className="top-r1">
          <div className="top-id">
            <button type="button" className="btn navbtn" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="rail" onClick={onMenu}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <div className="brand-t">
              <h1>{titleOf(section, capsAll.multiTool)}</h1>
              <div className="sub-row">
                {!caps.empty && <p className="sub">{fmtRange(win.from, win.to)}<span aria-hidden="true"> · </span><span className="asof">data as of {fmtDate(d.generated_at)}</span></p>}
                {!caps.empty && <EnginePill d={d} onData={onData} />}
              </div>
            </div>
          </div>
          {!caps.empty && <Pulse />}
          <span className="grow" />
          <button type="button" className="link count" disabled={off} onClick={openList} aria-label={`${fmtInt(v.rows.length)} sessions in view${v.rows.length !== d.sessions.length ? ` of ${fmtInt(d.sessions.length)}` : ""}. Open the list`}>
            {fmtInt(v.rows.length)}{v.rows.length !== d.sessions.length ? ` of ${fmtInt(d.sessions.length)}` : ""} sessions
          </button>
          <div className="top-tools">
          <Segmented label="Period" value={period} onChange={pickPeriod} options={[{ id: "30", text: "30d" }, { id: "90", text: "90d" }, { id: "all", text: "All" }, { id: "custom", text: "Custom" }]} />
          <button type="button" className="btn fbtn" aria-expanded={fopen} aria-controls="hdr-filters" onClick={() => setFopen(!fopen)}>Filters{scoped > 0 && <b className="badge">{scoped}</b>}</button>
          <Prefs />
          <button type="button" className="btn kbd" aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" onClick={openPalette}>{/Mac|iP/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</button>
          </div>
        </div>
        <form className="filters" id="hdr-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
          <label className="field"><span>Tool</span>
            <select value={f.source ?? ""} disabled={off} onChange={(e) => set({ source: (e.target.value || undefined) as never })}><option value="">All tools</option>{srcs.map((s) => <option key={s} value={s}>{srcLabel(s)}</option>)}</select></label>
          <label className="field"><span>Project</span>
            <select value={f.project === undefined ? "" : f.project || NONE} disabled={off} onChange={(e) => set({ project: e.target.value === NONE ? "" : e.target.value || undefined })}><option value="">All projects</option>{d.sessions.some((s) => !s.project) && <option value={NONE}>(no project)</option>}{projects.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="field"><span>Intent</span>
            <select value={f.intent ?? ""} disabled={off} onChange={(e) => set({ intent: (e.target.value || undefined) as never })}><option value="">All intents</option>{INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
          <label className="field"><span>Compare</span>
            <select value={cmp} disabled={off} onChange={(e) => setCmp(e.target.value as Cmp)}><option value="prev">Previous period</option><option value="yoy">Year ago</option><option value="off">Off</option></select></label>
          {period === "custom" && (
            <>
              <label className="field"><span>From</span><input type="date" value={f.from ?? ""} min={d.range.start} max={f.to ?? end} disabled={off} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
              <label className="field"><span>To</span><input type="date" value={f.to ?? ""} min={f.from ?? d.range.start} max={end} disabled={off} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
            </>
          )}
        </form>
        <div className="top-r3">
          <nav className="crumbs" aria-label="Active filters">
            {crumbs.map((c, i) => (
              <button key={c.id} type="button" className="crumb fchip" aria-label={`Remove filter: ${c.label}`} onClick={() => (c.keys === "sel" ? clearAfter(i - 1) : clear(c.keys))}>
                <span className="fchip-t">{c.label}</span><span aria-hidden="true" className="x">&times;</span>
              </button>
            ))}
            {crumbs.length > 1 && <button type="button" className="link" onClick={() => clear()}>Clear all</button>}
          </nav>
          <span className="grow" />
          {off && !caps.empty && <span className="note">This export has no per-session rows, so filters are off. Re-run prompt-analytics export.</span>}
        </div>
      </header>
    </div>
  );
}

/** Display settings: accent preset and glass strength, saved per browser. Esc or the button closes it. */
export function Prefs() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(loadSettings);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  const put = (n: Partial<Settings>) => { const next = { ...s, ...n }; setS(next); applySettings(next); saveSettings(next); };
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("input:checked")?.focus();
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    window.addEventListener("keydown", on, true); return () => window.removeEventListener("keydown", on, true);
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className="btn setbtn" aria-label="Display settings" aria-expanded={open} aria-controls={open ? "prefs" : undefined} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div id="prefs" ref={box} className="prefs" role="dialog" aria-label="Display settings">
          <fieldset><legend>Accent</legend>
            <div className="prefs-opts">{ACCENTS.map(([id, text]) => (
              <label key={id}><input type="radio" name="pa-accent" value={id} checked={s.accent === id} onChange={() => put({ accent: id })} />{text}</label>
            ))}</div>
          </fieldset>
          <label><span>Glass</span>
            <input type="range" min={0} max={GLASS.length - 1} step={1} value={s.glass} aria-valuetext={GLASS[s.glass][1]} onChange={(e) => put({ glass: +e.target.value })} />
            <output>{GLASS[s.glass][1]}</output>
          </label>
        </div>
      )}
    </>
  );
}

/** True when the active section is only reachable from the mobile "More" menu (so More carries the active state). */
export const underMore = (section: string) => !BAR_IDS.includes(section);

export function Nav({ part, quiet }: { part: "side" | "bar"; quiet?: Set<string> }) {
  const { section, goto, href, secs, f, capsAll } = useStore();
  const groups = navFor(secs, capsAll.multiTool);
  const bar = BAR.filter(([id]) => secs.has(id));
  const rest = groups.flatMap((g) => g.items).filter((i) => !BAR_IDS.includes(i.id));
  const scoped = (["source", "project", "intent"] as const).filter((k) => f[k] !== undefined).length;
  const here = underMore(section);
  const [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {   // open menu: focus its first item; Esc, an outside click or a scroll closes it
    if (!more) return;
    box.current?.querySelector<HTMLElement>("a")?.focus();
    const close = (refocus: boolean) => { setMore(false); if (refocus) btn.current?.focus(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(true); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close(false); };
    const scroll = () => close(false);
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down); window.addEventListener("scroll", scroll, { passive: true });
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); window.removeEventListener("scroll", scroll); };
  }, [more]);
  const link = (id: string, text: string, cls?: string, icon?: boolean) => (
    <a key={id} href={href(id)} className={cls} data-quiet={quiet?.has(id) || undefined} title={icon ? text : undefined} aria-current={id === section ? "location" : undefined}
      onClick={(e) => { e.preventDefault(); setMore(false); goto(id); }}>
      {icon && <i className="ic"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON[id] ?? ICON["s-overview"]} /></svg></i>}
      {icon ? <span className="nl">{text}</span> : text}
    </a>
  );
  return part === "side" ? (
    <>
      <nav className="side" aria-label="Sections">
        {groups.map((g) => {
          const gi = NAV.findIndex((n) => n.group === g.group);
          return <div key={g.group} className="grp" style={{ "--h": HUE[gi] ?? 255 } as React.CSSProperties}><h2>{g.group}</h2>{g.items.map((i) => link(i.id, i.text, "nv", true))}</div>;
        })}
      </nav>
    </>
  ) : (
    <>
      <nav className="bar" aria-label="Sections">
        {bar.map(([id, text]) => link(id, text))}
        {rest.length > 0 && <button ref={btn} type="button" aria-expanded={more} aria-controls={more ? "more" : undefined} data-here={here || undefined}
          aria-label={`More${here ? `, current: ${textOf(section)}` : ""}${scoped ? `, ${scoped} filter${scoped === 1 ? "" : "s"} on` : ""}`} onClick={() => setMore(!more)}>
          <span>More{scoped > 0 && <b className="badge" aria-hidden="true">{scoped}</b>}</span></button>}
        {more && <div id="more" ref={box} className="morebox">{rest.map((i) => link(i.id, i.text))}</div>}
      </nav>
    </>
  );
}

const NONE = "__no_project__";
const RAIL_KEY = "pa.rail";
export const railCollapsed = () => { try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; } };
const narrow = () => typeof matchMedia === "function" && matchMedia("(max-width: 819px)").matches;

/** Left rail: the logo toggles collapsed / expanded on desktop and closes the drawer on mobile; the menu button in the top bar opens it. */
export function Rail({ col, setCol, open, setOpen, quiet }: { col: boolean; setCol: (c: boolean) => void; open: boolean; setOpen: (o: boolean) => void; quiet?: Set<string> }) {
  const box = useRef<HTMLElement>(null);
  const close = () => { setOpen(false); document.querySelector<HTMLElement>(".navbtn")?.focus(); };   // hand focus back to the menu button
  const toggle = () => {
    if (narrow()) { close(); return; }
    setCol(!col); try { localStorage.setItem(RAIL_KEY, col ? "0" : "1"); } catch { /* private mode: collapse for this visit only */ }
  };
  useEffect(() => {   // drawer: focus its first link; Esc closes it and hands focus back to the menu button
    if (!open) return;
    box.current?.querySelector<HTMLElement>("nav a")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <aside id="rail" ref={box} className="rail" aria-label="Primary" data-open={open || undefined} onClick={(e) => { if ((e.target as Element).closest("nav a") && narrow()) setOpen(false); }}>
        <button type="button" className="brand" aria-label="Toggle sidebar" aria-expanded={!col} aria-controls="rail" title="Show / hide sidebar" onClick={toggle}>
          <Glyph /><b>Prompt Analytics</b>
        </button>
        <Nav part="side" quiet={quiet} />
      </aside>
      {open && <div className="rail-bd" aria-hidden="true" onClick={close} />}
    </>
  );
}
