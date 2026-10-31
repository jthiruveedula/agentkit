import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Chapter, DashboardData } from "./data/types";
import { isEmpty, patchFilter, same, views, type Filter, type FilterKey, type Views } from "./lib/filter";

export const TABS: { id: Chapter; name: string }[] = [
  { id: "footprint", name: "Footprint" }, { id: "time", name: "Time" }, { id: "funnel", name: "Funnel" },
  { id: "friction", name: "Friction" }, { id: "works", name: "What works" }, { id: "recommend", name: "Recommend" },
];

export interface Store {
  d: DashboardData;
  f: Filter;
  v: Views;
  /** Session ids matching the filter (null when no filter is active). */
  ids: Set<string> | null;
  tab: Chapter;
  setTab: (t: Chapter) => void;
  /** Change the filter without opening the drawer (filter bar). */
  set: (p: Filter) => void;
  /** A chart mark was activated: toggle that selection and open the drawer on it. */
  drill: (p: Filter, tab?: Chapter) => void;
  clear: (keys?: FilterKey[]) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  clusterLabel: (id: number) => string;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside <StoreProvider>");
  return s;
};

const fromHash = (): Chapter => {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Chapter) : "footprint";
};

export function StoreProvider({ d, children, initial }: { d: DashboardData; children: ReactNode; initial?: Filter }) {
  const [f, setF] = useState<Filter>(initial ?? {});
  const [open, setOpen] = useState(false);
  const [tab, setTabState] = useState<Chapter>(fromHash);
  const v = useMemo(() => views(d, f), [d, f]);
  const ids = useMemo(() => (isEmpty(f) ? null : new Set(v.rows.map((r) => r.id))), [f, v.rows]);
  const labels = useMemo(() => new Map(d.galaxy.clusters.map((c) => [c.id, c.label])), [d]);
  const setTab = useCallback((t: Chapter) => {
    setTabState(t);
    if (typeof history !== "undefined") history.replaceState(null, "", `#${t}`);
  }, []);
  const set = useCallback((p: Filter) => setF((c) => patchFilter(c, p)), []);
  const drill = useCallback((p: Filter, t?: Chapter) => {
    setF((c) => {
      const keys = Object.keys(p) as FilterKey[];
      const on = keys.length > 0 && same(Object.fromEntries(keys.map((k) => [k, c[k]])), p);
      return on ? patchFilter(c, Object.fromEntries(keys.map((k) => [k, undefined]))) : patchFilter(c, p);
    });
    setOpen(true);
    if (t) setTab(t);
  }, [setTab]);
  const clear = useCallback((keys?: FilterKey[]) => setF((c) => (keys ? patchFilter(c, Object.fromEntries(keys.map((k) => [k, undefined]))) : {})), []);
  const clusterLabel = useCallback((id: number) => labels.get(id) ?? `#${id}`, [labels]);
  const store: Store = { d, f, v, ids, tab, setTab, set, drill, clear, open, setOpen, clusterLabel };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
