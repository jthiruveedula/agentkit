#!/bin/sh
# Fetch each pinned source in external/skills.lock.json at its locked SHA
# into external/<name>/ (gitignored -- these are reference checkouts, not
# vendored into this repo's history or license).
#
# Usage: ./scripts/sync-external.sh [name ...]   # default: all sources
#
# Each download is retried up to 3 times with backoff. When a lock entry
# carries a "sha256" field, the downloaded tarball's SHA-256 is verified
# before extraction (needs sha256sum or shasum -a 256 on PATH; when neither
# exists, verification is skipped with a warning).
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK="$SCRIPT_DIR/external/skills.lock.json"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

warn() { printf 'warn: %s\n' "$*" >&2; }

# sha256_of FILE -- print FILE's SHA-256 hex digest, or nothing when no
# suitable tool is on PATH. Prefers sha256sum (Linux), falls back to
# shasum -a 256 (macOS).
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 < "$1" | awk '{print $1}'
  fi
}

# fetch_one NAME REPO SHA WANT_SHA256 -- download, optionally verify, and
# extract one source into external/$NAME. Returns 0 on success, 1 when the
# source was skipped (already reported).
fetch_one() {
  _name=$1; _repo=$2; _sha=$3; _want_sha256=$4
  _dest="$SCRIPT_DIR/external/$_name"
  echo "==> $_name ($_repo @ ${_sha%${_sha#??????}}...)"
  rm -rf "$_dest.tmp"
  mkdir -p "$_dest.tmp"
  _archive="$_dest.tmp/archive.tar.gz"

  _attempt=1
  _downloaded=0
  while [ "$_attempt" -le 3 ]; do
    if curl -fsSL -o "$_archive" "https://github.com/$_repo/archive/$_sha.tar.gz"; then
      _downloaded=1
      break
    fi
    warn "$_name: download failed (attempt $_attempt/3)"
    _attempt=$((_attempt + 1))
    if [ "$_attempt" -le 3 ]; then
      sleep "$((_attempt * 2))"
    fi
  done
  if [ "$_downloaded" -ne 1 ]; then
    echo "error: $_name: download failed after 3 attempts -- skipped" >&2
    rm -rf "$_dest.tmp"
    return 1
  fi

  if [ -n "$_want_sha256" ]; then
    _got=$(sha256_of "$_archive")
    if [ -z "$_got" ]; then
      warn "$_name: sha256 pinned but neither sha256sum nor shasum is available -- skipping verification"
    elif [ "$_got" != "$_want_sha256" ]; then
      echo "error: $_name: sha256 mismatch (got $_got) -- skipped" >&2
      rm -rf "$_dest.tmp"
      return 1
    else
      echo "  sha256 ok"
    fi
  fi

  if ! tar -xz -f "$_archive" -C "$_dest.tmp" --strip-components=1; then
    echo "error: $_name: extraction failed -- skipped" >&2
    rm -rf "$_dest.tmp"
    return 1
  fi
  rm -rf "$_dest"
  mv "$_dest.tmp" "$_dest"
  return 0
}

WANT="$*"
count=0
while IFS='|' read -r name repo sha sha256; do
  if [ -n "$WANT" ]; then
    case " $WANT " in *" $name "*) ;; *) continue ;; esac
  fi
  if fetch_one "$name" "$repo" "$sha" "$sha256"; then
    count=$((count + 1))
  else
    warn "$name: not synced"
  fi
done <<EOF
$(jq -r '.sources[] | "\(.name)|\(.repo)|\(.sha)|\(.sha256 // "")"' "$LOCK")
EOF

echo "synced $count source(s) into external/"
