// Generates src/data/sample.dev.json: synthetic data conforming to contract.ts.
// Deterministic (seeded). Dev/screenshot use only; never bundled into production.
//
// Planted scenarios (LAST 28 days only: 2026-09-28..2026-10-25; prior 28: 2026-08-31..2026-09-27):
//  A. Latency + friction regression in project "billing-api", intent "bugfix".
//     Re-labels 8 prompted sessions from elsewhere into the combo, then every billing-api/bugfix
//     session with >=4 prompts in the window gets +1..2 loops (friction +0.13 per loop) and ttr_min x1.6.
//     Expected: median ttr_min of the combo ~2x the prior 28 (measured 2.1x, n=15 vs 7); mean loops up ~1.2.
//  B. Cost mix shift: claude_code share of sessions rises ~15 pts in the window (about 50% -> 65%).
//     ~26 prompted copilot/cursor/opencode sessions in the window are re-labelled claude_code and priced
//     at the claude_code rate. Per-session cost rate per tool is unchanged; total spend rises.
// Mechanism: scenarios re-label/adjust existing rows (no change to the main rnd() sampling), and draw
// from their own LCGs (rndPlant, rndTtr). The legacy `ttr` gate uses pre-plant counts so its rnd() draws
// are unchanged. All aggregates are derived after planting.
// Per-session rows are generated first and every aggregate is derived from them, so the
// dashboard's client-side cross-filtering and the legacy aggregate fields agree.
import { writeFileSync } from "node:fs";

let s = 20260431;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const r2 = (n, d = 2) => +n.toFixed(d);
const pick = (a, w) => { let t = rnd() * (w ? w.reduce((x, y) => x + y, 0) : a.length); for (let i = 0; i < a.length; i++) { t -= w ? w[i] : 1; if (t < 0) return a[i]; } return a[a.length - 1]; };
const SRC = ["claude_code", "copilot", "cursor", "opencode", "antigravity"];
const INT = ["bugfix", "feature", "refactor", "explain", "test", "docs", "devops", "data", "other"];
const share = { claude_code: 0.52, copilot: 0.16, cursor: 0.2, opencode: 0.07, antigravity: 0.05 };
const costPer = { claude_code: 0.9, copilot: 0, cursor: 0.4, opencode: 0, antigravity: 0.25 }; // copilot/opencode are never priced
const PROJECTS = ["billing-api", "web-app", "mobile-app", "infra", "data-pipeline", "design-system", "auth-service", "docs-site", "ml-notebooks", "cli-tools", "payments", "internal-admin"];
const VERBS = { bugfix: ["Fix", "Debug", "Track down"], feature: ["Add", "Build", "Implement"], refactor: ["Refactor", "Split up", "Clean up"], explain: ["Explain", "Walk through", "Review"], test: ["Write tests for", "Stabilise", "Cover"], docs: ["Document", "Update README for", "Write guide for"], devops: ["Set up CI for", "Dockerise", "Deploy"], data: ["Clean", "Migrate", "Query"], other: ["Look at", "Check", "Triage"] };
const THINGS = ["login flow", "retry logic", "webhook handler", "date parsing", "cache layer", "flaky suite", "build script", "schema migration", "pagination", "error boundary", "rate limiter", "export job"];

