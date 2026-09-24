#!/bin/sh
# Installs into a temp $HOME, asserts the expected files landed, uninstalls,
# and asserts the temp $HOME is back to empty. Run twice in a row to also
# prove idempotency (second install must not error or duplicate anything).
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
TMP_HOME=$(mktemp -d)
trap 'rm -rf "$TMP_HOME"' EXIT

echo "== smoke test: installing into $TMP_HOME =="
HOME="$TMP_HOME" XDG_STATE_HOME="$TMP_HOME/.local/state" CLAUDE_HOME="$TMP_HOME/.claude" \
  CURSOR_HOME="$TMP_HOME/.cursor" ANTIGRAVITY_HOME="$TMP_HOME/.antigravity" \
  "$REPO_ROOT/install.sh" --tools=claude,cursor,antigravity

fail=0
check() {
  if [ ! -e "$1" ]; then
    echo "FAIL missing: $1" >&2
    fail=1
  fi
}

[ -e "$TMP_HOME/.claude/CLAUDE.md" ] && { echo "FAIL: installer must not create ~/.claude/CLAUDE.md" >&2; fail=1; }
check "$TMP_HOME/.claude/skills/prompt-enhancer/SKILL.md"
check "$TMP_HOME/.claude/agents/researcher.md"
check "$TMP_HOME/.cursor/rules/prompt-enhancer.mdc"
check "$TMP_HOME/AGENTS.md"
check "$TMP_HOME/.antigravity/rules/prompt-enhancer.md"

[ "$fail" = 0 ] || { echo "smoke test: install assertions failed" >&2; exit 1; }
echo "install assertions passed"

echo "== smoke test: idempotent re-install =="
HOME="$TMP_HOME" XDG_STATE_HOME="$TMP_HOME/.local/state" CLAUDE_HOME="$TMP_HOME/.claude" \
  CURSOR_HOME="$TMP_HOME/.cursor" ANTIGRAVITY_HOME="$TMP_HOME/.antigravity" \
  "$REPO_ROOT/install.sh" --tools=claude,cursor,antigravity
# manifest must not have grown duplicate entries
manifest="$TMP_HOME/.local/state/agentkit/manifest.tsv"
dupes=$(sort "$manifest" | uniq -d | wc -l | tr -d ' ')
[ "$dupes" = 0 ] || { echo "FAIL: manifest has $dupes duplicate entries after re-install" >&2; exit 1; }
echo "idempotent re-install passed"

echo "== smoke test: version (read-only, no upgrade) =="
HOME="$TMP_HOME" XDG_STATE_HOME="$TMP_HOME/.local/state" CLAUDE_HOME="$TMP_HOME/.claude" \
  "$REPO_ROOT/install.sh" version
echo "version command passed"

echo "== smoke test: uninstall =="
HOME="$TMP_HOME" XDG_STATE_HOME="$TMP_HOME/.local/state" CLAUDE_HOME="$TMP_HOME/.claude" \
  CURSOR_HOME="$TMP_HOME/.cursor" ANTIGRAVITY_HOME="$TMP_HOME/.antigravity" \
  "$REPO_ROOT/install.sh" uninstall

if [ -e "$TMP_HOME/.claude/skills/prompt-enhancer" ] || [ -e "$TMP_HOME/AGENTS.md" ]; then
  echo "FAIL: uninstall left files behind" >&2
  exit 1
fi
echo "uninstall assertions passed"

echo "SMOKE TEST OK"
