// WCAG contrast check for the OKLCH tokens in src/styles.css. Exit 1 on failure.
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const block = css.match(/\n:root \{([\s\S]*?)\n\}/)[1];
const srgbToOklch = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]), m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]), s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI]; };
const parse = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*(?:oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)|(#[0-9a-fA-F]{6})\b)/g)].map((m) => [m[1], m[5] ? srgbToOklch(m[5]) : [+m[2], +m[3], +m[4]]]));
const lin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function lum([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((v) => Math.min(1, Math.max(0, lin(Math.min(1, Math.max(0, v))))));
  const ch = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [foreground, background, minimum]. 4.5 text, 3 for graphical marks.
const pairs = [["ink", "bg", 4.5], ["ink", "surface", 4.5], ["muted", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "sunk", 4.5], ["accent", "surface", 4.5], ["accent", "bg", 4.5],
  ["accent-ink", "accent", 4.5], ["ink", "accent-soft", 4.5], ["good", "surface", 3], ["bad", "surface", 3], ["warn-secret", "surface", 3], ["warn-pii", "surface", 3], ["warn-phi", "surface", 3],
  ["bad", "bg", 3], ["good", "bg", 3], ["warn", "surface", 4.5], ["prior", "surface", 3], ["warn", "bg", 3],
  ...["claude_code", "copilot", "cursor", "opencode", "antigravity", "other"].flatMap((s) => [[`src-${s}`, "surface", 3], [`src-${s}`, "bg", 3]]), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`t${i}`, "surface", 3])];
let bad = 0;
const all = parse(block);
for (const [fg, bg, min] of pairs) {
  const r = ratio(all[fg], all[bg]);
  if (r < min) { bad++; console.log(`FAIL ${fg} on ${bg}: ${r.toFixed(2)} < ${min}`); }
}
console.log(bad ? `${bad} failing pairs` : "contrast ok");
process.exit(bad ? 1 : 0);
