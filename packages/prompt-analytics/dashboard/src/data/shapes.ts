// Mock data shapes for dev (`?sample=`) and the shape tests: each one bends the full sample into what
// a real install might export (one tool, no prices, basic engine, a week of use, nothing yet).
// Works on the raw export before normalize(), so it also exercises the loader's defaults.
type Raw = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

const clone = (r: Raw): Raw => structuredClone(r);
const sum = (xs: Raw[], k: string) => xs.reduce((a, x) => a + (x[k] ?? 0), 0);

const monday = (iso: string) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };

/** After the session list shrank: whole-export tables that point at sessions must follow it.
 *  `repeats` keep only the kept sessions and their count scales by the kept share (dropped below 3 runs or 2 sessions);
 *  `exposure.items` keep their session (or, with none, their tool) and the exposure aggregates are recounted from them. */
function rescope(r: Raw, srcs?: string[]): Raw {
  const ids = new Set<string>((r.sessions as Raw[]).map((s) => s.id));
  if (Array.isArray(r.repeats)) {
    r.repeats = r.repeats.map((x: Raw) => {
      const kept = x.sessions.filter((i: string) => ids.has(i));
      return { ...x, sessions: kept, count: Math.round(x.count * (kept.length / Math.max(1, x.sessions.length))) };
    }).filter((x: Raw) => x.count >= 3 && x.sessions.length >= 2);
  }
  const ex = r.exposure;
  if (ex && Array.isArray(ex.items)) {
    const items = ex.items.filter((i: Raw) => (i.session ? ids.has(i.session) : srcs ? srcs.includes(i.source) : false));
    const live = items.filter((i: Raw) => i.status !== "false_positive");
    const uniq = (xs: Raw[]) => new Set(xs.map((i) => i.session ?? i.id)).size;
    const cats = ["secret", "pii", "phi"];
    const kinds = [...new Set<string>(live.flatMap((i: Raw) => i.kinds))];
    r.exposure = {
      ...ex, items, sessions: uniq(live), share: ids.size ? uniq(live) / ids.size : 0,
      by_category: ex.by_category.map((c: Raw) => ({ ...c, sessions: uniq(live.filter((i: Raw) => i.category === c.category)), prompts: live.filter((i: Raw) => i.category === c.category).length })).filter((c: Raw) => cats.includes(c.category)),
      by_kind: kinds.map((k) => {
        const m = live.filter((i: Raw) => i.kinds.includes(k)), by: Record<string, number> = {};
        for (const i of m) by[i.source] = (by[i.source] ?? 0) + 1;
        return { kind: k, category: m[0].category, sessions: uniq(m), prompts: m.length, by_source: by };
      }),
      weekly: [...new Set<string>(live.map((i: Raw) => monday(i.date)))].sort().map((date) => {
        const w = live.filter((i: Raw) => monday(i.date) === date);
        return { date, secret: uniq(w.filter((i: Raw) => i.category === "secret")), pii: uniq(w.filter((i: Raw) => i.category === "pii")), phi: uniq(w.filter((i: Raw) => i.category === "phi")) };
      }),
    };
  }
  return r;
}

/** Keep only sessions (and per-tool tables) of these tools; totals recomputed from the rows. */
export function onlySources(raw: Raw, srcs: string[]): Raw {
  const r = clone(raw), keep = (x: Raw) => srcs.includes(x.source);
  r.sessions = r.sessions.filter(keep);
  r.by_source = (r.by_source ?? []).filter(keep);
  r.ttr = (r.ttr ?? []).filter(keep);
  r.tool_switch = (r.tool_switch ?? []).filter((x: Raw) => srcs.includes(x.from) && srcs.includes(x.to));
  r.cost_river = (r.cost_river ?? []).map((w: Raw) => ({ ...w, values: Object.fromEntries(Object.entries(w.values).filter(([k]) => srcs.includes(k))) }));
  r.sources = (r.sources ?? []).map((s: Raw) => (keep(s) ? s : { ...s, status: "missing", sessions: 0 }));
  return retotal(rescope(r, srcs));
}

