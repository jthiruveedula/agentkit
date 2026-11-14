# Structures

A structure is a promise about the order in which the audience will get
what they came for. Choose by asking one question: **how long will this
audience wait for the point?** Executives wait zero seconds. A launch
reader waits one paragraph if the problem is theirs. A conference room
waits five minutes if you have made them curious.

Every structure below starts from the same sentence, the big idea:

```
For <audience>: <what changes>, because <evidence>, so <decide or do X> by <when>.
```

Example used throughout: *For the exec team: fixing onboarding cut churn
18% in one quarter, so fund the same fix for the two remaining signup
flows by March.*

## Choosing

| Audience and moment | Structure | Why |
|---|---|---|
| Executives, a decision, 10 minutes | SCQA, then a Minto pyramid | Answer first; they interrupt, so the top must stand alone |
| Readers who do not know the product | Before-after-bridge | They care about their problem, not your feature |
| A launch with a real struggle behind it | Hero's journey | The customer is the hero; the product is the tool they pick up |
| A metric moved, or should | One number | A single figure with a comparison is the fastest hook data has |
| Teaching how or why something works | Problem-tension-resolution | Curiosity carries people through the mechanism |

If two fit, take the one that reaches the ask sooner.

## SCQA (situation, complication, question, answer)

The opening four beats of an executive story. Each is one sentence.

- **Situation**: what everyone already agrees on. No news here; it earns
  the nod. *"Onboarding is where a new account decides whether to stay."*
- **Complication**: what changed or broke. This is the tension.
  *"One in four new accounts quit before finishing setup in Q2."*
- **Question**: what the complication forces us to ask. Often left
  implicit. *"Can we fix setup without rebuilding the product?"*
- **Answer**: the big idea. *"Yes: the guided flow cut churn 18%; fund it
  for the other two flows."*

For executives, reorder to **answer first** (A, then S-C as the reason it
matters). Use the S-C-Q-A order when the audience must feel the problem
before they will accept the answer.

Check: delete the situation. If nothing is lost, it was throat-clearing;
start at the complication.

## Minto pyramid

The body under an SCQA opening. One answer on top, three or so supporting
claims under it, evidence under each.

```
Answer:   Fund the guided flow for the two remaining signup flows.
  Why 1:  It works: churn fell from 7.1% to 5.8% in one quarter.
            - cohort chart, control group
  Why 2:  It is cheap: $40k, six weeks, two engineers.
            - cost breakdown
  Why 3:  Waiting costs more: each month of delay loses about 120 accounts.
            - churn model
Ask:      Approve $40k by Friday; Priya owns delivery.
```

Rules that make it hold:

- **Vertical logic.** Each claim answers the "why?" or "how?" the claim
  above it raises. Read a branch top-down and it should feel like a
  conversation.
- **Horizontal logic.** Siblings are the same kind of thing (all reasons,
  or all steps), do not overlap, and together are enough. If you can
  remove one and the answer still stands, remove it.
- **Count what is there.** Two strong reasons beat three where the third
  is filler. Do not pad to three because three feels complete.
- Each "why" becomes one slide or section with that sentence as its
  action title.

## Before-after-bridge

For launch posts, README heroes and landing copy. Three beats.

- **Before**: the reader's world today, in their words, with a specific
  pain. *"Your pipeline fails at 3am. You read 400 lines of logs to find
  one bad row."*
- **After**: the same moment with the problem gone. Show it; do not
  describe a feeling. *"You get one line: step 4, row 8812, null
  customer_id."*
- **Bridge**: how they get there, and what it costs them to start.
  *"`pip install storykit && storykit why`. One command, no config."*

README hero version: the headline is the After as a claim with a number,
the first paragraph is the Before in two sentences, the first code block
is the Bridge. Features come later, each as a claim ("Finds the failing
row in 10 seconds"), never as a noun ("Diagnostics").

Check: is the Before specific enough that the right reader says "that is
me" and the wrong reader leaves? Both are wins.

## Hero's journey (short form)

For launches and demo videos with a real customer struggle. The customer
is the hero. You are the guide who hands them a tool.

1. **Ordinary world**: a named person doing their job. *"Maya runs
   onboarding for a 40-person support team."*
2. **The problem arrives**: what breaks, with stakes. *"New agents take
   23 minutes to set up; a quarter give up."*
3. **Failed attempts**: what they tried. This is where credibility comes
   from. *"A longer doc. A video. A checklist nobody opened."*
4. **The tool**: your product enters, late and briefly. *"A guided flow
   that asks four questions."*
5. **The change**: the same person, measurably better off. *"Setup takes
   4 minutes. Maya's team stopped writing onboarding tickets."*
6. **Your turn**: the ask. *"Try it on your slowest flow this week."*

Keep step 4 the shortest. A story where the product is the hero is an
advert, and people skip adverts.

Demo-video script: one beat per 10 to 20 seconds, problem on screen within
the first 10 seconds, product on screen by 30, the ask on the final frame
for at least 3 seconds.

## One number

For analysis, metric reviews and the narrative layer of a dashboard.

1. **The number, alone.** *"18%."* On a slide: huge, nothing else. In a
   dashboard: the headline tile, with a sentence title above it.
2. **What it measures and against what.** *"Churn fell 18% this quarter,
   from 7.1% to 5.8%, the largest drop in two years."* A number without a
   comparison is a fact; with one it is news.
3. **Why it moved.** One cause, with the evidence that separates it from
   the obvious alternatives (seasonality, pricing, a one-off).
4. **What it does not show.** One honest limit. *"Two flows are unchanged,
   so half of new accounts have not seen the fix."*
5. **So what.** The decision the number supports.

Dashboard narrative layer: every chart gets a sentence title that states
what the reader should see ("Signups recover within two weeks of each
release"), the top-left tile is the one number, and a two-line "what
changed and what to do" note sits above the fold. Rewrite those sentences
when the data changes; a stale claim over a live chart is worse than a
label.

Check: can you say the number, its comparison and its so-what in one
breath? If not, you have the wrong number or too many.

## Problem-tension-resolution

For explainers, tech talks and tutorials.

- **Problem**: a concrete failure or puzzle the audience recognises.
  *"The same query takes 40ms on Monday and 9 seconds on Friday."*
- **Tension**: why the obvious fixes do not work. Raise the stakes and
  close off the easy exits one at a time. *"More memory did nothing. An
  index made it worse."* Each closed exit is one beat.
- **Resolution**: the mechanism, shown on the same example that opened
  the piece, then generalised. *"The planner switches strategy at 10,000
  rows. Here is how to see it, and how to pin it."*
- **Carry-out**: the one rule the audience can use tomorrow, and where to
  go next.

The tension section is where explainers are won. If the audience never
wonders "so what is it, then?", the resolution lands as trivia.

## Storyboard template

Fill this before writing any section. One line each; 5 to 9 beats.

```
Big idea:  For ___: ___, because ___, so ___ by ___.
Structure: ___
1. (hook)      ___
2.             ___
3.             ___
4.             ___
5. (ask)       ___ decision / owner / date / cost
Cut list:      beats and facts removed, kept for the appendix or Q&A
```

Read the numbered lines aloud in order. If a listener could repeat the
argument back, the storyboard is done. If a beat needs "and" to join two
claims, split it. If two beats make the same claim, merge them.