const start = new Date("2026-04-27T00:00:00Z");
const days = 182;
const iso = (d) => d.toISOString().slice(0, 10);
const sessions = [];
for (let i = 0; i < days; i++) {
  const d = new Date(start.getTime() + i * 864e5);
  const dow = (d.getUTCDay() + 6) % 7;
  if (rnd() > (dow >= 5 ? 0.35 : 0.9)) continue;
  const n = Math.max(1, Math.round(3 + gauss() * 1.6 + (dow < 5 ? 2 : 0) + (i / days) * 2.5));
  for (let k = 0; k < n; k++) {
    // opencode only appears from week 6, antigravity from week 11, cursor fades out
    const w = SRC.map((x) => share[x] * (x === "opencode" ? (i > 40 ? 1 : 0) : x === "antigravity" ? (i > 75 ? 1 : 0) : x === "cursor" ? 1.4 - i / days : 1));
    const source = pick(SRC, w);
    const intent = pick(INT, [0.28, 0.24, 0.1, 0.12, 0.08, 0.05, 0.05, 0.05, 0.03]);
    const short = rnd() < 0.42;
    const prompts0 = short ? 1 + Math.floor(rnd() * 3) : Math.min(70, Math.round(4 + Math.exp(rnd() * 3.1)));
    const project = pick(PROJECTS, PROJECTS.map((_, j) => 1 / (1 + j * 0.45)));
    const empty = rnd() < 0.06;   // opened but never prompted: excluded from every rate denominator
    const reached = empty ? 1 : Math.max(1, Math.min(6, 1 + Math.floor((short ? 0.7 : 1.15) * (rnd() * 3.4 + (intent === "explain" ? 0 : 1.9)))));
    const prompts = empty ? 0 : prompts0;
    const loops = short || empty ? 0 : Math.min(8, Math.floor(-Math.log(1 - rnd() * 0.97) * (source === "antigravity" ? 1.8 : source === "copilot" ? 1.5 : 1.1)));
    const tokens = source === "antigravity" ? 0 : Math.round(prompts * (3000 + rnd() * 5000));
    const cost = costPer[source] && !empty ? r2(prompts * costPer[source] * (0.04 + rnd() * 0.09)) : null;
    const cl = [0, 4, 7, 1, 6, 0, 5, 7, 0, 2, 6, 3];
    const pool = cl.map((x, j) => (INT[x] === intent ? j : -1)).filter((j) => j >= 0);
    sessions.push({ id: `s${String(sessions.length + 1).padStart(4, "0")}`, source, date: iso(d), project, intent, prompts, tokens, cost_usd: cost, reached_stage: reached, applied: reached >= 5, loops, friction: empty ? 0 : r2(Math.min(1, loops * 0.13 + rnd() * 0.18), 3), cluster: rnd() < 0.08 || !pool.length ? -1 : pool[Math.floor(rnd() * pool.length)], title: `${pick(VERBS[intent])} ${pick(THINGS)} in ${project}` });
  }
}
// two outlier days: one moderate cost spike, one absurd z (real data produces these)
sessions.push({ ...sessions[sessions.length - 1], id: "s9001", date: "2026-08-12", source: "claude_code", prompts: 64, tokens: 910000, cost_usd: 143.9, title: "Rewrite billing-api ledger in one sitting" });
sessions.push({ ...sessions[0], id: "s9002", date: "2026-06-15", source: "claude_code", prompts: 41, tokens: 600000, cost_usd: 91.4, title: "Migrate users table across tenants" });

// ---- Planted scenarios and per-session ttr_min. Separate LCGs: the rnd() sequence above is untouched. ----
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rndPlant = lcg(9157); // scenario selection / re-labelling
const rndTtr = lcg(7301);   // ttr_min noise
const gaussTtr = () => Math.sqrt(-2 * Math.log(rndTtr() + 1e-9)) * Math.cos(2 * Math.PI * rndTtr());
const shuffle = (a, r) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pickP = (a) => a[Math.floor(rndPlant() * a.length)];
const lastStart = iso(new Date(start.getTime() + (days - 28) * 864e5));
const inLast = (x) => x.date >= lastStart;
const gatePre = new Map(); // (source|intent) counts before planting, gates the legacy ttr rows
for (const x of sessions) { const k = `${x.source}|${x.intent}`; gatePre.set(k, (gatePre.get(k) ?? 0) + 1); }

// Scenario B: claude_code mix +15 pts in the last 28 days (re-label, priced at the claude_code rate)
const K_MIX = Math.round(0.15 * sessions.filter(inLast).length);
const mixPool = shuffle(sessions.filter((x) => inLast(x) && x.prompts > 0 && ["copilot", "cursor", "opencode"].includes(x.source)), rndPlant).slice(0, K_MIX);
for (const x of mixPool) { x.source = "claude_code"; x.cost_usd = r2(x.prompts * costPer.claude_code * (0.04 + rndPlant() * 0.09)); }

