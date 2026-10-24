# Build prompt — `src/lib/trends/`: one source of truth for "is this metric moving?"

You are working in the **Autonomic Journal** repo. Read `CLAUDE.md` at the root first — its
conventions are binding. App code lives in `mobile/`.

## The problem

Several places in the app independently answer the question *"has this metric moved, in which
direction, and does it matter?"* — and they disagree.

| Where | How it decides | Window |
| --- | --- | --- |
| `src/lib/widgets.ts:101` `weekTrend` | today vs trailing-week **mean**, fires on **any** non-zero % change | 7 days |
| `src/lib/scoring/downturn.ts` | mean baseline, `MIN_SCORED = 4`, magnitude thresholds, `CEILING = 75` | `WINDOW = 8` |
| `src/lib/scoring/upturn.ts` | same shape again — "the mirror of ./downturn" — `MIN_SCORED = 4`, `MIN_TODAY = 40` | `WINDOW = 8` |

Two consequences, both real:

1. **The widget arrow flips on noise.** `weekTrend` reports a direction for a 1% change with no
   coverage requirement, so the home-screen widget can show ▲ while the app shows a downturn
   warning for the same day.
2. **`downturn` and `upturn` duplicate each other**, so any change to what "a trend" means has
   to be made twice and kept in sync by hand.

Adding the Trend card (below) without fixing this would make it three implementations.

## What to build

**`mobile/src/lib/trends/` — pure. No store, no MMKV, no expo, no React.**

The centrepiece is a **metric registry**: one table where each metric declares its extractor,
its direction, its thresholds and its copy. Everything else is generic machinery over that
table. This mirrors how `src/lib/registry.ts` is the single source of truth for entry types —
follow that pattern deliberately, including the comment density.

```
src/lib/trends/
  metrics.ts     # THE registry — the single source of truth
  series.ts      # days -> per-day values, one pass
  compare.ts     # windowed aggregate + delta + significance
  index.ts       # public API
  __tests__/
```

### `metrics.ts` — the registry

```ts
export type TrendMetricId =
  | 'score' | 'badDays' | 'rmssd' | 'restingHr' | 'sleepDuration' | 'sleepConsistency';

export interface TrendMetricDef {
  id: TrendMetricId;
  label: string;                       // "Resting heart rate"
  unit: string;                        // "bpm"
  /** Which way is good. 'band' = closer to `target` is better (sleep duration). */
  better: 'up' | 'down' | 'band';
  target?: [number, number];           // for 'band'
  /** Smallest change worth telling a user about — clinical, not statistical. */
  minDelta: number;
  /** Whether minDelta is absolute or a fraction of the prior window. */
  deltaKind: 'absolute' | 'relative';
  /** Minimum data points required in EACH window. */
  minPoints: number;
  /** Per-day value, or null when that day has nothing to say. */
  value: (d: DayRecord, dk: string, days: DaysMap, ctx: ScoreContext) => number | null;
  /** "down 6 bpm" — direction word plus magnitude, no subject. */
  phrase: (delta: number) => string;
}

export const TREND_METRICS: Record<TrendMetricId, TrendMetricDef>;
/** Display/selection priority, highest first. */
export const TREND_PRIORITY: TrendMetricId[];
```

The registry values:

| id | label | better | min delta | kind | min pts |
| --- | --- | --- | --- | --- | --- |
| `score` | Daily score | up | 0.5 | absolute | 8 |
| `badDays` | Bad days | down | 2 | absolute | 8 |
| `rmssd` | HRV (RMSSD) | up | 0.10 | relative | 5 |
| `restingHr` | Resting heart rate | down | 3 | absolute | 5 |
| `sleepConsistency` | Bedtime consistency | down | 20 | absolute | 8 |
| `sleepDuration` | Sleep | band → `[7, 9]` | 0.5 | absolute | 8 |

`TREND_PRIORITY` = the order above. Score and bad-days lead because they are the app's own
headline numbers and the most legible; sleep last because it is the least specific.

Notes the implementation must honour:

- **`rmssd` must extract through `trustedReadings` / `isTrustedReading`** (`src/lib/hrvQuality.ts`).
  Short imported HRV samples are excluded everywhere else in the app and must be excluded here.
  A trend built on the watch's passive ~1-minute samples reports noise as recovery. See
  `CLAUDE.md` — this is non-negotiable.
- **`sleepDuration` is not monotonic.** 11 hours is not better than 8. That is what `better:
  'band'` is for: score movement *toward* `[7, 9]`, and report nothing when both windows already
  sit inside it.
- **`sleepConsistency`** is the standard deviation of bedtime in minutes. Variance reduction is
  unambiguously good and well-evidenced — often a better story than duration.
- `score` and `badDays` come from `scoreSet` (`src/lib/scoring/day.ts`); reuse it, don't
  re-derive scoring.

### `series.ts` and `compare.ts`

