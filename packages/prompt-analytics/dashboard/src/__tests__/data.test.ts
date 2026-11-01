import { describe, expect, it, vi } from "vitest";
import { SchemaError, normalize, readInline } from "../data/load";
import { getApi } from "../data/api";
import { fmtCompact, fmtInt, fmtPct, fmtUSD, clampWords } from "../lib/format";

const doc = (txt: string) => new DOMParser().parseFromString(`<script type="application/json" id="pa-data">${txt}</script>`, "text/html");

describe("readInline", () => {
  it("null/empty -> null", () => { expect(readInline(doc("null"))).toBeNull(); expect(readInline(doc(""))).toBeNull(); });
  it("parses escaped </script> in strings", () => {
    const d = doc(String.raw`{"a":"x<\/script><script>alert(1)"}`);
    expect((readInline(d) as { a: string }).a).toBe("x</script><script>alert(1)");
  });
  it("parses \\u003c escapes", () => { expect((readInline(doc(String.raw`{"a":"<b>"}`)) as { a: string }).a).toBe("<b>"); });
});

describe("normalize", () => {
  it("fills defaults for minimal input", () => {
    const d = normalize({ schema: "1.0" });
    for (const k of ["calendar", "insights", "recommendations", "by_source", "ttr", "anomalies"] as const) expect(d[k]).toEqual([]);
    expect(d.exposure.sessions).toBe(0);
    expect(d.exposure.items).toEqual([]);
  });
  it("rejects unknown major and non-objects", () => {
    expect(() => normalize({ schema: "2.0" })).toThrow(SchemaError);
    expect(() => normalize(null)).toThrow(SchemaError);
  });
  it("truncates ragged galaxy columns", () => {
    const d = normalize({ schema: "1.0", galaxy: { points: { x: [1, 2, 3], y: [1, 2], c: [0, 0, 0], q: [1, 1, 1] } } });
    expect(d.galaxy.points.x.length).toBe(2);
  });
});

describe("getApi", () => {
  it("is null without pa-token meta (file://)", () => { vi.stubEnv("DEV", false); expect(getApi(new DOMParser().parseFromString("<p></p>", "text/html"))).toBeNull(); vi.unstubAllEnvs(); });
  it("exists with pa-token meta", () => { expect(getApi(new DOMParser().parseFromString('<meta name="pa-token" content="t">', "text/html"))).not.toBeNull(); });
});

describe("format", () => {
  it("numbers", () => {
    expect(fmtInt(1234567)).toBe("1,234,567");
    expect(fmtInt(NaN)).toBe("0");
    expect(fmtCompact(1500)).toMatch(/1\.5k/i);
    expect(fmtPct(0.256)).toBe("26%");
    expect(fmtUSD(12.5)).toContain("12.5");
  });
  it("clampWords", () => { expect(clampWords("a b c d", 2).split(" ").length).toBeLessThanOrEqual(3); });
});
