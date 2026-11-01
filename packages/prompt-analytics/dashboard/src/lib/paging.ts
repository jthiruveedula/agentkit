// Pagination math for the sessions table. size 0 = All.
export const SIZES = [10, 25, 50, 100, 0] as const;
export const DEFAULT_SIZE = 10;
export const sizeLabel = (n: number) => (n === 0 ? "All" : String(n));
export const pageCount = (total: number, size: number) => (size <= 0 || total <= 0 ? 1 : Math.ceil(total / size));
/** Clamp a (possibly stale or shared) page into 1..last. */
export const clampPage = (pg: number | undefined, total: number, size: number) => Math.min(pageCount(total, size), Math.max(1, Math.floor(pg ?? 1) || 1));
export const pageBounds = (total: number, pg: number, size: number): [number, number] => (size <= 0 ? [0, total] : [(pg - 1) * size, Math.min(total, pg * size)]);
export const pageSlice = <T,>(rows: T[], pg: number, size: number): T[] => { const [a, b] = pageBounds(rows.length, pg, size); return rows.slice(a, b); };
/** "11–20 of 174" (en dash); "0 of 0" when empty. */
export const rangeText = (total: number, pg: number, size: number) => { if (!total) return "0 of 0"; const [a, b] = pageBounds(total, pg, size); return `${a + 1}–${b} of ${total}`; };

export type SortKey = "date" | "prompts" | "tokens" | "loops" | "cost" | "friction";
const SORT = /^(date|prompts|tokens|loops|cost|friction)-([ad])$/;
export const sortToken = (k: SortKey, desc: boolean) => `${k}-${desc ? "d" : "a"}`;
export const parseSort = (s: string | undefined): { k: SortKey; desc: boolean } | undefined => { const m = s ? SORT.exec(s) : null; return m ? { k: m[1] as SortKey, desc: m[2] === "d" } : undefined; };
