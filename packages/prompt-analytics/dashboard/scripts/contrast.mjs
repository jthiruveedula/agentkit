// Validates src/lib/palette.ts: text >= 4.5:1, graphics >= 3:1 against BG and SURFACE.
// Exemption: SEQ[0..1] are "empty/low" heatmap cells. They are outlined with GRID (checked
// here at >= 3:1) and every heatmap is mirrored by a hidden data table.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/palette.ts", import.meta.url), "utf8");
const hex = (n) => src.match(new RegExp(`${n}\\s*=\\s*"(#[0-9a-f]{6})"`, "i"))[1];
const list = (n) => [...src.match(new RegExp(`${n}\\s*=\\s*\\[([^\\]]*)\\]`))[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const BG = hex("BG"), SURFACE = hex("SURFACE");
const sourceBlock = src.match(/SOURCE_COLOR[^{]*\{([^}]*)\}/)[1];
const checks = [
  ["TEXT", hex("TEXT"), 4.5], ["MUTED", hex("MUTED"), 4.5], ["GRID", hex("GRID"), 3],
  ["HELPS", hex("HELPS"), 4.5], ["HURTS", hex("HURTS"), 4.5],
  ...list("CAT").map((c, i) => [`CAT[${i}]`, c, 3]),
  ...list("SEQ").slice(2).map((c, i) => [`SEQ[${i + 2}]`, c, 3]),
  ...[...sourceBlock.matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/gi)].map((m) => [`source ${m[1]}`, m[2], 4.5]),
];
let bad = 0;
for (const [n, c, min] of checks) for (const [bn, b] of [["BG", BG], ["SURFACE", SURFACE]]) {
  const r = cr(c, b); const ok = r >= min; if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${n} ${c} on ${bn}: ${r.toFixed(2)} (need ${min})`);
}
console.log(bad ? `${bad} failing` : "all pass");
process.exit(bad ? 1 : 0);
