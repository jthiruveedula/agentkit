// Iteration 4b: pagination math, hash keys, serializers (CSV / JSON / XLSX zip), summary privacy, palette actions, and the table UI.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";
import { clampPage, pageCount, pageSlice, parseSort, rangeText, sortToken } from "../lib/paging";
import { fromHash, toHash } from "../lib/hash";
import { crc32, csvCell, fileName, serial, toCsv, toJson, toXlsx } from "../lib/export";
import { capabilities } from "../lib/capabilities";
import { views } from "../lib/filter";
import { summarize } from "../lib/summary";
import { addView, buildActions, loadViews, rank, removeView, score, sessionActions, storeViews } from "../lib/palette-actions";
import type { SessionRow } from "../data/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: "a", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1.5, reached_stage: 5, applied: true, loops: 0, friction: 0.25, cluster: 0, title: "Fix", ...o });

describe("paging math", () => {
  it("slices, counts and words the range", () => {
    const xs = Array.from({ length: 174 }, (_, i) => i);
    expect(pageCount(174, 10)).toBe(18); expect(pageCount(174, 0)).toBe(1); expect(pageCount(0, 10)).toBe(1);
    expect(pageSlice(xs, 2, 10)).toEqual(xs.slice(10, 20)); expect(pageSlice(xs, 18, 10)).toHaveLength(4); expect(pageSlice(xs, 1, 0)).toHaveLength(174);
    expect(rangeText(174, 2, 10)).toBe("11–20 of 174"); expect(rangeText(174, 18, 10)).toBe("171–174 of 174"); expect(rangeText(174, 1, 0)).toBe("1–174 of 174"); expect(rangeText(0, 1, 10)).toBe("0 of 0");
    expect(clampPage(99, 174, 10)).toBe(18); expect(clampPage(undefined, 5, 10)).toBe(1); expect(clampPage(-3, 5, 10)).toBe(1);
  });
  it("sort tokens round-trip and reject junk", () => {
    expect(parseSort(sortToken("cost", true))).toEqual({ k: "cost", desc: true }); expect(parseSort("nope-d")).toBeUndefined(); expect(parseSort(undefined)).toBeUndefined();
  });
  it("hash keys pg, pgs, dn, so survive a round trip; defaults stay out of the URL", () => {
    const n = { f: {}, list: false, cmp: "prev" as const, pg: 3, pgs: 0, dens: "c" as const, so: "cost-d" };
    const h = toHash(n, "s-sessions");
    expect(h).toContain("pg=3"); expect(h).toContain("pgs=all");
    expect(fromHash(h).nav).toMatchObject({ pg: 3, pgs: 0, dens: "c", so: "cost-d" });
    expect(toHash({ f: {}, list: false, cmp: "prev", pg: 1, pgs: 10 })).toBe("#/s-overview");
    expect(fromHash("#/s-sessions?pgs=7&pg=abc&so=evil").nav.pgs).toBeUndefined();
  });
});