/** No tool records a price (Copilot-style). */
export function noPrices(raw: Raw): Raw {
  const r = clone(raw);
  r.sessions = r.sessions.map((s: Raw) => ({ ...s, cost_usd: null }));
  r.by_source = (r.by_source ?? []).map((s: Raw) => ({ ...s, cost_usd: null }));
  r.cost_river = [];
  return retotal(r);
}

/** Keyword-only engine: no topic map, no effect tests. */
export function basic(raw: Raw): Raw {
  const r = clone(raw);
  r.engine = { ...r.engine, mode: "basic", available: ["basic"], upgrade: { mode: "ml", command: "pip install 'prompt-analytics[ml]'" } };
  r.galaxy = { clusters: [], points: { x: [], y: [], c: [], q: [] } };
  r.what_works = [];
  r.what_works_tested = 0;
  return r;
}

/** A first week: the latest 5 days, at most 12 sessions. */
export function small(raw: Raw): Raw {
  const r = clone(raw);
  const days = [...new Set<string>(r.sessions.map((s: Raw) => s.date))].sort().slice(-5);
  r.sessions = r.sessions.filter((s: Raw) => days.includes(s.date)).slice(0, 12);
  return retotal(rescope(r));
}

/** Older exporter: optional tables absent; normalize() must fill them. */
export function missing(raw: Raw): Raw {
  const r = clone(raw);
  for (const k of ["hour_week", "ttr", "tool_switch", "quality", "what_works", "anomalies", "cost_river", "repeats"]) delete r[k];
  r.sessions = r.sessions.map(({ features: _f, ...s }: Raw) => s);   // schema 1.2 additions
  return r;
}

export function empty(raw: Raw): Raw {
  const r = clone(raw);
  r.sessions = []; r.by_source = []; r.calendar = []; r.cost_river = []; r.insights = []; r.recommendations = [];
  r.sources = (r.sources ?? []).map((s: Raw) => ({ ...s, status: "missing", sessions: 0 }));
  r.funnel = {}; r.galaxy = {}; r.what_works = []; r.what_works_tested = 0;
  r.totals = { sessions: 0, prompts: 0, tokens: 0, cost_usd: null, active_days: 0, longest_streak: 0, current_streak: 0, projects: 0, commits_linked: 0 };
  r.exposure = { sessions: 0, share: 0, by_category: [], by_kind: [], weekly: [], items: [] };
  r.repeats = [];
  return r;
}

/** Longest run of consecutive active days, and the run ending on the newest day. */
function streaks(dates: string[]): { longest_streak: number; current_streak: number } {
  const days = [...new Set(dates)].sort().map((d) => Date.parse(`${d}T00:00:00Z`) / 864e5);
  let longest = 0, run = 0;
  days.forEach((t, i) => { run = i > 0 && t - days[i - 1] === 1 ? run + 1 : 1; longest = Math.max(longest, run); });
  return { longest_streak: longest, current_streak: days.length ? run : 0 };
}

function retotal(r: Raw): Raw {
  const s = r.sessions as Raw[];
  const priced = s.filter((x) => x.cost_usd !== null);
  r.totals = {
    ...r.totals, sessions: s.length, prompts: sum(s, "prompts"), tokens: sum(s, "tokens"),
    cost_usd: priced.length ? Math.round(sum(priced, "cost_usd") * 100) / 100 : null,
    active_days: new Set(s.map((x) => x.date)).size, projects: new Set(s.map((x) => x.project)).size,
    commits_linked: Math.round(((r.totals?.commits_linked ?? 0) * s.length) / Math.max(1, r.totals?.sessions ?? 1)),   // ponytail: sessions carry no commit field, so scale by the kept share
    ...streaks(s.map((x) => x.date)),
  };
  return r;
}

/** Names accepted by `?sample=` in dev, besides the generated single-tool exports. */
export const SHAPES: Record<string, (r: Raw) => Raw> = {
  "two-tools": (r) => onlySources(r, ["claude_code", "cursor"]),
  "no-prices": noPrices,
  basic, small, missing, empty,
};
