# Build prompt — the Trend card: replace `ProUpsellCard` with something true

You are working in the **Autonomic Journal** repo. Read `CLAUDE.md` at the root first — its
conventions are binding. App code lives in `mobile/`.

## What exists today

`ProUpsellCard` (`src/features/DaySummary.tsx`, rendered at line ~206, defined at ~428) sits in
the day summary of every free user, permanently, expanded by default, with a `LOCKED` badge and
four generic bullets. It is the same card on day 8 as on day 300. It says nothing about the
user, so people stop seeing it, and the badge frames the app as broken rather than the offer as
available.

Replace it with a card that says one true thing about the user's own data.

## The central design decision — read this before anything else

**The Trend card renders for every tier, not just free users.**

It is a *feature*, not an upsell. Free and Pro users see the identical headline. The tier
changes only two things:

|  | Free | Trial / Pro |
| --- | --- | --- |
| Headline | identical | identical |
| Tap destination | Analysis **Month** (locked segments — the user meets their own faded data, and the paywall raises from there) | Analysis **Month**, unlocked |
| Upgrade sub-line | shown, when the upsell gate allows it | never shown |

Rationale: a card that only ever appears when you *haven't* paid is an advertisement, and users
learn to ignore advertisements. A card that tells you your resting heart rate dropped 6 bpm is
worth having whether or not you pay — and for a free user, the locked destination does the
selling far better than the card ever could.

**Consequence:** the *card* does not go through `nextUpsell()`. Only the optional **upgrade
sub-line** does. The fact is never rationed; the ask is. (If `src/lib/upsell/` from
`UPSELL_ELIGIBILITY_PROMPT.md` isn't built yet, ship the card without the sub-line and leave a
`// TODO(upsell-gate)` — the card stands on its own.)

## The one rule that must never break

**This card reports improvements only. It never reports a decline.**

Telling someone with a chronic illness that their HRV is down 15% is cruel, useless, and for
this population an actual crash trigger. Decline is already handled by `DownturnWarning`
(`detectDownturn`), which has the right framing and the right copy. This card is the good-news
channel and nothing else.

It must also stay silent when `detectDownturn` fires, **even if some metric improved**. Someone
mid-crash does not want to hear that their bedtime got more consistent.

## Metrics

Compare a **recent window** against a **prior window** — last 30 days vs the 30 before. Report
at most one metric: the largest qualifying improvement, by the priority order below.

| Metric | Source | Better is | Min. delta to report | Min. points per window |
| --- | --- | --- | --- | --- |
| Daily score | `scoreSet(...).score` per day | up | ≥ 0.5 | 8 |
| Bad days / month | days scoring in the bad/crash categories | down | ≥ 2 days | 8 |
| Resting HR | `restingHr` readings | down | ≥ 3 bpm | 5 |
| RMSSD | HRV readings — **`trustedReadings` only** | up | ≥ 10% | 5 |
| Sleep duration | `sleepHours(...)` (`src/lib/scoring/day.ts`) | toward 7–9h | ≥ 30 min | 8 |
| Sleep consistency | stdev of bedtime minutes | down | ≥ 20 min | 8 |

Priority for choosing which to show: **daily score → bad days → RMSSD → resting HR → sleep
consistency → sleep duration.** Score and bad-days first because they're the app's own headline
numbers and the most emotionally legible; sleep last because it's the least specific.

Notes on individual metrics:

- **RMSSD must go through `trustedReadings` / `isTrustedReading`** (`src/lib/hrvQuality.ts`).
  Short imported HRV samples are excluded everywhere else in the app and must be excluded here —
  a card built on the watch's passive 1-minute samples would report noise as recovery. This is
  non-negotiable; see `CLAUDE.md`.
- **Sleep duration is not monotonic.** 11 hours is not better than 8. Score it as *movement
  toward the 7–9h band*, and report nothing if both windows sit inside the band already.
- **Sleep consistency** is variance reduction, which is unambiguously good and well-evidenced —
  often a better story than duration.

## Statistics — the part that must not lie

- **Compare medians, not means.** One 130 bpm reading or one catastrophic night is common in
  this population and will drag a mean into a false claim.
- **Enforce the minimum point counts above, per window.** Chronic-illness logging is irregular;
  crash weeks are often empty. Below the minimum, report nothing.
- **Enforce the minimum deltas above.** These are chosen to be *worth telling someone about*,
  not merely detectable. A 1 bpm change is noise dressed as progress.
