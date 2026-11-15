---
name: data-storytelling
description: Shapes analysis, metrics, a feature or a project into a memorable story with a big idea, structure, storyboard, action titles and a closing ask. Use when drafting or reviewing a deck, explainer, exec update, launch post, README hero, dashboard narrative or demo-video script.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/story_lint.py *), Bash(python3 scripts/story_lint.py *), Read
version: 0.1.0
---

# Data Storytelling

An audience keeps one sentence and forgets the rest. Decide which sentence
before you open a slide tool, then make every headline, number and example
earn its place by carrying that sentence. Work like an editor: the draft is
done when nothing more can be cut, and the reader knows what to do next.

## Procedure

1. **Write the big idea first.** One sentence, before any outline:

   ```
   For <audience>: <what changes>, because <evidence>, so <decide or do X> by <when>.
   ```

   It names who is listening, what is at stake for them, and why now. Two
   sentences means two stories: pick one and park the other. If the user
   has not said who the audience is or what they should do afterwards, ask
   those two questions and nothing else.

2. **Pick the structure the audience needs**, not the order you did the
   work in. Details and worked skeletons: `reference/structures.md`.

   | Piece | Structure | Opens with |
   |---|---|---|
   | Exec update, decision memo | SCQA / Minto pyramid | The answer and the ask |
   | Launch post, README hero, demo video | Before-after-bridge or hero's journey | The reader's bad day |
   | Analysis, metrics review, dashboard | One number | The number, then its comparison |
   | Explainer, tech talk, tutorial | Problem-tension-resolution | A question the audience now wants answered |

3. **Storyboard at sticky-note size.** One line per beat, 5 to 9 beats,
   no visuals yet. Read only those lines top to bottom: they must tell the
   whole story to someone who sees nothing else. Reorder and delete now,
   while a beat costs one line.

4. **Turn every beat into an action title.** A headline is a full-sentence
   claim with its so-what, ideally a number: "Churn fell 18% after we fixed
   onboarding", never "Q3 Results". Rewrite recipes: `reference/headlines.md`.

5. **One idea per slide or section.** The body exists to prove its
   headline. Two claims make two slides; evidence that proves neither goes
   to an appendix or out.

6. **Climb the ladder of abstraction.** Open each point on the ground with
   one case (a named customer, one row, one screenshot, one bad Tuesday),
   then state the general point it stands for. Give every number a
   comparison (versus last quarter, the target, a competitor) and a human
   scale ("one in four new accounts").

7. **Build tension, then pay it off.** Set what is against what could be,
   before against after, the expected against the surprising. Name the
   cost of doing nothing. Make the audience want the answer before giving
   it, except for executives, who get the answer first and the tension as
   proof.

8. **End on the ask.** The last section states the decision, the owner,
   the date and the cost. Never end on "Thank you" or "Questions?": the
   final screen stays up longest, so it carries the ask.

9. **Cut, then set density for the medium.** Remove a third: every beat
   that does not move the big idea, every hedge, every second example.
   Spoken decks carry one claim and one visual per slide and the words
   live in the speaker notes. Read-alone documents carry full sentences
   and their evidence on the page. See `reference/editing.md`.

10. **Lint the outline** and fix what it finds
    (re-run until clean, max 3 attempts, then report what remains and why):

    ```
    python3 scripts/story_lint.py outline.md --strict
    ```

    It flags topic-label headlines, filler phrases, bullet overload
    (`--max-bullets`, default 5), a missing opening hook, a missing closing
    ask, duplicated headlines and an unclosed code fence. `--json` for
    machine output; `-` reads stdin. Two or more `---` rules mean a slide
    deck; force it with `--slides` or `--headings`. A clean lint is a floor: it cannot tell whether the story is
    true or worth telling.

11. **Hand off the build.** Diagrams go to `ext-diagrams`; Word, Excel,
    PDF and PowerPoint styling to `doc-standards`. If a `chart-design` or
    `ext-slides` skill is installed, charts and HTML decks go there;
    otherwise build them here from the outline. Hand over the linted
    outline, not a blank page.

## Rules

- **Never invent evidence.** No made-up numbers, quotes, customers or
  dates. Write `[number: source?]` and ask; a placeholder is honest, a
  plausible figure is not.
- **Plain words.** No stock openers ("In today's fast-paced world"), no
  hype adjectives, no "delve", no lists of three padded to feel complete.
  If a sentence could sit in any deck about anything, cut it.
- **The story serves the decision.** Do not bend the data to fit the arc.
  Say what the evidence does not show; a stated limit buys trust for the
  claims that remain.
- **Keep the user's voice and facts.** Restructure and sharpen; do not
  swap in a different conclusion than the analysis supports.

## Token economy

Lint first: `story_lint.py` on an existing draft costs a few hundred tokens and names the lines to fix, so read only those. Load one reference file per need (`structures.md` to choose an arc, `headlines.md` to rewrite titles, `editing.md` to cut and set density), never all three by default. Storyboard as one line per beat and get the user's nod before writing full sections.
