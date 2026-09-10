# Pacing Budget — design notes

**Status:** thinking / pre-design. Nothing here is built. This is the document the
design work and the eventual implementation both hang off.

**One line:** each morning the app estimates how much load today can absorb,
charges what the day actually costs against it, and then checks — over weeks —
whether that estimate was *right for this person*, using crashes that already
happened as the answer key.

---

## 1. Why this, and why we can do it better

Visible's model is one morning number (HRV + resting HR off an armband) turned
into a fixed pool of "pace points", spent by heart-rate minutes above a
threshold. It works, and it is the reason people buy an armband. Its two
structural limits:

1. **It only bills for heart rate.** Standing in a queue, an argument, a hot
   shower, a supermarket, three hours of hard thinking — these are what actually
   put this population on the floor, and they barely move a wrist HR average.
2. **It never finds out whether it was right.** The formula is the formula. It
   cannot tell a user "your ceiling is lower than the model thinks" because it
   has no ground truth about their crashes.

We have both of those. The journal already knows that `stressfulWork`,
`errands`, `shower` and `carWash` are load-bearing activity types for these
users (`activityGrade` in `scoring/day.ts` half-implements this today). And
`detectDownturn`, `detectStrain`, `dayScore` and the sleep report give us a
next-day verdict on every single day the user paced. **That closes the loop, and
the loop is the product.** A pacing tool that reports its own hit rate is a
different category of thing from one that hands out points.

The honest framing for the store and the landing page: *most pacing apps give you
a budget. This one checks whether the budget was right.*

### What this is not

- Not a step goal, not a ring to close, not a streak. Filling the bar is a
  warning, never an achievement, and nothing in the UI may congratulate it.
- Not medical advice and not permission. The copy describes a pattern in the
  user's own log ("at this pace you reach your usual ceiling around 4pm"), it
  never grants ("you may do X") and never diagnoses.
- Not a replacement for the warning cards. `detectStrain` / `detectDownturn`
  stay exactly where they are, and stay free (see §8).

---

## 2. The mechanic

Three parts. Only the third is the moat.

### A. The envelope — what today can absorb

Produced once each morning (and revised as morning data lands), from three
inputs:

**A1. Personal capacity baseline.** Not a constant, not a population figure. The
rolling median daily LOAD over the user's recent history, restricted to days that
were *followed* by a non-declining window. In other words: "how much you have
typically been able to do without paying for it." This is the number that makes
the whole feature personal, and it is only computable because we retain the
journal and the score history.

Cold start: with under ~21 scored days there is no defensible baseline. The
feature must say so rather than invent one (see §7).

**A2. Today's readiness modifier.** A multiplier on A1 from the morning signals
we already compute, each stated against *the user's own* 42-day baseline rather
than against textbook ranges (the `strain.ts` discipline — this population runs
"abnormal" numbers every day of the week and only the move away from their own
normal means anything):

| Signal | Source |
| --- | --- |
| HRV vs own baseline | `scoreSet` comps / `trends/metricSeries`, through `isTrustedReading` |
| Resting HR delta | same |
| Overnight low HR | `sleep/night.ts`, `OVERNIGHT_HR_BANDS` |
| Sleep duration + grade | `sleepGradeParts` |
| Nocturnal dip | `sleep/dip.ts` (upgrades to `rolling-low` when a curve exists) |
| Orthostatic rise | most recent `standTest` / `orthostatic` reading, if recent |
| Yesterday's overspend | carry-over, see A3 |

**A3. Carry-over and hard overrides.**

- Yesterday over budget → today's envelope is reduced, and says why. PEM is a
  debt instrument, not a daily reset.
- `detectStrain` fired → envelope reduced further, card wears the caution tone.
- `detectDownturn` fired, or the day scores Crash → **no budget is shown at
  all.** The slot says rest. A number here is an invitation to spend it.

### B. The burn — what today has cost

Four sources, in descending order of how much of it we already have. Everything
is charged in the same unit (§3).