// Scenario A: billing-api / bugfix regression in the last 28 days
const REG = { project: "billing-api", intent: "bugfix" };
const bugfixClusters = [0, 4, 7, 1, 6, 0, 5, 7, 0, 2, 6, 3].map((x, j) => (INT[x] === REG.intent ? j : -1)).filter((j) => j >= 0);
const regressed = (x) => inLast(x) && x.project === REG.project && x.intent === REG.intent && x.prompts >= 4;
const relabel = shuffle(sessions.filter((x) => inLast(x) && x.prompts >= 4 && !(x.project === REG.project && x.intent === REG.intent)), rndPlant).slice(0, 8);
for (const x of relabel) {
  x.project = REG.project;
  x.intent = REG.intent;
  if (x.cluster !== -1) x.cluster = bugfixClusters[Math.floor(rndPlant() * bugfixClusters.length)];
  x.title = `${pickP(VERBS.bugfix)} ${pickP(THINGS)} in ${REG.project}`;
}
// Prior window gets the same combo at equal volume (baseline behaviour) so the segment passes the n>=15 guard in both windows.
const priorStart = iso(new Date(start.getTime() + (days - 56) * 864e5));
const inPrior = (x) => x.date >= priorStart && x.date < lastStart;
const relabelPrior = shuffle(sessions.filter((x) => inPrior(x) && x.prompts >= 4 && !(x.project === REG.project && x.intent === REG.intent)), rndPlant).slice(0, 8);
for (const x of relabelPrior) { x.project = REG.project; x.intent = REG.intent; x.title = `${pickP(VERBS.bugfix)} ${pickP(THINGS)} in ${REG.project}`; }
for (const x of sessions.filter(regressed)) {
  const extra = 2 + Math.floor(rndPlant() * 2);
  x.loops = Math.min(8, x.loops + extra);
  x.friction = r2(Math.min(1, x.friction + 0.13 * extra), 3);
}
// The regression must clear the significance rule: every current combo session struggles, and the prior window keeps only 2 stray struggles outside the combo.
const struggled = (x) => x.loops >= 3 || x.friction >= 0.5;
for (const x of sessions.filter(regressed)) { x.loops = Math.max(x.loops, 3); x.friction = Math.max(x.friction, 0.5); }
sessions.filter((x) => x.prompts && inPrior(x) && struggled(x) && !(x.project === REG.project && x.intent === REG.intent)).slice(2).forEach((x) => { x.loops = Math.min(x.loops, 2); x.friction = Math.min(x.friction, 0.4); });
// Latency attribution needs n>=15 resolved in both windows, so the combo sessions in both windows resolve.
for (const x of sessions) {
  if (x.prompts && x.project === REG.project && x.intent === REG.intent && (inLast(x) || inPrior(x))) {
    x.applied = true;
    x.reached_stage = Math.max(x.reached_stage, 5);
  }
}

