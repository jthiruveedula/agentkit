#!/usr/bin/env bash
# Regenerate site/assets/og.png (1200x630) from the hero of site/index.html.
# Uses an already-installed Chrome/Chromium/Edge; installs nothing.
#   Usage: bash site/scripts/build-og.sh   (override browser with CHROME=/path)
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
browser=${CHROME:-}
if [ -z "$browser" ]; then
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)" \
    "$(ls -d "$HOME"/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell 2>/dev/null | sort -V | tail -1)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then browser=$c; break; fi
  done
fi
[ -n "$browser" ] || { echo "no Chrome/Chromium found; set CHROME=/path/to/browser" >&2; exit 1; }

tmp=$(mktemp -d)
srv=
trap '[ -z "$srv" ] || kill "$srv" 2>/dev/null; rm -rf "$tmp"' EXIT

# Work on a copy so the live page is untouched: hide the nav, freeze animations.
cp -R "$root/site" "$tmp/site"
sed -i.bak 's#</head>#<style>.nav,\#readout{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}</style></head>#' "$tmp/site/index.html"

port=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$tmp/site" >/dev/null 2>&1 &
srv=$!
sleep 1

"$browser" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot="$tmp/og.png" "http://127.0.0.1:$port/index.html" >/dev/null 2>&1
cp "$tmp/og.png" "$root/site/assets/og.png"
echo "wrote site/assets/og.png"
