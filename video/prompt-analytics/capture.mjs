// Re-runnable capture of the MOCK dashboard (sample.dev.json) into shots/*.png + shots.json.
// Run through capture.sh (it injects __ROOT__ and pipes this file to `ego-browser nodejs`).
// Requires: `cd packages/prompt-analytics/dashboard && npx vite --port 5330` (mock data only).
const ROOT = "__ROOT__";
const BASE = "http://localhost:5330/";
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
async function box(spec, id) {
  const sel = await tag(spec, id);
  return page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const x = Math.max(0, r.x), y = Math.max(0, r.y), x2 = Math.min(1440, r.right), y2 = Math.min(900, r.bottom);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
  }, sel);
}
async function click(spec, id) {
  await page.click(await tag(spec, id));
  await wait(900);
}
// Take a 1440x900 viewport screenshot and record named boxes (viewport coordinates).
async function snap(name, boxes = {}, note = "") {
  const out = {};
  for (const [k, spec] of Object.entries(boxes)) out[k] = await box(spec, "b-" + k);
  await page.screenshot({ path: `${ROOT}/shots/${name}.png` });
  shots.push({ file: `shots/${name}.png`, name, note, boxes: out });
  console.log("shot", name, JSON.stringify(out));
}
async function open(hash = "", q = "") {
  await page.goto(`${BASE}${q || "?cap=" + Date.now()}#/${hash}`);
  await page.waitForSelector(".sec", { state: "visible" });
  await wait(2200);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(900);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(400);
}

const C = (t, btn) => (btn ? { card: t, btn } : { card: t });
// 1 Overview: briefing strip, KPIs, per-week trend, needs attention
await open(W30);
await snap("overview", { brief: ".brief", kpis: ".kpis", trend: "#s-trend", attention: "#s-attention" });
await scrollTo("#s-driver", 110);
await snap("driver", { driver: "#s-driver" });

// 2 Tools
await scrollTo("#s-tools", 98);
await snap("tools", { resolved: C("Resolved rate"), struggled: C("Struggled by tool"), cost: C("Cost / resolved") });

// 3 Time: calendar 2D -> 3D, hour-of-week 3D terrain, time to resolve
await scrollTo("#s-time", 98);
await snap("time-2d", { cal: C("Activity calendar"), tog3: C("Activity calendar", "3D"), hours: "#s-golden" });
await click(C("Activity calendar", "3D"), "click");
await wait(2200);
await snap("time-cal3d", { cal: C("Activity calendar"), tog3: C("Activity calendar", "3D") });
await click(C("Activity calendar", "3D"), "click"); // back to 2D
await click(C("Hour by weekday", "3D"), "click");
await wait(1800);
await snap("time-terrain3d", { hours: "#s-golden", seg3d: C("Hour by weekday", "3D") });
await scrollTo(C("Time to resolve"), 110);
await snap("time-resolve", { resolve: C("Time to resolve") });

// 4 Funnel
await scrollTo("#s-funnel", 98);
await snap("funnel", { stages: C("Session to resolved"), steps: C("Step rates"), switches: C("Tool switches") });

// 5 Friction
await scrollTo("#s-friction", 98);
await snap("friction", { signals: C("Signals behind struggle"), byIntent: C("Retries by intent") });
await scrollTo("#s-loopbreak", 110);
await snap("loopbreak", { loop: "#s-loopbreak" });

// 6 Model fit
await scrollTo("#s-models", 98);
await snap("models", { grid: C("Task size"), change: C("What to change") });

// 7 What works
await scrollTo("#s-works", 98);
await snap("works", { playbook: "#s-playbook" });
await scrollTo(C("Quality profile"), 110);
await snap("works-radar", { radar: C("Quality profile"), topics: C("Topics") });

// 8 Recommendations
await scrollTo("#s-recs", 98);
await snap("recs", { next: C("Do next, in order") });

// 9 Exposure review queue (masked previews)
await scrollTo("#s-exposure", 98);
await snap("exposure", { queue: C("Review queue") });

// 10 Sessions drilldown (billing-api / bugfix) for the site
await open("s-sessions?from=2026-09-26&prj=billing-api&int=bugfix");
await scrollTo("#s-sessions", 98);
await snap("drilldown", { list: C("All sessions in view") });

// 11 Mind map (3D)
await open(W30.replace("s-overview", "s-map"));
await scrollTo(C("How your work connects"), 98);
await wait(2500);
await snap("map", { map: C("How your work connects") });

// 12 Command palette
await open(W30);
await page.keyboard.press("ControlOrMeta+k");
await page.waitForSelector('[role="dialog"]', { state: "visible" });
await wait(600);
await snap("palette", { palette: '[role="dialog"]' });
await page.keyboard.press("Escape");

await fs.writeFile(`${ROOT}/shots.json`, JSON.stringify({ viewport: [1440, 900], shots }, null, 1));
console.log("done", shots.length);
