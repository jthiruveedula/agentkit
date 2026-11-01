import type { ExposureApi, RevealFinding } from "./types";
import { normalize } from "./load";

/**
 * Review API client. Returns null over file:// or when no token meta is present.
 * In dev (never in production builds) a fake in-memory API is used unless `?offline` is in the URL.
 * Revealed text is returned to the caller only; nothing is logged, cached or put in URLs/storage.
 */
export function getApi(doc: Document = document): ExposureApi | null {
  const token = doc.querySelector<HTMLMetaElement>('meta[name="pa-token"]')?.content;
  if (token) {
    const call = async (path: string, init?: RequestInit) => {
      const r = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin", headers: { "X-PA-Token": token, "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json();
    };
    return {
      reveal: async (id) => ((await call(`/api/exposure/${encodeURIComponent(id)}`)).findings ?? []) as RevealFinding[],
      review: async (id, status) => { await call(`/api/exposure/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ status }) }); },
      reanalyze: async (mode) => normalize(await call("/api/analyze", { method: "POST", body: JSON.stringify({ mode }) })),
    };
  }
  if (import.meta.env.DEV && !location.search.includes("offline")) {
    return {
      reveal: async (id) => (await import("./api.mock")).reveal(id),
      review: async (id, s) => (await import("./api.mock")).review(id, s),
      reanalyze: async (m) => normalize(await (await import("./api.mock")).reanalyze(m)),
    };
  }
  return null;
}
