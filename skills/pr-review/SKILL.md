---
name: pr-review
description: Review a GitHub pull request for correctness bugs and scope creep, posting inline findings. Use when the user asks to review a PR, "look at PR #N", or check a branch before merge.
version: 0.1.0
allowed-tools: Bash, Read, Grep
---

# PR Review

Thin wrapper around this repo's own review tooling — don't reimplement a
reviewer here.

1. Load the `code-review` skill/command at effort `medium` against the PR
   number or branch given. It reports correctness findings, severity-tagged.
2. Load `scope-creep-detector` (or the `cavecrew-reviewer` subagent if
   available) against the same diff to flag anything outside the PR's
   stated intent.
3. Merge both outputs into one list, most-severe first. Do not duplicate a
   finding both tools raised.
4. If asked to post comments, use `gh pr review <N> --comment` per finding —
   never `--approve`/`--request-changes` without the user explicitly asking
   for that verdict.
