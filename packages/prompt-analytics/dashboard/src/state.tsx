import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DashboardData } from "./data/types";
import { chips, patchFilter, same, views, isEmpty, type Filter, type FilterKey, type Views } from "./lib/filter";
import { priorViews, windowOf, type Cmp, type Prior, type Win } from "./lib/compare";
import { fromHash, lockSpy, sectionOf, toHash, type Nav } from "./lib/hash";
import { capabilities, sectionsFor, type Caps } from "./lib/capabilities";

export interface Crumb { id: string; label: string; keys: FilterKey[] | "sel" }
type Cat = "all" | "secret" | "pii" | "phi";
interface S { nav: Nav; order: string[] }

export interface Store {
  d: DashboardData;
  f: Filter;
  v: Views;
  /** What the rows in view can honestly show (recomputed under every filter). */
  caps: Caps;
  /** Same flags for the whole export, ignoring filters: keeps a clicked row's table in place. */
  capsAll: Caps;
  /** Section ids with something to show, for the nav and scroll-spy. */
  secs: Set<string>;
  win: Win;
  /** Prior-period views, null for "All", cmp off, or a prior window outside the data. */
  prior: Prior | null;
  cmp: Cmp;
  setCmp: (c: Cmp) => void;
  /** Session ids matching the filter (null when no filter is active). */
  ids: Set<string> | null;
  /** Sessions in view with an open exposure finding (from the review queue, newest 300). */
  exposed: Set<string>;
  sel?: string;
  list: boolean;
  panel: "none" | "list" | "detail";
  crumbs: Crumb[];
  section: string;
  setSection: (id: string) => void;
  goto: (id: string) => void;
  /** Filter-bar edit: replaces the history entry so Back is not spammed. */
  set: (p: Filter) => void;
  /** A chart mark was activated: toggle that selection (pushes history). */
  drill: (p: Filter, o?: { list?: boolean }) => void;
  /** Like drill but never toggles off (attention rows, evidence links). */
  apply: (p: Filter, o?: { list?: boolean }) => void;
  /** Hash URL for a section anchor under the current state. */
  href: (sec: string) => string;
  clear: (keys?: FilterKey[]) => void;
  /** Clear every crumb after index i (-1 = all). */
  clearAfter: (i: number) => void;
  /** Sessions table view (page, rows per page, density, sort); all in the hash. */
  view: Pick<Nav, "pg" | "pgs" | "dens" | "so">;
  /** Patch the table view (replace, no history spam); a key set to undefined resets it. */
  setView: (p: Partial<Pick<Nav, "pg" | "pgs" | "dens" | "so">>) => void;
  /** Apply a saved or shared hash (`#/s-time?src=...`) as the whole navigation state. */
  go: (hash: string) => void;
  openList: () => void;
  openSession: (id: string) => void;
  back: () => void;
  closePanel: () => void;
  exCat: Cat;
  setExCat: (c: Cat) => void;
  clusterLabel: (id: number) => string;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside <StoreProvider>");
  return s;
};

const hasWin = typeof window !== "undefined";
const readHash = () => (hasWin ? fromHash(location.hash) : fromHash(""));
const labelOf = (f: Filter, cl: (n: number) => string) => chips(f, cl);
/** Keep earlier crumbs in the order they were added, then append new ones. */
const reorder = (prev: string[], ids: string[]) => [...prev.filter((x) => ids.includes(x)), ...ids.filter((x) => !prev.includes(x))];
const toggle = (c: Filter, p: Filter): Filter => {
  const keys = Object.keys(p) as FilterKey[];
  const on = keys.length > 0 && same(Object.fromEntries(keys.map((k) => [k, c[k]])), p);
  return patchFilter(c, Object.fromEntries(keys.map((k) => [k, on ? undefined : p[k]])));
};

