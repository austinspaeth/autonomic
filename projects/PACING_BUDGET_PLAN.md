# Pacing Budget — implementation plan

**For:** the implementing agent (Opus). Read, in this order:

1. `PACING_BUDGET.md` — the why and the model.
2. `PACING_BUDGET_DESIGN.dc.html` — **the design, and it is binding.** A local
   copy of the Claude Design file. The states, copy, colours and layout below
   are transcribed from it; when this plan and the design disagree, the design
   wins. The data script at the bottom of that file (`renderVals()`) holds every
   string and every colour; the `rationale`, `sheetNotes`, `copyNotes` and
   `pitchNotes` arrays are the designer's reasoning and are worth reading in
   full before touching a pixel.
3. This document — build order, decisions taken, exact seams in the code.

Every path is under `mobile/` unless it says otherwise.

**Austin's instructions, binding:**

1. It must draw from what the user has logged AND from health sensors (steps and
   heart rate from Apple Health / Health Connect).
2. This sells retention and conversion. Make it excellent.
3. When confidence is low, show ONE recommendation at a time, the most important
   first: take an HRV reading, then log your sleep, and so on. Never a list.
4. The gauge, its deltas, the confidence line, the paragraph and the three sunk
   tiles do not change. The strip is an ADDED section between the guidance
   paragraph and the three tiles.
5. Use existing patterns. No new primitives unless nothing fits.
6. Animate the bar ONLY when over budget. Under budget it is static.
7. Add a Progress section, NOT near the top, with a card showing how far over or
   under the daily budget the user ran.

---

## 0. Decisions taken (do not re-open)

| Question | Decision | Why |
| --- | --- | --- |
| Module name | `src/lib/budget/` | `trends/pacing.ts` and `upsell/pacing.ts` already exist and mean rate limiting. User-facing name stays "Pacing budget". |
| Unit | **Minutes everywhere the user reads it.** "3h 20m left of 5h 30m". Points internally, never shown. No percent on the card | Design rationale "Minutes, not points": an index out of 100 is a second score competing with the first. Overrides §3 of the notes. |
| Health-derived spend | `days[dk].load` in the JOURNAL, written through `mutate`; the thinned all-day HR curve in the waveform sidecar under `load:<dk>` | User's health data rides export/import like sleep does, the engine stays pure over `AppState`, and the drill-in needs the trace. |
| Calibration state | None. The ceiling is a pure function of history | "Widened by 40m over three weeks" is `ceilingAt(dk)` vs `ceilingAt(dk − 21)`. No memory file. |
| Credits (legs up, breathwork, cooldown) | **They REFUND.** A restorative entry buys minutes back: spend goes down, "left" goes up, and the row says so ("Legs up bought back 15m"). Bounded: a day's credits can return at most `CREDIT_CAP = 0.25` of the envelope, and spend never goes below zero | Austin's call (closes open question 3 the motivating way): "you bought yourself 20 minutes by lying down" is the most reinforcing sentence the feature can produce, and the calibration loop will correct the rate if it proves generous. |
| Over budget on free tier | Free sees the locked row and nothing else, in every state. No sentence, no number, no partial | The design draws exactly one locked form. The warning cards under the Outlook are the safety half and stay free. |
| Day one | **There is a budget from the first reading.** It starts from a conservative prior sized by today's own readiness, blends toward the personal baseline as held days accumulate, and wears the word "Learning" with a day count until it has 14 of them. The accuracy sentence still waits for 21 evaluated days | Austin's call: a day-one feature that gets to know you. A strip that says "come back in two weeks" is one most users never meet. §2.2 has the math, §5.3 the state. |
| Outcome window | Days +1 and +2 after the paced day, worst of the two | The sheet says "whether the next two days held". PEM is delayed; "tomorrow" is banned from the math and the copy. |
| Pace marker | Even spend across waking hours: `wake` from last night's sleep record, else 08:00, to 22:30 | 2:40pm reads 46 percent in the design, which is 08:00 to 22:30. |
| Strip animation | None under budget. Over budget: the ember gradient drift (3.4s linear loop) and the glow breathe (2.2s ease loop) from the design, and nothing else moves | Rule 6, and the design's "Over budget burns". Gold is ahead, red is over, the two are never confused. |
| Progress placement | New `pacing` category AFTER `activity`, before `triggers` | Rule 7. |
| Paywall letter | `PaywallSource 'pacing'` → `SurfaceCode 'B'` | R I P O M N S are taken. |
| Steps permission | Asked from a tap only: the strip's "Todo: Connect steps" action or the sheet's Connect row, with `force: true`. Never from `HealthUpdates` | Adding read types changes the auth set key; the one extra prompt existing users see must be on a tap. |
| Steps without a watch | **Every phone counts steps.** iPhone's motion coprocessor writes `stepCount` to HealthKit on its own; Android phones write `Steps` to Health Connect through the system step provider (Pixel, Samsung Health, Fitbit). So the step floor and the walking-minutes row work for a user with no wearable at all | Austin's question. It means the feature has a passive signal on day one for everyone who connects Health, not only watch owners. |
| Upright time | Four sources, the best available is used and the row's detail line names which: (1) iOS with a watch: `appleStandTime` minutes, "3h 40m standing or walking"; (2) anyone with all-day HR: walking minutes PLUS standing-still minutes inferred from the user's own orthostatic signature (§2.12), "2h 10m walking or standing, estimated"; (3) anyone with steps: walking minutes only, "1h 10m walking"; (4) the posture tap adjusts any of them. Without a heart-rate series, standing still is not claimed | `appleStandTime` is written only by Apple Watch and Health Connect has no stand record. But a POTS heart sitting 25 bpm above its own lying rate with no steps for three minutes is standing, and the user's own stand test says what "above" means for them. That is derived, so the row says "estimated". |
| Confidence wording | Low / Medium / High, never a percentage | Design: "confidence stated on the right as low, medium or high rather than a percentage". |
| No push notifications, no widget | Out of scope, list as follow-ups | §6.4 of the notes. |
| Demo | Progress's pacing section renders demo data behind `DemoBanner`. The Journal strip never shows demo | "Never fake the Journal." |

---

## 1. Data model

### 1.1 `src/lib/types.ts`

