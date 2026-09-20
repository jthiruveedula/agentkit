#!/bin/sh
# agentkit installer -- symlinks (default) or copies (--copy) the built
# dist/<tool>/ output into each tool's global config location.
# Idempotent: re-running never clobbers a file this installer didn't create.
#
# Usage:
#   ./install.sh [--tools=claude,copilot,cursor,antigravity] [--copy] [--dry-run] [--with-external] [--with-boost]
#   ./install.sh upgrade    # git pull + re-link with your last-used --tools,
#                            # prunes symlinks for any skill removed upstream
#   ./install.sh uninstall
#   ./install.sh version    # show installed vs. latest released version
#
# --with-external also fetches every source pinned in external/skills.lock.json
# (scripts/sync-external.sh) in the same run, so a fresh machine is fully set
# up -- native and external skills both -- in one command.
#
# --with-boost installs jfrog/boost (CLI output compression -- fewer tokens
# spent on shell noise) and wires it into every tool named in --tools. THIS
# ACCEPTS JFROG'S ONLINE PREVIEW AGREEMENT NON-INTERACTIVELY (boost.jfrog.com
# /preview-agreement) and sends them command metadata (timing, exit codes,
# token savings -- never raw output or file contents). Pass it only once you
# already agree to those terms; it is never on by default.
#
# Env overrides: AGENTKIT_HOME (repo clone, default: this script's dir),
# CURSOR_HOME (default ~/.cursor), ANTIGRAVITY_HOME (default ~/.antigravity).
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENTKIT_HOME=${AGENTKIT_HOME:-"$SCRIPT_DIR"}
DIST="$AGENTKIT_HOME/dist"
MANIFEST_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/agentkit"
MANIFEST="$MANIFEST_DIR/manifest.tsv"
TOOLS_FILE="$MANIFEST_DIR/tools"

TOOLS=""
TOOLS_GIVEN=0
MODE=link   # link | copy
DRY_RUN=0
ACTION=install
WITH_EXTERNAL=0
WITH_BOOST=0

for arg in "$@"; do
  case "$arg" in
    --tools=*) TOOLS="${arg#--tools=}"; TOOLS_GIVEN=1 ;;
    --copy) MODE=copy ;;
    --dry-run) DRY_RUN=1 ;;
    --with-external) WITH_EXTERNAL=1 ;;
    --with-boost) WITH_BOOST=1 ;;
    upgrade) ACTION=upgrade ;;
    uninstall) ACTION=uninstall ;;
    version) ACTION=version ;;
    -h|--help)
      sed -n '2,25p' "$0"; exit 0 ;;
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

