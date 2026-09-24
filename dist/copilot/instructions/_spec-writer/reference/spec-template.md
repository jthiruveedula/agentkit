# Spec template

```markdown
## Problem
One paragraph: who's affected, what's broken/missing.

## Scope
What this change covers.

## Non-goals
What it explicitly does not cover.

## Acceptance criteria
- [ ] Item, testable/observable
- [ ] Item, testable/observable

## Open questions
- Anything the spec can't resolve without the user.

## Tasks
| id | owner | objective | acceptance check | deps |
|---|---|---|---|---|
| t1 | researcher | Locate the code paths this change touches | file:line list handed to t2 | [] |
| t2 | implementer | Make the change per Scope | acceptance criteria items 1-2 pass | [t1] |
| t3 | test-writer | Cover the new branch/edge case | test fails on revert, passes on change | [t2] |
| t4 | reviewer | Check diff against this spec | no open findings vs acceptance criteria | [t2, t3] |
```

Owner must be one of the roster agents: `researcher`, `implementer`,
`test-writer`, `verifier`, `reviewer`, `doc-writer`,
`data-platform-architect`, `pipeline-engineer`, `data-quality-engineer`,
`ml-engineer`.

To hand this off to `orchestrate` for a multi-agent run, translate the
Tasks table into `.agentkit/plan.json` (`id`/`owner`/`objective`/`deps`,
`output` in place of `acceptance check` — see
`skills/orchestrate/reference/plan-format.md`) and validate with:

```
python3 skills/orchestrate/scripts/plan_check.py .agentkit/plan.json
```