```ts
// TypeDef (activities only). Built-ins never carry it; the table in load.ts is the source.
load?: LoadWeight;   // 'rest' | 'light' | 'moderate' | 'heavy' | 'strenuous'

// DayRecord
load?: DayLoad;

export interface DayLoad {
  steps: number | null;         // whole day so far; null = not read
  walkingMin: number | null;    // minutes holding any steps, from sample timestamps (phone or watch)
  standMin: number | null;      // appleStandTime minutes; iOS with a watch only, else null
  stillUprightMin: number | null;   // §2.12: minutes standing still inferred from HR + no steps; null without an HR series
  uprightSpans: { startMin: number; endMin: number; kind: 'walk' | 'still' }[] | null;   // for the drill-in's shading, thinned to 60
  hrAboveMin: number | null;    // minutes above the exertion line
  hrCoverageMin: number | null; // minutes the series actually covered
  hrStretches: number | null;   // contiguous runs above the line ("in three stretches")
  longestStretch: { startMin: number; endMin: number } | null;   // minutes past midnight
  peakBpm: number | null;
  lineBpm: number | null;       // the line the count used, so a later baseline shift does not re-mean it
  posture?: 'upright' | 'mixed' | 'horizontal';
  readAt: string | null;
}
```

### 1.2 Waveform sidecar

`src/lib/waveforms.ts`: add `loadWaveformId = (dk) => \`load:${dk}\`` and list
it in `waveformIds` beside `sleepWaveformId`, or `pruneWaveforms` deletes the
curve on the next launch. The curve is `sampledHr: { t, bpm }[]` thinned to
`NIGHT_SERIES_MAX` at write time, `t` in seconds from local midnight.

### 1.3 Custom types

`addCustomType(kind, name, { load })` and `editType` carry `load` into the
pure-JSON def. `loadOf(def, key)` resolves `def.load`, then the table, then
`'moderate'`.

---

## 2. Engine: `src/lib/budget/`

Pure. No store, no native, no MMKV. `addDays` and `now` are passed in. Every
file has a test. Style: `src/lib/scoring/strain.ts` (named constants with a
comment each, coverage bars per window).

```
src/lib/budget/
  load.ts        weights table + loadOf + entryCost
  baseline.ts    capacity baseline (A1) + the exertion line
  envelope.ts    today's budget + confidence + inputs (A2, A3)
  burn.ts        today's spend by SOURCE, with coverage (B1..B4) + hrMinutesAbove
  pace.ts        pace marker + "runs out around 4:10pm"
  outcome.ts     the +1..+2 day verdict on a past day
  calibrate.ts   pure ceiling adjustment
  accuracy.ts    "11 of your last 13 days held" + the history strip
  recommend.ts   the ONE next thing to log
  format.ts      hm(), "About 3h", "left of about 5h"
  index.ts       buildBudget(state, dk, ctx, opts) -> BudgetView
  __tests__/
```

### 2.1 `load.ts`

```ts
export type LoadWeight = 'rest' | 'light' | 'moderate' | 'heavy' | 'strenuous';
/** Effort minutes per logged minute. The product, like scoring thresholds. */
export const LOAD_PER_MIN: Record<LoadWeight, number> = {
  rest: -0.35, light: 0.6, moderate: 1.0, heavy: 1.6, strenuous: 2.2,
};
export const LOAD_TABLE: Record<string, LoadWeight> = {
  legsUp: 'rest', breathwork: 'rest', cooldown: 'rest',
  walk: 'light', taiChi: 'light', yoga: 'light', pilates: 'light', shower: 'light',
  errands: 'moderate', stressfulWork: 'moderate', carWash: 'moderate', dance: 'moderate',
  hike: 'moderate', cycle: 'moderate', elliptical: 'moderate', swim: 'moderate',
  rower: 'moderate', stairStepper: 'moderate', sex: 'moderate', indoorBike: 'moderate',
  otherExercise: 'moderate',
  strength: 'heavy', coreWorkout: 'heavy', hiit: 'heavy', kickboxing: 'heavy', run: 'heavy',
  strenuousWork: 'strenuous',
};
```

- Test: every `ACTIVITY_TYPES` key has a row (the coverage-test pattern in
  `trends/metrics.ts`).
- The unit is **effort minutes**: a moderate minute costs one. So "1.2x
  costlier" and "3h 20m left" are the same currency.
- `entryCost(entry, def, lineBpm)` → `{ minutes, effortMin, weight, hrBoost,
  assumed }`. Minutes from `duration` (a string, `parseFloat`). If `avgHr`
  exceeds the line, `hrBoost = 1 + min(0.5, (avgHr − line) / 40)`. No
  `duration` ⇒ 20 minutes with `assumed: true`, which the drill-in says out
  loud. `rest` yields NEGATIVE effort: 20 minutes of legs up at −0.35 buys back
  7 effort minutes. `CREDIT_PER_MIN` is its own constant beside the table so
  the refund rate can be tuned without touching the costs, and a test pins
  that a full day of legs up cannot exceed `CREDIT_CAP` of the envelope.

### 2.2 `baseline.ts`

- `exertionLine(days, dk, ctx)`: median `restingHr` over the trailing 42 days
  via `metricSeries(days, keys, ['restingHr'], ctx)` (the source `strain.ts`
  uses at L212; never a local extraction) plus `LINE_ABOVE_RESTING = 25`. Null
  under 5 readings. The drill-in calls it "your own exertion line, not a
  fitness zone".
- `capacityBaseline(days, dk, ctx, addDays)` → `{ effortMin, heldDays,
  learning: number /* 0..1 */ }`. Over the trailing `BASELINE_DAYS = 42`
  complete days, `daySpend` (§2.4, logged + stored load) and outcome (§2.5);
  keep days whose outcome was `'held'`; `personal` = their median ×
  `UNDERSHOOT = 0.85`. Undershoot because a conservative budget costs a good
  day under-used and a generous one costs a crash (honesty rule 5).
- **The prior, which is what day one runs on.** `PRIOR_BY_GRADE` maps the
  day's own score category to a starting envelope: Excellent 300, Good 270,
  Moderate 220, Compromised 170, Bad 120 effort minutes (Crash is
  suppressed). Deliberately low for this population, and it is a starting
  point, not a claim: the first held day already starts pulling it toward the
  person. The blend is `w = min(1, heldDays / LEARN_DAYS)` with `LEARN_DAYS =
  14`, `effortMin = prior × (1 − w) + personal × w`, and `learning = w`. So a
  day-one user gets a number sized by their own morning readings, and every
  held day makes it more theirs. Nothing is ever null here except on a
  suppressed day.
