---
description: Convert meeting notes or a transcript into action items with owners and dates. Use when the user pastes meeting notes, a transcript or call summary and wants action items extracted.
trigger: model_decision
---

# Meeting to Actions

1. Read the notes fully first; late action items often reference earlier context.
2. Extract only items that are actual commitments ("I'll do X", "let's
   have Y send Z") — not general discussion points or FYIs.
3. Output a flat list: `- [ ] <action> — @<owner> — <date if stated,
   else "no date given">`.
4. If an item has no clear owner, mark it `@unassigned` rather than
   guessing who it falls to.
5. No summary paragraph above or below the list unless asked.

## Token economy

- One pass; no re-read to "double-check"; don't summarize the meeting.
- Output the flat list and stop.
