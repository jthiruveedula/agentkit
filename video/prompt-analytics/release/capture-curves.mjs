// Curve-insight cards (Curve.tsx) from the MOCK dashboard in ../out/dash (built by ../capture.sh's
// build step) -> public/shots/curve-*.png, clipped to the card. Headless Edge via ../cdp.mjs.
// sample.dev.json has no friction.retry_cliff, so before running, append the video's MOCK retry-cliff
// insight (data/insights.json, from mock_insights.py) to the pa-data JSON in ../out/dash/index.html.
import { writeFile } from "node:fs/promises";
import { launch } from "../cdp.mjs";
const BASE = `file://${import.meta.dirname}/../out/dash/index.html`;
const { page, close } = await launch();
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
for (const [name, sec, title] of [["curve-retry", "s-friction", "Applied rate by retries"], ["curve-length", "s-works", "Applied rate by opening prompt length"], ["curve-daypart", "s-time", "Applied rate by start time"]]) {
  await page.goto(`${BASE}?cap=${Date.now()}#/${sec}`);
  await page.waitForSelector(".sec");
  await page.waitForTimeout(2500);
  const top = (t) => page.evaluate((t) => {
    const c = [...document.querySelectorAll(".card")].find((c) => (c.querySelector(".card-h h3, .card-h h2")?.textContent || "").trim().startsWith(t));
    if (!c) return null;
    scrollTo({ top: scrollY + c.getBoundingClientRect().top - 130 /* clear the sticky header */, behavior: "instant" });
    return true;
  }, t);
  if (!(await top(title))) throw new Error("no card: " + title);
  await page.waitForTimeout(1800); // reveal fade
  await top(title); await page.waitForTimeout(600);
  const r = await page.evaluate((t) => {
    const c = [...document.querySelectorAll(".card")].find((c) => (c.querySelector(".card-h h3, .card-h h2")?.textContent || "").trim().startsWith(t));
    const b = c.getBoundingClientRect(); return { x: b.x - 16, y: scrollY + b.y - 16, width: b.width + 32, height: Math.min(b.height + 32, 900 - b.y), scale: 1 };
  }, title);
  const { data } = await page.cdp("Page.captureScreenshot", { format: "png", clip: r });
  await writeFile(`${import.meta.dirname}/public/shots/${name}.png`, Buffer.from(data, "base64"));
  console.log(name, JSON.stringify(r));
}
close();