// ttr_min: minutes from first prompt to last activity. Log-normal; median ~12, tail capped at 180. Null when nothing applied (as export.py).
const TTR_INTENT = { bugfix: 1.3, devops: 1.3, feature: 1.0, refactor: 1.0, test: 1.0, data: 1.0, other: 0.9, explain: 0.7, docs: 0.7 };
const r1 = (n) => +n.toFixed(1);
for (const x of sessions) {
  if (!x.prompts || !x.applied) { x.ttr_min = null; continue; }
  const m = 11 * TTR_INTENT[x.intent] * Math.exp(0.2 * x.loops) * (x.applied ? 0.85 : 1) * Math.pow(x.prompts / 5, 0.3) * Math.exp(0.85 * gaussTtr()) * (regressed(x) ? 1.8 : 1);
  x.ttr_min = Math.min(180, r1(m));
}
// model: dominant model id per session, own LCG so no other draw changes. Tier mix differs by tool.
const rndModel = lcg(4421);
const MODELS = {
  claude_code: [["claude-sonnet-4-5", 0.68], ["claude-opus-4-1", 0.17], ["claude-haiku-4-5", 0.15]],
  copilot: [["gpt-5", 0.5], ["gpt-5-mini", 0.33], ["o3", 0.17]],
  cursor: [["claude-sonnet-4-5", 0.4], ["gpt-5", 0.25], ["gemini-2.5-pro", 0.25], ["gpt-5-mini", 0.1]],
  opencode: [["gemini-2.5-flash", 0.45], ["claude-sonnet-4-5", 0.3], ["gemini-2.5-pro", 0.25]],
  antigravity: [["gemini-2.5-flash", 0.55], ["gemini-2.5-pro", 0.45]],
};
for (const x of sessions) {
  const u = rndModel(); let a = 0;
  x.model = x.prompts ? (MODELS[x.source].find(([, w]) => u < (a += w)) ?? MODELS[x.source][0])[0] : null;
}
sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1)); // newest first, as export.py does

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const byDate = new Map();
for (const x of sessions) { const c = byDate.get(x.date) ?? { date: x.date, sessions: 0, prompts: 0, cost_usd: 0 }; c.sessions++; c.prompts += x.prompts; c.cost_usd += x.cost_usd ?? 0; byDate.set(x.date, c); }
const calendar = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((c) => ({ ...c, cost_usd: r2(c.cost_usd) }));
const totSessions = sessions.length, totPrompts = sum(sessions, (x) => x.prompts), totCost = sum(sessions, (x) => x.cost_usd ?? 0), totTokens = sum(sessions, (x) => x.tokens);
let longest = 0, run = 0, cur = 0;
for (let i = 0; i < days; i++) {
  run = byDate.has(iso(new Date(start.getTime() + i * 864e5))) ? run + 1 : 0; longest = Math.max(longest, run);
  if (i === days - 1) cur = run;
}
const by_source = SRC.map((source) => {
  const g = sessions.filter((x) => x.source === source);
  return { source, sessions: g.length, prompts: sum(g, (x) => x.prompts), tokens: sum(g, (x) => x.tokens), cost_usd: r2(sum(g, (x) => x.cost_usd ?? 0)), cost_is_estimate: source !== "claude_code" };
});
const hour_week = [];
for (let dow = 0; dow < 7; dow++) for (let hour = 0; hour < 24; hour++) {
  const w = dow >= 5 ? 0.35 : 1;
  const peak = Math.exp(-((hour - 11) ** 2) / 14) + 0.8 * Math.exp(-((hour - 15.5) ** 2) / 10) + 0.35 * Math.exp(-((hour - 22) ** 2) / 8);
  hour_week.push({ dow, hour, prompts: Math.round(w * peak * (totPrompts / 900) * (0.8 + rnd() * 0.4)), sessions: 0, applied: 0 });
}
// schema 1.1: sessions started / applied per cell. Start hour comes from a hash of the id (no rnd() draws, so the rest of the data is unchanged)
{
  const hw = Array.from({ length: 24 }, (_, h) => Math.exp(-((h - 11) ** 2) / 14) + 0.8 * Math.exp(-((h - 15.5) ** 2) / 10) + 0.35 * Math.exp(-((h - 22) ** 2) / 8));
  const tot = hw.reduce((a, b) => a + b, 0);
  for (const x of sessions) {
    if (!x.prompts) continue;
    let h = 2166136261; for (const c of x.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    let u = (h % 100000) / 100000 * tot, hour = 0; while (hour < 23 && (u -= hw[hour]) > 0) hour++;
    const c = hour_week[((new Date(`${x.date}T00:00:00Z`).getUTCDay() + 6) % 7) * 24 + hour]; c.sessions++; if (x.applied) c.applied++;
  }
}
const wk = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return iso(t); };
const weeks = new Map();
for (const x of sessions) { const k = wk(x.date); const v = weeks.get(k) ?? {}; v[x.source] = (v[x.source] ?? 0) + (x.cost_usd ?? 0); weeks.set(k, v); }
const cost_river = [...weeks.entries()].sort().map(([date, v]) => ({ date, values: Object.fromEntries(Object.entries(v).map(([k, n]) => [k, r2(n)])) }));
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const anomalies = [];
for (const [metric, f] of [["cost", (c) => c.cost_usd], ["prompts", (c) => c.prompts]]) {
  const vs = calendar.map(f), med = median(vs), mad = median(vs.map((v) => Math.abs(v - med))) || 1;
  calendar.map((c) => ({ date: c.date, value: f(c), z: r2((0.6745 * (f(c) - med)) / mad, 1) })).filter((r) => r.z > 3).sort((a, b) => b.z - a.z).slice(0, 4).forEach((r) => anomalies.push({ date: r.date, metric, value: r2(r.value), z: r.z }));
}
const ttr = [];
for (const source of SRC) for (const intent of INT) { const n = sessions.filter((x) => x.source === source && x.intent === intent).length; if ((gatePre.get(`${source}|${intent}`) ?? 0) >= 3) ttr.push({ source, intent, median_min: r2(6 + rnd() * 44), n }); }

