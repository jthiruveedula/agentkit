#!/bin/sh
# agentkit installer -- symlinks (default) or copies (--copy) the built
# dist/<tool>/ output into each tool's global config location.
# Idempotent: re-running never clobbers a file this installer didn't create.
#
# Usage:
#   ./install.sh [--tools=claude,copilot,cursor,antigravity] [--copy] [--dry-run] [--with-external] [--with-boost]
#   ./install.sh upgrade    # git pull + re-link with your last-used --tools,
#                            # prunes stale installs (symlink or --copy mode)
#                            # for any skill removed upstream
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

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
AGENTKIT_HOME=${AGENTKIT_HOME:-"$SCRIPT_DIR"}
DIST="$AGENTKIT_HOME/dist"
MANIFEST_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/agentkit"
MANIFEST="$MANIFEST_DIR/manifest.tsv"
TOOLS_FILE="$MANIFEST_DIR/tools"

TOOLS=""
TOOLS_GIVEN=0
MODE="link"   # link | copy
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

# fetch_url URL DEST -- download URL to DEST, up to 3 attempts with backoff.
# Returns 0 on success.
fetch_url() {
  _url=$1; _dest=$2; _attempt=1
  while [ "$_attempt" -le 3 ]; do
    if curl -fsSL -o "$_dest" "$_url"; then
      return 0
    fi
    warn "download failed (attempt $_attempt/3): $_url"
    _attempt=$((_attempt + 1))
    if [ "$_attempt" -le 3 ]; then
      sleep "$((_attempt * 2))"
    fi
  done
  return 1
}

# file_sha256 FILE -- print FILE's SHA-256 hex digest, or nothing when
# neither sha256sum nor shasum is available.
file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 < "$1" | awk '{print $1}'
  fi
}

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
  # Claude Code lists installed skills itself, so the AGENTS.md catalog is
  # not linked over ~/.claude/CLAUDE.md (that displaced the user's own
  # global instructions and re-sent ~3k tokens every turn). Undo the link
  # older versions made, restoring the newest backup if there is one.
  if [ -L "$base/CLAUDE.md" ] && [ "$(readlink "$base/CLAUDE.md")" = "$AGENTKIT_HOME/AGENTS.md" ]; then
    bak=$(ls -t "$base"/CLAUDE.md.bak.* 2>/dev/null | head -n 1)
    if [ "$DRY_RUN" != 1 ]; then
      rm -f "$base/CLAUDE.md"
      [ -n "$bak" ] && mv "$bak" "$base/CLAUDE.md"
    fi
    log "  unlinked legacy CLAUDE.md -> AGENTS.md${bak:+ (restored $bak)}"
  fi
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

