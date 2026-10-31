// Move the inlined module script to the end of <body> so the static shell paints before the
// ~500 kB script is parsed (FCP). Idempotent.
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("../../src/prompt_analytics/web/index.html", import.meta.url);
let h = readFileSync(f, "utf8");
const i = h.indexOf('<script type="module"');
const j = h.indexOf("</script>", i) + 9;
if (i > 0 && h.indexOf("</head>") > i) {
  const tag = h.slice(i, j);
  h = h.slice(0, i) + h.slice(j);
  h = h.replace("</body>", () => tag + "\n  </body>");
  writeFileSync(f, h);
}
