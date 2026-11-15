// Re-runnable capture of the MOCK dashboard (sample.dev.json) into shots/*.png + shots.json.
// Run through capture.sh: it builds the dashboard into out/dash with the mock data inlined, injects
// __ROOT__ / __BASE__ and pipes this file to `ego-browser nodejs`. Mock data only, never real sessions.
const ROOT = "__ROOT__";
const BASE = "__BASE__"; // file:// URL of out/dash/index.html
const W30 = "s-overview?from=2026-09-26"; // 30d window: briefing reads 3.9% -> 11.0%
const fs = await import("node:fs/promises");
await fs.mkdir(`${ROOT}/shots`, { recursive: true });

const task = await taskSpace("pa video");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const shots = [];
const wait = (ms) => page.waitForTimeout(ms);

// Tag the first element matching a spec so it can be clicked / measured. Returns the CSS selector.
async function tag(spec, id) {
  const ok = await page.evaluate(({ spec, id }) => {
    document.querySelectorAll(`[data-cap="${id}"]`).forEach((e) => e.removeAttribute("data-cap"));
    let el = null;
    const vis = (e) => e.getBoundingClientRect().width > 0;
    if (typeof spec === "string") el = [...document.querySelectorAll(spec)].find(vis);
    else if (spec.card) {
      el = [...document.querySelectorAll(".card")].find((c) => (c.querySelector(".card-h h3, .card-h h2")?.textContent || "").trim().startsWith(spec.card));
      if (el && spec.btn) el = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === spec.btn);
    } else if (spec.btn) el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(spec.btn) && vis(b));
    if (!el) return false;
    el.setAttribute("data-cap", id);
    return true;
  }, { spec, id });
  if (!ok) throw new Error("no match: " + JSON.stringify(spec));
  return `[data-cap="${id}"]`;
}
async function scrollTo(spec, pad = 104) {
  const sel = await tag(spec, "scr");
  await page.evaluate(({ sel, pad }) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    scrollTo({ top: scrollY + r.top - pad, behavior: "instant" });
  }, { sel, pad });
  await wait(1700); // sections fade in on reveal
}
const clip = (r) => {
  const x = Math.max(0, r.x), y = Math.max(0, r.y), x2 = Math.min(1440, r.x + r.w), y2 = Math.min(900, r.y + r.h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
};
// spec: selector / card spec, {union: [spec, spec]} (bounding box of both), or {pt: [x, y]} (a click point)
async function box(spec, id) {
  if (spec.pt) return { x: spec.pt[0] - 2, y: spec.pt[1] - 2, w: 4, h: 4 };
  if (spec.union) {
    const bs = [];
    for (const [i, s] of spec.union.entries()) bs.push(await box(s, id + i));
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return clip({ x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y });
  }
  const sel = await tag(spec, id);
  const r = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  return clip(r);
}
async function click(spec, id) {
  await page.click(await tag(spec, id));
  await wait(900);
}
// Sunburst arcs sit under their labels: find a point where the arc itself takes the click.
const arcAt = (id) => page.evaluate((id) => {
  const a = [...document.querySelectorAll(".sb-arc")].find((e) => e.dataset.id === id);
  if (!a) return null;
  const b = a.getBoundingClientRect(), pts = [];
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const x = b.x + (b.width * i) / 12, y = b.y + (b.height * j) / 12;
    if (document.elementFromPoint(x, y) === a) pts.push([x, y]);
  }
  if (!pts.length) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  pts.sort((p, q) => Math.hypot(p[0] - mx, p[1] - my) - Math.hypot(q[0] - mx, q[1] - my));
  return pts[0].map(Math.round);
}, id);
// Take a 1440x900 viewport screenshot and record named boxes (viewport coordinates).
async function snap(name, boxes = {}, note = "") {
  const out = {};
  for (const [k, spec] of Object.entries(boxes)) out[k] = await box(spec, "b-" + k);
  await page.screenshot({ path: `${ROOT}/shots/${name}.png` });
  shots.push({ file: `shots/${name}.png`, name, note, boxes: out });
  console.log("shot", name, JSON.stringify(out));
}
async function open(hash = "") {
  await page.goto(`${BASE}?cap=${Date.now()}#/${hash}`);
  await page.waitForSelector(".sec", { state: "visible" });
  await wait(2200);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(900);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(400);
}

const C = (t, btn) => (btn ? { card: t, btn } : { card: t });
const K = (id) => `li:has(> [data-kpi="${id}"])`;
const at30 = (sec) => W30.replace("s-overview", sec);

// 1 Overview: compact header and the brief
await open(W30);
await snap("overview", { head: ".top", brief: ".brief", why: ".brief .story" });

// 2 Key numbers: six tiles, called out in pairs
await scrollTo(".kcard", 96);
await snap("keynums", {
  card: ".kcard",
  k1: { union: [K("sessions"), K("spend")] },
  k2: { union: [K("tokens"), K("cpa")] },
  k3: { union: [K("applied"), K("exposed")] },
});

