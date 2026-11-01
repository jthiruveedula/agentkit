// URL hash is the only state store: `#/s-time?src=claude_code&int=bugfix&from=2026-09-01&sel=s0835&cmp=prev`.
// Short keys map 1:1 to Filter, plus `fr` (friction band), `sel` (session), `pn` (list panel), `cmp`.
import type { Filter } from "./filter";
import type { Cmp } from "./compare";

export interface Nav { f: Filter; sel?: string; list: boolean; cmp: Cmp }
export const SECTIONS = ["s-overview", "s-map", "s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-exposure", "s-recs", "s-sessions"];

export function toHash(n: Nav, sec = "s-overview"): string {
  const p = new URLSearchParams(), f = n.f;
  const set = (k: string, v: unknown) => { if (v !== undefined) p.set(k, String(v)); };
  set("src", f.source); set("int", f.intent); set("prj", f.project); set("from", f.from); set("to", f.to); set("cl", f.cluster);
  set("st", f.stage); set("sx", f.stageExact); set("lp", f.loops); set("ap", f.applied === undefined ? undefined : f.applied ? 1 : 0);
  if (f.frictionMin !== undefined || f.frictionMax !== undefined) p.set("fr", `${f.frictionMin ?? 0}-${f.frictionMax ?? 1}`);
  set("sel", n.sel); if (n.list) p.set("pn", "list"); if (n.cmp !== "prev") p.set("cmp", n.cmp);
  const q = p.toString();
  return `#/${sec}${q ? `?${q}` : ""}`;
}

export function fromHash(h: string): { nav: Nav; sec: string } {
  const raw = h.replace(/^#\/?/, ""), [path, q = ""] = raw.split("?"), p = new URLSearchParams(q);
  const num = (k: string) => { const v = p.get(k); return v !== null && v !== "" && Number.isFinite(+v) ? +v : undefined; };
  const str = (k: string) => p.get(k) || undefined;
  const f: Filter = {};
  const put = <K extends keyof Filter>(k: K, v: Filter[K]) => { if (v !== undefined) f[k] = v; };
  put("source", str("src") as never); put("intent", str("int") as never); put("project", str("prj")); put("from", str("from")); put("to", str("to"));
  put("cluster", num("cl")); put("stage", num("st")); put("stageExact", num("sx")); put("loops", num("lp"));
  if (p.get("ap") === "1" || p.get("ap") === "0") f.applied = p.get("ap") === "1";
  const fr = /^([\d.]+)-([\d.]+)$/.exec(p.get("fr") ?? "");
  if (fr) { f.frictionMin = +fr[1]; f.frictionMax = +fr[2]; }
  const cmp = p.get("cmp");
  const sec = str("sec") ?? path;
  return { nav: { f, sel: str("sel"), list: p.get("pn") === "list", cmp: cmp === "yoy" || cmp === "off" ? cmp : "prev" }, sec: SECTIONS.includes(sec) ? sec : SECTIONS.includes(`s-${sec}`) ? `s-${sec}` : "s-overview" };
}