export function StoreProvider({ d, children, initial }: { d: DashboardData; children: ReactNode; initial?: Filter }) {
  const first = useMemo(() => readHash(), []);
  const labels = useMemo(() => new Map(d.galaxy.clusters.map((c) => [c.id, c.label])), [d]);
  const clusterLabel = useCallback((id: number) => labels.get(id) ?? `#${id}`, [labels]);
  const boot = (): S => {
    const nav = initial ? { ...first.nav, f: initial } : first.nav;
    return { nav, order: reorder(typeof history !== "undefined" ? history.state?.order ?? [] : [], labelOf(nav.f, clusterLabel).map((c) => c.keys.join())) };
  };
  const [s, setS] = useState<S>(boot);
  const sRef = useRef(s);
  const secRef = useRef(sectionOf(first.sec));
  const [section, setSec] = useState(sectionOf(first.sec));
  const [exCat, setExCat] = useState<Cat>("all");
  const { f, sel, list, cmp } = s.nav;
  const view = useMemo(() => ({ pg: s.nav.pg, pgs: s.nav.pgs, dens: s.nav.dens, so: s.nav.so }), [s.nav.pg, s.nav.pgs, s.nav.dens, s.nav.so]);

  const write = useCallback((next: S, mode: "push" | "replace") => {
    sRef.current = next; setS(next);
    if (typeof history === "undefined") return;
    history[mode === "push" ? "pushState" : "replaceState"]({ order: next.order }, "", toHash(next.nav, secRef.current));
  }, []);
  const commit = useCallback((nav: Nav, mode: "push" | "replace") => {
    const cur = sRef.current.nav;   // a new filter starts the sessions table on page 1
    if (nav.pg && nav.pg === cur.pg && !same(nav.f, cur.f)) nav = { ...nav, pg: undefined };
    write({ nav, order: reorder(sRef.current.order, labelOf(nav.f, clusterLabel).map((c) => c.keys.join())) }, mode);
  }, [write, clusterLabel]);

  useEffect(() => {   // Back / Forward and pasted hashes re-read the URL
    const on = () => {
      const h = readHash(); secRef.current = sectionOf(h.sec); setSec(sectionOf(h.sec));
      const next = { nav: h.nav, order: reorder(history.state?.order ?? [], labelOf(h.nav.f, clusterLabel).map((c) => c.keys.join())) };
      sRef.current = next; setS(next);
    };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [clusterLabel]);

  const v = useMemo(() => views(d, f), [d, f]);
  const caps = useMemo(() => capabilities(d, v), [d, v]);
  // Section visibility follows the whole export, so drilling into one day never collapses the page;
  // the content inside each section follows the filtered caps.
  const whole = useMemo(() => (isEmpty(f) ? null : views(d, {})), [d, f]);
  const capsAll = useMemo(() => (whole ? capabilities(d, whole) : caps), [whole, caps, d]);
  const secs = useMemo(() => (whole ? sectionsFor(capsAll, d, whole) : sectionsFor(caps, d, v)), [whole, caps, capsAll, d, v]);
  const prior = useMemo(() => priorViews(d, f, cmp), [d, f, cmp]);
  const win = useMemo(() => windowOf(d, f), [d, f]);
  const ids = useMemo(() => (isEmpty(f) ? null : new Set(v.rows.map((r) => r.id))), [f, v.rows]);
  const openIds = useMemo(() => new Set(d.exposure.items.filter((i) => i.status === "open" && i.session).map((i) => i.session as string)), [d]);
  const exposed = useMemo(() => new Set(v.rows.filter((r) => openIds.has(r.id)).map((r) => r.id)), [v.rows, openIds]);

  const crumbs = useMemo<Crumb[]>(() => {
    const cs: Crumb[] = labelOf(f, clusterLabel).map((c) => ({ id: c.keys.join(), label: c.label, keys: c.keys }));
    if (sel) cs.push({ id: "sel", label: `Session ${sel}`, keys: "sel" });
    return cs.sort((a, b) => (a.id === "sel" ? 1 : b.id === "sel" ? -1 : s.order.indexOf(a.id) - s.order.indexOf(b.id)));
  }, [f, sel, s.order, clusterLabel]);

  const nav = (p: Partial<Nav>): Nav => ({ ...sRef.current.nav, ...p });
  const set = useCallback((p: Filter) => commit(nav({ f: patchFilter(sRef.current.nav.f, p) }), "replace"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const drill = useCallback((p: Filter, o?: { list?: boolean }) => commit(nav({ f: toggle(sRef.current.nav.f, p), list: o?.list ? true : sRef.current.nav.list }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const apply = useCallback((p: Filter, o?: { list?: boolean }) => commit(nav({ f: patchFilter(sRef.current.nav.f, p), list: o?.list ? true : sRef.current.nav.list }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback((keys?: FilterKey[]) => commit(nav({ f: keys ? patchFilter(sRef.current.nav.f, Object.fromEntries(keys.map((k) => [k, undefined]))) : {}, ...(keys ? {} : { sel: undefined }) }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const clearAfter = useCallback((i: number) => {
    const cur = sRef.current, drop = crumbs.slice(i + 1);
    let nf = cur.nav.f, sl = cur.nav.sel;
    for (const c of drop) { if (c.keys === "sel") sl = undefined; else nf = patchFilter(nf, Object.fromEntries(c.keys.map((k) => [k, undefined]))); }
    commit({ ...cur.nav, f: nf, sel: sl }, "push");
  }, [commit, crumbs]);
  const openList = useCallback(() => commit(nav({ list: true, sel: undefined }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const openSession = useCallback((id: string) => commit(nav({ sel: id }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const back = useCallback(() => { const n = sRef.current.nav; commit(n.sel ? { ...n, sel: undefined } : { ...n, list: false }, "push"); }, [commit]);
  const closePanel = useCallback(() => commit(nav({ sel: undefined, list: false }), "push"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const setView = useCallback((p: Partial<Pick<Nav, "pg" | "pgs" | "dens" | "so">>) => commit(nav(p), "replace"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const go = useCallback((hash: string) => {
    const h = fromHash(hash), id = sectionOf(h.sec);
    secRef.current = id; setSec(id); commit(h.nav, "push");
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.());
  }, [commit]);
  const setCmp = useCallback((c: Cmp) => commit(nav({ cmp: c }), "replace"), [commit]);  // eslint-disable-line react-hooks/exhaustive-deps
  const setSection = useCallback((raw: string) => {
    const id = sectionOf(raw);
    if (secRef.current === id) return;
    secRef.current = id; setSec(id);
    if (typeof history !== "undefined") history.replaceState(history.state, "", toHash(sRef.current.nav, id));
  }, []);
  const goto = useCallback((id: string) => {
    setSection(sectionOf(id)); lockSpy(sectionOf(id));
    const el = document.getElementById(id);
    if (el) el.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [setSection]);

  useEffect(() => {   // a pasted URL scrolls to its section once
    if (first.sec !== "s-overview") requestAnimationFrame(() => document.getElementById(first.sec)?.scrollIntoView?.());
  }, [first.sec]);

  const href = (sec: string) => toHash(s.nav, sec);
  const panel = sel ? "detail" : list ? "list" : "none";
  const store: Store = { d, f, v, caps, capsAll, secs, win, prior, cmp, setCmp, ids, exposed, sel, list, panel, crumbs, section, setSection, goto, set, drill, apply, href, clear, clearAfter, view, setView, go, openList, openSession, back, closePanel, exCat, setExCat, clusterLabel };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
