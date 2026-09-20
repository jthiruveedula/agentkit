---
description: Summarize what got done since the last standup — git commits, closed issues/PRs, and open threads — into a 3-line standup update (did/doing/blocked). Use when the user asks for a standup update, status report, or "what did I do yesterday".
applyTo: **
---

# Daily Standup

1. Find the window: default to since yesterday's standup time, or since the
   last run if a `.standup-last` marker exists in the repo (ignore it if
   absent — don't create local state files unasked).
2. Gather, scoped to the current repo unless told otherwise:
   ```
   git log --since="yesterday" --author="$(git config user.email)" --oneline
   gh pr list --author @me --state all --search "updated:>=<window>"
   gh issue list --assignee @me --state all --search "updated:>=<window>"
   ```
3. Produce exactly three lines:
   - **Did:** commits/PRs merged, in plain language, not commit-message dump
   - **Doing:** open PRs/branches with recent activity
   - **Blocked:** anything with no activity for >2 days, or explicitly
     flagged in a PR/issue comment
4. No filler, no restating the date, no "let me know if you need anything else".