```ts
/** Per-day values for the requested metrics across a key range, in ONE pass. */
export function metricSeries(
  days: DaysMap, keys: string[], ids: TrendMetricId[], ctx?: ScoreContext,
): Record<TrendMetricId, (number | null)[]>;

export type TrendDirection = 'improving' | 'declining' | 'flat' | 'unknown';

export interface TrendDelta {
  metric: TrendMetricId;
  direction: TrendDirection;
  recent: number; prior: number;       // medians
  delta: number;                       // recent − prior, raw
  significant: boolean;                // clears minDelta AND both minPoints
  recentN: number; priorN: number;
}

export function compareWindows(
  series: (number | null)[], recentLen: number, priorLen: number, def: TrendMetricDef,
): TrendDelta;
```

**Statistics rules — these are the product, so get them exactly right:**

- **Median, not mean.** One 130 bpm reading or one catastrophic night is normal in this
  population and will drag a mean into a false claim. (This is the specific bug in `weekTrend`.)
- **Enforce `minPoints` in *each* window independently.** Chronic-illness logging is irregular
  and crash weeks are often empty.
- **Enforce `minDelta`.** These thresholds are chosen to be *worth telling someone about*, not
  merely detectable. A 1 bpm move is noise dressed as progress.
- **`'unknown'` is a first-class result, and the default.** Insufficient coverage returns
  `unknown`, never `flat` — the two mean different things and callers render them differently.
- Never round before comparing; round only for display, and round so the number matches what
  Analysis would show for the same window.

*Known confounder, worth a code comment, not a blocker:* without cycle data (see
`marketing/PRO_GROWTH_IDEAS.md` §1.3 M) a 30-vs-30 comparison can be reading menstrual phase
rather than recovery.

### `index.ts` — the public API

```ts
/** The single best improvement worth surfacing, or null. Used by the Trend card. */
export function findTrend(
  days: DaysMap, dk: string, ctx?: ScoreContext,
): TrendFinding | null;

/** Direction of one metric over a window. Used by widgets. */
export function trendDirection(
  days: DaysMap, dk: string, id: TrendMetricId, windowDays?: number, ctx?: ScoreContext,
): TrendDirection;

export interface TrendFinding {
  metric: TrendMetricId;
  headline: string;   // "Your resting HR is down 6 bpm since last month"
  detail: string;     // "62 → 56 bpm · 21 readings"
  delta: TrendDelta;
}
```

`findTrend` compares the last 30 days against the 30 before, walks `TREND_PRIORITY`, and returns
the first metric whose delta is `significant` **and** `improving`.

## The one rule that must never break

**`findTrend` returns improvements only. It never reports a decline.**

Telling someone with a chronic illness that their HRV fell 15% is cruel, useless, and for this
population an actual crash trigger. Decline is already owned by `DownturnWarning` /
`detectDownturn`, which has the right framing and copy.

`findTrend` must also return `null` when `detectDownturn` fires, **even if some metric
improved** — someone mid-crash does not want to hear their bedtime got more consistent. (The
lower-level `compareWindows` and `trendDirection` are neutral and do report declines; the
never-bad-news rule lives at the `findTrend` layer.)

## Consumers — three tiers, and the tiers matter

### Adopt it (this task)

- **`src/lib/widgets.ts`** — delete `weekTrend`, `TREND_UP`/`TREND_DOWN` local constants and its
  private `mean`. Call `trendDirection(...)` and map `'improving' | 'declining'` to ▲/▼,
  rendering nothing for `'flat'` and `'unknown'`. **This changes widget behaviour, and that is
  the point**: arrows stop flipping on 1% noise, and some widgets that previously always showed
  an arrow will now correctly show none. Update the widget tests to match.
- **The new `TrendCard`** (below).

### Adopt the primitives, behaviour-preserving (this task, carefully)

- **`src/lib/scoring/downturn.ts` and `upturn.ts`** — have both consume `metricSeries` for the
  scored-day extraction they currently each implement, and keep their own thresholds, windows
  and verdict shapes exactly as they are. `detectDownturn` fires a **crash notification**
  (`src/lib/reminders.ts`) and `detectUpturn` gates the **review ask** — changing when either
  fires is user-visible and safety-adjacent.

  **Hard requirement: every existing test in `src/lib/scoring/__tests__/` must pass unchanged.**
  If a behaviour-preserving refactor isn't achievable cleanly, leave these two files alone and
  say so in your summary — a shared extraction is not worth altering when a crash warning fires.

### Out of scope — do not touch, and here is why

- **`src/lib/analysis/milestones.ts`** (`msRollAvg`, `msWindowCount`, `msCleanRate`, `msNoneIn`).
  These answer "when did X *first* happen", not "is X moving now". Refactoring them would change
  which milestones fire and on what dates for **existing users with existing journals** —
  rewriting their history. Different job, unacceptable blast radius.
- **POTS baselines** in `src/components/summary.tsx` and `src/components/charts.tsx`
  (`baselineHr`, supine baseline, `orthoMaxDelta`). "Baseline" there means *supine HR within a
  single test*, not a trend across days. Entirely different concept — consolidating them would
  be a bug, not a cleanup.
