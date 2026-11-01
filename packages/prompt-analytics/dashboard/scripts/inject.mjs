// usage: node scripts/inject.mjs <data.json> <out.html>  (copy of the build with data injected; never writes to web/)
import { readFileSync, writeFileSync } from "node:fs";
const [data, out] = process.argv.slice(2);
const html = readFileSync(new URL("../../src/prompt_analytics/web/index.html", import.meta.url), "utf8");
const json = JSON.stringify(JSON.parse(readFileSync(data, "utf8"))).replace(/</g, "\\u003c");
const tag = '<script type="application/json" id="pa-data">null</script>';
if (!html.includes(tag)) throw new Error("data tag not found");
writeFileSync(out, html.replace(tag, () => `<script type="application/json" id="pa-data">${json}</script>`));