const stages = ["intent", "prompt", "response", "iterate", "applied", "outcome"];
const counts = (g) => stages.map((_, i) => g.filter((x) => x.reached_stage >= i + 1).length);
const funnel = {
  stages,
  by_source: SRC.map((source) => ({ source, counts: counts(sessions.filter((x) => x.source === source)) })),
  by_intent: INT.map((intent) => ({ intent, counts: counts(sessions.filter((x) => x.intent === intent)) })),
};
const tsw = new Map();
{
  const ordered = [...sessions].reverse();
  const lastBy = new Map();
  for (const x of ordered) { const p = lastBy.get(x.project); if (p && p.source !== x.source && (new Date(x.date) - new Date(p.date)) / 864e5 < 1.01) { const k = `${p.source}|${x.source}`; tsw.set(k, (tsw.get(k) ?? 0) + 1); } lastBy.set(x.project, x); }
}
const tool_switch = [...tsw.entries()].map(([k, count]) => { const [from, to] = k.split("|"); return { from, to, count }; }).sort((a, b) => b.count - a.count);

const friction = {
  rates: SRC.map((source) => {
    const g = sessions.filter((x) => x.source === source), n = g.length || 1, k = { claude_code: 0.8, copilot: 1.25, cursor: 1.05, opencode: 1, antigravity: 1.4 }[source];
    return { source, correction: r2(0.18 * k, 3), frustration: r2(0.07 * k, 3), rephrase: r2(g.filter((x) => x.loops > 0).length / n, 3), abandoned: r2(0.09 * k, 3), interrupted: r2(0.05 * k, 3), n: g.length };
  }),
  by_intent: INT.map((intent) => { const g = sessions.filter((x) => x.intent === intent); return { intent, friction: r2(sum(g, (x) => x.friction) / (g.length || 1), 3), n: g.length }; }).sort((a, b) => b.friction - a.friction),
  loops_hist: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((loops) => ({ loops, sessions: sessions.filter((x) => x.loops === loops).length })),
};

const labels = ["Auth refactor", "Flaky tests", "SQL migrations", "React hooks", "CI pipelines", "API errors", "Docs polish", "Data cleaning", "Type errors", "Perf profiling", "Docker setup", "Regex help"];
const centers = labels.map((_, i) => { const a = (i / labels.length) * Math.PI * 2 + 0.4; const r = 0.28 + 0.12 * ((i * 7) % 3); return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.82]; });
const clusters = labels.map((label, i) => ({ id: i, label, size: Math.round(300 + rnd() * 900), intent: INT[[0, 4, 7, 1, 6, 0, 5, 7, 0, 2, 6, 3][i]], success: r2(0.45 + rnd() * 0.45, 3), exemplar: i % 3 === 0 ? "fix the failing [path] test after the refactor" : undefined, cx: r2(centers[i][0], 4), cy: r2(centers[i][1], 4) }));
const N = 9000, px = [], py = [], pc = [], pq = [];
for (let i = 0; i < N; i++) {
  if (rnd() < 0.06) { px.push(r2(rnd(), 4)); py.push(r2(rnd(), 4)); pc.push(-1); pq.push(Math.round(rnd() * 60)); continue; }
  const c = Math.floor(rnd() * rnd() * 1.6 * labels.length) % labels.length;
  const sd = 0.035 + (c % 4) * 0.01;
  px.push(r2(Math.min(1, Math.max(0, centers[c][0] + gauss() * sd)), 4));
  py.push(r2(Math.min(1, Math.max(0, centers[c][1] + gauss() * sd)), 4));
  pc.push(c); pq.push(Math.round(Math.min(100, Math.max(0, clusters[c].success * 100 + gauss() * 18))));
}
const quality = {
  axes: ["specificity", "context", "constraints", "length"],
  you: [0.52, 0.41, 0.28, 0.6], top: [0.71, 0.66, 0.49, 0.64],
  by_source: SRC.map((source) => ({ source, values: [0.4 + rnd() * 0.3, 0.3 + rnd() * 0.4, 0.2 + rnd() * 0.3, 0.45 + rnd() * 0.3].map((v) => r2(v)) })),
  validation: { spearman: 0.34, n: 2140 },
};
const feats = ["file references", "error message pasted", "explicit constraints", "very short prompt", "no context given", "acceptance criteria", "code block included", "vague verbs"];
const what_works = feats.map((feature, i) => {
  const helps = i < 5; const effect = r2((helps ? 1 : -1) * (0.04 + rnd() * 0.16), 3);
  return { cluster: i % labels.length, feature, effect, ci: [r2(effect - 0.05 - rnd() * 0.04, 3), r2(effect + 0.05 + rnd() * 0.04, 3)], n: Math.round(80 + rnd() * 500), direction: helps ? "helps" : "hurts" };
}).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