describe("serializers", () => {
  it("csv escapes quotes, commas, newlines and neutralises formulas", () => {
    expect(csvCell('a"b,c\nd')).toBe('"a""b,c\nd"');
    for (const s of ["=1+1", "+1", "-1", "@x", "\tx", "\rx"]) expect(csvCell(s).startsWith(`"'`)).toBe(true);
    expect(csvCell(null)).toBe('""');
    const out = toCsv([row({ cost_usd: null, title: '=HYPERLINK("x")' })]).split("\n");
    expect(out[0]).toBe('"date","tool","project","intent","title","prompts","tokens","cost_usd","friction","applied"');
    expect(out[1]).toContain(`"'=HYPERLINK(""x"")"`); expect(out[1]).toContain('"","0.25"'.replace('"0.25"', '"0.25"'));
    expect(out[1].split(",")[7]).toBe('""');   // unpriced stays empty, never 0
  });
  it("json is a pretty object with meta and null cost", () => {
    const j = toJson([row({ cost_usd: null })], { source: "cursor" }, new Date("2026-03-05T00:00:00Z"));
    expect(j).toContain("\n  \"meta\"");
    const o = JSON.parse(j);
    expect(o.meta).toEqual({ generated_at: "2026-03-05T00:00:00.000Z", filters: { source: "cursor" }, count: 1 });
    expect(o.sessions[0].cost_usd).toBeNull(); expect(o.sessions[0].applied).toBe(true);
  });
  it("file names carry the local date", () => { expect(fileName("xlsx", new Date(2026, 2, 5))).toBe("prompt-analytics-sessions-2026-03-05.xlsx"); });
  it("crc32 matches the known check value", () => { expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926); });
  it("xlsx is a well-formed stored zip with the right cells", () => {
    const bytes = toXlsx([row({ title: "=cmd|' /C calc'!A0" }), row({ id: "b", cost_usd: null, date: "2026-03-03" })]);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder();
    // end of central directory
    const eocd = bytes.length - 22; expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    const count = v.getUint16(eocd + 10, true), cdOff = v.getUint32(eocd + 16, true); expect(count).toBe(6);
    const files: Record<string, string> = {}; let p = cdOff;
    for (let i = 0; i < count; i++) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true), nl = v.getUint16(p + 28, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nl));
      expect(v.getUint32(lo, true)).toBe(0x04034b50);   // local header
      expect(v.getUint16(lo + 8, true)).toBe(0);         // stored
      expect(v.getUint32(lo + 14, true)).toBe(crc); expect(v.getUint32(lo + 18, true)).toBe(size);
      const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), data = bytes.subarray(start, start + size);
      expect(crc32(data)).toBe(crc);
      files[name] = dec.decode(data); p += 46 + nl;
    }
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const x = files["xl/worksheets/sheet1.xml"];
    expect(x).toContain(`<c r="A2" s="2"><v>${serial("2026-03-02")}</v></c>`); expect(serial("2026-03-02")).toBe(46083);
    expect(x).toContain('<c r="F2"><v>2</v></c>'); expect(x).toContain('<c r="H2" s="3"><v>1.5</v></c>');
    expect(x).toContain('<c r="J2" t="b"><v>1</v></c>');
    expect(x).toContain('<c r="E2" t="inlineStr"><is><t xml:space="preserve">=cmd|&apos;'.replace("&apos;", "'"));   // literal text, not a formula
    expect(x).not.toContain("<f>"); expect(x).not.toMatch(/r="H3"/);   // null cost: no cell at all
  });
});

