// Generates src/data/sample.dev.json: synthetic data conforming to contract.ts.
// Deterministic (seeded). Dev/screenshot use only; never bundled into production.
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
    const prompts = short ? 1 + Math.floor(rnd() * 3) : Math.min(70, Math.round(4 + Math.exp(rnd() * 3.1)));
    const project = pick(PROJECTS, PROJECTS.map((_, j) => 1 / (1 + j * 0.45)));
    const reached = Math.max(1, Math.min(6, 1 + Math.floor((short ? 0.6 : 1) * (rnd() * 3.2 + (intent === "explain" ? 0 : 1.6)))));
    const loops = short ? 0 : Math.min(8, Math.floor(-Math.log(1 - rnd() * 0.97) * (source === "antigravity" ? 1.8 : source === "copilot" ? 1.5 : 1.1)));
    const tokens = source === "antigravity" ? 0 : Math.round(prompts * (3000 + rnd() * 5000));
    const cost = costPer[source] ? r2(prompts * costPer[source] * (0.04 + rnd() * 0.09)) : null;
    const cl = [0, 4, 7, 1, 6, 0, 5, 7, 0, 2, 6, 3];
    const pool = cl.map((x, j) => (INT[x] === intent ? j : -1)).filter((j) => j >= 0);
    sessions.push({ id: `s${String(sessions.length + 1).padStart(4, "0")}`, source, date: iso(d), project, intent, prompts, tokens, cost_usd: cost, reached_stage: reached, applied: reached >= 5, loops, friction: r2(Math.min(1, loops * 0.13 + rnd() * 0.18), 3), cluster: rnd() < 0.08 || !pool.length ? -1 : pool[Math.floor(rnd() * pool.length)], title: `${pick(VERBS[intent])} ${pick(THINGS)} in ${project}` });
  }
}
// two outlier days: one moderate cost spike, one absurd z (real data produces these)
sessions.push({ ...sessions[sessions.length - 1], id: "s9001", date: "2026-09-21", source: "claude_code", prompts: 64, tokens: 910000, cost_usd: 143.9, title: "Rewrite billing-api ledger in one sitting" });
sessions.push({ ...sessions[0], id: "s9002", date: "2026-06-15", source: "claude_code", prompts: 41, tokens: 600000, cost_usd: 91.4, title: "Migrate users table across tenants" });
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
  hour_week.push({ dow, hour, prompts: Math.round(w * peak * (totPrompts / 900) * (0.8 + rnd() * 0.4)) });
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
for (const source of SRC) for (const intent of INT) { const n = sessions.filter((x) => x.source === source && x.intent === intent).length; if (n >= 3) ttr.push({ source, intent, median_min: r2(6 + rnd() * 44), n }); }

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

