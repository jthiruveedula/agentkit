---
name: ext-systems-design
description: Route system design and scalability questions to the pinned anthropics/skills and ashishps1/awesome-system-design-resources sources. Use when actively making a system design decision (architecture, scaling, DB/cache/queue trade-offs, CAP, sharding) and want deeper reference material than general knowledge.
version: 0.1.0
allowed-tools: Bash, Read, Grep
---

# External: system design / scalability

Two pinned sources in `external/skills.lock.json`:

| Source | Repo | License | Use for |
|---|---|---|---|
| `anthropic-skills` | anthropics/skills | NOASSERTION | a skills collection under `skills/` |
| `systems-design-resources` | ashishps1/awesome-system-design-resources | **GPL-3.0** | a curated reference/reading list — substituted in for `ryanthedev/systems-design`, which 404s |

**`systems-design-resources` is reference-only.** Read it for guidance
(what to consider, what to read next); never copy its text or diagrams
verbatim into a skill body or into code — GPL-3.0 terms don't mix cleanly
into this MIT repo's authored content.

1. Sync whichever the task needs:
   ```
   ./scripts/sync-external.sh anthropic-skills systems-design-resources
   ```
2. `anthropic-skills`: `ls external/anthropic-skills/skills/`, find and
   follow the matching `SKILL.md`.
3. `systems-design-resources`: read the relevant section of its README/
   docs for background, then write your own answer in your own words.
4. For a live, in-context reference pass instead of a one-off read, the
   `system-design-resources` Claude Code skill (if installed) covers the
   same ground — prefer it when already loaded in the session.