**B1. Logged activities × duration × per-type load weight.**
Add a `load` weight to `TypeDef` (`src/lib/types.ts`) covering every activity
type, not just exercise. This generalises the `heavy` array already hardcoded in
`activityGrade`. Weights are cost-per-minute-of-that-thing for this population,
and the non-exercise ones are the point:

- High: `strenuousWork`, `strength`, `hiit`, `coreWorkout`, `kickboxing`
- Moderate: `errands`, `stressfulWork`, `carWash`, `dance`, `hike`, `cycle`
- Low but non-zero: `shower` (thermal + upright), `walk`, household
- Negative (credits): `legsUp`, `breathwork`, `cooldown` — the app should be
  able to show that lying down with legs up bought some room back. Nothing else
  in this category of app does this, and it is the single most reinforcing thing
  we could show someone.

Custom types created by the user need a load weight too. Ask for it once, in the
create-type form, as three plain buttons (light / moderate / heavy) rather than a
number. Default moderate.

**B2. Heart-rate minutes above a personal exertion line.**
Not %HRmax. `workoutZones.ts` (Tanaka) is right for the workout report and wrong
here. The meaningful line for a POTS/ME body is resting HR + N, learned per user
(and eventually validated against the correlation engine). Charged from:

- Imported workout HR traces (`sampledHr`, already in the waveform sidecar).
- All-day HR series from Apple Health / Health Connect (new read, §4).
- Live capture sessions.

**B3. Orthostatic / upright load.** The real limiter in POTS and the axis nobody
bills for. **We cannot measure this today and must not fake it with steps.**
Options, in order of preference:

1. Later: derive from step cadence + HR (upright-and-still is the expensive
   state, and it looks like nothing in a step count).
2. v1: infer from activity types that are inherently upright.
3. v1 escape hatch: one optional tap on the sheet, "mostly upright / mixed /
   mostly horizontal", which adjusts the day's multiplier. One tap, never a
   form, and the budget is complete without it.

