# Headlines

Most readers read only the headlines. In a deck that is the slide title,
in a document the section heading, in a dashboard the chart title, in a
README the hero line and the feature headings. So the headlines, read
alone and in order, have to be the story.

## Topic label vs action title

A **topic label** names what the section is about. An **action title**
says what is true about it and why that matters.

| Topic label | Action title |
|---|---|
| Q3 Results | Revenue grew 12% in Q3 while support cost stayed flat |
| Overview | Fixing onboarding cut churn 18% in one quarter |
| Architecture | One queue replaces four cron jobs and removes the 3am failures |
| Customer Feedback | Seven of ten churned customers named setup time as the reason |
| Competitive Landscape | Two competitors ship this in Q1, so our window closes in March |
| Roadmap | We ship the guided flow to EU in March and APAC in May |
| Risks | The plan fails if the billing migration slips past April |
| Next Steps | Approve $40k by Friday so the rebuild starts on the 3rd |
| How It Works | The planner switches strategy at 10,000 rows |
| Features | Finds the failing row in 10 seconds, with no config |

The test: cover the body. Does the headline alone tell the reader
something they could agree or disagree with? "Q3 Results" cannot be
wrong. A headline that cannot be wrong has said nothing.

## The recipe

```
<subject> <verb> <number or comparison>, <so-what>
```

1. **Find the claim.** Look at the body and finish the sentence "The
   point of this slide is that ...". What follows "that" is the draft.
2. **Add the number.** One figure, with its unit. Prefer the comparison
   ("from 23 minutes to 4") to the bare value ("4 minutes").
3. **Add the so-what** if the claim does not carry it: a consequence, a
   cause, or a decision. "..., so we can retire the old flow."
4. **Cut to one line.** Aim for 6 to 12 words; 15 is the ceiling. Drop
   "we believe", "it is clear that", "an overview of".
5. **Read it aloud.** If you would not say it to a colleague in a
   corridor, rewrite it in the words you would use.

## Good verbs, weak verbs

Strong headlines use verbs that commit: *cut, doubled, fell, beat, costs,
saves, fails, replaces, needs, blocks*. Weak ones hide behind verbs that
commit to nothing: *impacts, affects, relates to, drives value*. "Pricing
impacts churn" becomes "The March price rise doubled churn among small
teams".

## When there is no number

Not every claim is quantitative. Use a contrast, a cause or a decision:

- Contrast: "The new flow asks four questions; the old one asked fifteen"
- Cause: "Agents quit setup because the first screen asks for a card"
- Decision: "We should retire the legacy importer this quarter"
- Qualitative finding: "Every churned customer we interviewed blamed setup"

Never invent a number to fill the slot. `[number: source?]` in the draft
and a question to the user is the right move.

## Questions as headlines

A question headline is a hook, and it is a debt: the body or the next
headline must pay it. Use at most one or two, at the opening or at the
turn into the resolution ("So why did an index make it slower?"). A deck
of question headlines makes the audience do the work.

## Titles, labels and when a label is fine

- **The document or deck title** may be a name ("storykit", "Q3 Business
  Review"), but the big idea must then appear in the subtitle or the first
  section. Better: make the title the big idea.
- **Appendix, references and backup** sections are filing, not story;
  labels are correct there.
- **Reference docs** (API pages, runbooks) are looked up, not read
  through; they keep topic labels. This guidance is for pieces meant to
  persuade or explain.

## The headline read-through

Before any visual work, list only the headlines:

```
1. Fixing onboarding cut churn 18% in one quarter
2. One in four new accounts quit before finishing setup in Q2
3. Setup took 23 minutes, and every extra minute lost us 2% of signups
4. The guided flow gets a new account live in 4 minutes
5. Churn fell from 7.1% to 5.8% while support tickets halved
6. Approve $40k to rebuild the two remaining flows by March
```

Check four things:

1. **It reads as an argument.** Each line follows from the one before.
2. **No line repeats another.** Two slides with the same claim are one
   slide.
3. **Line 1 is the big idea** (or the hook that sets it up).
4. **The last line is the ask.**

`scripts/story_lint.py` automates the mechanical half of this. Its verb
check is a word list, so it can miss an unusual verb or pass a weak one;
when it disagrees with the cover-the-body test, trust the test and say
so.

## What story_lint.py flags

| Code | Meaning | Fix |
|---|---|---|
| `topic-label` | No verb, under three words, or a how/what/why opener without a verb and a number | Apply the recipe above |
| `long-headline` | Over `--max-words` (default 15); not checked in an appendix | Keep one claim; move the rest to the body |
| `no-headline` | A slide with content and no heading | Give it a claim or merge it into its neighbour |
| `too-many-bullets` | Over `--max-bullets` (default 5) in one section | Split into two claims, or cut to the bullets that prove this one |
| `filler` | A banned stock phrase | Delete it; if the sentence collapses, it had no content |
| `no-hook` | The opening has no claim, number or question | Lead with the big idea |
| `no-ask` | The last non-appendix section has no decision or next step | End on decision, owner, date, cost |
| `duplicate-headline` | The same headline twice | Merge, or give each its own claim |
| `unclosed-fence` | A code fence that never closes; the rest is still linted | Close the fence |

Sections come from `#` to `###` headings. Two or more `---` rules switch
to slides mode, where each slide's first heading is its headline; force
either reading with `--slides` or `--headings`. Setext headings
(underlined with `===` or `---`) are not read as headings. Question
headlines are reported separately and do not count as action titles.
