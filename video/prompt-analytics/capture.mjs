// Re-runnable capture of the MOCK dashboard (sample.dev.json) into shots/*.png + shots.json.
// Run through capture.sh (it injects __ROOT__ and pipes this file to `ego-browser nodejs`).
// Requires: `cd packages/prompt-analytics/dashboard && npx vite --port 5330` (mock data only).
const ROOT = "__ROOT__";
const BASE = "http://localhost:5330/";
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
      el = [...document.querySelectorAll(".card")].find((c) => (c.querySelector("h2,h3")?.textContent || "").trim().startsWith(spec.card));
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
  await wait(700);
}
async function box(spec, id) {
  const sel = await tag(spec, id);
  return page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
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
  await wait(1800);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(900);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await wait(400);
}

// 1 Overview
await open("s-overview");
await snap("overview", { kpis: 'ul[aria-label^="Totals"]', trend: "#s-trend", attention: "#s-attention" });

// 2 Tools (router matrix)
await scrollTo("#s-router", 100);
await snap("tools", { router: "#s-router" });

// 3 Time: calendar 2D -> 3D, hour-of-week 2D -> 3D terrain
await scrollTo("#s-time");
await snap("time-2d", { cal: { card: "Activity calendar" }, tog3: { card: "Activity calendar", btn: "3D" }, hours: "#s-golden" });
await click({ card: "Activity calendar", btn: "3D" }, "click");
await snap("time-cal3d", { cal: { card: "Activity calendar" }, tog3: { card: "Activity calendar", btn: "3D" } });
{ // orbit: drag across the 3D calendar
  const c = await box(".tog3 ~ *, [aria-label^='3D calendar']", "orb");
  const x = c.x + c.w / 2, y = c.y + c.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * 14, y - i * 3);
  await page.mouse.up();
  await wait(900);
  await snap("time-cal3d-orbit", { cal: { card: "Activity calendar" }, stage: "[aria-label^='3D calendar']" });
}
await click({ card: "Activity calendar", btn: "3D" }, "click"); // back to 2D
await scrollTo("#s-golden", 180);
await snap("time-hours-2d", { hours: "#s-golden", seg3d: { card: "Hour by weekday", btn: "3D" } });
await click({ card: "Hour by weekday", btn: "3D" }, "click");
await wait(1500);
await snap("time-terrain3d", { hours: "#s-golden", seg3d: { card: "Hour by weekday", btn: "3D" } });

// 4 Funnel
await scrollTo("#s-funnel");
await snap("funnel", { stages: { card: "Stages" }, switches: { card: "Tool switches" } });

// 5 Friction (loop breaker)
await scrollTo("#s-friction");
await snap("friction", { signals: { card: "Signals by tool" }, byIntent: { card: "Friction by intent" } });
await scrollTo("#s-loopbreak", 130);
await snap("loopbreak", { loop: "#s-loopbreak" });

// 6 What works (playbook)
await scrollTo("#s-works");
await snap("works", { playbook: "#s-playbook" });

// 7 Exposure
await scrollTo("#s-exposure");
await snap("exposure", { findings: { card: "Findings by category" }, kinds: { card: "Kinds by tool" }, queue: { card: "Review queue" } });

// 8 Sessions: 10 rows -> 25 rows -> compact -> export menu
await scrollTo("#s-sessions");
await snap("sessions-10", { pager: ".pager", rows: ".pager select", dens: '[aria-label="Row density"]', exp: { btn: "Export" } });
await page.selectOption(await tag(".pager select", "rows"), "25");
await wait(900);
await page.evaluate(() => { const r = document.querySelector(".pager").getBoundingClientRect(); scrollTo({ top: scrollY + r.bottom - 870, behavior: "instant" }); });
await wait(600);
await snap("sessions-25", { pager: ".pager", rows: ".pager select", dens: '[aria-label="Row density"]', exp: { btn: "Export" } });
await click({ btn: "Compact" }, "click");
await wait(500);
await page.evaluate(() => { const r = document.querySelector(".pager").getBoundingClientRect(); scrollTo({ top: scrollY + r.bottom - 870, behavior: "instant" }); });
await wait(600);
await snap("sessions-compact", { pager: ".pager", dens: '[aria-label="Row density"]' });
await scrollTo("#s-sessions");
await snap("sessions-pre-export", { exp: { btn: "Export" } });
await click({ btn: "Export" }, "click");
await snap("sessions-export", { menu: '[role="menu"]', exp: { btn: "Export" } });
await page.keyboard.press("Escape");

// 9 Mind map (3D)
await open("s-map");
await scrollTo({ card: "Constellation" }, 98);
await wait(2500);
await snap("map", { map: { card: "Constellation" } });

// 10 Command palette
await open("s-overview");
await page.keyboard.press("ControlOrMeta+k");
await page.waitForSelector('[role="dialog"][aria-label="Command palette"]', { state: "visible" });
await wait(600);
await snap("palette", { palette: '[role="dialog"][aria-label="Command palette"]' });
await page.keyboard.press("Escape");

// 11 Single-tool sample
await open("s-tools", "?sample=single-claude");
await snap("single-top", { kpis: 'ul[aria-label^="Totals"]' });
await scrollTo("#s-tools");
await snap("single-tools", { tools: "#s-tools" });

await fs.writeFile(`${ROOT}/shots.json`, JSON.stringify({ viewport: [1440, 900], shots }, null, 1));
console.log("done", shots.length);
