#!/bin/sh
# agentkit installer -- symlinks (default) or copies (--copy) the built
# dist/<tool>/ output into each tool's global config location.
# Idempotent: re-running never clobbers a file this installer didn't create.
#
# Usage:
#   ./install.sh [--tools=claude,copilot,cursor,antigravity] [--copy] [--dry-run]
#   ./install.sh uninstall
#
# Env overrides: AGENTKIT_HOME (repo clone, default: this script's dir),
# CURSOR_HOME (default ~/.cursor), ANTIGRAVITY_HOME (default ~/.antigravity).
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENTKIT_HOME=${AGENTKIT_HOME:-"$SCRIPT_DIR"}
DIST="$AGENTKIT_HOME/dist"
MANIFEST_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/agentkit"
MANIFEST="$MANIFEST_DIR/manifest.tsv"

TOOLS="claude,copilot,cursor,antigravity"
MODE=link   # link | copy
DRY_RUN=0
ACTION=install

for arg in "$@"; do
  case "$arg" in
    --tools=*) TOOLS="${arg#--tools=}" ;;
    --copy) MODE=copy ;;
    --dry-run) DRY_RUN=1 ;;
    uninstall) ACTION=uninstall ;;
    -h|--help)
      sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '%s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
err()  { printf 'error: %s\n' "$*" >&2; }

mkdir -p "$MANIFEST_DIR"
touch "$MANIFEST"

# link_one SRC DEST -- installs one file/dir, backing up a pre-existing
# non-agentkit target instead of overwriting it.
link_one() {
  src=$1; dest=$2
  [ -e "$src" ] || return 0

  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
    return 0  # already ours, nothing to do
  fi

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if grep -qxF "$dest" "$MANIFEST" 2>/dev/null; then
      : # a previous agentkit target we're about to replace with a fresher link
    else
      ts=$(date +%Y%m%d%H%M%S)
      bak="$dest.bak.$ts"
      warn "$dest exists and is not managed by agentkit -- backing up to $bak"
      [ "$DRY_RUN" = 1 ] || mv "$dest" "$bak"
    fi
  fi

  [ "$DRY_RUN" = 1 ] && { log "  would install: $dest"; return 0; }

  mkdir -p "$(dirname -- "$dest")"
  rm -rf "$dest"
  if [ "$MODE" = link ]; then
    ln -s "$src" "$dest"
  else
    cp -R "$src" "$dest"
  fi
  grep -qxF "$dest" "$MANIFEST" || printf '%s\n' "$dest" >> "$MANIFEST"
  log "  installed: $dest"
}

install_claude() {
  log "claude:"
  base="${CLAUDE_HOME:-$HOME/.claude}"
  mkdir -p "$base"
  for d in "$DIST"/claude/skills/*; do
    [ -d "$d" ] || continue
    link_one "$d" "$base/skills/$(basename "$d")"
  done
  for f in "$DIST"/claude/agents/*.md; do
    [ -f "$f" ] || continue
    link_one "$f" "$base/agents/$(basename "$f")"
  done
  link_one "$AGENTKIT_HOME/AGENTS.md" "$base/CLAUDE.md"
}

install_copilot() {
  log "copilot:"
  # VS Code user prompts dir differs by OS; fall back to a conventional path.
  case "$(uname -s)" in
    Darwin) base="$HOME/Library/Application Support/Code/User" ;;
    Linux)  base="$HOME/.config/Code/User" ;;
    *)      base="$HOME/.config/Code/User" ;;
  esac
  mkdir -p "$base"
  link_one "$AGENTKIT_HOME/AGENTS.md" "$base/copilot-instructions.md"
  for f in "$DIST"/copilot/instructions/*.instructions.md; do
    [ -f "$f" ] || continue
    link_one "$f" "$base/instructions/$(basename "$f")"
  done
}

install_cursor() {
  log "cursor:"
  base="${CURSOR_HOME:-$HOME/.cursor}"
  mkdir -p "$base"
  for f in "$DIST"/cursor/rules/*.mdc; do
    [ -f "$f" ] || continue
    link_one "$f" "$base/rules/$(basename "$f")"
  done
  link_one "$AGENTKIT_HOME/AGENTS.md" "$HOME/AGENTS.md"
}

install_antigravity() {
  log "antigravity:"
  base="${ANTIGRAVITY_HOME:-$HOME/.antigravity}"
  mkdir -p "$base"
  for f in "$DIST"/antigravity/rules/*.md; do
    [ -f "$f" ] || continue
    link_one "$f" "$base/rules/$(basename "$f")"
  done
  for f in "$DIST"/antigravity/workflows/*.md; do
    [ -f "$f" ] || continue
    link_one "$f" "$base/workflows/$(basename "$f")"
  done
}

do_uninstall() {
  [ -s "$MANIFEST" ] || { log "nothing to uninstall (no manifest at $MANIFEST)"; return 0; }
  while IFS= read -r path; do
    [ -e "$path" ] || [ -L "$path" ] || continue
    [ "$DRY_RUN" = 1 ] && { log "  would remove: $path"; continue; }
    rm -rf "$path"
    bak=$(ls -td -- "$path".bak.* 2>/dev/null | head -n1 || true)
    if [ -n "$bak" ]; then
      mv "$bak" "$path"
      log "  removed: $path (restored backup $bak)"
    else
      log "  removed: $path"
    fi
  done < "$MANIFEST"
  [ "$DRY_RUN" = 1 ] || : > "$MANIFEST"
  log "uninstall complete"
}

if [ ! -d "$DIST" ]; then
  err "dist/ not found under $AGENTKIT_HOME -- is this a full clone of the agentkit repo?"
  exit 1
fi

if [ "$ACTION" = uninstall ]; then
  do_uninstall
  exit 0
fi

log "agentkit install ($MODE mode) -- tools: $TOOLS"
OLD_IFS=$IFS; IFS=','
for tool in $TOOLS; do
  IFS=$OLD_IFS
  case "$tool" in
    claude) install_claude ;;
    copilot) install_copilot ;;
    cursor) install_cursor ;;
    antigravity) install_antigravity ;;
    *) warn "unknown tool '$tool', skipping" ;;
  esac
  IFS=','
done
IFS=$OLD_IFS

log "done. re-run any time -- already-linked files are skipped, edits outside agentkit are backed up, never overwritten."