const ev = (n, method = "bootstrap") => ({ n, ci: [0, 1], method });
const insights = [
  { id: "i-fp-1", chapter: "footprint", rank: 1, claim: "You ship with AI almost every working day", metric: "active days", value: calendar.length, unit: "", delta: null, evidence: { n: totSessions, method: "count" }, drill: { chapter: "footprint", filter: {} } },
  { id: "i-fp-2", chapter: "footprint", rank: 2, claim: "Claude Code carries half your sessions", metric: "session share", value: 52, unit: "%", delta: null, evidence: { n: totSessions, method: "count" }, drill: { chapter: "footprint", filter: { source: "claude_code" } } },
  { id: "i-tm-1", chapter: "time", rank: 1, claim: "Late mornings are your deepest AI hours", metric: "peak hour share", value: 31, unit: "%", delta: 0.4, evidence: { n: totPrompts, method: "count" }, drill: { chapter: "time", filter: {} } },
  { id: "i-tm-2", chapter: "time", rank: 2, claim: "Two cost spikes drove a fifth of spend", metric: "anomaly cost share", value: 21, unit: "%", delta: null, evidence: ev(3, "z-score"), drill: { chapter: "time", filter: {} } },
  { id: "i-fn-1", chapter: "funnel", rank: 1, claim: "Fewer than four in ten sessions end in a commit", metric: "applied rate", value: 38, unit: "%", delta: null, evidence: { n: totSessions, method: "funnel" }, drill: { chapter: "funnel", filter: {} } },
  { id: "i-fn-2", chapter: "funnel", rank: 2, claim: "Cursor to Claude Code is your busiest handoff", metric: "tool switches", value: 51, unit: "", delta: null, evidence: { n: 51, method: "count" }, drill: { chapter: "funnel", filter: { source: "cursor" } } },
  { id: "i-fr-1", chapter: "friction", rank: 1, claim: "Antigravity prompts need rewording 1.7x more often", metric: "rephrase rate", value: 1.7, unit: "x", delta: 0.7, evidence: ev(210, "ratio"), drill: { chapter: "friction", filter: { source: "antigravity" } } },
  { id: "i-fr-2", chapter: "friction", rank: 2, claim: "Bugfix sessions hit the most friction", metric: "friction", value: 42, unit: "%", delta: 0.3, evidence: ev(400), drill: { chapter: "friction", filter: { intent: "bugfix" } } },
  { id: "i-wk-1", chapter: "works", rank: 1, claim: "Naming files lifts success by about 16 points", metric: "success lift", value: 16, unit: "%", delta: 0.16, evidence: { n: 520, ci: [0.1, 0.22], method: "bootstrap" }, drill: { chapter: "works", filter: { cluster: 0 } } },
  { id: "i-wk-2", chapter: "works", rank: 2, claim: "Short vague prompts cost you retries", metric: "success drop", value: 11, unit: "%", delta: -0.11, evidence: ev(310), drill: { chapter: "works", filter: {} } },
  { id: "i-rc-1", chapter: "recommend", rank: 1, claim: "Four small habits would remove most friction", metric: "recommendations", value: 4, unit: "", delta: null, evidence: { n: 4, method: "rules" }, drill: { chapter: "recommend", filter: {} } },
];
const recommendations = [
  { id: "r1", title: "Name the files up front", action: "Add file refs to bugfix prompts.", impact: "+16 pts success", evidence_insight: "i-wk-1" },
  { id: "r2", title: "State constraints", action: "Say what must not change before you ask.", impact: "-20% rewording", evidence_insight: "i-fr-1" },
  { id: "r3", title: "Close the loop", action: "Commit or discard each session before the next.", impact: "+9 pts commits", evidence_insight: "i-fn-1" },
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
  schema: "1.0", generated_at: "2026-10-26T08:00:00Z", range: { start: iso(start), end: iso(new Date(start.getTime() + (days - 1) * 864e5)) }, sources,
  engine: { mode: "ml", requested: "auto", available: ["basic", "ml"], libs: { duckdb: "1.1.3", scikit_learn: "1.9.1", fastembed: null }, accel: "cpu", reason: "auto: scikit-learn 1.9.1 found, no embedding model", upgrade: { mode: "deep", command: "pip install 'prompt-analytics[deep]'" }, methods: { footprint: "Counted from session logs", time: "Rolling z-score plus IsolationForest on daily cost", funnel: "Rule-based stage detection per session", friction: "Loop and retry heuristics", works: "TF-IDF + KMeans clusters; logistic model with bootstrap CI", recommend: "Ranked from the strongest evidence" } },
  totals: { sessions: totSessions, prompts: totPrompts, tokens: totTokens, cost_usd: r2(totCost), active_days: calendar.length, longest_streak: longest, current_streak: cur, projects: PROJECTS.length, commits_linked: Math.round(totSessions * 0.34) },
  by_source, calendar, hour_week, cost_river, anomalies, ttr, funnel, tool_switch, friction,
  galaxy: { clusters, points: { x: px, y: py, c: pc, q: pq } }, quality, what_works, sessions, exposure, insights, recommendations,
};
writeFileSync(new URL("../src/data/sample.dev.json", import.meta.url), JSON.stringify(data));
console.log("sample.dev.json", JSON.stringify(data).length, "bytes");
