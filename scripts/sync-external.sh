#!/bin/sh
# Fetch each pinned source in external/skills.lock.json at its locked SHA
# into external/<name>/ (gitignored -- these are reference checkouts, not
# vendored into this repo's history or license).
#
# Usage: ./scripts/sync-external.sh [name ...]   # default: all sources
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK="$SCRIPT_DIR/external/skills.lock.json"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

WANT="$*"
count=0
while IFS='|' read -r name repo sha; do
  if [ -n "$WANT" ]; then
    case " $WANT " in *" $name "*) ;; *) continue ;; esac
  fi
  dest="$SCRIPT_DIR/external/$name"
  echo "==> $name ($repo @ ${sha%${sha#??????}}...)"
  rm -rf "$dest.tmp"
  mkdir -p "$dest.tmp"
  curl -fsSL "https://github.com/$repo/archive/$sha.tar.gz" \
    | tar -xz -C "$dest.tmp" --strip-components=1
  rm -rf "$dest"
  mv "$dest.tmp" "$dest"
  count=$((count + 1))
done <<EOF
$(jq -r '.sources[] | "\(.name)|\(.repo)|\(.sha)"' "$LOCK")
EOF

echo "synced $count source(s) into external/"
