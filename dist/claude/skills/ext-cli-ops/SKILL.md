---
name: ext-cli-ops
description: Wires jfrog/boost's shell-output compression into whichever coding agent is running, so noisy CLI output (test/build/lint/log dumps) stops filling the context window. Use when the user asks to save tokens on CLI/shell output, mentions jfrog Boost by name, or when a session is running many verbose shell commands and the user wants that noise cut.
allowed-tools: Bash, Read
version: 0.1.0
---

# External: boost (CLI token savings)

`jfrog/boost` (preview software, `boost.jfrog.com`) wraps shell commands
and compresses their output — keeps errors/timings/diffs, drops
scrollback — so an agent-heavy session spends tokens on signal, not log
noise. It is **not bundled by default**: installing it means accepting
JFrog's Online Preview Agreement and sending them product metadata
(timing, exit codes, token savings — never raw command output or file
contents). State that plainly before installing; don't install silently.

## Procedure

1. **Check if it's already installed:**
   ```
   command -v boost && boost version
   ```

2. **If not installed, disclose then install** — the four facts to state
   before running anything, per boost's own agent-install guidance:
   - It's preview software under JFrog's Online Preview Agreement
     (`https://boost.jfrog.com/preview-agreement/`)
   - It sends metadata (timing, exit codes, token savings) to JFrog —
     raw output and file contents stay local
   - `DISABLE_BOOST=1 <command>` gets exact unfiltered output on any one
     command
   - Hooks fail open — if a filter breaks, the original command still runs

   Then, once the user has actually agreed (this skill never assumes
   agreement from silence):
   ```
   curl -fsSL https://boost.jfrog.com/install.sh | bash      # macOS/Linux/WSL
   # Windows PowerShell: irm https://boost.jfrog.com/install.ps1 | iex
   command -v boost && boost version
   ```

3. **Wire it into the running agent** — dry-run first, then the real
   thing, matching whichever tool this session is:
   ```
   boost init --claude --dry-run      # or --cursor / --codex / --copilot
   boost init --claude --accept-terms # --accept-terms only with explicit user OK
   ```
   Takes effect on the tool's next session/reload — say so, don't claim
   it's live immediately.

4. **Verify:**
   ```
   boost version
   boost report -t     # terminal savings summary, no browser needed
   ```

5. **Uninstall/rollback**, if asked:
   ```
   boost init --claude --uninstall
   ```

## Also available via agentkit

`./install.sh --with-boost` runs steps 2–3 above (Claude Code target) as
part of a normal agentkit install — still requires the same explicit
consent; the flag itself only exists because the user already agreed to
it once, not a standing "always install" default. See the root `README.md`
§ CLI token savings.

## Token economy

- Route verbose commands (test/build/lint/log dumps) through boost —
  unfiltered scrollback is the biggest CLI token sink there is.
- Prefer `--quiet` / `--format=short` / `jq` field selection on every CLI
  call, boost or not.
- Need exact raw output once? Use `DISABLE_BOOST=1 <command>` — don't
  debug blind through a filter.
- General read/search/output patterns live in the `token-saver` skill —
  don't duplicate them here.