# prune_stale -- drop any manifest entry whose symlink target no longer
# exists in dist/ (the source skill/agent was removed upstream), so an
# upgrade doesn't leave a dangling link behind.
prune_stale() {
  [ -s "$MANIFEST" ] || return 0
  tmp="$MANIFEST.tmp.$$"
  : > "$tmp"
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if [ -L "$path" ]; then
      target=$(readlink "$path")
      case "$target" in
        "$DIST"/*)
          if [ ! -e "$target" ]; then
            [ "$DRY_RUN" = 1 ] || rm -f "$path"
            log "  pruned (removed upstream): $path"
            continue
          fi
          ;;
      esac
    fi
    printf '%s\n' "$path" >> "$tmp"
  done < "$MANIFEST"
  [ "$DRY_RUN" = 1 ] || mv "$tmp" "$MANIFEST"
  rm -f "$tmp" 2>/dev/null || true
}

show_version() {
  if ! git -C "$AGENTKIT_HOME" rev-parse --git-dir >/dev/null 2>&1; then
    log "installed: unknown (not a git clone)"
    return 0
  fi
  installed=$(git -C "$AGENTKIT_HOME" describe --tags --always 2>/dev/null || echo unknown)
  log "installed: $installed"
  git -C "$AGENTKIT_HOME" fetch --tags --quiet origin 2>/dev/null || {
    warn "could not reach origin to check the latest version"
    return 0
  }
  latest=$(git -C "$AGENTKIT_HOME" tag --list 'v*' --sort=-v:refname | head -n1)
  [ -n "$latest" ] && log "latest:    $latest"
  if [ -n "$latest" ] && [ "$installed" != "$latest" ]; then
    log "-> run './install.sh upgrade' to update"
  fi
}

do_upgrade() {
  if ! git -C "$AGENTKIT_HOME" rev-parse --git-dir >/dev/null 2>&1; then
    err "$AGENTKIT_HOME is not a git clone -- can't auto-upgrade; git pull it yourself, or re-clone"
    return 1
  fi
  before=$(git -C "$AGENTKIT_HOME" rev-parse --short HEAD)
  log "pulling latest agentkit into $AGENTKIT_HOME ..."
  [ "$DRY_RUN" = 1 ] || git -C "$AGENTKIT_HOME" pull --ff-only
  after=$(git -C "$AGENTKIT_HOME" rev-parse --short HEAD 2>/dev/null || echo "$before")
  [ "$before" = "$after" ] && log "already up to date ($before)" || log "updated $before -> $after"

  if [ "$TOOLS_GIVEN" = 0 ] && [ -f "$TOOLS_FILE" ]; then
    TOOLS=$(cat "$TOOLS_FILE")
  fi
  TOOLS=${TOOLS:-claude,copilot,cursor,antigravity}

  prune_stale
  run_install
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

run_install() {
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
  [ "$DRY_RUN" = 1 ] || printf '%s' "$TOOLS" > "$TOOLS_FILE"

  if [ "$WITH_EXTERNAL" = 1 ]; then
    log "fetching pinned external skill sources..."
    if [ "$DRY_RUN" = 1 ]; then
      log "  would run: $AGENTKIT_HOME/scripts/sync-external.sh"
    else
      "$AGENTKIT_HOME/scripts/sync-external.sh" || warn "sync-external.sh failed -- native skills are still installed; re-run it yourself when ready"
    fi
  fi

  [ "$WITH_BOOST" = 1 ] && with_boost

  log "done. re-run any time -- already-linked files are skipped, edits outside agentkit are backed up, never overwritten."
}

# with_boost -- installs jfrog/boost if missing, wires it into every tool in
# $TOOLS boost supports (claude, cursor, copilot). Accepts JFrog's Online
# Preview Agreement non-interactively -- only reached when the caller passed
# --with-boost, which is the consent (see install.sh's own header comment).
with_boost() {
  log "boost (CLI output compression):"
  if [ "$DRY_RUN" = 1 ]; then
    log "  would install/wire boost for: $TOOLS (accepts JFrog's Online Preview Agreement)"
    return 0
  fi

  if ! command -v boost >/dev/null 2>&1; then
    log "  installing boost (boost.jfrog.com, preview software)..."
    if ! curl -fsSL https://boost.jfrog.com/install.sh | sh; then
      warn "boost install failed -- skipping; re-run with --with-boost once resolved"
      return 0
    fi
  fi
  if ! command -v boost >/dev/null 2>&1; then
    warn "boost installed but not on PATH yet -- open a new shell, then run: boost init --accept-terms"
    return 0
  fi

  OLD_IFS=$IFS; IFS=','
  for tool in $TOOLS; do
    IFS=$OLD_IFS
    case "$tool" in
      claude|cursor|copilot)
        boost init "--$tool" --accept-terms >/dev/null 2>&1 \
          && log "  wired: $tool (takes effect on its next session/reload)" \
          || warn "  boost init --$tool failed -- see 'boost init --$tool --dry-run' for why"
        ;;
      antigravity) : ;;  # not a boost-supported target yet
      *) : ;;
    esac
    IFS=','
  done
  IFS=$OLD_IFS
}

if [ ! -d "$DIST" ]; then
  err "dist/ not found under $AGENTKIT_HOME -- is this a full clone of the agentkit repo?"
  exit 1
fi

case "$ACTION" in
  uninstall) do_uninstall; exit 0 ;;
  version) show_version; exit 0 ;;
  upgrade) do_upgrade; exit 0 ;;
esac

TOOLS=${TOOLS:-claude,copilot,cursor,antigravity}
run_install
