// Tiny CDP shim: launches headless Microsoft Edge and exposes only the page methods capture.mjs uses.
// No dependencies: Node >= 22 (global WebSocket + fetch). Edge is killed (our PID only) on any exit.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = process.env.EDGE_BIN || "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "pa-edge-"));
  const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const close = () => {
    edge.kill();
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Edge may still be flushing; $TMPDIR gets cleaned anyway */ }
  };
  process.on("exit", close); // covers normal end, uncaught errors and process.exit
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => process.exit(1));

  const port = await new Promise((res, rej) => {
    let err = "";
    edge.stderr.on("data", (d) => { err += d; const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(err); if (m) res(m[1]); });
    edge.on("error", rej);
    edge.on("exit", (c) => rej(new Error(`Edge exited (${c}) before DevTools came up:\n${err}`)));
    setTimeout(() => rej(new Error("timed out waiting for the Edge DevTools port")), 20000).unref();
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP socket failed to open")); });

  let seq = 0;
  const pending = new Map(), waiters = new Map(); // id -> {res, rej}; event name -> [resolve]
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result);
    } else (waiters.get(m.method) || []).splice(0).forEach((r) => r(m.params));
  };
  ws.onclose = () => pending.forEach((p) => p.rej(new Error("CDP socket closed")));
  const cdp = (method, params = {}) => new Promise((res, rej) => { pending.set(++seq, { res, rej, method }); ws.send(JSON.stringify({ id: seq, method, params })); });
  const once = (event) => new Promise((r) => waiters.set(event, [...(waiters.get(event) || []), r]));
  await cdp("Page.enable");

  const evaluate = async (fn, arg) => {
    const r = await cdp("Runtime.evaluate", { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const mouse = {
    async click(x, y) { // a third {label} argument is accepted and ignored
      const p = { x, y, button: "left", clickCount: 1 };
      await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await cdp("Input.dispatchMouseEvent", { ...p, type: "mousePressed", buttons: 1 });
      await cdp("Input.dispatchMouseEvent", { ...p, type: "mouseReleased" });
    },
  };
  const MOD = { Alt: 1, Control: 2, Meta: 4, Shift: 8, ControlOrMeta: process.platform === "darwin" ? 4 : 2 };
  const page = {
    cdp, evaluate, mouse,
    waitForTimeout: sleep,
    async goto(url) {
      const loaded = once("Page.loadEventFired");
      const r = await cdp("Page.navigate", { url });
      if (r.errorText) throw new Error(`goto ${url}: ${r.errorText}`);
      await loaded;
    },
    // Only {state: "visible"} is used: resolves once a match has a non-empty box.
    async waitForSelector(sel, { timeout = 30000 } = {}) {
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
        if (await evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getBoundingClientRect().width > 0), sel)) return;
      }
      throw new Error("timed out waiting for " + sel);
    },
    async click(sel) {
      const c = await evaluate((s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        e.scrollIntoView({ block: "nearest", behavior: "instant" });
        const r = e.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      }, sel);
      if (!c) throw new Error("click: no element for " + sel);
      await mouse.click(c[0], c[1]);
    },
    keyboard: {
      async press(combo) { // "Escape", "ControlOrMeta+k"
        const keys = combo.split("+"), key = keys.pop(), modifiers = keys.reduce((m, k) => m | MOD[k], 0);
        const code = key.length === 1 ? key.toUpperCase().charCodeAt(0) : { Escape: 27, Enter: 13, Tab: 9 }[key];
        const ev = { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: code, modifiers };
        await cdp("Input.dispatchKeyEvent", { ...ev, type: "rawKeyDown" });
        await cdp("Input.dispatchKeyEvent", { ...ev, type: "keyUp" });
      },
    },
    async screenshot({ path }) {
      const { data } = await cdp("Page.captureScreenshot", { format: "png" });
      await writeFile(path, Buffer.from(data, "base64"));
    },
  };
  return { page, close: () => { ws.close(); close(); } };
}