**B4. Cost multipliers from the user's own correlations.** `src/lib/insights/`
already knows which factors associate with worse outcomes *for this user*. If
short sleep, heat, alcohol or a specific trigger genuinely correlate, the same
walk costs more on those days. Rules that carry over unchanged: only
BH-surviving findings, never an `early`/`unconfirmed` tier finding, never a
`lfPeak` claim, and the multiplier is capped and named in the sheet ("today
costs more: you slept 5h 10m"). If we cannot name it, we do not charge it.

### C. The calibration loop — the moat

Every day produces a row: `{ envelope, spend, overspend, outcome }` where
`outcome` is read from what actually happened **1 to 3 days later**.

> **PEM is delayed 24 to 72 hours.** Evaluating against tomorrow alone is the
> single biggest way this feature ends up confidently lying to someone. The
> outcome window is a window, and the doc should say so wherever the math is
> written.

Two things fall out of that table:

1. **Self-correction.** If the user repeatedly stays under budget and crashes
   anyway, the ceiling comes down. If they repeatedly go over and are fine, it
   goes up. Bounded, slow (a rate limit per week), and never silent — a change in
   the ceiling is worth a sentence on the card.
2. **An accuracy readout.** "Your budget has held on 11 of your last 13 days."
   This is the sentence that sells the feature, and it is only sayable because
   we keep the history. Under a minimum number of evaluated days it says nothing
   at all rather than quoting 2 of 2.

And one milestone: **the ceiling rising over months IS the recovery story.**
That belongs in Milestones and in the Trend card's vocabulary, not buried in a
pacing sheet.

---

## 3. The unit

Requirements: it must be pictureable, it must not read as calories, it must not
read as a game currency, and it must survive being wrong.

Candidates:

- **"Spoons"** — instantly understood by the audience, and instantly owned by the
  community rather than by us. Risk: people have strong existing definitions and
  will argue with ours. Also hard to say in the App Store description without
  sounding like we are appropriating it.
- **Percent of today's capacity (0–100%)** — no unit to learn, maps directly to a
  bar, and is honest about being relative. Risk: reads like a battery, and
  batteries imply a linear discharge nobody experiences.
- **Effort minutes** — "you have about 40 moderate minutes left". Concrete,
  pictureable, and it forces the model to stay honest because the user can check
  it against their own afternoon.

**Recommendation: percent on the card, effort minutes in the sheet.** The card
answers "how much room is left" at a glance; the sheet answers "in what" and can
say "roughly 40 minutes at the pace of this morning's errand". Internally the
model is points; points are never shown.

---

## 4. Data

### Have already, no new permission

Every logged activity with duration + HR fields · imported workouts with full HR
traces · all HRV metrics off real RR (with `isTrustedReading` gating) · resting
HR · sleep duration, stages, awake minutes, overnight HR + respiratory series,
nocturnal dip · symptoms with fields · triggers · meds · water · POTS stand tests
and episodes · `detectStrain`'s six markers against 7d/42d personal baselines ·
`detectDownturn` / `detectUpturn` · the daily score with its confidence ·
correlation findings.

**A credible v1 ships on this alone.** That matters: it means the feature is not
blocked on a permission dialog, and it works for the user who has no wearable.

### Add — new health reads

| What | HealthKit | Health Connect | Why |
| --- | --- | --- | --- |
| Steps | `stepCount` | `Steps` | Passive load floor on days nothing is logged |
| Active energy | `activeEnergyBurned` | `ActiveCaloriesBurned` | Cross-check on B1/B2 |
| Exercise minutes | `appleExerciseTime` | (derive) | Cheap corroboration |
| Walking HR average | `walkingHeartRateAverage` | (derive from `HeartRate`) | Moves with deconditioning and with flares |
| **All-day HR series** | `heartRate` samples | `HeartRate` | **The important one.** B2 lives here |
| Stand hours (iOS) | `appleStandTime` | none | Weak proxy for upright time |

Notes that will bite if forgotten:

- Android needs each of these declared in `app.json` under
  `android.permission.health.*` (`READ_STEPS`, `READ_ACTIVE_CALORIES_BURNED`,
  `READ_HEART_RATE` is already there). **A record type requested without its
  manifest permission loops the Health Connect consent sheet forever** — we have
  hit this before. Add to `READ_TYPES` in `health/healthConnect.ts` and to the
  manifest in the same commit.
- iOS: extend the read set in `health/index.ts`. The whole set goes through
  `requestAuth`'s self-gating latch (`health/askedAuth.ts`); adding types changes
  the set key, which means **one more prompt for existing users**. That is a
  product decision, not an accident — it should be attached to a Connect button
  or to first opening the pacing feature, never to a background update check.
- All-day HR is a lot of samples. It must be summarised at read time into
  minutes-above-line per hour, and only the summary is kept. Raw all-day HR
  belongs nowhere near the journal; if we keep any curve it goes to the waveform
  sidecar under a new key, and that key must be listed in `waveformIds` or
  `pruneWaveforms` deletes it on the next launch.

### Do not have, and should not pretend to

True posture / upright time · continuous HR at armband fidelity without an
armband · cognitive load · anything about the user's day we did not measure or
they did not log. Where the model is blind, the card says its confidence is low.
It never fills the gap with a guess wearing a number.

---

## 5. Module layout

Following the app's existing pure-core / thin-shell split (`trends/`,
`insights/`, `review/`, `upsell/`):

```
src/lib/pacing/
  load.ts        # per-type load weights + the pure "what did this entry cost" fn
  envelope.ts    # A1 + A2 + A3 -> today's budget, with a confidence
  burn.ts        # B1..B4 -> today's spend, itemised, with coverage
  pace.ts        # the time-of-day pace line ("should be at 40% by now")
  outcome.ts     # C: the 1-3 day verdict on a past day
  calibrate.ts   # C: ceiling adjustment, bounded + rate limited
  accuracy.ts    # C: the "held 11 of 13" readout, with a minimum-N rule
  index.ts       # buildPacing(state, dk) -> the whole view, one entry point
  memory.ts      # the ONE stateful file: flags MMKV, never exported from index
  __tests__/
```

