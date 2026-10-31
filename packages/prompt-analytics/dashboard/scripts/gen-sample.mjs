// Generates src/data/sample.dev.json: synthetic data conforming to contract.ts.
// Deterministic (seeded). Dev/screenshot use only; never bundled into production.
import { writeFileSync } from "node:fs";

let s = 20260431;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const r2 = (n, d = 2) => +n.toFixed(d);
const SRC = ["claude_code", "copilot", "cursor", "opencode", "antigravity"];
const INT = ["bugfix", "feature", "refactor", "explain", "test", "docs", "devops", "data", "other"];
const share = { claude_code: 0.52, copilot: 0.16, cursor: 0.2, opencode: 0.07, antigravity: 0.05 };
const costPer = { claude_code: 0.9, copilot: 0.15, cursor: 0.4, opencode: 0.3, antigravity: 0.25 };

const start = new Date("2026-04-27T00:00:00Z");
const days = 182;
const iso = (d) => d.toISOString().slice(0, 10);
const calendar = [];
for (let i = 0; i < days; i++) {
  const d = new Date(start.getTime() + i * 864e5);
  const dow = (d.getUTCDay() + 6) % 7;
  const p = dow >= 5 ? 0.35 : 0.88;
  if (rnd() > p) continue;
  const sessions = Math.max(1, Math.round(4 + gauss() * 2.5 + (dow < 5 ? 3 : 0) + (i / days) * 4));
  const prompts = Math.round(sessions * (9 + rnd() * 10));
  calendar.push({ date: iso(d), sessions, prompts, cost_usd: r2(prompts * (0.05 + rnd() * 0.07)) });
}
const sum = (a, k) => a.reduce((t, x) => t + x[k], 0);
const totSessions = sum(calendar, "sessions"), totPrompts = sum(calendar, "prompts"), totCost = sum(calendar, "cost_usd");
const totTokens = Math.round(totPrompts * 5200);
let longest = 0, run = 0, cur = 0;
for (let i = 0; i < days; i++) {
  const has = calendar.some((c) => c.date === iso(new Date(start.getTime() + i * 864e5)));
  run = has ? run + 1 : 0; longest = Math.max(longest, run);
  if (i === days - 1) cur = run;
}
const by_source = SRC.map((source) => ({
  source, sessions: Math.round(totSessions * share[source]), prompts: Math.round(totPrompts * share[source]),
  tokens: Math.round(totTokens * share[source] * (source === "antigravity" ? 0 : 1)),
  cost_usd: r2(totCost * share[source] * (costPer[source] / 0.4) / 1.6), cost_is_estimate: source !== "claude_code",
}));
const hour_week = [];
for (let dow = 0; dow < 7; dow++) for (let hour = 0; hour < 24; hour++) {
  const w = dow >= 5 ? 0.35 : 1;
  const peak = Math.exp(-((hour - 11) ** 2) / 14) + 0.8 * Math.exp(-((hour - 15.5) ** 2) / 10) + 0.35 * Math.exp(-((hour - 22) ** 2) / 8);
  hour_week.push({ dow, hour, prompts: Math.round(w * peak * 160 * (0.8 + rnd() * 0.4)) });
}
const cost_river = [];
for (let w = 0; w < 26; w++) {
  const d = new Date(start.getTime() + w * 7 * 864e5);
  const values = {};
  for (const src of SRC) {
    const ramp = src === "cursor" ? 1 - w / 40 : src === "opencode" ? Math.min(1, w / 14) : src === "antigravity" ? (w > 10 ? 0.8 : 0.05) : 1;
    values[src] = r2(Math.max(0, (totCost / 26) * share[src] * (costPer[src] / 0.4) * ramp * (0.7 + rnd() * 0.6)));
  }
  cost_river.push({ date: iso(d), values });
}
const anomalies = [
  { date: "2026-06-15", metric: "cost", value: 118.4, z: 3.1 },
  { date: "2026-08-03", metric: "prompts", value: 412, z: 2.8 },
  { date: "2026-09-21", metric: "cost", value: 143.9, z: 3.6 },
];
const ttr = [];
for (const source of SRC) for (const intent of INT) ttr.push({ source, intent, median_min: r2(8 + rnd() * 40), n: Math.round(10 + rnd() * 120) });

const stages = ["intent", "prompt", "response", "iterate", "applied", "outcome"];
const mk = (n, k) => { const c = [n]; const f = [1, 0.97, 0.81, 0.62, 0.38]; for (let i = 0; i < 5; i++) c.push(Math.round(n * f[i] * k * (0.95 + rnd() * 0.1))); return c; };
const funnel = {
  stages,
  by_source: by_source.map((b) => ({ source: b.source, counts: mk(b.sessions, 1) })),
  by_intent: INT.map((intent, i) => ({ intent, counts: mk(Math.round(totSessions * [0.28, 0.24, 0.1, 0.12, 0.08, 0.05, 0.05, 0.05, 0.03][i]), 1 - i * 0.015) })),
};
const tool_switch = [];
for (const a of SRC) for (const b of SRC) if (a !== b && rnd() > 0.35) tool_switch.push({ from: a, to: b, count: Math.round(4 + rnd() * 50 * share[a] * 2) });

