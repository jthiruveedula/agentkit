#!/bin/sh
# Re-capture screenshots + bounding boxes from the MOCK dashboard (see capture.mjs).
# Builds the dashboard into out/dash (never the tracked web/index.html), inlines
# src/data/sample.dev.json into <script id="pa-data">, and opens it as a file:// page.
set -e
cd "$(dirname "$0")"
D=../../packages/prompt-analytics/dashboard
(cd "$D" && npx vite build --outDir "$OLDPWD/out/dash" --emptyOutDir)
python3 - out/dash/index.html "$D/src/data/sample.dev.json" <<'EOF'
import json, sys
f, d = sys.argv[1:]
h = open(f).read()
old = '<script type="application/json" id="pa-data">null</script>'
assert h.count(old) == 1, "pa-data placeholder not found"
data = json.dumps(json.load(open(d)), separators=(",", ":")).replace("</", "<\\/")
open(f, "w").write(h.replace(old, '<script type="application/json" id="pa-data">' + data + "</script>"))
EOF
sed -e "s|__ROOT__|$PWD|" -e "s|__BASE__|file://$PWD/out/dash/index.html|" capture.mjs | ego-browser nodejs