Conventions this must inherit:

- **`index.ts` stays pure.** State lives in `memory.ts` only, the
  `trends/pacing.ts` + `trends/memory.ts` split.
- **One entry point** (`buildPacing`), the `buildInsights` shape.
- **Cached and deferred**, keyed on `todayKey()|meta.lastUpdated`, built in
  `InteractionManager.runAfterInteractions` behind a skeleton — and **wrapped**,
  because a throw on that queue freezes every other deferred build in the app.
- **`'unknown'` is a first-class result** and is never rendered as zero or full.
- New metrics that deserve trend treatment become rows in `trends/metrics.ts`,
  never a second registry and never a comparison at a call site.
- The load weights are the product, the way the scoring thresholds are. They get
  a table, a comment explaining the reasoning, and a test.

---

## 6. Surfaces

### 6.1 The Outlook card (primary)

The Outlook is already dense: title row with info glyph + grade pill, a 270°
gauge with a 57pt number, a confidence line, a paragraph of guidance, a hairline,
then three sunk tiles. Adding height here is a real cost.

Options to explore in design (see the design prompt kept alongside this doc):

1. **A slim spend bar above the tile row.** Cheapest in height, reads left to
   right, can carry a "where you should be by now" pace tick. Weakness: one more
   horizontal element in a card that already has a divider there.
2. **A fourth tile.** Free structurally, but a percent in a tile that otherwise
   holds measurements is a category error, and four tiles on a small phone is
   tight.
3. **A second concentric arc inside the score gauge.** Visually strongest, ties
   the budget to the score it came from, adds zero height. Weakness: the gauge is
   the app's most recognisable object and this is the riskiest thing to touch.
4. **A sentence plus a hairline meter under the guidance paragraph.** Most
   honest, least glanceable.

Whatever wins must show three things at a glance: **how much is left**, **whether
that is ahead of or behind the pace for this hour**, and **whether the estimate
is trustworthy**.

States to draw: healthy · ahead of pace · over budget (caution, never scolding) ·
low confidence (provisional, and visibly different from both zero and full) ·
suppressed (downturn/strain: no number, rest instead) · locked (free tier).

### 6.2 The pacing sheet (tap the strip)

House grammar: one card per section, each with a title, a `HelpDot`, one
plain-language sentence, then inset bubble rows that all go somewhere.

- **Today** — budget, spent, left, pace line.
- **Where it went** — ranked spend by source, each row tappable. Credits (legs
  up, breathwork) shown as credits.
- **Why today's budget is this size** — the morning inputs, each against the
  user's own baseline ("HRV 31 ms, 6 below your usual"). Missing inputs are
  ghost bars, never dashes, never zeros.
- **How well this has been working** — the accuracy readout plus a compact
  history strip. Needs its own design for "not enough history to claim
  anything yet", which is the state most users see first.

### 6.3 Drill-in

One spend source: the activity or the HR trace it was charged from, and why it
cost what it did. Reuses `FindingCard` + `LineChart` with `marks`, the way
`insights/FindingSheet.tsx` does.

### 6.4 Elsewhere

- **Widget** — a fourth figure in `buildWidgetPayload`, or a dedicated Pacing
  widget. Real data only; a stale payload renders as awaiting, as today.
- **Milestones** — "your ceiling has risen" is a milestone.
- **Insights** — pacing accuracy is a legitimate Trend Watch row.
- **Notifications** — tempting and probably wrong. A push saying "you are at 80%
  of your budget" is the app interrupting someone mid-life to tell them to stop.
  Deliberately out of scope for v1; revisit only if users ask.

---

## 7. Honesty rules

These are the load-bearing ones. They belong in the code comments, not only here.

