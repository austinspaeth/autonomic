# Pacing Budget — design prompt

Paste the block below into Claude (or Claude Design) to generate the visual
design. Background, rationale and the data model live in `PACING_BUDGET.md`.

---

```
You are designing a new feature for Autonomic Journal, a private offline-first
iOS/Android app (Expo / React Native) for people tracking autonomic recovery:
POTS, ME/CFS, long COVID, dysautonomia. The audience is chronically ill and
often reads the app on a bad day. Restraint is the product.

FEATURE: a personal PACING BUDGET. Each morning the app estimates how much
effort today can absorb, tracks what has been spent so far, and shows what is
left. It is calibrated to the individual by checking, over weeks, whether
staying under budget actually prevented a decline 1 to 3 days later.

DESIGN THE FOLLOWING, IN ORDER:

(1) THE PACING STRIP inside the existing Autonomic Outlook card.
The Outlook card today, top to bottom: section title ("Autonomic Outlook") with
an info glyph and a coloured grade pill on the right; a large 270-degree score
gauge with a 57pt number in the centre and small delta chips beneath it; a
"74% confidence" line; a paragraph of guidance; then a hairline divider over a
row of three sunk tiles (HRV / Resting HR / Sleep), each a 19pt figure tinted by
its grade band over an 11.5pt dim label. The card has no fill: colour comes only
from a gradient border lit from the top-left corner in the day's grade colour.

Add the pacing budget to this card WITHOUT making it a second hero. The score
gauge stays the primary object. Show at least three alternatives for where the
strip lives and what form it takes (for example: a horizontal spend bar above
the tile row; a fourth tile; a thin arc concentric with the existing gauge; a
single sentence plus a slim meter). Explain the tradeoff of each. Assume the
card is already dense and that adding height is a real cost.

The strip must communicate, at a glance: how much is left, how fast it is being
spent relative to the time of day, and whether the estimate is trustworthy.
It must never look like a goal to fill or a ring to close. Filling it is a
warning, not an achievement.

Draw these states:
  a. Healthy: budget comfortable, spend tracking below pace.
  b. Ahead of pace: spending faster than the day allows, not yet over.
  c. Over budget: past the ceiling, with the tone of a caution rather than a
     failure. Nothing here may read as scolding.
  d. Low confidence: little data logged today, so the number is provisional.
     "Unknown" must look different from "zero" and different from "full".
  e. Suppressed: the app has detected a downturn or early strain. No number at
     all; the slot says rest instead.
  f. Locked (free tier after a 14-day trial): a compact locked row that opens a
     lock card. Do NOT draw a blurred or dimmed fake value.

(2) THE PACING SHEET, opened by tapping the strip. A bottom sheet in the app's
existing grammar: one card per section, each holding a title, a small help dot,
a plain-language sentence, then inset rounded "bubble" rows. Sections:
  - Today: the budget, what has been spent, what remains, and the pace line.
  - Where it went: today's spend broken down by source (logged activities,
    heart-rate minutes above the user's own exertion line, upright/postural
    load, and cost multipliers from the user's own correlations). Ranked, each
    row tappable. Restorative entries such as legs-up and breathwork appear as
    credits and must read differently from costs.
  - Why today's budget is this size: the morning inputs, each stated against the
    user's OWN baseline rather than a population range, for example "HRV 31 ms,
    6 below your usual". Empty inputs render as ghost bars, never dashes.
  - How well this has been working: the honest accuracy readout, for example
    "held on 11 of your last 13 days", with a compact history strip. Design a
    version of this for when there is not yet enough history to claim anything,
    which is the state most users see first.

(3) A DRILL-IN SHEET for one spend source, showing the activity or heart-rate
trace it was charged from and why it cost what it did.

(4) THE LOCK CARD for free tier: a single-question, fit-content card explaining
what the pacing budget is and what unlocks it. One primary action. No preview of
the value behind it.

CONSTRAINTS
- Dark and light themes, both drawn.
- Reuse the app's existing vocabulary: grade colours (green / lime / amber /
  orange / red) for state, sunk tiles, hairline dividers, gradient-border cards,
  rounded bubble rows, ghost bars for absent data, a caution gold reserved for
  warnings. Introduce at most one new visual idea, and justify it.
- Legible one-handed on a small phone. The pacing state must be readable without
  opening anything.
- No em dashes in any copy. Keep subtexts to one short line.
- Copy is descriptive and associational, never causal, never medical advice,
  never permission-granting. Say "at this pace" rather than "you may".
- Numbers must carry units the reader can picture. No bare indices, no
  percentages standing in for quantities the user cannot feel.

DELIVER: annotated artboards for each state and sheet above, plus a short
rationale for the layout you chose and for the ones you rejected.
```
