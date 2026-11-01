// Command palette: pure action building, ranking and saved views. No DOM; the component executes `run`.
import { chips, type Filter } from "./filter";
import { fromHash } from "./hash";
import type { Fmt } from "./export";

export type Run =
  | { t: "goto"; id: string } | { t: "filter"; p: Filter } | { t: "range"; days: number }
  | { t: "copy" } | { t: "wrapped" } | { t: "export"; fmt: Fmt } | { t: "clear" } | { t: "session"; id: string }
  | { t: "view-apply"; hash: string } | { t: "view-save" } | { t: "view-del"; name: string };
export interface Action { id: string; label: string; /** second line, e.g. the filters a saved view applies */ sub?: string; group: string; keys?: string; run: Run; /** only listed once the user types */ lazy?: boolean }
export interface SavedView { name: string; hash: string }
/** "Claude Code, bugfix" for a saved view's hash, or "no filters". */
export const viewSummary = (hash: string) => { const l = chips(fromHash(hash).nav.f).map((c) => c.label); return l.length ? l.join(", ") : "no filters"; };
/** With an empty query: saved views first, then actions, then section jumps. Typed queries rank by score. */
export const groupOrder = (g: string) => (g === "Views" ? 0 : g === "Jump" ? 2 : 1);
export const groupName = (g: string) => (g === "Views" ? "Saved views" : g === "Jump" ? "Jump to" : "Actions");

export interface Ctx {
  sections: { id: string; text: string }[];     // only sections that exist per capabilities
  sources: { id: string; text: string }[];      // empty for a single tool: filtering by it is pointless
  intents: string[]; projects: string[];
  hasFilters: boolean; hasRows: boolean; /** Weekly Wrapped is offered */ hasWrapped?: boolean;
  views: SavedView[];
}

export function buildActions(c: Ctx): Action[] {
  const a: Action[] = [];
  for (const s of c.sections) a.push({ id: `go:${s.id}`, label: `Go to ${s.text}`, group: "Jump", keys: "section scroll", run: { t: "goto", id: s.id } });
  for (const [days, t] of [[30, "last 30 days"], [90, "last 90 days"], [0, "all time"]] as const) a.push({ id: `range:${days}`, label: `Range: ${t}`, group: "Range", keys: "period date", run: { t: "range", days } });
  a.push({ id: "copy", label: "Copy summary as Markdown", group: "Share", keys: "clipboard report", run: { t: "copy" } });
  if (c.hasWrapped) a.push({ id: "wrapped", label: "Open Weekly Wrapped", group: "Share", keys: "week recap summary", run: { t: "wrapped" } });
  if (c.hasRows) for (const fmt of ["csv", "json", "xlsx"] as const) a.push({ id: `export:${fmt}`, label: `Export sessions as ${fmt === "xlsx" ? "Excel (.xlsx)" : fmt.toUpperCase()}`, group: "Share", keys: "download", run: { t: "export", fmt } });
  if (c.hasFilters) a.push({ id: "clear", label: "Clear all filters", group: "Filter", keys: "reset", run: { t: "clear" } });
  for (const s of c.sources) a.push({ id: `src:${s.id}`, label: `Filter tool: ${s.text}`, group: "Filter", keys: "source", lazy: true, run: { t: "filter", p: { source: s.id as never } } });
  for (const i of c.intents) a.push({ id: `int:${i}`, label: `Filter intent: ${i}`, group: "Filter", lazy: true, run: { t: "filter", p: { intent: i as never } } });
  for (const p of c.projects) a.push({ id: `prj:${p}`, label: `Filter project: ${p}`, group: "Filter", lazy: true, run: { t: "filter", p: { project: p } } });
  a.push({ id: "view-save", label: "Save current view as...", group: "Views", keys: "bookmark", run: { t: "view-save" } });
  for (const v of c.views) {
    a.push({ id: `view:${v.name}`, label: `Apply view: ${v.name}`, sub: viewSummary(v.hash), group: "Views", run: { t: "view-apply", hash: v.hash } });
    a.push({ id: `viewdel:${v.name}`, label: `Delete view: ${v.name}`, group: "Views", keys: "remove", run: { t: "view-del", name: v.name } });
  }
  return a;
}

/** Score 0 = no match. All query words must match; prefix of the label or of a word beats a substring. Stable for ties. */
export function score(a: Action, q: string): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = a.label.toLowerCase(), hay = `${label} ${a.keys ?? ""}`;
  let s = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    s += label.startsWith(w) ? 4 : i === 0 || /[\s:]/.test(hay[i - 1]) ? 3 : 1;
  }
  return s;
}

export function rank(actions: Action[], q: string, limit = 40): Action[] {
  const t = q.trim();
  return actions.map((a, i) => ({ a, i, s: !t && a.lazy ? 0 : score(a, t) })).filter((x) => x.s > 0)
    .sort((x, y) => (t ? y.s - x.s : groupOrder(x.a.group) - groupOrder(y.a.group)) || y.s - x.s || x.i - y.i).slice(0, limit).map((x) => x.a);
}

/** Session search: newest first among rows whose title contains every word; at most `limit`. */
/** "Filter sessions by title" row for a typed query of 2+ characters: the visible search box's twin, same `q` filter key. */
export const titleAction = (q: string): Action[] => (q.trim().length >= 2 ? [{ id: "q", label: `Filter sessions by title: ${q.trim().slice(0, 40)}`, group: "Filter", run: { t: "filter", p: { q: q.trim() } } }] : []);

export function sessionActions(rows: { id: string; title: string; date: string }[], q: string, limit = 5): Action[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (q.trim().length < 2) return [];
  return rows.filter((r) => r.title && words.every((w) => r.title.toLowerCase().includes(w))).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, limit).map((r) => ({ id: `s:${r.id}`, label: `Open session: ${r.title.slice(0, 70)}`, group: "Sessions", run: { t: "session", id: r.id } }));
}

// ---- saved views (localStorage, tolerant of blocked storage) ----
export const VIEWS_KEY = "pa.views";
type Store = Pick<Storage, "getItem" | "setItem">;
export function loadViews(st?: Store): SavedView[] {
  try { const x = JSON.parse((st ?? localStorage).getItem(VIEWS_KEY) ?? "[]"); return Array.isArray(x) ? x.filter((v) => v && typeof v.name === "string" && typeof v.hash === "string") : []; } catch { return []; }
}
/** false when storage refused the write (the caller says so). */
export function storeViews(v: SavedView[], st?: Store): boolean { try { (st ?? localStorage).setItem(VIEWS_KEY, JSON.stringify(v)); return true; } catch { return false; } }
export const addView = (v: SavedView[], name: string, hash: string): SavedView[] => { const n = name.trim().slice(0, 40); return n ? [...v.filter((x) => x.name !== n), { name: n, hash }] : v; };
export const removeView = (v: SavedView[], name: string): SavedView[] => v.filter((x) => x.name !== name);