- **Early days learn faster.** The first two evaluated outcomes move the
  prior directly: a `'dipped'` outcome multiplies the prior by 0.85 and a
  `'held'` day whose spend beat the prior raises it toward that spend by half
  the gap. After that `calibrate.ts` takes over at its slower rate. Both are
  pure functions of history; the "getting to know you" is visible as the
  figure moving and is said out loud in the sheet ("Your budget moved up 25m
  after Tuesday held").
- **A Health backfill seeds it on day one.** The welcome wizard's one-shot
  history import (`HealthApi.readHistory`, workouts with traces, sleep, HRV)
  gives `capacityBaseline` real held days before the user has logged a single
  entry, so an Apple Watch user can wake up to a budget that is already
  partly personal. Nothing to build for this beyond making sure the engine
  reads imported activities like logged ones (it does; `isTrustedReading`
  only gates HRV).
- Move `shift` and `pick` out of `strain.ts` into an exported
  `src/lib/scoring/baseline.ts` and import from both. `strain.ts` tests pass
  unchanged.

### 2.3 `envelope.ts`

```ts
export interface EnvelopeInput {
  id: 'hrv' | 'restingHr' | 'sleep' | 'sleepingHr' | 'dip' | 'orthostatic' | 'carryover';
  label: string;                 // "HRV this morning", "Sleep last night", "Standing test"
  value: string | null; unit: string;
  vs: string; vsCat: 'good' | 'bad' | 'neutral';   // "2 above your usual" | "Not logged today"
  bar: number | null; usual: number | null;         // 0..1 for the row's bar + baseline tick
  factor: number; known: boolean;
}
export interface Envelope {
  effortMin: number | null; confidence: 'low' | 'medium' | 'high';
  inputs: EnvelopeInput[]; reduced: 'strain' | 'carryover' | null;
  suppressed: 'downturn' | 'crash' | 'strain-alert' | null;
}
```

- Each known input contributes a factor in `[0.7, 1.1]` from its delta vs the
  user's own 42-day median (`shift`). Product clamped to `[0.5, 1.1]`:
  asymmetric, the budget can rise 10 percent and fall by half.
- `bar` / `usual`: value and baseline placed on a 0..1 scale spanning the
  user's own 42-day min..max, so the tick sits where their usual is.
- Confidence: weighted share of known inputs (HRV 3, sleep 2, others 1) times
  `max(0.5, learning)`, so a day-one user with a full set of morning readings
  reads Medium, not Low: the inputs are good, the ceiling is still being
  learned, and the strip says which. `< 0.5` low, `< 0.8` medium.
- `learning` (from the baseline) rides on the envelope so the strip can show
  "Learning · day 3" while `learning < 1`.
- A3: yesterday's overspend ratio above 1 reduces today by `min(0.3, (ratio −
  1) × 0.5)` and adds a `carryover` input row. `strain` at `'watch'` × 0.8 with
  `reduced: 'strain'`. `strain` at `'alert'`, a downturn, or a Crash-grade day
  sets `suppressed` and `effortMin: null`. The caller passes `downturn` and
  `strain` in; `DaySummary` already has both.

### 2.4 `burn.ts`

Spend is reported **by source**, four rows at most, the design's "Where it
went":

```ts
export type SpendSource = 'hr' | 'upright' | 'activities' | 'multiplier' | 'credits';
export interface SpendRow { source: SpendSource; label: string; detail: string;
  effortMin: number; share: number /* 0..1 of the largest row */;
  members?: SpendMember[] /* activities: one per entry */ }
export interface SpendMember { entryId: string; label: string; minutes: number; effortMin: number; credit: boolean; assumed: boolean }
export interface Burn { effortMin: number; rows: SpendRow[]; coverage: 'full' | 'partial' | 'logged-only' | 'none' }
```

- `hr` "Minutes above your line", detail "48m over 98 bpm, in three
  stretches" from `day.load`. Minus minutes covered by a logged activity that
  carries `avgHr` above the line (no double charge), floor 0.
- `upright` "Upright time": `uprightMin = standMin ?? (walkingMin +
  stillUprightMin) ?? walkingMin`, charged at `UPRIGHT_PER_MIN = 0.2` effort
  per minute (the design's 3h 40m → 44m). Detail "3h 40m standing or walking"
  from stand time, "2h 10m walking or standing, estimated" when the still
  minutes are inferred (§2.12), "1h 10m walking" from steps alone, so the
  reader always knows what was measured and what was derived.
  Minutes inside a logged walk or run are subtracted first (they are charged
  as the activity). Then the posture tap scales the row: `upright` × 1.5 with
  detail "…and you said mostly upright", `horizontal` × 0.5. With neither
  measurement nor tap the row is absent, never a guess.
- `activities` "Logged activities", detail = the first three labels joined
  ("Grocery run, laundry, one call"), `members` for the drill-in. Costs only;
  credits are pulled out into their own row.
- `credits` "Bought back" (a fifth `SpendSource`): the sum of the day's
  restorative entries, shown as a NEGATIVE row in `good` ("−22m", detail
  "Legs up 20m, breathwork 10m"). It is subtracted from the day's spend, so
  the strip's "left" figure rises when one is logged, capped at `CREDIT_CAP`
  of the envelope. This is the sentence that sells the feature; the row is
  always last so the reader ends on it.
- `multiplier` "Short sleep multiplier" (or the finding's own factor label),
  detail "Your log runs 1.2x costlier under 7h". From `opts.findings`: strict
  tier only (`tier === undefined`), `good === false`, outcome in the HRV /
  score family, factor present today. Cap 1.25. If it cannot be named, it is
  not charged. Its effort is the delta it adds.
- **Steps are a floor, never a sum**: `stepsEffort = steps × STEP_EFFORT =
  0.011` (8,000 steps ≈ 88 effort minutes, a moderate 90-minute day). When it
  exceeds the summed rows, the difference becomes a fifth row, `source:
  'hr'`-adjacent, labelled "Steps", detail "6,400 so far, nothing else logged
  yet". This is why a day with nothing logged still shows a number, and it
  holds for a phone with no watch: the step total and the walking minutes
  both come from the phone's own motion sensor through the health store.
- `hrMinutesAbove(series, lineBpm)` → `{ aboveMin, coverageMin, stretches,
  longest, peak }`: integrates sample gaps up to 5 minutes; a gap longer than
  that is uncovered, not rest.

### 2.5 `outcome.ts`

`outcomeOf(days, dk, ctx, addDays)`: `dayScore` (`trends/metrics.ts`) on +1
and +2 against the paced day. `'held'` if neither fell more than
`DECLINE_PTS = 10` below it and neither is Crash; `'dipped'` if either did;
`'unknown'` if either is unscored or in the future. Never "tomorrow".

### 2.6 `calibrate.ts`

`ceilingAt(days, dk, ctx, addDays)`: baseline × an adjustment from the
trailing 28 evaluated days: −0.05 per day that was under budget and dipped,
+0.03 per day over budget that held, each after the first two of its kind,
clamped `[0.7, 1.15]`, pure. The sheet's footer sentence: "The budget widened
by 40m over the last three weeks as those days kept holding" when
`ceilingAt(dk) − ceilingAt(dk − 21)` exceeds 10 minutes either way (narrowed:
"…as those days kept dipping after").

### 2.7 `accuracy.ts`

Over the trailing 42 days: `Cell = { dk, outcome: 'held' | 'dipped' | 'over' |
'pending' }` where `'over'` is a day over budget (its outcome is not counted
either way, the design's "three outcomes, not two") and `'pending'` is a day
whose window has not played out. `strip` is the last 13 cells. `held / of`
counts under-budget days with a known outcome. `ready` when `of >=
MIN_EVALUATED = 21`; below that the headline is "4 of 21 days evaluated" and
the strip shows the evaluated cells followed by hatched cells to 13.

### 2.8 `pace.ts`

`paceAt(now, wakeMin, envelope, spend)` → `{ expected: number /* 0..1 */,
byNowMin, status: 'under' | 'ahead' | 'over', runsOutAt: Date | null }`. Even
spend from wake to 22:30. `'ahead'` when spend exceeds expected by more than
`AHEAD_MARGIN = 0.08` of the envelope. `runsOutAt` projects the rate since
wake. Before wake, `expected = 0` and no projection.

### 2.9 `recommend.ts`

One `{ id, title, action }` or null, first match wins:

1. No trusted HRV reading today → `hrv`, "Todo: Take an HRV reading".
2. No sleep for last night → `sleep`, "Todo: Log your sleep".
3. All-day HR present but the upright signature is `'default'` (no stand
   test or orthostatic reading in 90 days) → `orthostatic`, "Todo: Log a
   standing test". This is what fits the standing band to the person (§2.12),
   so it ranks above connecting steps for a watch wearer.
4. Health not connected at all, or connected without steps → `steps`, "Todo:
   Connect steps" (action: `connectPacingHealth`, which connects Health if
   needed). This ranks above logging activities because a phone's own step
   count is the one passive signal every user has, watch or not.
5. No activities and no HR series by 2pm → `activity`, "Todo: Log what you
   did this morning".
6. Nothing else missing while `learning < 1` → `learning`, "Learning your
   ceiling, day 3 of 14" (no action). This is what a well-logged early day
   reads, so the subtext is never empty in the learning period.
7. Posture unanswered and spend over 40 percent → `posture`, "Todo: Mostly
   upright today?".

Shown only in the low-confidence form, as the strip's subtext. Never two.

### 2.12 `upright.ts`: standing still, inferred from the user's own heart

The limiter in POTS is time upright, and most of it is spent not walking:
the queue, the shower, the kitchen, the conversation in a doorway. No sensor
reports it. But this population's hearts DO report it: standing raises heart
rate by tens of beats within a minute or two and holds it there, which is the
whole definition of the condition, and the app already measures each user's
own rise in the stand test. So a stretch of minutes with no steps, outside
sleep and outside any logged activity, where heart rate sits in the user's
own "upright" band, is standing still. Everything below is pure and tested.

```ts
export interface UprightSignature { restBpm: number; riseBpm: number; source: 'standTest' | 'orthostatic' | 'default' }
export function uprightSignature(days, dk, ctx): UprightSignature | null
export function stillUprightMinutes(hr: { t: number; bpm: number }[], stepSpans, sig: UprightSignature,
  exclude: { startMin: number; endMin: number }[], lineBpm: number | null):
  { stillMin: number; spans: { startMin; endMin; kind: 'still' }[]; coverageMin: number }