describe("summary", () => {
  const raw = JSON.parse(JSON.stringify(sample)) as Record<string, any>;
  raw.sessions[0].title = "SECRET-TITLE-123";
  raw.exposure.items[0] = { ...raw.exposure.items[0], preview: "PREVIEW-LEAK-456", session_title: "SECRET-TITLE-789" };
  if (raw.galaxy.clusters[0]) raw.galaxy.clusters[0].exemplar = "EXEMPLAR-LEAK-000";
  const d = normalize(raw);
  const mk = (f = {}) => { const v = views(d, f); return { f, v, win: { from: d.range.start, to: d.range.end, days: 30 }, caps: capabilities(d, v), prior: null, cmp: "prev" as const }; };
  it("never includes titles, previews or exemplars; deterministic", () => {
    const a = summarize(d, mk()), b = summarize(d, mk());
    expect(a).toBe(b);
    for (const bad of ["SECRET-TITLE", "PREVIEW-LEAK", "EXEMPLAR-LEAK"]) expect(a).not.toContain(bad);
    expect(a).toMatch(/^# Prompt Analytics summary/); expect(a).toMatch(/n=\d+/); expect(a).toContain("## Top insights"); expect(a).toContain("## Recommendations");
  });
  it("drops cost lines when nothing is priced and says so for one tool", () => {
    const r2 = JSON.parse(JSON.stringify(raw)); r2.sessions = r2.sessions.filter((r: any) => r.source === "copilot").map((r: any) => ({ ...r, cost_usd: null }));
    const d2 = normalize(r2), v = views(d2, {}), caps = capabilities(d2, v);
    const md = summarize(d2, { f: {}, v, win: { from: d2.range.start, to: d2.range.end, days: 30 }, caps, prior: null, cmp: "off" });
    expect(md).not.toMatch(/- Cost:/); expect(md).toContain("Copilot only"); expect(md).toContain("Comparison: off");
  });
});

describe("palette actions", () => {
  const ctx = { sections: [{ id: "s-time", text: "Time" }, { id: "s-sessions", text: "Sessions" }], sources: [{ id: "cursor", text: "Cursor" }], intents: ["bugfix"], projects: ["alpha"], hasFilters: true, hasRows: true, views: [{ name: "Weekly", hash: "#/s-time" }] };
  const acts = buildActions(ctx);
  it("lists only existing sections; filters appear once typing", () => {
    expect(acts.filter((a) => a.group === "Jump").map((a) => a.label)).toEqual(["Go to Time", "Go to Sessions"]);
    expect(rank(acts, "").some((a) => a.id.startsWith("src:"))).toBe(false);
    expect(rank(acts, "cursor")[0].id).toBe("src:cursor");
    expect(buildActions({ ...ctx, hasRows: false, hasFilters: false }).some((a) => a.id === "clear" || a.id.startsWith("export:"))).toBe(false);
  });
  it("ranks prefix above substring, requires every word, and is stable", () => {
    expect(score(acts[0], "zzz")).toBe(0); expect(rank(acts, "go time")[0].id).toBe("go:s-time");
    expect(rank(acts, "export").map((a) => a.id)).toEqual(["export:csv", "export:json", "export:xlsx"]);
    expect(rank(acts, "excel")[0].id).toBe("export:xlsx");
  });
  it("searches sessions by title, newest first, capped", () => {
    const rs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Fix login ${i}`, date: `2026-03-0${i + 1}` }));
    const r = sessionActions(rs, "login", 5); expect(r).toHaveLength(5); expect(r[0].run).toEqual({ t: "session", id: "s7" });
    expect(sessionActions(rs, "l")).toEqual([]);
  });
  it("saved views add, replace, remove, and survive blocked storage", () => {
    let v = addView([], " A ", "#/a"); v = addView(v, "A", "#/b"); expect(v).toEqual([{ name: "A", hash: "#/b" }]); expect(addView(v, "  ", "#/c")).toBe(v);
    expect(removeView(v, "A")).toEqual([]);
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadViews(blocked)).toEqual([]); expect(storeViews(v, blocked)).toBe(false);
    const mem: Record<string, string> = {}, ok = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, x: string) => { mem[k] = x; } };
    expect(storeViews(v, ok)).toBe(true); expect(loadViews(ok)).toEqual(v);
  });
});

describe("sessions table UI", () => {
  let root: Root | null = null, el: HTMLDivElement;
  afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
  const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(sample as never)} />)); };
  const click = (n: Element | null) => act(() => { (n as HTMLElement).click(); });
  const pager = () => el.querySelector('nav[aria-label="Sessions pages"]')!;
  const btn = (t: string) => [...pager().querySelectorAll("button")].find((b) => b.textContent === t)!;
  const rows = () => el.querySelectorAll("#s-sessions tbody tr");
  it("pages by 10, disables Prev/Next at the ends, announces, and resets on sort", () => {
    mount();
    expect(rows()).toHaveLength(10); expect(btn("Prev").disabled).toBe(true); expect(pager().textContent).toMatch(/^Prev1–10 of \d+/);
    click(btn("Next"));
    expect(pager().textContent).toMatch(/11–20 of/); expect(location.hash).toContain("pg=2");
    expect(pager().querySelector("[aria-live]")!.textContent).toMatch(/^Page 2 of \d+/);
    click(el.querySelector("#s-sessions .th-b"));   // sort resets to page 1
    expect(location.hash).not.toContain("pg="); expect(pager().textContent).toMatch(/1–10 of/);
    const sel = el.querySelector<HTMLSelectElement>("#s-sessions .pager select")!;
    act(() => { sel.value = "0"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(location.hash).toContain("pgs=all"); expect(btn("Next").disabled).toBe(true); expect(rows().length).toBeGreaterThan(10);
  });
  it("density toggle persists in the hash; export menu is keyboard operable", () => {
    mount();
    click([...el.querySelectorAll<HTMLButtonElement>("#s-sessions .seg button")].find((b) => b.textContent === "Compact")!);
    expect(location.hash).toContain("dn=c"); expect(el.querySelector("#s-sessions table")!.getAttribute("data-dens")).toBe("c");
    const b = [...el.querySelectorAll<HTMLButtonElement>("#s-sessions .btn")].find((x) => x.textContent?.startsWith("Export"))!;
    expect(b.getAttribute("aria-haspopup")).toBe("menu");
    click(b); const items = el.querySelectorAll('[role="menuitem"]'); expect(items).toHaveLength(3); expect(document.activeElement).toBe(items[0]);
    act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(el.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(b);
  });
  it("Ctrl+K opens a focus-trapped palette that closes on Esc and restores focus", () => {
    mount();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); });
    const dlg = document.querySelector('[role="dialog"]')!; expect(dlg).not.toBeNull();
    expect(document.activeElement).toBe(dlg.querySelector("input"));
    expect(dlg.querySelectorAll('[role="option"]').length).toBeGreaterThan(3);
    act(() => { dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