- **Silence is the default.** Every guard failing means the card does not render. That is the
  correct outcome, not a gap to paper over.
- Round and phrase so the number matches what Analysis would show for the same window. If the
  card says 6 bpm and the chart implies 4, trust is gone.

*Known confounder, worth a code comment but not a blocker:* without cycle data (see
`marketing/PRO_GROWTH_IDEAS.md` §1.3 M) a 30-vs-30 comparison can be reading menstrual phase
rather than recovery.

## Performance

`metricHistory` (`src/lib/scoring/day.ts:437`) walks **all** days, and six metrics would mean
six full walks on a screen that re-renders on sheets and animations. Don't use it here.

Iterate the ~60 day keys in the two windows **once**, collecting every metric in that single
pass. Wrap it in one `useMemo` keyed on `[state.days]` — matching the `DaySummary` convention
already in that file, and the `save()`/`days`-identity rule in `CLAUDE.md`.

## Files

**`mobile/src/lib/trends/card.ts`** — pure, no store/MMKV/expo imports.

```ts
export type TrendMetric =
  | 'score' | 'badDays' | 'rmssd' | 'restingHr' | 'sleepDuration' | 'sleepConsistency';

export interface TrendFinding {
  metric: TrendMetric;
  headline: string;      // "Your resting HR is down 6 bpm since last month"
  detail: string;        // "62 → 56 bpm · 21 readings"
  deltaText: string;     // "−6 bpm"
  recentN: number;
  priorN: number;
}

/** The single best improvement worth telling the user about, or null. */
export function findTrend(
  days: DaysMap, dk: string, ctx?: ScoreContext, nowMs?: number,
): TrendFinding | null;
```

**`mobile/src/features/TrendCard.tsx`** — presentation.

- Compact single row: icon · headline · chevron. No accordion — there is one line, so
  `useAccordion` is dead weight; remove it from this card.
- Optional second line for the delta detail, dimmed.
- Optional upgrade sub-line, free tier only, gated by `nextUpsell()` when that module exists.
- Tap → navigate to Analysis, `mode = 'month'`. **Do not open the paywall directly.** A free
  user should land on their own data (dimmed, per `PRO_GROWTH_IDEAS.md` §2.1) and let that view
  raise the paywall. Skipping to the paywall skips the persuasion.
- Reuse the existing visual language: `usePalette()`, `radius.card`, `Icon`, and the card
  silhouette of `MilestoneProgressCard` / `StreakCard` so it sits in the stack naturally.

**`mobile/src/features/DaySummary.tsx`**

- Delete `ProUpsellCard` and its `PRO_BENEFITS` array.
- Replace `{tier === 'free' ? <ProUpsellCard /> : null}` with `<TrendCard dk={dk} />`,
  which renders nothing when `findTrend` returns null.
- Keep it in the same slot — after `DownturnWarning`, before `MilestoneProgressCard`.

**`mobile/src/lib/trends/__tests__/card.test.ts`**

The copy makes factual claims about the user's data, so pin the copy, not just the branches:

- each metric fires at exactly its threshold and stays silent one unit below it
- below the minimum point count → null, even with a large delta
- a **decline** in every metric → null (the never-bad-news rule)
- an outlier reading cannot flip the verdict (medians, not means)
- sleep duration: 8h → 11h reports nothing; 5h → 7h reports an improvement
- RMSSD ignores imported HRV entries with `durationSec` under `IMPORTED_HRV_MIN_SEC`
- priority order holds when several metrics qualify at once
- exactly one finding is ever returned

## Non-goals

- Do **not** gate, delay, or suppress any reactive paywall. Tapping a locked Week/Month/Year
  segment must still raise the paywall instantly, every time.
- Do **not** show this card only to free users. See the design decision above.
- Do **not** report declines, and do **not** add a "needs attention" variant.
- Do **not** touch `src/store/iap.ts`, `src/store/tier.ts`, `PaywallCard`, or `DownturnWarning`.
- Do **not** add analytics or network calls.

## Acceptance

- `npm test` and `npm run lint` pass in `mobile/`.
- `src/lib/trends/card.ts` imports nothing stateful.
- A Pro user with 60 days of improving data sees the card and taps through to an unlocked
  Month view.
- A free user with the same data sees the identical headline and lands on the locked Month view.
- A user mid-downturn sees no card, whatever their metrics did.
- A user with 9 days of data sees no card.