```

- **The signature is personal.** `restBpm` is the 42-day median `restingHr`
  (the same series `exertionLine` reads). `riseBpm` is the median
  `sustainedDelta ?? peakDelta` of the user's `standTest` readings in the
  last 90 days, else the median `afterHr − beforeHr` of `orthostatic`
  readings, else `DEFAULT_RISE = 20` with `source: 'default'`. Null with no
  resting-HR baseline at all: no signature, no inference, no row.
- **The band is `[restBpm + 0.6 × riseBpm, lineBpm)`.** Below the floor is
  sitting or lying; at or above the exertion line is exercise and is charged
  by `hr` already. `0.6` because standing quietly settles below the stand
  test's peak.
- **A minute counts when it is settled.** Bucket the series into minutes.
  A run of at least `STILL_MIN_RUN = 3` consecutive minutes inside the band,
  with no step span touching them, and at least one HR sample in each (a gap
  is uncovered, never upright). Runs are the `spans`.
- **Excluded windows.** Last night's sleep window, every logged activity's
  duration plus `RECOVERY_MIN = 30` after it (recovery HR sits in the band
  and is not standing), and any minute inside a live capture session (a
  seated reading with paced breathing can wander into the band).
- **Bounded.** `stillMin` caps at `STILL_CAP_MIN = 300` a day, and the whole
  inference is dropped on a day the series covers under `STILL_MIN_COVERAGE =
  360` minutes, because four hours of watch time cannot describe a day.
- **What it cannot tell apart, said out loud.** A seated argument, a hot
  room, a fever or caffeine can hold a heart in the band. The row's detail
  therefore says "estimated", the drill-in shades the spans on the trace so
  the user can see the 12:40 to 1:04 stretch and know whether they were in
  a queue or on the phone, and the posture tap overrides it for the day. The
  calibration loop is the long-run corrective: if inferred upright time does
  not predict this user's dips, the ceiling adjusts around it.
- Tests: a synthetic day with a lying morning, a 25-minute standing stretch
  at rest+20 with no steps, a walk (steps), a workout above the line and its
  recovery tail, and a charger gap. Assert the 25 minutes and nothing else;
  assert `source: 'default'` when there is no stand test; assert null under
  the coverage bar.

The shell (§4) computes it on every `refreshDayLoad` alongside
`hrMinutesAbove`, from the same raw series, and stores `stillUprightMin` and
the thinned `uprightSpans` in `day.load`. `walk` spans come from the step
spans, so the drill-in can shade both kinds on one trace.

### 2.10 `format.ts`

`hm(min)` → "3h 20m", "45m", "1h 05m" (two-digit minutes after an hour, as
drawn). `about(min)` rounds to the nearest 30 → "About 3h". Reuse the app's
`hm()` if `lib/trends` already exports one with this shape; otherwise add it
here and use it everywhere in the feature.

### 2.11 `index.ts`

```ts
export type BudgetState = 'healthy' | 'ahead' | 'over' | 'low' | 'suppressed';
// There is no 'not-yet'. Day one is 'healthy' / 'ahead' / 'over' / 'low' with
// `learning < 1`, and the strip wears the Learning label until it reaches 1.
export interface BudgetView {
  state: BudgetState;
  envelope: Envelope; burn: Burn; pace: Pace | null; accuracy: Accuracy;
  leftMin: number | null; overByMin: number | null;
  figure: string; figureSub: string;          // "3h 20m" / "left of 5h 30m"; "About 3h" / "left of about 5h"; "Over by 45m" / ""
  sub: string; flag: 'amber' | 'red' | null;  // the subtext line + its optional mark
  recommendation: Recommendation | null;
  ceilingMoved: { min: number; dir: 'up' | 'down' } | null;
}
```

Subtext by state, from the design:

- healthy: "Behind pace for 2:40pm, which leaves room"
- ahead: "At this pace the budget runs out around 4:10pm" (amber mark)
- over: "Resting now brings this back down" (red mark)
- low: the recommendation title, with "Low confidence" on the right
- suppressed: "Budget paused for today" / "Take it easy, resume tomorrow"
- any state while `learning < 1`: the right-hand label reads "Learning · day
  3" instead of the confidence word, and the figure is the `about()` form
  ("About 4h" / "left of about 4h 30m") until `learning >= 0.5`.

Tests: `buildBudget` over the demo journal asserting the arc (crash days
suppressed, green days healthy) and over synthetic journals for each state.
Pin that `leftMin` is null only for `'suppressed'`, that a one-day journal
with a single trusted HRV reading yields a number, and that the number moves
toward the personal median as held days are appended.

---

## 3. Health reads

### 3.1 `HealthApi` (`src/lib/health/index.ts`)

```ts
readDayLoad(dk: string): Promise<{
  steps: number | null;
  stepSpans: { startMin: number; endMin: number }[] | null;  // minutes past midnight, one per step sample/record with count > 0
  standMin: number | null;                                   // iOS only, null elsewhere
  hr: { t: number; bpm: number }[] | null;
}>;
```

- iOS steps: **use a statistics query, not a sample sum.** When a watch is
  paired, HealthKit holds the phone's steps AND the watch's steps for the
  same minutes; `queryStatisticsForQuantity(StepCount, cumulativeSum)` merges
  sources and de-duplicates, a sum over `queryQuantitySamples` double-counts.
  The spans come from the samples (`limit: 0`, the L538 rule): each sample's
  start..end with `count > 0`. HR via the `seriesQ` pattern (L536) over local
  midnight..now, raw points returned, NOT thinned; the shell computes
  `hrMinutesAbove` on the raw series and thins only what it stores.
- iOS stand: `queryStatisticsForQuantity(AppleStandTime, cumulativeSum)` in
  minutes. It exists only when a watch wrote it; a zero with no watch is
  reported as null, never as "did not stand" (check for at least one sample
  before trusting the sum).
- Android: `readAll<StepsRecord>('Steps', from, to)`: `steps` is the sum of
  `count`; spans are each record's `startTime..endTime` with `count > 0`
  (providers chunk records by minute or by walk). Health Connect has no stand
  record, `standMin` is null. HR via `readAll<HrRecord>('HeartRate', ...)`
  flattening `samples` as `nightOf` does (L147).
- `walkingMinutes(spans)` (pure, `burn.ts`): merge overlapping spans, cap any
  single span at 60 minutes (some providers write one day-long record), sum.
  Test with overlapping phone + watch spans and with a day-long record.
- Stub returns nulls.

### 3.2 Permissions

- iOS `READ_IDS`: add `HKQuantityTypeIdentifierStepCount` and
  `HKQuantityTypeIdentifierAppleStandTime`. Nothing else.
- Android `READ_TYPES`: add `'Steps'`; `app.json`: add
  `android.permission.health.READ_STEPS` in the SAME commit (the consent-loop
  trap in `askedAuth.ts` L59-74). No stand type exists to declare.
- New `HealthScope 'steps'` for `readAuthStatus` so the strip can ask "is
  steps granted" without requesting.

### 3.3 Existing users

Split the read set into `CORE_READ_IDS` (unchanged, drives `HealthUpdates`
and onboarding) and `STEPS_READ_IDS`. `requestAuth({ scope: 'steps', force:
true })` requests the union under its own latch key. Test that the core set
key string is byte-identical to before this change, so no background path
prompts.

---

## 4. Shell: `src/store/budget.ts`

- `refreshDayLoad(dk)`: Health connected and `load.readAt` older than
  `LOAD_STALE_MIN = 20` ⇒ `readDayLoad`, `hrMinutesAbove` with the current
  `exertionLine`, thin the series to `NIGHT_SERIES_MAX`, `storeWaveform(loadWaveformId(dk), { sampledHr })`
  BEFORE the `mutate` that writes `days[dk].load`. Launch, foreground
  (throttled like `HealthUpdates`), and the Journal's pull-to-refresh, today
  only. Wrapped; `logError('budget.load', e)`.
- `setPosture(dk, posture)` via `mutate`.
- `connectPacingHealth()`: `requestAuth({ scope: 'steps', force: true })` then
  `refreshDayLoad`.

No cache module. `DaySummary` computes `scoreSet`, `detectStrain` and
`detectDownturn` in `useMemo`s keyed on `state.days`; add `buildBudget`
beside them with a `now` from a `useNow(5 * 60_000)` hook (only while `dk ===
todayKey()`), so the pace marker walks through the day. Progress's section
gets the deferred build for free because `buildCategories` runs inside its
`InteractionManager` task.

---

## 5. The Journal strip

### 5.1 Placement

Inside `ScoredHero` (`src/features/DaySummary.tsx` L623), after the `Flag`
rows and before `<KeyFigures/>` (L713). New file
`src/features/budget/Strip.tsx`; `ScoredHero` gains a `budget: BudgetView`
prop and one line. The gauge, deltas, confidence line and paragraph are not
touched. `UnscoredHero` gets no strip.

The design puts a hairline ABOVE the strip and keeps the one above the tiles
(`border-top: 1px #ffffff0d; padding-top 12; margin-bottom 12`). `KeyFigures`
already draws its own top hairline with `marginTop: 16`; set the strip's
container to `borderTopWidth: StyleSheet.hairlineWidth, borderTopColor:
p.border, marginTop: 14, paddingTop: 12` and leave `KeyFigures` alone.