1. **Unknown is unknown.** No history, no wearable, nothing logged: the card says
   it cannot estimate yet and shows what to log. It never renders 100%.
2. **Coverage is stated.** A budget inferred from three logged activities is not
   the same object as one built from a full day of HR, and must not look like it.
3. **Never suggest doing more.** The budget is a ceiling, never a target. No
   copy, anywhere, may imply unspent budget is wasted.
4. **Silence on bad days.** Downturn, crash-grade day, or a fired strain card:
   no number.
5. **Undershoot safely.** Where the model is uncertain, it errs low. The cost of
   a conservative budget is a good day the user under-used. The cost of a
   generous one is a crash.
6. **The outcome window is 1 to 3 days.** Never "tomorrow".
7. **Say when it was wrong.** The accuracy readout reports misses as readily as
   hits. That is the whole basis of trusting it.
8. **No causal copy.** Associational, in the user's own log, in their own units.

---

## 8. Tier and gating

**Pro. Free during the 14-day trial, locked after.** Three refinements:

- **The safety half stays free forever.** `detectStrain` and `detectDownturn`
  already are, and must stay. That makes the budget an *optimisation*, and means
  we are not taking a crash warning away from someone on day 15. It is also the
  defensible public answer to "you paywalled pacing for sick people".
- **Lock it as a CARD, not a blur.** Per the app's own rule: Progress and
  Insights blur because the shape of the locked document is itself information.
  A remaining-budget number has no shape, so a dimmed arc is a tease. The tap
  opens a `fitContent` lock card, `features/PotsLock.tsx` being the model, and
  nothing else.
- **Open question:** should the *red* state (over budget / rest today) stay
  visible on free tier with the granularity locked? Arguably yes on the same
  safety logic. Decide before design freezes, because it changes the locked
  state's drawing.

Paywall plumbing: a new surface letter for `/ping/pay` (`pingPaywall`) so we can
see whether pacing becomes the front door to Pro. Everything else is existing
`usePaywall()` behaviour: reactive only, never raised on launch.

---

## 9. Phasing

**Phase 0 — model, no UI.** `load.ts` weights + `burn.ts` + `envelope.ts` pure,
with tests, run against the demo journal and against a real 81-day export. Look
at the numbers before anyone draws anything. If the budget is not obviously
sensible on real data, nothing downstream matters.

**Phase 1 — journal-only v1.** No new permissions. B1 + B3(escape hatch) + the
envelope. Outlook strip + sheet. Says its own coverage loudly.

**Phase 2 — health reads.** Steps, active energy, all-day HR. B2 lands. The
permission ask is attached to opening pacing, not to a background check.

**Phase 3 — the loop.** `outcome.ts` + `calibrate.ts` + `accuracy.ts`. This is
the version worth marketing.

**Phase 4 — upright load.** Cadence + HR derivation, if the data supports it.

---

## 10. Open questions

1. Unit: percent-on-card / minutes-in-sheet, or commit to one everywhere?
2. Does the over-budget state stay free? (§8)
3. Do credits (legs up, breathwork) really give budget back, or only slow the
   burn? Physiologically the honest answer is probably "slow the burn", but
   "you bought yourself 20 minutes by lying down" is the most motivating
   sentence this feature could produce. Needs a decision, and the copy has to
   match the math either way.
4. Minimum history before we show a budget at all. 21 scored days is a guess.
5. Where does the ceiling live for someone with no wearable and light logging?
   Is there a floor version that is still useful, or does the card just stay in
   its "not yet" state for them indefinitely, and is that acceptable?
6. Should the model be told about menstrual cycle / known flare triggers as
   envelope inputs? Big lift, big payoff for a large part of the audience.

---

## 11. Prior art to look at properly before designing

Visible (armband + pace points), Bearable (symptom-first, no budget), Welltory
(HRV-first, no pacing), Whoop/Garmin body battery (athlete framing, wrong
population, but the *depletion* UI is well solved and worth stealing the
legibility of). Note where each one's framing would harm our user, not just what
it looks like.