- **The morning/evening delta** at `src/features/DaySummary.tsx:270`. Within-day comparison, not
  a time series.

## The UI consumer — `TrendCard`

Replaces `ProUpsellCard` (`src/features/DaySummary.tsx`, rendered ~line 206, defined ~428),
which is a permanent, generic, four-bullet list with a `LOCKED` badge shown to every free user
on every day. It says nothing about the user, so people stop seeing it, and the badge frames the
app as broken rather than the offer as available.

**The Trend card renders for every tier.** It is a feature, not an upsell. Free and Pro see the
identical headline; the tier changes only two things:

|  | Free | Trial / Pro |
| --- | --- | --- |
| Headline | identical | identical |
| Tap destination | Analysis **Month** — locked segments, so the user meets their own faded data and the paywall raises from there | Analysis **Month**, unlocked |
| Upgrade sub-line | shown, when the upsell gate allows | never shown |

A card that only appears when you haven't paid is an advertisement, and people learn to ignore
advertisements. The same card shown to everyone is a feature — and for a free user the locked
destination sells far better than the card could. **Consequence: the card does not pass through
`nextUpsell()`; only its optional upgrade sub-line does.** The fact is never rationed, only the
ask. (If `src/lib/upsell/` from `UPSELL_ELIGIBILITY_PROMPT.md` isn't built yet, ship without the
sub-line and leave `// TODO(upsell-gate)`.)

**`mobile/src/features/TrendCard.tsx`**

- Compact single row: icon · headline · chevron, with a dimmed detail line. **No accordion** —
  there is one line, so `useAccordion` is dead weight here.
- Renders nothing when `findTrend` returns null.
- Tap → navigate to Analysis with `mode = 'month'`. **Do not open the paywall directly**; a free
  user should land on their own data and let that view raise it. Skipping there skips the
  persuasion.
- Reuse the existing visual language — `usePalette()`, `radius.card`, `Icon`, and the silhouette
  of `MilestoneProgressCard` / `StreakCard` so it sits naturally in the stack.

**`src/features/DaySummary.tsx`** — delete `ProUpsellCard` and its `PRO_BENEFITS`; replace
`{tier === 'free' ? <ProUpsellCard /> : null}` with `<TrendCard dk={dk} />` in the same slot
(after `DownturnWarning`, before `MilestoneProgressCard`).

**Performance:** `metricHistory` (`src/lib/scoring/day.ts:437`) walks **all** days; six metrics
would be six full walks on a screen that re-renders on sheets and animations. Do not use it
here — that is what the single-pass `metricSeries` over the ~60 keys in both windows is for. One
`useMemo` keyed on `[state.days]`, matching the `DaySummary` convention already in that file and
the `save()`/`days`-identity rule in `CLAUDE.md`.

## Tests — `src/lib/trends/__tests__/`

The registry is the product and the copy makes factual claims about the user's data, so pin
both, not just the branches:

- each metric fires at exactly its `minDelta` and stays silent one unit below it
- below `minPoints` in **either** window → `unknown`, even with a large delta
- an outlier cannot flip a verdict (proves medians, not means)
- `'unknown'` is never returned as `'flat'`
- `sleepDuration`: 8h → 11h reports nothing; 5h → 7h improves; both-in-band reports nothing
- `rmssd` ignores imported HRV under `IMPORTED_HRV_MIN_SEC`
- `findTrend` returns null when every metric declined (never-bad-news)
- `findTrend` returns null during a downturn even with an improving metric
- `TREND_PRIORITY` order holds when several metrics qualify at once
- `findTrend` returns exactly one finding
- a table-driven case per registry entry, so adding a metric without a test fails

## Non-goals

- Do **not** gate, delay or suppress any reactive paywall. Tapping a locked Week/Month/Year
  segment must still raise the paywall instantly, every time.
- Do **not** show `TrendCard` only to free users.
- Do **not** report declines in `findTrend`, and do not add a "needs attention" variant.
- Do **not** touch milestones, POTS baselines, `src/store/iap.ts`, `src/store/tier.ts`,
  `PaywallCard`, or `DownturnWarning`'s copy.
- Do **not** add analytics or network calls.
- Do **not** add a metric that isn't in the registry table above. New metrics go in the
  registry, never inline at a call site — that is the entire point of this task.

## Acceptance

- `npm test` and `npm run lint` pass in `mobile/`.
- `src/lib/trends/**` imports nothing stateful — no `react-native-mmkv`, no `../../store/*`, no
  `expo-*`, no React. If it does, the split has failed.
- `grep -rn "weekTrend" src/` returns nothing.
- Every existing test in `src/lib/scoring/__tests__/` passes **unchanged**.
- A Pro user with 60 days of improving data sees the card and taps into an unlocked Month view.
- A free user with the same data sees the identical headline and lands on the locked Month view.
- A user mid-downturn sees no card, whatever their metrics did.
- A user with 9 days of data sees no card.
- A widget metric that moved 1% shows no arrow.