// schema 1.2: per-session feature tags and repeated prompts. Both come from id hashes (no rnd() draws, so the rest of the data is unchanged).
const fnv = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
for (const x of sessions) x.features = x.prompts ? feats.filter((f) => (fnv(x.id + f) % 1000) / 1000 < (x.applied ? 0.68 : 0.3)) : [];
const REPEATS = [
  ["add unit tests for the new handler and keep the existing mocks", 2, 41], ["fix the failing [path] test and explain the root cause", 1, 33],
  ["summarise what changed in this branch for the pull request description", 3, 24], ["explain what this function does and list its edge cases", 3, 19],
  ["bump the dependencies and run the full test suite before you stop", 4, 14], ["rewrite this commit message in the conventional commits style", 6, 9],
];
const repeats = REPEATS.map(([exemplar, cluster, count]) => {
  const pool = sessions.filter((x) => x.prompts > 1).sort((a, b) => fnv(a.id + exemplar) - fnv(b.id + exemplar)).slice(0, Math.min(count, 25));
  return { cluster, count, exemplar, sessions: pool.sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => x.id) };
});

const asked = sessions.filter((x) => x.prompts > 0);   // every rate uses sessions with a prompt
const pct = (a, b) => Math.round((100 * a) / (b || 1));
const appliedRate = pct(asked.filter((x) => x.applied).length, asked.length);
const claudeShare = pct(sessions.filter((x) => x.source === "claude_code").length, totSessions);
const morning = pct(sum(hour_week.filter((h) => h.hour >= 9 && h.hour <= 12), (h) => h.prompts), sum(hour_week, (h) => h.prompts));
const spikeCost = sum([...new Map(anomalies.filter((a) => a.metric === "cost").map((a) => [a.date, a])).values()], (a) => a.value);
const spikeShare = pct(spikeCost, totCost);
const rephrase = (g) => g.filter((x) => x.loops > 0).length / (g.length || 1);
const agRatio = r2(rephrase(asked.filter((x) => x.source === "antigravity")) / (rephrase(asked.filter((x) => x.source !== "antigravity")) || 1), 1);
const topFric = friction.by_intent[0];
const top = tool_switch[0] ?? { from: "cursor", to: "claude_code", count: 0 };
const NAME = { claude_code: "Claude Code", copilot: "Copilot", cursor: "Cursor", opencode: "opencode", antigravity: "Antigravity" };
const ev = (n, method = "bootstrap") => ({ n, ci: [0, 1], method });
const insights = [
  { id: "i-fp-1", chapter: "footprint", rank: 1, claim: "You ship with AI almost every working day", metric: "active days", value: calendar.length, unit: "", delta: null, evidence: { n: totSessions, method: "count" }, drill: { chapter: "footprint", filter: {} } },
  { id: "i-fp-2", chapter: "footprint", rank: 2, claim: `Claude Code carries ${claudeShare}% of your sessions`, metric: "session share", value: claudeShare, unit: "%", delta: null, evidence: { n: totSessions, method: "count" }, drill: { chapter: "footprint", filter: { source: "claude_code" } } },
  { id: "i-tm-1", chapter: "time", rank: 1, claim: "Late mornings are your deepest AI hours", metric: "9-12h prompt share", value: morning, unit: "%", delta: null, evidence: { n: totPrompts, method: "count" }, drill: { chapter: "time", filter: {} } },
  { id: "i-tm-2", chapter: "time", rank: 2, claim: `Spike days drove ${spikeShare}% of spend`, metric: "anomaly cost share", value: spikeShare, unit: "%", delta: null, evidence: ev(anomalies.length, "z-score"), drill: { chapter: "time", filter: {} } },
  { id: "i-fn-1", chapter: "funnel", rank: 1, claim: `${appliedRate}% of sessions with a prompt end applied`, metric: "applied rate", value: appliedRate, unit: "%", delta: null, evidence: { n: asked.length, method: "funnel" }, drill: { chapter: "funnel", filter: {} } },
  { id: "i-fn-2", chapter: "funnel", rank: 2, claim: `${NAME[top.from]} to ${NAME[top.to]} is your busiest handoff`, metric: "tool switches", value: top.count, unit: "", delta: null, evidence: { n: top.count, method: "count" }, drill: { chapter: "funnel", filter: { source: top.from } } },
  { id: "i-fr-1", chapter: "friction", rank: 1, claim: `Antigravity prompts need rewording ${agRatio}x as often`, metric: "rephrase ratio", value: agRatio, unit: "x", delta: null, evidence: ev(asked.filter((x) => x.source === "antigravity").length, "ratio"), drill: { chapter: "friction", filter: { source: "antigravity" } } },
  { id: "i-fr-2", chapter: "friction", rank: 2, claim: `${topFric.intent[0].toUpperCase()}${topFric.intent.slice(1)} sessions hit the most friction`, metric: "mean friction", value: pct(topFric.friction, 1), unit: "%", delta: null, evidence: ev(topFric.n), drill: { chapter: "friction", filter: { intent: topFric.intent } } },
  { id: "i-wk-1", chapter: "works", rank: 1, claim: "Naming files lifts success by about 16 points", metric: "success lift", value: 16, unit: "%", delta: 0.16, evidence: { n: 520, ci: [0.1, 0.22], method: "bootstrap" }, drill: { chapter: "works", filter: { cluster: 0 } } },
  { id: "i-wk-2", chapter: "works", rank: 2, claim: "Short vague prompts cost you retries", metric: "success drop", value: 11, unit: "%", delta: -0.11, evidence: ev(310), drill: { chapter: "works", filter: {} } },
  { id: "i-rc-1", chapter: "recommend", rank: 1, claim: "Four small habits would remove most friction", metric: "recommendations", value: 4, unit: "", delta: null, evidence: { n: 4, method: "rules" }, drill: { chapter: "recommend", filter: {} } },
];
const recommendations = [
  { id: "r1", title: "Name the files up front", action: "Add file refs to bugfix prompts.", impact: "+16 pts success", evidence_insight: "i-wk-1" },
  { id: "r2", title: "State constraints", action: "Say what must not change before you ask.", impact: "-20% rewording", evidence_insight: "i-fr-1" },
  { id: "r3", title: "Close the loop", action: "Commit or discard each session before the next.", impact: `lift the ${appliedRate}% applied rate`, evidence_insight: "i-fn-1" },
  { id: "r4", title: "Cap spikes", action: "Review sessions that cross 3 sigma in cost.", impact: "-15% spend", evidence_insight: "i-tm-2" },
];
const sources = [
  { source: "claude_code", status: "ok", sessions: by_source[0].sessions },
  { source: "copilot", status: "ok", sessions: by_source[1].sessions },
  { source: "cursor", status: "degraded", sessions: by_source[2].sessions, note: "Some chat logs could not be decoded." },
  { source: "opencode", status: "ok", sessions: by_source[3].sessions },
  { source: "antigravity", status: "degraded", sessions: by_source[4].sessions, note: "Token counts are not recorded by this tool." },
];
const kinds = [["aws_access_key", "secret"], ["github_token", "secret"], ["private_key", "secret"], ["email", "pii"], ["phone", "pii"], ["ssn", "pii"], ["patient_id", "phi"], ["diagnosis_code", "phi"]];
const previews = ["set AWS_KEY=⟦aws_access_key⟧ then run the deploy", "email ⟦email⟧ keeps bouncing, why", "token ⟦github_token⟧ gets 401 on push", "patient ⟦patient_id⟧ has duplicate rows", "call ⟦phone⟧ about the invoice", null, "here is the key: ⟦private_key⟧ please load it"];
// 41 flagged sessions, 1-4 flagged prompts each (the queue is per prompt; the UI groups them per session)
const flagged = sessions.filter((x) => x.prompts >= 2).filter((_, i) => i % 13 === 4).slice(0, 41);
const items = [];
flagged.forEach((x, j) => {
  const m = j % 5 === 0 ? 4 : j % 3 === 0 ? 2 : 1;
  for (let q = 0; q < m; q++) {
    const k = kinds[(j * 3 + q * 5) % kinds.length], i = items.length;
    items.push({ id: `x${i + 1}`, session: x.id, source: x.source, date: x.date, session_title: j % 9 === 8 ? null : x.title, category: k[1], kinds: q === 1 ? [k[0], kinds[(j + 3) % kinds.length][0]].sort() : [k[0]], preview: previews[(j + q) % previews.length], status: i % 9 === 0 ? "reviewed" : i % 13 === 5 ? "false_positive" : "open" });
  }
});
const live = items.filter((i) => i.status !== "false_positive");
const sess = (f) => new Set(f.map((i) => i.session)).size;
const kindSessions = (kind) => sess(live.filter((i) => i.kinds.includes(kind)));
const exposure = {
  sessions: sess(live), share: r2(sess(live) / totSessions, 4),
  by_category: [["secret", "Move keys to environment variables and rotate any that were pasted."], ["pii", "Replace real names and emails with placeholders before pasting."], ["phi", "Use synthetic records; never paste patient data into an assistant."]]
    .map(([category, advice]) => ({ category, sessions: sess(live.filter((i) => i.category === category)), prompts: live.filter((i) => i.category === category).length, advice })),
  by_kind: kinds.map(([kind, category]) => ({ kind, category, sessions: kindSessions(kind), prompts: live.filter((i) => i.kinds.includes(kind)).length, by_source: Object.fromEntries(SRC.map((src) => [src, sess(live.filter((i) => i.kinds.includes(kind) && i.source === src))]).filter(([, n]) => n > 0)) })),
  weekly: [...new Set(cost_river.map((c) => c.date))].map((date) => ({ date, secret: sess(live.filter((i) => wk(i.date) === date && i.category === "secret")), pii: sess(live.filter((i) => wk(i.date) === date && i.category === "pii")), phi: sess(live.filter((i) => wk(i.date) === date && i.category === "phi")) })),
  items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
};
const data = {
  schema: "1.3", generated_at: "2026-10-26T08:00:00Z", range: { start: iso(start), end: iso(new Date(start.getTime() + (days - 1) * 864e5)) }, sources,
  engine: { mode: "ml", requested: "auto", available: ["basic", "ml"], libs: { duckdb: "1.1.3", scikit_learn: "1.9.1", fastembed: null }, accel: "cpu", reason: "auto: scikit-learn 1.9.1 found, no embedding model", upgrade: { mode: "deep", command: "pip install 'prompt-analytics[deep]'" }, methods: { footprint: "Counted from session logs", time: "Rolling z-score plus IsolationForest on daily cost", funnel: "Rule-based stage detection per session", friction: "Loop and retry heuristics", works: "TF-IDF + KMeans clusters; logistic model with bootstrap CI", recommend: "Ranked from the strongest evidence" } },
  totals: { sessions: totSessions, prompts: totPrompts, tokens: totTokens, cost_usd: r2(totCost), active_days: calendar.length, longest_streak: longest, current_streak: cur, projects: PROJECTS.length, commits_linked: Math.round(totSessions * 0.34) },
  by_source, calendar, hour_week, cost_river, anomalies, ttr, funnel, tool_switch, friction,
  galaxy: { clusters, points: { x: px, y: py, c: pc, q: pq } }, quality, what_works, what_works_tested: what_works.length + 40, sessions, repeats, exposure, insights, recommendations,
};
writeFileSync(new URL("../src/data/sample.dev.json", import.meta.url), JSON.stringify(data));
console.log("sample.dev.json", JSON.stringify(data).length, "bytes");