### 5.2 Anatomy (transcribed from the design, section 38c)

The whole strip is ONE `Pressable`, 52pt tall, `hitSlop` 4.

```
PACING  3h 20m  left of 5h 30m                       ← label row, baseline aligned, gap 7
[███████████░░░|░░░░░░░░░░░░░░░░]  ›                ← bar 12pt + chevron 18pt, gap 11
(i) Behind pace for 2:40pm, which leaves room   Low confidence   ← subtext row, 11.5pt
```

- Label "PACING": 11pt, 700, `letterSpacing` 1.1, uppercase, `p.textDim`.
- Figure: `fonts.numHeavy` 14.5pt tabular, `p.text` (red `p.accent` when
  over).
- Figure sub: 11.5pt `p.textDim`, `numberOfLines={1}`, ellipsis.
- Bar: height 12, radius 999, track `hexA(p.text, 0.06)`, fill absolute with
  radius 999. Chevron `Icon chevronRight` 18 in `hexA(p.textDim, 0.8)` beside
  it, `flex: none`.
- Pace marker: 2pt × (bar + 8) white at 84 percent alpha, centred on
  `expected`, with a 10×6 triangle under the bar pointing up. Draw with two
  absolute `View`s (a rotated square for the triangle, or an `Svg` polygon).
  This is the design's ONE new visual idea.