// 3 Usage mix: model donut, tokens and spend by tool, tier mix
await scrollTo("#s-mix-models", 104);
await snap("mix", { models: "#s-mix-models", tools: "#s-mix-tools", tiers: "#s-mix-tiers" });

// 4 Why: driver attribution
await scrollTo("#s-driver", 104);
await snap("driver", { driver: "#s-driver" });

// 5 Tools (a quiet section in this window: opening its link expands it)
await open(at30("s-tools"));
await scrollTo("#s-tools", 98);
await snap("tools", { resolved: C("Resolved rate"), struggled: C("Struggled by tool"), cost: C("Cost / resolved") });

// 6 Time: calendar 2D -> 3D, hour-of-week 3D terrain
await open(at30("s-time"));
await scrollTo("#s-time", 98);
await snap("time-2d", { cal: C("Activity calendar"), tog3: C("Activity calendar", "3D"), hours: "#s-golden" });
await click(C("Activity calendar", "3D"), "click");
await wait(2200);
await snap("time-cal3d", { cal: C("Activity calendar"), tog3: C("Activity calendar", "3D") });
await click(C("Activity calendar", "3D"), "click"); // back to 2D
await click(C("Hour by weekday", "3D"), "click");
await wait(1800);
await snap("time-terrain3d", { hours: "#s-golden", seg3d: C("Hour by weekday", "3D") });

// 7 Funnel
await open(at30("s-funnel"));
await scrollTo("#s-funnel", 98);
await snap("funnel", { stages: C("Session to resolved"), switches: C("Tool switches") });

// 8 Friction
await open(at30("s-friction"));
await scrollTo("#s-friction", 98);
await snap("friction", { signals: C("Signals behind struggle"), byIntent: C("Retries by intent") });

// 9 Model fit (quiet section, expanded by its link)
await open(at30("s-models"));
await scrollTo("#s-models", 98);
await snap("models", { grid: C("Task size"), change: C("What to change") });

// 10 What works
await open(at30("s-works"));
await scrollTo("#s-works", 98);
await snap("works", { playbook: "#s-playbook" });
await scrollTo(C("Quality profile"), 110);
await snap("works-radar", { radar: C("Quality profile"), topics: C("Topics") });

// 11 Recommendations
await open(at30("s-recs"));
await scrollTo("#s-recs", 98);
await snap("recs", { next: C("Do next, in order") });

// 12 Exposure review queue (masked previews)
await open(at30("s-exposure"));
await scrollTo("#s-exposure", 98);
await snap("exposure", { queue: C("Review queue") });

// 13 Sessions drilldown (billing-api / bugfix), kept for the site
await open("s-sessions?from=2026-09-26&prj=billing-api&int=bugfix");
await scrollTo("#s-sessions", 98);
await snap("drilldown", { list: C("All sessions in view") });

// 14 Mind map: sunburst -> zoom into Claude Code / bugfix -> a session opens in the side panel
await open(at30("s-map"));
await page.waitForSelector(".sb-arc", { state: "visible" });
await scrollTo(C("How your work connects"), 98);
await wait(1200);
const BUG = "root/claude_code/bugfix";
const p0 = await arcAt(BUG);
await snap("map", { map: C("How your work connects"), sb: ".sb svg", bugfix: { pt: p0 } });
await page.mouse.click(p0[0], p0[1], { label: "zoom into bugfix" });
await wait(1800);
const ses = await page.evaluate(() => [...document.querySelectorAll(".sb-arc[data-kind=project]")].map((a) => a.dataset.id).find((id) => id.endsWith("/billing-api")));
const p1 = await arcAt(ses);
await snap("map-zoom", { sb: ".sb svg", hub: ".sb-hub", billing: { pt: p1 } });
await page.mouse.click(p1[0], p1[1], { label: "open billing-api" });
await wait(1800);
const sid = await page.evaluate(() => document.querySelector(".sb-arc[data-kind=session]")?.dataset.id);
const p2 = await arcAt(sid);
await snap("map-ses", { sb: ".sb svg", ses: { pt: p2 } });
await page.mouse.click(p2[0], p2[1], { label: "open a session" });
await page.waitForSelector("#panel", { state: "visible" });
await wait(1600);
await snap("map-panel", { panel: "#panel", sb: ".sb svg" });

// 15 Command palette
await open(W30);
await page.keyboard.press("ControlOrMeta+k");
await page.waitForSelector('[role="dialog"]', { state: "visible" });
await wait(600);
await snap("palette", { palette: '[role="dialog"]' });
await page.keyboard.press("Escape");

await fs.writeFile(`${ROOT}/shots.json`, JSON.stringify({ viewport: [1440, 900], shots }, null, 1));
console.log("done", shots.length);
await task.finish({ keep: [] });