const friction = {
  rates: SRC.map((source) => {
    const k = { claude_code: 0.8, copilot: 1.25, cursor: 1.05, opencode: 1, antigravity: 1.4 }[source];
    return { source, correction: r2(0.18 * k, 3), frustration: r2(0.07 * k * (0.8 + rnd() * 0.5), 3), rephrase: r2(0.22 * k, 3), abandoned: r2(0.09 * k * (0.8 + rnd() * 0.5), 3), interrupted: r2(0.05 * k * (0.7 + rnd()), 3), n: Math.round(totPrompts * share[source]) };
  }),
  by_intent: INT.map((intent, i) => ({ intent, friction: r2(0.42 - i * 0.03 + rnd() * 0.06, 3), n: Math.round(60 + rnd() * 400) })).sort((a, b) => b.friction - a.friction),
  loops_hist: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((loops) => ({ loops, sessions: Math.round(520 * Math.exp(-loops * 0.62) + 3) })),
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
const kinds = [["aws_access_key", "secret", 9], ["github_token", "secret", 7], ["private_key", "secret", 3], ["email", "pii", 21], ["phone", "pii", 6], ["ssn", "pii", 2], ["patient_id", "phi", 4], ["diagnosis_code", "phi", 2]];
const exposure = {
  sessions: 41, share: r2(41 / totSessions, 4),
  by_category: [
    { category: "secret", sessions: 17, prompts: 29, advice: "Move keys to environment variables and rotate any that were pasted." },
    { category: "pii", sessions: 24, prompts: 51, advice: "Replace real names and emails with placeholders before pasting." },
    { category: "phi", sessions: 6, prompts: 9, advice: "Use synthetic records; never paste patient data into an assistant." },
  ],
  by_kind: kinds.map(([kind, category, sessions]) => ({ kind, category, sessions, prompts: sessions * 2, by_source: Object.fromEntries(SRC.filter(() => rnd() > 0.3).map((x) => [x, Math.max(1, Math.round(sessions * share[x] * (0.8 + rnd() * 0.5)))])) })),
  weekly: Array.from({ length: 26 }, (_, w) => ({ date: iso(new Date(start.getTime() + w * 7 * 864e5)), secret: Math.round(rnd() * 2 + (w % 7 === 3 ? 2 : 0)), pii: Math.round(rnd() * 3), phi: rnd() > 0.8 ? 1 : 0 })),
};
const titles = ["Fix deploy script", "Debug login flow", "Migrate users table", "Refactor billing", null, "Set up CI secrets", "Clean patient export", "Add webhook handler"];
const previews = ["set AWS_KEY=⟦aws_access_key⟧ then run the deploy", "email ⟦email⟧ keeps bouncing, why", "token ⟦github_token⟧ gets 401 on push", "patient ⟦patient_id⟧ has duplicate rows", "call ⟦phone⟧ about the invoice", null, "here is the key: ⟦private_key⟧ please load it"];
exposure.items = Array.from({ length: 63 }, (_, i) => {
  const k = kinds[i % kinds.length];
  return { id: `x${i + 1}`, source: SRC[i % 5], date: iso(new Date(start.getTime() + (days - 1 - i * 2) * 864e5)), session_title: titles[i % titles.length], category: k[1], kinds: i % 4 === 0 ? [k[0], kinds[(i + 3) % kinds.length][0]] : [k[0]], preview: previews[i % previews.length], status: i % 9 === 0 ? "reviewed" : i % 13 === 0 ? "false_positive" : "open" };
});
const data = {
  schema: "1.0", generated_at: "2026-10-26T08:00:00Z", range: { start: iso(start), end: iso(new Date(start.getTime() + (days - 1) * 864e5)) }, sources,
  engine: { mode: "ml", requested: "auto", available: ["basic", "ml"], libs: { duckdb: "1.1.3", scikit_learn: "1.9.1", fastembed: null }, accel: "cpu", reason: "auto: scikit-learn 1.9.1 found, no embedding model", upgrade: { mode: "deep", command: "pip install 'prompt-analytics[deep]'" }, methods: { footprint: "Counted from session logs", time: "Rolling z-score plus IsolationForest on daily cost", funnel: "Rule-based stage detection per session", friction: "Loop and retry heuristics", works: "TF-IDF + KMeans clusters; logistic model with bootstrap CI", recommend: "Ranked from the strongest evidence" } },
  totals: { sessions: totSessions, prompts: totPrompts, tokens: totTokens, cost_usd: r2(totCost), active_days: calendar.length, longest_streak: longest, current_streak: cur, projects: 23, commits_linked: Math.round(totSessions * 0.34) },
  by_source, calendar, hour_week, cost_river, anomalies, ttr, funnel, tool_switch, friction,
  galaxy: { clusters, points: { x: px, y: py, c: pc, q: pq } }, quality, what_works, exposure, insights, recommendations,
};
writeFileSync(new URL("../src/data/sample.dev.json", import.meta.url), JSON.stringify(data));
console.log("sample.dev.json", JSON.stringify(data).length, "bytes");