- Subtext row: optional 12pt circle-i mark (amber or red, use `Icon
  "info"` tinted, or an `Svg` circle + line matching the design), sentence
  11.5pt (`p.textDim` normally, `hexA(p.text, 0.8)` when flagged),
  `numberOfLines={1}`, and on the right "Low confidence" 11.5pt `p.textDim`
  with `marginRight: 29` so it ends under the chevron. Gap above the subtext
  is 14 (10 when over).

Colours (map the design's palette onto the app's tokens):

| Design | App token |
| --- | --- |
| G `#3ec46d` fill | `SCORE_COLORS.good` |
| AMBER `#e0a030` ahead | `CAUTION_GOLD` |
| RED `#e03127` over | `p.accent` |
| grey fill `#a8a8b0` provisional | `p.textDim` |
| white marker `#ffffffd6` | `hexA(p.text, 0.84)` |
| track `#ffffff0f` | `hexA(p.text, 0.06)` |

Light theme: the same tokens resolve through `usePalette()`; the design's
light tiles use `#15803d` for good, which is what `SCORE_COLORS.good` already
reads as on the light palette if it differs, otherwise leave it.

### 5.3 The six states

**a. Healthy.** Fill `good` at `spend / envelope`, marker at `expected`, no
mark, sub "Behind pace for 2:40pm, which leaves room". The gap between fill
and marker IS the good news: no badge, no praise.

**b. Ahead of pace.** Fill `CAUTION_GOLD`, marker shown, amber mark, sub "At
this pace the budget runs out around 4:10pm". Figure "1h 05m", sub "left of
5h 30m".

**c. Over budget.** Figure "Over by 45m" in `p.accent`, no figure sub. Bar
fills end to end in `p.accent`, no marker. Over it, the ember: a horizontal
`LinearGradient` (`expo-linear-gradient` is already a dependency; check
`package.json`, else `react-native-svg` `LinearGradient`) with the design's
stops `#e03127 0, #ff7a3d 22%, #e03127 46%, #ff5c2e 70%, #e03127 100%` at
200 percent width, translated with Reanimated `withRepeat(withTiming(−w,
{ duration: 3400, easing: Easing.linear }), −1, false)`, clipped by the bar's
`overflow: hidden`. Under it a glow: an absolute `View` inset −3, radius
999, `hexA(p.accent, 0.33)`, `withRepeat(withTiming(0.75, { duration: 1100 }),
−1, true)` on opacity between 0.35 and 0.75 (blur is not available; the soft
alpha reads close enough, and on iOS a `shadowRadius: 5` on that view gets the
rest). Red mark, sub "Resting now brings this back down". **This is the only
animation in the card and it runs only in this state.**

**d. Low confidence.** Figure "About 3h" / "left of about 5h" (§2.10). Fill
`p.textDim` at the provisional share. Hatching over the FULL bar length: a
`repeating-linear-gradient` has no RN equivalent, so draw it with
`react-native-svg` `Pattern` (a 9-wide tile with a 3-wide `hexA(p.text,
0.06)` stripe at 115°) or a row of 2×16 rotated `View`s at 9pt pitch, whichever
already exists in the codebase (check `components/ui.tsx` `DisabledHatch` at
L317: it draws exactly this and can be reused with a lighter alpha). Marker
shown. Sub is the recommendation title ("Todo: Log your sleep"), right label
"Low confidence". Tapping the strip opens the sheet; the `Todo` line is not a
separate target (the whole strip is one tap; the sheet's Today card carries the
same Todo as a row whose tap runs the action).

**Learning (day one to fourteen, not drawn separately, and deliberately
so).** The strip is whichever of a to d applies, with two differences: the
right-hand label reads "Learning · day 3" in `p.textDim` where "Low
confidence" would sit, and while `learning < 0.5` the figure takes the
`about()` form. The hatch appears only when confidence is genuinely low, not
because the app is new: a day-one user with an HRV reading and last night's
sleep sees a solid bar, a firm-ish "About 4h", and the word Learning. The
claim is "this is yours and it is still being fitted", which is different
from "this is unknown". The first held day visibly moves the figure, and the
sheet's fourth card says by how much.

**e. Suppressed.** Replaces the bar with a tinted tile: `backgroundColor:
hexA(CAUTION_GOLD, 0.08)`, `borderWidth 1`, `borderColor: hexA(CAUTION_GOLD,
0.22)`, radius 15, padding 12/13. Left, a 38×38 radius-13 well
`hexA(CAUTION_GOLD, 0.12)` holding a pause glyph (two 3.4-wide rounded bars,
`Svg` or two `View`s) in `CAUTION_GOLD`. Text "Budget paused for today"
13.5pt 700 `p.text`, under it "Take it easy, resume tomorrow" 11.5pt `hexA(p.text,
0.66)`. Chevron 13pt. Tap opens the sheet, whose Today card states the reason
and the resume condition (§6.1). Not a warning: the warning card below the
Outlook already is one.

**f. Locked.** A single row at the strip's height: lock glyph 14pt
`p.textDim` (`Icon "lock"` if present, else `Svg`), "Pacing budget" 13.5pt
700 `hexA(p.text, 0.8)`, under it "Included with Pro" 11.5pt `p.textDim`, and
on the right "See what it does" 12.5pt 700 `p.accent`. Tap opens the pitch
card (§6.4). No figure, no bar, no blur.

`locked = useTier() === 'free'`; `isBudgetLocked()` sibling of
`isPotsResultLocked` reads `getTier()` at tap time.

---

## 6. The sheets: `src/features/budget/`

House grammar: `InsightCard` + `CardRow` from
`src/features/insights/Sections.tsx`, measurements from `insights/style.ts`,
help copy in `src/lib/help.ts`. The design's cards are `#141416` with radius
22 and inset rows `#0a0a0b` radius 16: that is `InsightCard` with `bg:
p.sunk` and `CardRow` with `ROW_BG` swapped for `p.bg`, which `CardRow` does
not expose yet. Add an optional `bg` prop to `CardRow` (one line) rather than
a new row component.

### 6.1 `BudgetSheet.tsx`

Default scrolling sheet. Title "Pacing budget", subtitle the day and time
("Tuesday, 2:40pm", `fmtDateLong` + `fmtTime12`; for a past day the date
only). Four cards:

