// Fresh shots of the MOCK dashboard built from main (../out/dash, sample.dev.json inlined) -> public/shots.
// Run: node capture.mjs. Mock data only, never real sessions.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const ROOT = new URL(".", import.meta.url).pathname;
const base = "http://127.0.0.1:8765/index.html";
mkdirSync(ROOT + "public/shots", { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const wait = (ms) => page.waitForTimeout(ms);
async function open(hash) {
  await page.goto(`${base}?cap=${Date.now()}#/${hash}`);
  await page.waitForSelector(".sec", { state: "visible" });
  await wait(2500);
}
async function scrollTo(sel, pad = 96) {
  await page.evaluate(([s, p]) => { const e = document.querySelector(s); scrollTo({ top: scrollY + e.getBoundingClientRect().top - p, behavior: "instant" }); }, [sel, pad]);
  await wait(1500);
}
const card3d = (t) => page.locator(".card", { has: page.locator(".card-h h3, .card-h h2", { hasText: t }) }).locator("button", { hasText: /^3D$/ });
await open("s-overview?from=2026-09-26");
await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" })); await wait(800);
await page.screenshot({ path: ROOT + "public/shots/overview.png" });
await open("s-time");
await scrollTo("#s-time");
await card3d("Activity calendar").click(); await wait(3500);
await page.screenshot({ path: ROOT + "public/shots/cal3d.png" });
await card3d("Hour by weekday").click(); await wait(3500);
await scrollTo("#s-golden", 80);
await page.screenshot({ path: ROOT + "public/shots/hour3d.png" });
console.log("webgl:", await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2")));
await b.close();
