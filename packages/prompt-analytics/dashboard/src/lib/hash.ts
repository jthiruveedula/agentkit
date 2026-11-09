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
  set("src", f.source); set("int", f.intent); set("prj", f.project); set("from", f.from); set("to", f.to); set("cl", f.cluster); set("q", f.q); set("mdl", f.model);
  set("st", f.stage); set("sx", f.stageExact); set("lp", f.loops); set("ap", f.applied === undefined ? undefined : f.applied ? 1 : 0);
  set("sg", f.struggled === undefined ? undefined : f.struggled ? 1 : 0); set("ex", f.exposed === undefined ? undefined : f.exposed ? 1 : 0);
  if (f.frictionMin !== undefined || f.frictionMax !== undefined) p.set("fr", `${f.frictionMin ?? 0}-${f.frictionMax ?? 1}`);
  set("sel", n.sel); if (n.list) p.set("pn", "list"); if (n.cmp !== "prev") p.set("cmp", n.cmp);
  if (n.pg && n.pg > 1) p.set("pg", String(n.pg)); if (n.pgs !== undefined && n.pgs !== 10) p.set("pgs", n.pgs === 0 ? "all" : String(n.pgs));
  if (n.dens) p.set("dn", n.dens); if (n.so) p.set("so", n.so);
  const q = p.toString();
  return `#/${sec}${q ? `?${q}` : ""}`;
}

/** A whole ISO day ("2026-09-01") that exists, year 1970 or later; null otherwise. A native date input passes through
 *  partial years while typing ("0002-09-01", "0202-09-01"): those are rejected here, never treated as a range. */
export function isoDay(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < "1970") return null;
  const t = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s ? s : null;
}
export interface Span { start: string; end: string }
/** Clamp a valid day into the data's range (either end may be "" when unknown). */
export const clampDay = (s: string, r?: Span) => (r?.start && s < r.start ? r.start : r?.end && s > r.end ? r.end : s);

/** `range` (the data's first and last day) clamps from/to, so a pasted or half-typed date can never widen the window past the data. */
export function fromHash(h: string, range?: Span): { nav: Nav; sec: string } {
  const raw = h.replace(/^#\/?/, ""), [path, q = ""] = raw.split("?"), p = new URLSearchParams(q);
  const num = (k: string) => { const v = p.get(k); return v !== null && v !== "" && Number.isFinite(+v) ? +v : undefined; };
  const str = (k: string) => p.get(k) || undefined;
  const day = (k: string) => { const v = isoDay(p.get(k)); return v === null ? undefined : clampDay(v, range); };
  const f: Filter = {};
  const put = <K extends keyof Filter>(k: K, v: Filter[K]) => { if (v !== undefined) f[k] = v; };
  put("source", str("src") as never); put("intent", str("int") as never); put("project", p.get("prj") ?? undefined); put("model", p.get("mdl")?.slice(0, 120) ?? undefined); put("from", day("from")); put("to", day("to"));
  put("cluster", num("cl")); put("q", str("q")?.slice(0, 80)); put("stage", num("st")); put("stageExact", num("sx")); put("loops", num("lp"));
  if (p.get("ap") === "1" || p.get("ap") === "0") f.applied = p.get("ap") === "1";
  if (p.get("sg") === "1" || p.get("sg") === "0") f.struggled = p.get("sg") === "1";
  if (p.get("ex") === "1" || p.get("ex") === "0") f.exposed = p.get("ex") === "1";
  const fr = /^([\d.]+)-([\d.]+)$/.exec(p.get("fr") ?? "");
  if (f.from !== undefined && f.to !== undefined && f.to < f.from) delete f.to;   // an inverted range keeps its start
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