1. **Today.** Sentence "Today's estimate, and how much of it the day has used
   so far." Then the 40pt figure "3h 20m" with "left" 14pt beside it; a 14pt
   bar with fill and marker (the strip's bar component with `height={14}`);
   under it "2h 10m spent" left and "2h 32m by now" right at 11.5pt; then an
   explainer bubble (`p.bg`, radius 14, the small triangle glyph, "The white
   mark is where an even day would have you by 2:40pm. Left of it is room,
   past it is ahead."); then three tiles Today's budget / Spent / Left (17pt
   `numHeavy`, Left in `good`). In the `over` state the figure is "Over by
   45m" in `p.accent`, the bar is full red and still (no ember in the sheet),
   and the third tile reads Over. Whenever a recommendation exists a `CardRow` "Todo: Log
   your sleep ›" under the tiles runs the recommendation's action. In
   `suppressed` the card holds the pause tile from the strip, the sentence
   "No budget is published on a day the app sees a downturn, since a number
   here invites someone to spend it.", and "Resumes when the warning card
   below your Outlook clears." Coverage line at the bottom in every state:
   "Built from 3 logged activities, 6,400 steps and 9 hours of heart rate" /
   "Built from 3 logged activities and 6,400 steps" (phone only, no HR) /
   "Logged activities only, steps not connected" with a `CardRow` "Connect
   steps from Apple Health ›" (`healthAppName()`) whenever steps are not
   granted, Health connected or not.
2. **Where it went.** Sentence "The 2h 10m spent so far, largest source
   first." Rows from `burn.rows`: 34×34 icon well, label 14pt 700, detail
   11.5pt, a 4pt share bar in the row's colour under the detail, cost `hm()`
   15pt 700, chevron. Row colours: hr `CAUTION_GOLD`, upright `#8a9ee8`,
   activities `#5eb4e8`, multiplier `#c9a0e8` (add these four to the feature's
   `style.ts`, the design's own; credits `SCORE_COLORS.good`). The credits
   row shows "−22m" in `good` and its share bar in `good`, last in the list.
   Empty: "Nothing charged yet today." Each row opens the drill-in; the
   credits drill-in lists each restorative entry and what it bought back.
3. **Why today is 5h 30m** (the title CARRIES the figure; "Why today is about
   5h" when low; "Why today is paused" when suppressed). Sentence "This
   morning's readings, each against your own usual, not a population range."
   Rows from `envelope.inputs`: value 16pt `numHeavy` + unit 11pt + label
   13pt on the left, `vs` 12pt 600 in its colour on the right, then a 5pt bar
   with the fill in the row's grade colour and a 1.5pt tick at `usual`. A ghost
   row keeps the shape: no value, "Standing test" label, "Not logged today"
   in `#6a6a72`, and a hatched 5pt bar. Footnote with the small circle-i:
   "Ghost rows are inputs the app has not seen yet today. The estimate widens
   without them." A `carryover` or `strain` reduction is a row like the
   others ("Yesterday ran over", "−20% today"). Last, a posture `CardRow`
   with a three-way `LinkToggle` Upright / Mixed / Horizontal → `setPosture`.
4. **How well this holds.** Sentence "Days you stayed under budget, and
   whether the next two days held." Headline "11" 30pt in `good` + "of your
   last 13 days held" 14pt. The 13-cell strip: `flex: 1`, height 26, radius
   6, cells `good` held / `CAUTION_GOLD` dipped / `hexA(p.text, 0.08)` over /
   hatched pending. Legend Held · Dipped after · Over budget. Footer above a
   hairline: the ceiling sentence from §2.6, or while learning "Learning your
   ceiling, day 3 of 14. Your budget moved up 25m after Tuesday held." (the
   early-days adjustment from §2.2, so the reader watches it learn), or when
   learned but `!ready` "12 of 21 days evaluated. The readout arrives when
   three weeks have played out." The card title while learning is "How it is
   learning".

### 6.2 `SpendSheet.tsx` (drill-in)

Header eyebrow "SPEND SOURCE" 12pt uppercase `p.textDim`, title the row's
label 21pt 700. Card 1: 32pt figure ("48m" in the row's colour) + "charged of
2h 10m spent", the sentence for the source ("Time your heart rate sat above 98
bpm, which is your own exertion line, not a fitness zone."), and for `hr` a
150pt `LineChart` of `getWaveform(loadWaveformId(dk)).sampledHr` with a dashed
`trendLine`-style horizontal at the line (add a `guides` prop, or reuse
`marks` to shade the above-line minutes in `CAUTION_GOLD`; use whichever the
chart already supports and extend by one prop at most), x ticks at wake /
noon / now, legend "Above your line" and "98 bpm". For `activities`: no chart,
one `CardRow` per member (label, minutes, effort, "assumed 20m" when
`assumed`), tap opens `useEntryForms(dk).openActivity`. For `upright` with an
HR series: the same 150pt trace, with `marks` shading walk spans in `#8a9ee8`
and still-upright spans in a lighter tint of it, the signature band drawn as
two faint horizontal guides (`restBpm + 0.6 × riseBpm` and the exertion
line), sentence "Minutes your heart sat in your own standing band with no
steps, plus minutes walking. Estimated, so tap Mostly horizontal below if
today was not like that.", legend "Walking" / "Standing, estimated", and the
posture `LinkToggle` under the chart. Its "Why" rows: "1h 10m walking · 14m",
"1h 00m standing, estimated · 12m", "Your standing band, 84 to 98 bpm · from
your stand test" (or "· default, log a stand test to fit it"), and the
longest still stretch with its clock time. For `upright` without HR, and for
`multiplier`: no chart, the sentence explains the source. Card 2 "Why it cost
48m": rows label 13pt / value 14pt 700, four at most, last one good news in
`good` when it exists: "48 minutes above 98 bpm · 48m", "Longest stretch,
12:40 to 1:04pm · 24m", "Peak, 128 bpm · 30 above", "Your line moved up 3 bpm
this month · Cheaper" (from `exertionLine(dk)` vs `exertionLine(dk − 30)`).
`fitContent` when there is no chart.

### 6.3 Help copy

`BUDGET_HELP` in `src/lib/help.ts`: four entries (what / why) for the cards,
one for the strip's ⓘ in the Outlook explain sheet if that sheet lists
components.

### 6.4 `BudgetPitchCard.tsx` (design section 38f)

Opened by "See what it does". `fitContent`. Gradient border in `p.accent`
(reuse `GradientBorderCard`: export it from `DaySummary.tsx` or lift it to
`components/`; lifting is preferred, `DaySummary` then imports it).
Contents, top to bottom:

- Lock glyph + "PACING BUDGET" eyebrow 11pt uppercase `p.textDim`.
- Headline 21pt 700: "Know how much today can absorb, before you spend it".
- Body 13.5pt: "Each morning your readings set a budget in minutes. The app
  tracks what the day uses and tells you where you stand against it."
- A sample strip in a `p.sunk` radius-18 box: "PACING 3h 20m left of 5h 30m",
  a 12pt bar at 39 percent `good` with the marker at 46 percent, and the
  caption "Lives inside your Autonomic Outlook card". Static sample numbers,
  never the user's own.
- Four perks with green ticks, 14pt title / 12.5pt body, verbatim from the
  design's `perks` array (the fourth is "It tells you when it is wrong").
- Hairline, then `Button` "Purchase Pro" primary 52pt → `usePaywall('pacing')`,
  the price line "$7.99 a month or $49.99 a year" from `priceOf` (as
  `PotsLockedCard` does), then a ghost "Not now" that closes. Self-dismisses
  on tier change like `PotsLockedCard`.

### 6.5 Custom type effort

`TypeManager.tsx` L72 and `LogPicker.tsx` L107 for `kind === 'activities'`:
one `LinkToggle` row "Effort" Light / Moderate / Heavy, default Moderate, into
`addCustomType(kind, name, { load })` / `editType`.

---

## 7. Progress section (`src/lib/analysis/categories.ts`)

Insert after `activity` at L557-564:

```ts
{ id: 'pacing', icon: 'gauge', title: 'Pacing', desc: 'Budget vs what the day cost', buckets: bl, build: () => nonEmpty(pacing()) },
```

`pacing()` builds ONE `AnalysisCard` from `buildBudget` per day over the
buckets' days (past days evaluate at end of day, `now` = 23:59):

- `title: 'Budget margin'`, `tiles: true`, stats **Over budget** (day count,
  `SCORE_COLORS.bad`), **Under** (count), **Average margin** (signed `hm()`,
  `prefix` "+" / "−", colour by sign). Margin is `envelope − spend` in
  minutes: the unit the rest of the feature speaks.
- One `LineChart` of per-bucket mean margin through `acAgg`, zero as a zone
  boundary, `catBands` two-band (below 0 `bad`, at or above `good`) so the
  grade dot re-grades on scrub.
- `insights`: the accuracy sentence when `ready` ("Your budget held on 11 of
  13 under-budget days this range."), and the ceiling sentence when it moved.
- Suppressed days contribute null. Learning days count (their budget was
  real for the user that day); the card's `desc` says "Includes 9 learning
  days" while any are in range.

Demo (`src/lib/demo.ts` L364-378): add `errands` (~45 min, p 0.5) for `w` in
0.3..0.6, `strength` (~30 min, p 0.3) for `w > 0.75`, and a `stressfulWork`
entry the day before each crash trough, so the demo margin curve dips before
the crashes. Update `demo.test.ts` if it pins counts. The Journal never sees
this.

Skeleton: `SectionSkeleton` dresses tiles + one chart already. Verify the
veil on Week and Month. Free tier: `LockedOverlay` masks every range but Day,
same as every section.

---

## 8. Paywall and ping

- `src/features/Paywall.tsx` L150: add `'pacing'` to `PaywallSource`.
- `src/lib/ping.ts` L151-154: `SurfaceCode` gains `'B'`; `surfaceCode` maps
  `pacing → 'B'`; test in `src/lib/__tests__/ping.test.ts`.
- `sls/lambdas/ping/main.js` L189 `SURFACES`: `B: 'pacing'`; test in
  `sls/tests/ping.test.mjs`.
- `landing/master/analytics.js` L177-188: `SURFACE_NAME.B = 'Pacing budget'`,
  add `'B'` to `SURFACE_ORDER` and `WALL_ORDER` before `'?'`; test in
  `landing/tests/master-paywall.test.mjs`.
- **Deploy the lambda before a build carrying `B` ships**, or the ping fails
  outright (CLAUDE.md, ping bullet). Say so in the final report.

---

## 9. Clear all data, export, diagnostics

- `clearAllData`: `day.load` and `load:<dk>` waveforms go with the journal
  and sidecar; no flags key is written by this feature except the steps auth
  latch, which is about the person. Assert in the clear-all test.
- Export: `day.load` rides `serializeState`; `load:<dk>` rides `waveformIds`.
  Old imports have neither; every consumer treats absence as unknown.
- `src/lib/diagnostics/collectApp.ts`: one COUNT row, "days with load read".

---

## 10. Build order and verification

Each step ends green (`npm test`, `npm run lint`) before the next.

1. **Types, load table, engine with tests** (§1, §2). Print the demo journal's
   60-day table `{ dk, envelope, spend, state, outcome }` once in a test. Look
   at it. A green day reading over, or a crash day carrying a number, is a
   model bug to fix before any UI.
2. **Health reads + shell** (§3, §4), including `upright.ts` (§2.12) run
   against the 81-day export's imported workout traces plus a synthetic
   all-day series. Test `hrMinutesAbove` with a charger gap
   and three stretches.
3. **Strip** (§5), all six states plus a day-one journal (one HRV reading,
   one night of sleep, nothing else) showing a Learning budget, light and
   dark. Use
   `FORCE_TIER` (memory: mobile-freemium-tier) and a dev journal on the
   simulator (memory: mobile-simulator-verify). Screenshot each state and
   compare against section 38c of the design side by side. Confirm nothing
   animates in any state but over, and that the card's height does not change
   between locked and unlocked (the design's "unlocking does not shift the
   card").
4. **Sheets** (§6): budget sheet, drill-in, pitch card, custom-type effort.
   Compare against 38d and 38f.
5. **Progress section** (§7) with demo; veil on Week and Month; free-tier
   mask.
6. **Ping plumbing** (§8), all three suites.
7. **Copy pass.** Grep the new files for `—` (none), "tomorrow" (allowed only
   in "Take it easy, resume tomorrow"), "you may", "you can", "you should",
   "exceeded", "eased" (credits are refunds: "bought back"), and any percent
   shown to the user (none: minutes, bpm, and "1.2x" only).
8. **Docs.** One CLAUDE.md bullet in the house style stating the honesty rules
   (notes §7) and the three load-bearing traps: steps are a floor never a
   sum, the outcome window is +1..+2 never tomorrow, and the ember is the only
   animation and runs only when over. Do NOT touch `CHANGELOG.md` or
   `whatsNew.ts` (memory: changelog is opt-in; Austin names what is
   announced).

Final report must list: screenshots of the strip states beside the design,
the demo table, which permission prompt existing iOS users will see and when,
the lambda deploy dependency, and the follow-ups (widget figure,
notifications, active
energy).
