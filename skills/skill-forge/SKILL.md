---
name: skill-forge
description: Scaffold a new compliant skill — canonical SKILL.md, reference/scripts/tests dirs, and a golden test stub — from a one-line description. Use when the user asks to create, scaffold, or add a new skill to this repo.
version: 0.1.0
allowed-tools: Bash, Read, Write
---

# Skill Forge

1. Get the skill's kebab-case name and one-line description+trigger from the
   user (ask if not given — this is the one case worth a quick check, a bad
   name means a rename later touches 4 emitted copies).
2. Run the scaffolder:
   ```
   python3 scripts/scaffold.py <name> "<description. Use when <trigger>.>"
   ```
   It creates `skills/<name>/{SKILL.md,reference/,scripts/,tests/}` and
   refuses if the name already exists or fails the schema `validate.py`
   enforces (kebab-case, description 40-500 chars, contains "Use when").
3. Fill in the body under 500 lines; push depth into `reference/`.
4. Run `python3 scripts/validate.py` from the repo root before considering
   it done — new skill must pass frontmatter/link/secret checks like every
   other skill.
5. Run `python3 scripts/build.py` to regenerate the 4 tool adapters and
   `AGENTS.md` — never hand-edit `dist/`.