# dist_source_for_copy DEST -- print the dist/ (or repo) path a --copy
# install would have copied DEST from, or nothing when DEST doesn't match a
# known install layout. Keep in sync with install_claude/copilot/cursor/
# antigravity above.
dist_source_for_copy() {
  p=$1
  claude_base="${CLAUDE_HOME:-$HOME/.claude}"
  cursor_base="${CURSOR_HOME:-$HOME/.cursor}"
  antigravity_base="${ANTIGRAVITY_HOME:-$HOME/.antigravity}"
  case "$(uname -s)" in
    Darwin) copilot_base="$HOME/Library/Application Support/Code/User" ;;
    *)      copilot_base="$HOME/.config/Code/User" ;;
  esac
  case "$p" in
    "$claude_base"/skills/*)                 src="$DIST/claude/skills/$(basename "$p")" ;;
    "$claude_base"/agents/*)                 src="$DIST/claude/agents/$(basename "$p")" ;;
    "$claude_base"/CLAUDE.md)                src="$AGENTKIT_HOME/AGENTS.md" ;;
    "$copilot_base"/instructions/*)          src="$DIST/copilot/instructions/$(basename "$p")" ;;
    "$copilot_base"/copilot-instructions.md) src="$AGENTKIT_HOME/AGENTS.md" ;;
    "$cursor_base"/rules/*)                  src="$DIST/cursor/rules/$(basename "$p")" ;;
    "$HOME"/AGENTS.md)                       src="$AGENTKIT_HOME/AGENTS.md" ;;
    "$antigravity_base"/rules/*)             src="$DIST/antigravity/rules/$(basename "$p")" ;;
    "$antigravity_base"/workflows/*)         src="$DIST/antigravity/workflows/$(basename "$p")" ;;
    *) return 0 ;;
  esac
  printf '%s\n' "$src"
}

# prune_stale -- drop manifest entries whose source no longer exists in
# dist/ (the source skill/agent was removed upstream), so an upgrade
# doesn't leave stale installs behind.
#
# Two cases:
#   * symlink installs (default mode): prune when the link target is under
#     $DIST and no longer exists.
#   * copy installs (--copy): the manifest only records the destination, so
#     the dist source is re-derived with dist_source_for_copy, which mirrors
#     the dest layouts in the install_* functions above. An entry is pruned
#     only when the mapping is recognized AND the dist source is gone;
#     anything unrecognized is kept -- better a stale copy than deleting a
#     file we can't trace back to dist/.
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
    elif [ -e "$path" ]; then
      src=$(dist_source_for_copy "$path")
      if [ -n "$src" ] && [ ! -e "$src" ]; then
        [ "$DRY_RUN" = 1 ] || rm -rf "$path"
        log "  pruned (removed upstream): $path"
        continue
      fi
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
  if [ "$before" = "$after" ]; then
    log "already up to date ($before)"
  else
    log "updated $before -> $after"
  fi

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
    # Backups are named "$path.bak.YYYYMMDDHHMMSS", so the newest is the
    # lexicographically last glob match. (Pure POSIX sh: no ls, no -nt.)
    bak=""
    for _cand in "$path".bak.*; do
      [ -e "$_cand" ] && bak=$_cand
    done
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

# Boost installer pinning. No versioned installer URL exists (boost.jfrog.com
# only serves the rolling install.sh), so the installer itself is pinned by
# SHA-256 instead: it is downloaded to a temp file, verified, and only then
# executed. Refresh: curl -fsSL https://boost.jfrog.com/install.sh -o
# /tmp/boost-install.sh && sha256sum /tmp/boost-install.sh   (macOS:
# shasum -a 256 /tmp/boost-install.sh), then update BOOST_INSTALL_SH_SHA256
# below. A hash mismatch fails closed -- the installer is never executed.
BOOST_INSTALL_URL="https://boost.jfrog.com/install.sh"
BOOST_INSTALL_SH_SHA256="fdc1f7a6b34f2372204b2eb227103a081d125f9d46b84ab3142eb24e1b958509"  # fetched 2026-09-20

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
    tmp_installer=$(mktemp "${TMPDIR:-/tmp}/agentkit-boost-install.XXXXXX" 2>/dev/null) || tmp_installer=""
    if [ -z "$tmp_installer" ]; then
      warn "could not create temp file -- skipping boost install; re-run with --with-boost once resolved"
      return 0
    fi
    if fetch_url "$BOOST_INSTALL_URL" "$tmp_installer"; then
      got_hash=$(file_sha256 "$tmp_installer")
      if [ -n "$got_hash" ] && [ "$got_hash" = "$BOOST_INSTALL_SH_SHA256" ]; then
        sh "$tmp_installer" \
          || warn "boost install failed -- skipping; re-run with --with-boost once resolved"
      elif [ -z "$got_hash" ]; then
        warn "no sha256sum/shasum available -- refusing to run unverified boost installer; re-run with --with-boost once resolved"
      else
        warn "boost installer sha256 mismatch (got $got_hash) -- refusing to run it; upstream may have changed (see pinning comment above)"
      fi
    else
      warn "boost installer download failed -- skipping; re-run with --with-boost once resolved"
    fi
    rm -f "$tmp_installer"
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
        if boost init "--$tool" --accept-terms >/dev/null 2>&1; then
          log "  wired: $tool (takes effect on its next session/reload)"
        else
          warn "  boost init --$tool failed -- see 'boost init --$tool --dry-run' for why"
        fi
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
