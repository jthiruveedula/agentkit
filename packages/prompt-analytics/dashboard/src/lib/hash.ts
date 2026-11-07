// URL hash is the only state store: `#/s-time?src=claude_code&int=bugfix&from=2026-09-01&sel=s0835&cmp=prev`.
// Short keys map 1:1 to Filter (sg = struggled, ex = exposed), plus `fr` (friction band), `sel` (session), `pn` (list panel), `cmp`.
import type { Filter } from "./filter";
import type { Cmp } from "./compare";

/** Sessions table view state, all optional so a bare hash means: page 1, 10 rows, comfortable, default sort.
 *  pg = page (1-based), pgs = rows per page (0 = All), dens = "c" for compact, so = sort token ("cost-d"). */
export interface Nav { f: Filter; sel?: string; list: boolean; cmp: Cmp; pg?: number; pgs?: number; dens?: "c"; so?: string }
export const SECTIONS = ["s-overview", "s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-models", "s-exposure", "s-recs", "s-sessions", "s-map"];
/** Card anchors inside a section: linkable and scroll targets, but the nav / scroll-spy highlight their section. */
export const ANCHORS: Record<string, string> = { "s-trend": "s-overview", "s-attention": "s-overview", "s-playbook": "s-works", "s-loopbreak": "s-friction" };
/** Scroll-spy lock: goto() pins the active nav item to the clicked section until the smooth scroll ends (scrollend, or ~900 ms). */
export const spyLock = { id: "", until: 0 };
export function lockSpy(id: string, ms = 900) {
  spyLock.id = id; spyLock.until = Date.now() + ms;
  const done = () => { spyLock.until = 0; };
  if ("onscrollend" in window) window.addEventListener("scrollend", done, { once: true });
}
export const spyLocked = () => (Date.now() < spyLock.until ? spyLock.id : null);
export const sectionOf = (id: string) => ANCHORS[id] ?? id;
const known = (id: string) => SECTIONS.includes(id) || id in ANCHORS;

export function toHash(n: Nav, sec = "s-overview"): string {
  const p = new URLSearchParams(), f = n.f;
  const set = (k: string, v: unknown) => { if (v !== undefined) p.set(k, String(v)); };
  set("src", f.source); set("int", f.intent); set("prj", f.project); set("from", f.from); set("to", f.to); set("cl", f.cluster); set("q", f.q);
  set("st", f.stage); set("sx", f.stageExact); set("lp", f.loops); set("ap", f.applied === undefined ? undefined : f.applied ? 1 : 0);
  set("sg", f.struggled === undefined ? undefined : f.struggled ? 1 : 0); set("ex", f.exposed === undefined ? undefined : f.exposed ? 1 : 0);
  if (f.frictionMin !== undefined || f.frictionMax !== undefined) p.set("fr", `${f.frictionMin ?? 0}-${f.frictionMax ?? 1}`);
  set("sel", n.sel); if (n.list) p.set("pn", "list"); if (n.cmp !== "prev") p.set("cmp", n.cmp);
  if (n.pg && n.pg > 1) p.set("pg", String(n.pg)); if (n.pgs !== undefined && n.pgs !== 10) p.set("pgs", n.pgs === 0 ? "all" : String(n.pgs));
  if (n.dens) p.set("dn", n.dens); if (n.so) p.set("so", n.so);
  const q = p.toString();
  return `#/${sec}${q ? `?${q}` : ""}`;
}

export function fromHash(h: string): { nav: Nav; sec: string } {
  const raw = h.replace(/^#\/?/, ""), [path, q = ""] = raw.split("?"), p = new URLSearchParams(q);
  const num = (k: string) => { const v = p.get(k); return v !== null && v !== "" && Number.isFinite(+v) ? +v : undefined; };
  const str = (k: string) => p.get(k) || undefined;
  const f: Filter = {};
  const put = <K extends keyof Filter>(k: K, v: Filter[K]) => { if (v !== undefined) f[k] = v; };
  put("source", str("src") as never); put("intent", str("int") as never); put("project", p.get("prj") ?? undefined); put("from", str("from")); put("to", str("to"));
  put("cluster", num("cl")); put("q", str("q")?.slice(0, 80)); put("stage", num("st")); put("stageExact", num("sx")); put("loops", num("lp"));
  if (p.get("ap") === "1" || p.get("ap") === "0") f.applied = p.get("ap") === "1";
  if (p.get("sg") === "1" || p.get("sg") === "0") f.struggled = p.get("sg") === "1";
  if (p.get("ex") === "1" || p.get("ex") === "0") f.exposed = p.get("ex") === "1";
  const fr = /^([\d.]+)-([\d.]+)$/.exec(p.get("fr") ?? "");
  if (fr) { f.frictionMin = +fr[1]; f.frictionMax = +fr[2]; }
  const cmp = p.get("cmp");
  const sec = str("sec") ?? path;
  const view: Partial<Nav> = {}, pg = num("pg"), ps = p.get("pgs"), so = str("so");
  if (pg !== undefined && pg > 1) view.pg = Math.floor(pg);
  if (ps === "all") view.pgs = 0; else if (ps && [25, 50, 100].includes(+ps)) view.pgs = +ps;
  if (p.get("dn") === "c") view.dens = "c";
  if (so && /^(date|prompts|tokens|loops|cost|friction)-[ad]$/.test(so)) view.so = so;
  return { nav: { f, sel: str("sel"), list: p.get("pn") === "list", cmp: cmp === "yoy" || cmp === "off" ? cmp : "prev", ...view }, sec: known(sec) ? sec : known(`s-${sec}`) ? `s-${sec}` : "s-overview" };
}
