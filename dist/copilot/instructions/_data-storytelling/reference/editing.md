# Editing: concreteness, tension, cutting, density

The structure gets the audience to the end. These four moves make them
remember it.

## Ladder of abstraction

Abstract statements are easy to agree with and easy to forget. Concrete
cases are sticky and prove little alone. Use both, in this order:
**ground first, then climb.**

| Rung | Example |
|---|---|
| One case | "Maya opened 11 support tickets in her first week, then cancelled." |
| The pattern | "One in four new accounts quit before finishing setup." |
| The principle | "Every minute of setup costs us 2% of signups." |
| The decision | "Fund the guided flow for the remaining two signup flows." |

Rules:

- Start each major point on the bottom rung. One person, one row, one
  screenshot, one day. Name them (with permission, or anonymised and
  labelled as such; never invented).
- Climb straight away. A case with no general point is an anecdote.
- Come back down once near the end: return to the opening case and show
  how it changes. That return is what makes an ending feel like one.
- For numbers, add a human scale beside the precise figure: "5.8% (about
  one account in seventeen)".
- For features, show the output before describing the capability: the
  one-line diagnosis first, "root-cause analysis" never.

## Tension and contrast

A story moves only when there is a gap between two things. Find the gap
and put the two sides next to each other.

| Contrast | Pattern |
|---|---|
| What is / what could be | "Setup takes 23 minutes. It could take 4." |
| Before / after | The same screen, the same customer, two dates |
| Expected / actual | "We assumed price drove churn. Seven of ten named setup." |
| Us / the alternative | "Doing nothing costs 120 accounts a month." |
| Cheap / expensive | "$40k to fix, $310k a year to leave" |

Ways to raise tension honestly:

- **State the cost of doing nothing**, in the audience's currency (money,
  hours, customers, risk).
- **Close the easy exits.** Say what was tried and why it failed before
  showing what worked.
- **Hold the reveal for one beat**, not five. Pose the question on one
  slide and answer it on the next.
- **Admit the weak point** before someone else finds it. One sentence on
  what the data does not show.

Do not manufacture drama the evidence does not support. If the finding is
"nothing changed", the tension is "we expected a change and spent $X to
get one"; say that.

## Cutting

A first draft is the author's work log. The edit turns it into the
audience's story. Cut in this order:

1. **Beats that do not move the big idea.** For each section ask: if this
   vanished, would the audience decide differently? No means appendix.
2. **The history of the work.** Method, dead ends and effort belong in one
   line or in backup, unless the method is the story.
3. **The second example.** One vivid case beats three adequate ones.
4. **Hedges and throat-clearing.** "I think", "it is worth noting that",
   "as you may know", "in order to", "basically".
5. **Words doing no work.** Adjectives that grade instead of describe
   ("powerful", "seamless", "robust"): replace with the fact that earned
   the adjective, or delete.

Target: remove a third of the first draft. Keep the cut material in an
appendix or a notes file; it answers questions later.

### Narrative tics to delete on sight

These mark text as written on autopilot, and readers stop trusting what
surrounds them.

- **Stock openers**: "In today's fast-paced world", "In the ever-evolving
  landscape of", "Let's dive in", "Without further ado".
- **Hype words**: game-changing, cutting-edge, revolutionary, seamless,
  world-class, next-generation, supercharge, unlock, unleash.
- **Filler verbs and nouns**: delve, leverage, utilize, synergy, tapestry,
  testament, journey (when nobody travels).
- **Rule-of-three padding**: "fast, simple and powerful", "plan, build and
  scale". Count what the evidence gives you. If there are two real
  reasons, write two.
- **Fake contrast**: "It's not just X, it's Y", "more than just a tool".
  State Y.
- **Announcing instead of saying**: "This section will discuss", "It is
  important to note that". Say the thing.
- **Summary echo**: a closing paragraph that repeats the section in
  vaguer words. End on the consequence or the ask.
- **Rhetorical question chains**: one question can hook; three in a row
  is a stall.

`scripts/story_lint.py` catches the commonest literal phrases. The structural tics
(threes, echoes, fake contrast) need an editor's read.

## Density: reading vs speaking

The same story needs two different artifacts. Ask which one you are
making before writing a word, and never ship one as the other.

| | Spoken (live deck, demo video) | Read alone (memo, emailed deck, README, post) |
|---|---|---|
| Carrier of the argument | The speaker's voice | The page |
| Per slide or section | One claim, one visual | One claim, its evidence, the caveat |
| Words on screen | Headline plus up to about 15 words | Full sentences, short paragraphs |
| Bullets | Up to 3, or none | Up to 5, each a sentence |
| Where detail lives | Speaker notes and appendix | In line, with tables |
| Pace | About 1 to 2 minutes a slide; about 140 words a minute | 30-second skim of headlines must work |
| Numbers | One per slide, rounded ("about 6%") | Exact, with source and date |

Checks:

- **Spoken**: turn off the projector in your head. Does the script still
  work as audio? Then the slides are support, as they should be.
- **Read alone**: remove the presenter. Does every slide still make sense
  to someone who was not in the room? If not, it needs sentences.
- **A deck that must do both** gets two layers: sparse slides for the
  room, and full notes or a one-page memo for the inbox. A single
  half-dense deck fails both audiences.
- **Exec updates**: three lines above the fold (what changed, why it
  matters, what you need), then detail for those who scroll.
- **Demo-video scripts**: write for the ear. Short sentences, one idea
  per breath, no parentheses, and say numbers the way people say them.

## The ending

The last thing on screen or page is what people act on.

- State the **decision** as a yes/no the audience can give.
- Name the **owner**, the **date** and the **cost**.
- Say what happens **next week** if the answer is yes.
- If there is no decision to ask for, give the one thing to remember and
  the one thing to try.
- Put "Questions?" in your voice, not on a slide. Leave the ask on screen
  while you take them.
