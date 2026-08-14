# CLAUDE.md — project notes

**Autonomic Journal** is a private, offline-first app for tracking autonomic
recovery. The app is a native **Expo / React Native (iOS + Android)** build that
lives in **`mobile/`**. **All state is on-device** — no accounts, no sync, no
health data ever leaves the phone. The app makes exactly one network call of
its own, the anonymous cohort ping in `src/store/ping.ts` (one date, one
platform letter, no identifier); everything else in `sls/` belongs to the
private store-analytics dashboard at `/master`, not to the product. (A
previous pure-static-HTML PWA under `docs/` has been removed; the mobile app is
the app.) Platform split: the Apple Watch companion, HealthKit and ECG are
iOS-only; Android uses **Health Connect** (`src/lib/health/healthConnect.ts`,
same `HealthApi`) and hides every watch surface behind `Platform.OS === 'ios'`.
Both platforms share BLE strap + camera-PPG capture and the Play/App Store
subscription paywall (`src/store/iap.ts`).

See `mobile/README.md` for a fuller map. This file is the quick orientation.

## Layout

| Path | Purpose |
| --- | --- |
| `mobile/` | The app — Expo / React Native |
| `landing/` | Marketing landing page (separate from the app) |
| `landing/master/` | Private store-analytics dashboard served at `/master/` — framework-free HTML/CSS/JS, inlined into one prerendered page by `landing/src/routes/master/`, signed in via Cognito. See `MASTER_DASHBOARD.md` |
| `sls/` | The `/master` dashboard's API + DynamoDB table. **Nothing the mobile app uses** |
| `infrastructure/` | CodePipeline / CodeBuild stack; `buildspec.yml` at the root drives it |
| `FABLE_BUILD_PROMPT.md` | Historical build spec used to bootstrap the native app |

Pushing to `main` builds the landing site, syncs it to S3, invalidates
CloudFront and runs `sls deploy` — one pipeline for all three.

## Inside `mobile/`

| Area | Location |
| --- | --- |
| Routes (Journal · Analysis · Milestones · Insights + full-screen HRV) | `app/` (expo-router) |
| Built-in type registry (`READING_TYPES` / `ACTIVITY_TYPES` / `MED_TYPES` / `SYMPTOM_TYPES` / `TRIGGER_TYPES` / `MEAL_TYPES`) + field/summary helpers | `src/lib/registry.ts` |
| User-defined types layered over the registry (`typesFor`, `addCustomType`, `deleteType`) | `src/lib/typeCatalog.ts` |
| Scoring/grading (`computeScores`, `bandsFor`, `rowScoreCategory`, `hrvComposite`) | `src/lib/scoring/` |
| HRV pipeline (artifact correction, time/frequency domain, coherence) | `src/lib/hrv/` |
| Analysis / milestones / AI-insights builders | `src/lib/analysis/` |
| BLE heart-rate manager (0x180D / 0x2A37 RR parsing) | `src/lib/ble/` |
| Health wrapper (HealthKit on iOS · Health Connect on Android, one `HealthApi`) | `src/lib/health/` |
| MMKV store + `save()` | `src/store/store.ts` |
| Theme (light/dark), component library, charts, sheets | `src/theme/`, `src/components/` |
| Journal sections / summaries / forms / live capture / settings | `src/features/` |
| Unit tests (scoring + HRV) | `src/lib/**/__tests__/` |

## State shape (the persisted JSON)

State is a single object persisted to **MMKV** under the key
`autonomic.journal.v1` (`STORAGE_KEY` in `src/store/store.ts`), same schema as the
old web app so old `export.json` files import directly.

```jsonc
{
  "version": 1,
  "settings": { "theme": "light" | "dark",
                "reminder": { "enabled": true, "time": "08:00" } },  // daily morning nudge; source of truth for the OS schedule
  "profile": { "sex", "weight", "height" },  // feeds reading scores (e.g. sex-adjusted QTc)
  "customTypes": { "meds": { "custom-magnesium": { /* pure-JSON TypeDef */ } } },  // user-created types (activities/meds/symptoms/triggers)
  "hiddenTypes": { "symptoms": ["nausea"] },  // built-in types the user deleted (only allowed while unused)
  "meta": {
    "lastUpdated": "<ISO timestamp>",      // stamped by save(); see rule below
    "lastImport":  { "name": "file.json", "at": "<ISO timestamp>" }
  },
  "days": {
    "YYYY-MM-DD": {
      "sleep":      { "bed": "HH:MM", "wake": "HH:MM", "quality", "hrLow?", "hrHigh?",
                      "stages?": { "deep": 0, "rem": 0, "core": 0, "awake": 0 } },  // minutes, Health-staged nights only
      // readings/activities/meds/symptoms are logged-entry ARRAYS, each item
      // { id, type, time, note, ...templateFields }, where `type` keys into a
      // registry map (READING_TYPES / ACTIVITY_TYPES / MED_TYPES / SYMPTOM_TYPES)
      // or into state.customTypes for user-created types. Entries use an ordered,
      // typed field schema (number / select / time / check / text / textarea /
      // {divider:true}).
      "readings":   [ { "id", "type", "time", "note", ...fields } ],
      "activities": [ { "id", "type", "time", "note", ...fields } ],
      "meds":       [ { "id", "type", "time", "amount", "note" } ],
      "symptoms":   [ { "id", "type", "time", "note", ...fields } ],
      "food":       { "water": 0, "meals": [], "triggers": { "<triggerType>": count } },
      "digestion":  { "movements": [ { "id", "time", ...fields } ] }
    }
  }
}
```

## Important behaviors / conventions

- **Every mutation flows through `save()`** in `src/store/store.ts`, which stamps
  `meta.lastUpdated = new Date().toISOString()`. **Never write MMKV directly** —
  the store exposes an external store + `useSyncExternalStore` so React re-renders.
  The disk write is **debounced** (`src/lib/persist.ts`) and flushed whenever the
  app leaves the foreground; call `flushSave()` if a write must not wait.
  `save()` re-wraps `state.days` **only when a day was touched**, so the
  O(history) `useMemo`s keyed on `days` (Analysis sections, milestones) skip
  settings-only saves — day writes must go through `ensureDay` / `upsertEntry` /
  `deleteEntry` / `mutate` (they mark the flag), never via `getState().days`.
  Nested maps consumed by memo deps (`customTypes`, `hiddenTypes`) are replaced
  wholesale on edit (`typeCatalog.ts`), not mutated in place, for the same
  reason. Cheap subscribers should use `useStore(selector)` returning a
  primitive rather than `useAppState()`.
- **Waveform arrays never live in the journal.** `rrRaw` / `sampledHr` /
  `sampledSdnn` go to a sidecar MMKV instance keyed by entry id — write via
  `storeWaveform()`, read via `getWaveform()` (`src/lib/waveforms.ts` has the pure
  split/extract/import helpers). Readings AND activities: a workout imported from
  the health store keeps its full HR trace as `sampledHr`, which powers the
  workout report (`WorkoutSummary` + `WorkoutHrChart`, zones in
  `src/lib/workoutZones.ts`); tapping such an activity row opens the report
  instead of the edit form. `rrClean` isn't stored at all (re-derived via
  `correctArtifacts`). Exports carry a top-level `waveforms` map; old exports with
  embedded arrays still import. A dev-build warning fires if an inline array ever
  reaches the persisted journal.
- **Imports** record `meta.lastImport` (`{ name, at }`) before calling `save()`.
- **Periodic health-store import pill.** With Health connected, the app quietly
  checks today's Apple Health / Health Connect data on launch, at most hourly on
  foreground, and on the Journal's pull-to-refresh (iOS: custom overscroll brand
  mark; Android: RefreshControl) — `<HealthUpdatePill/>` in the root layout +
  `src/features/HealthUpdates.tsx`. Every check calls `HealthApi.requestAuth()`
  first — a permission we never asked for otherwise reads back as "nothing new"
  forever. That request is self-gating (`src/lib/health/askedAuth.ts`): silent
  when the platform has nothing left to ask, at most one prompt per app launch
  otherwise, concurrent callers coalesced into one sheet, and only the Connect
  buttons pass `force`. It covers the whole set both devices need (the watch's
  workout SHARE included) plus ECG, which rides on the local
  `modules/ecg-health` module because the kingstinct library can't express it.
  It offers only non-duplicates not authored by
  this app (dedup rules are pure + tested in `src/lib/health/updateSet.ts`; HRV
  needs real RR ≥ 4 min). Tapping opens a grouped import sheet (Sleep / Readings /
  Exercise / Medications — meds read is a stub, see `HealthApi.readMedications`).
  Viewing the card or dismissing the pill marks those item keys "seen" (plaintext
  `autonomic.flags` MMKV, 48h TTL) so the pill never re-offers them. Deleting an
  imported entry is stronger: `deleteEntry` records its `healthKey` (stamped at
  import) plus a day/kind/type/time fingerprint in a permanent declined list
  (`src/lib/health/declined.ts`), and `filterDeclined` keeps the pill from ever
  suggesting that sample again. Settings →
  Apple Health → "Check for updates" ignores that memory and sweeps the last 24h
  (`checkHealthUpdatesLast24h`). Imports write through the normal store paths
  (scores + waveform sidecar).
- **One-time historical backfill.** Connecting Health in the welcome wizard offers
  a one-shot import of the last year (`HealthApi.readHistory`, `HISTORY_DAYS` in
  `src/features/Onboarding.tsx`): readings (HRV only with real RR ≥ 4 min; Android
  imports no historical HRV at all — Health Connect has no beat-to-beat series),
  nights of sleep with overnight HR + stages, workouts with their HR trace, and
  meds (same platform stub). Guarded by `meta.healthHistoryImported` and written
  in a single `mutate()`. Sleep uses one range query bucketed by `groupNights`
  (`src/lib/health/sleepSummary.ts`, pure + tested) instead of 365 per-day reads;
  per-night HR and per-workout HR are the only per-item queries, pooled a few at
  a time, with `onProgress` driving the sheet's status line.
- **An imported HRV reading only counts if it carries ≥ 4 min of real RR.**
  Health stores are full of short HRV samples (the watch's passive ~1-minute
  background measurement, a truncated Breathe session, another app's RMSSD
  record); they aren't comparable to a seated 5-minute reading and a year of them
  wrecks every average. The import paths refuse them (`health/updateSet`,
  `readHistory`), and `src/lib/hrvQuality.ts` is the second line of defence:
  `isTrustedReading` / `trustedReadings` drop `imported` HRV entries whose
  `durationSec` (stamped with real RR coverage at import) is under
  `IMPORTED_HRV_MIN_SEC`, in the Journal list, `scoreSet` / `blueZone` /
  `metricHistory`, `acReadVals` / `acTotalPower` (so all of Analysis, Progress and
  the widgets), milestones and the Insights prompts. Readings captured in-app are
  never filtered, however short. Journals imported by older builds are repaired on
  load by `stampImportedHrvCoverage` (store `loadState`), which stamps coverage
  from the waveform sidecar — no RR ⇒ 0 ⇒ permanently excluded. Nothing is
  deleted: the entries stay in the journal and in exports, they just don't count.
- **Progress + Insights fall back to demo data on an empty journal.** `src/lib/demo.ts`
  generates a deterministic **60-day** sample history (`DEMO_DAYS`; seeded PRNG, keyed
  off today so it lands in the Analysis buckets and report ranges) that arcs from crash
  days up into the green. Two months, not one, because every windowed comparison in the
  app is a month against the month before — a 30-day sample gave the Insights view only
  one window and almost nothing to show. Each domain (sleep, BP, symptoms, gut, HRV)
  draws its own reading of the day around the shared arc rather than being one function
  of it, and `DEMO_MAG_START` puts a supplement onset mid-history so the before/after
  card has something real to find. Both views render it behind `<DemoBanner/>` whenever
  `hasOwnData(days)` is false, and swap to real data on the user's first entry.
  **Never fake the Journal**
  — it's where real data goes in, so a demo entry there would be tappable fiction; the
  demo only ever feeds derived views. `hasOwnData` is deliberately broader than either
  view's "is there anything to chart" gate (a single logged glass of water counts), so
  demo data can never sit on top of real data. Insights builds its report prompts from
  `demoState()` too, resolved at press time, and overrides its headline card with
  `WELCOME_CHANGE` ("You downloaded this app") — the only fabricated finding anywhere in
  the engine, and it sits directly under the demo banner. See
  `src/lib/__tests__/demo.test.ts`, which asserts the arc through the real scoring engine
  and the findings through the real insights engine.
- **The app sends two local notifications, both owned by `src/lib/reminders.ts`.**
  (1) The morning reminder: `settings.reminder` is the source of truth and the OS
  schedule is derived, reconciled by `syncReminder()` on launch (covers reinstall, an
  imported journal, or permission revoked in system settings). It schedules under one
  stable id, so re-scheduling replaces rather than stacks. iOS **throws** from
  `scheduleNotificationAsync` when unauthorized — always request permission first and
  only persist `enabled: true` once the schedule actually succeeded. (2) The crash
  warning (`settings.crashAlert`): `checkCrashRisk()` runs `detectDownturn` on today —
  on launch and, debounced, after journal changes via `initCrashWatcher()` (no
  background execution exists) — and fires an immediate notification reusing the
  Outlook downturn copy, at most once per day (`crashAlert.lastFired`). Enabling the
  morning reminder while `crashAlert` is undefined defaults crash warnings on (the
  welcome wizard's opt-in); an explicit off is never overridden. UI: Settings →
  `NotificationsRow` opens `NotificationsSheet` (`src/features/Reminders.tsx`); the
  wizard's last step still uses `useReminderToggle()`.
- **The store review ask is earned, never scheduled.** `src/lib/review/` decides
  it: `eligibility.ts` is pure (four days holding the user's OWN entries —
  imported Health rows don't count — plus `detectUpturn`, the mirror of
  `detectDownturn` in `src/lib/scoring/upturn.ts`), and `index.ts` is the shell
  (memory in the plaintext `autonomic.flags` MMKV, `expo-store-review`). It asks
  on a day trending clearly above the user's own recent baseline, NOT on a green
  day — plenty of people never reach one — but never below a Bad-day floor, never
  during a downturn, never on the day the crash warning fired, and never in a
  session where the paywall came up (`notePaywallSeen()`). Our memory is stricter
  than the OS quota (once per app version, ~120 days apart) because iOS allows
  only 3 prompts a year and silently swallows the rest; the ask is therefore
  stamped BEFORE it's requested, since nothing tells us whether the sheet
  appeared. `<ReviewPrompt/>` (root layout) owns the "calm moment" half: sheet
  stack empty, app foreground, 25s after launch, 4s after a journal change.
- **Every offer the app raises on its OWN initiative goes through
  `src/lib/upsell/`.** Same split as the review module: `eligibility.ts` is pure
  (`nextUpsell`, unit-tested), `index.ts` is the shell over the plaintext
  `autonomic.flags` MMKV. It returns a winning **surface** plus the `trigger`
  phrase that picked it ("31 days logged"), so exactly one proactive offer can be
  live and the card's copy can't drift from the condition that fired it.
  Suppressed for pro/trial, an open sheet, a crash-alert day, an active
  downturn, a session where the review ask already went out
  (`noteReviewAsked()`), and for 10 days after any offer; two dismissals or three
  ignored sessions retire a surface for 30 days (`noteUpsellShown` /
  `noteUpsellDismissed` / `noteUpsellTapped`). The one consumer today is
  the annual offer below (`ProUpsellCard`, the old generic card, is gone —
  replaced in the Journal by `<TrendCard/>`, which is a feature and not an
  offer). **Reactive paywalls are not
  upsells**: a user who taps a locked thing gets `usePaywall()` instantly and is
  never gated, delayed or counted. Greyed-out UI is neither, and never counted.
- **"Has this metric moved?" is answered in exactly one place: `src/lib/trends/`.**
  `metrics.ts` is a REGISTRY (the way `registry.ts` is for entry types): each
  metric declares its extractor, direction, aggregate, thresholds and copy, and
  `series.ts` / `compare.ts` are generic machinery over that table. Adding a
  metric is a row there, never a comparison at a call site. The statistics are
  the product: **medians, not means** (one 130 bpm artifact is normal here and
  drags a mean into a false claim), `minPoints` enforced in **each** window
  independently, `minDelta` set at "worth telling someone about", and
  `'unknown'` a first-class result that is never reported as `'flat'`. **A
  dispersion metric's headline carries NO number** — the one exception in the
  registry, enforced by the coverage test. `sleepConsistency` is a stdev, so its
  delta is a change in night-to-night scatter, a second-order quantity nobody
  can picture; "steadier by 89 min" and "swings 1h 29m less" both shipped and
  both read as nonsense, because there is no question "89 minutes" answers. It
  says "much more consistent" instead, with the magnitude word banded so a
  just-past-threshold change doesn't get the superlative, and a `tail` of "than
  last month" because a comparative needs it. The `fmt` readout column stays
  numeric — there the ± spread IS interpretable. Durations elsewhere in copy go
  through `hm()` ("1h 29m"), never bare minutes or decimal hours. HRV
  extraction goes through `isTrustedReading`, sleep duration is banded (`[7,9]`
  — 11h is not better than 8h), bedtime consistency is a stdev of minutes past
  noon so midnight doesn't wrap. **`findTrend` returns improvements ONLY** and
  returns null during a downturn even when something improved — telling someone
  with a chronic illness their HRV fell is a crash trigger, and decline is
  `detectDownturn`'s job. The lower-level `compareWindows` / `trendDirection`
  are neutral, which is what the widget arrows use. Consumers: `<TrendCard/>`
  in the Journal (**every tier** — free and Pro see the same headline; only the
  tap destination differs, landing a free user on their own masked Month) and
  `src/lib/widgets.ts` (which lost its local today-vs-week-mean helper, so
  arrows no longer flip on 1% noise; SDNN has no registry entry and so carries
  no arrow). `downturn.ts` / `upturn.ts` consume `metricSeries` for scored-day
  extraction but keep their own thresholds — both are safety-adjacent (a crash
  notification and the review ask), and their tests pass unchanged.
  `TREND_PRIORITY` is the curated 6 the Journal card walks; `INSIGHT_OUTCOMES` is
  every row (what `src/lib/insights/` may correlate), `WATCH_PRIORITY` the subset
  Trend Watch may display, `OUTCOME_FAMILY` which rows say the same thing. A
  metric that should never be shown a trend for (MxDMn, AMo50, stress index) is
  kept out simply by never being a row.
- **A congratulation that arrives daily isn't one, so the Trend card is PACED.**
  On an improving journal `findTrend` has an answer every single day, and the
  card shipped restating it with a slightly worse number each morning ("steadier
  by 130 min", then 125, then 120), which reads as noise. `src/lib/trends/pacing.ts`
  (pure + tested) + `memory.ts` (the ONE stateful file in `trends/`, flags MMKV,
  never exported from `index.ts` so the engine stays pure) make a finding
  **claimed** rather than recomputed: the headline is **pinned** to the journal
  day it was computed for and cannot drift under the reader, the card then goes
  quiet for **7 days**, and the SUBJECT is retired for **30 days**. Retirement is
  by `OUTCOME_FAMILY`, not by metric — muting `sleepConsistency` alone would just
  hand the slot to `sleepDuration` and say the same thing in different units — and
  it is enforced by `findTrend`'s `exclude` argument, so the next thing the card
  says is about something else or it says nothing. The headline ends in an
  exclamation mark: this is the only place the app congratulates anyone, and the
  pacing is what keeps that earned. **Bump `TREND_COPY_VERSION` whenever a
  headline's wording changes** — a claim pins the finished SENTENCE, so a copy
  fix cannot otherwise reach phones already holding one, and an OTA update would
  leave the old wording on the Journal for a day and its subject retired for a
  month. A bump discards the stored memory wholesale.
- **The downturn card and the Trend card are the same object.** `DownturnWarning`
  (`src/features/DaySummary.tsx`) was tinted in the severity colour with a
  title over a "Down 8 points over the last 3 days" readout — the loudest thing
  on a screen someone opens while already feeling bad, and a different kind of
  notice from the good news directly below it. Both are now a neutral surface
  card: sunk tile, ONE sentence, chevron. Severity rides the emoji (⚠️ watch,
  🛑 alert) and the sentence carries its own numbers — `Downturn.headline`
  ("Autonomic score trending down 8 points over the last 3 days"), which is a
  separate field from `title` because `title` still feeds the crash notification
  in `src/lib/reminders.ts`. The explain SHEET keeps the colour; that is where
  the user went looking for it.
- **"What is linked to what?" is `src/lib/insights/`, and every guard in it is
  load-bearing.** One entry point, `buildInsights(state, dk)`, returns the whole
  Insights view: the headline change, ranked correlations, heuristic observations,
  trend watch and a data-confidence score. Outcomes are rows in
  `trends/metrics.ts` (never a second registry); **factors are generated** from
  whatever this user logs, custom types included (`factors.ts`), and everything
  reads one `buildDayMatrix` pass. **The analysis window ends at the last COMPLETE
  day** (`analysisDk = dk - 1`): today is a day in progress, and `matrix.ts` writes
  its not-yet-logged categories as a real 0, so a half-logged today entered every
  window as a genuine "drank nothing, took nothing" day and then flipped as the user
  logged. That is noise in a 180-day sweep but 1/30 of Trend Watch and 1/14 of
  `changeSinceStart` — one symptom logged at 3pm deleted a whole Trend Watch row.
  Measured: 39 of 150 in-day rebuilds changed the report with today in, 0 of 150 with
  it out. `detectDownturn` is the ONE thing still anchored to `dk`, because
  "are you heading into a crash" is a question about now. The rules, all of which
  exist because the alternative is confidently telling someone something false about
  their body:
  **rank statistics only** (Spearman / Mann–Whitney, tie-corrected — a 130 bpm
  artifact must not invent a relationship); **one Benjamini–Hochberg family per
  sweep at `FDR_Q = 0.05`**, measured against 30 noise journals, and the clinical
  filters (`MIN_EFFECT`, "both medians inside a target band is not a finding") run
  **after** the correction, never before, because shrinking the family raises
  every BH threshold; **factors have active windows** (`presence`), so the months
  before someone started logging supplements are unknown rather than
  supplement-free; **onset analysis needs `onsetNoun`**, since starting magnesium
  is a decision with a date and the first night you slept 7h is not; **dispersion
  metrics can't be correlation outcomes** (one night's bedtime is a bedtime, not a
  consistency); **copy is associational, never causal**; **a row's readout is the gap
  between the two groups' medians in the metric's own unit** (`deltaText`, "+12 ms"),
  never the coefficient — a signed decimal with no unit reads as a percentage, and a
  rho is a statement about ordering nobody can act on, so `rText` now survives only in
  the AI prompt; **a family's reported metric is a REGISTRY fact, not a data fact**
  (`FAMILY_RANK` in `trends/metrics.ts`) — RMSSD, SDNN and pNN50 are near-collinear,
  so the old "keep the strongest survivor" collapse let noise pick the label and
  "quercetin days show higher RMSSD" silently became "...higher pNN50" in 10 of 160
  perturbations of an effect that never once appeared or disappeared; the group still
  takes its POSITION from its strongest member, but its representative is
  `familyRank`, so the sentence cannot drift under the reader; and **an empty report is
  a correct answer**. **A finding can be OPENED**, and when it is, the sheet draws
  the columns the claim was computed from and never a second extraction of them:
  `detail.ts` (pure + tested) keeps the outcome and factor columns per finding,
  the report carries them as `detail[findingId]`, and
  `features/insights/FindingSheet.tsx` renders the Biggest change card's own tile +
  confidence shape over a `LineChart` whose new `marks` prop shades the days the
  factor was present (`divider` marks an onset's before/after split). Unknown days
  are never shaded — that is the same "months before you started logging are not
  supplement-free days" rule, in pixels — a continuous factor is split at its own
  median, and a lag is reported but never applied to the shading. A correlation row
  and the Biggest change card open the SAME sheet, which is why the change is not
  also listed as a correlation row. `watch.ts` is the ONE place the app volunteers bad news —
  Insights is a view the user deliberately opened — but it stays silent during a
  downturn, and `findTrend`'s improvements-only rule is untouched. Results are
  cached in `cache.ts` keyed `todayKey()|meta.lastUpdated|demo`; the screen's
  render path only ever calls `getCachedInsights`, and builds run in
  `InteractionManager.runAfterInteractions` behind a skeleton. **Anything queued on
  that queue must not throw**: a task that throws stops the queue, and every deferred
  build in the app shares it, so one Insights failure left Progress sitting on its
  skeletons at every range with no visible connection to Insights at all. The build
  and the shape write in `app/(tabs)/insights.tsx` are therefore wrapped and reported
  through `logError` ("finding nothing" is a state this view already renders). The
  app's own error log is how that was diagnosed — `errorLog` in the plaintext
  `autonomic.flags` MMKV, readable straight out of a simulator's container. The demo
  month's correlations all read ~1.00 for a structural reason documented in `demo.ts`,
  not a bug.
- **Insights wears Progress's card grammar, not its own.** Each section is ONE
  card (`InsightCard` in `src/features/insights/Sections.tsx`) holding its title,
  a `HelpDot`, an optional plain-language sentence, and then its rows as inset
  BUBBLES (`ROW` in `style.ts`) rather than hairline-divided lines: every row goes
  somewhere, so it reads as a button, and the treatment matches the stat tiles so a
  card holds one kind of object throughout. A card that has more to show ends with a
  full-width `CardButton` ("Show all 24 correlations") rather than a link in its
  title, and the claim's chevron opens `SinceExplain` — the same "How this was
  calculated" shape the Outlook's "What powers this" opens, wearing the Journal's own
  `ScoreGauge` (extended with a `marker` tick for where the comparison began), with
  the component breakdown normalised by the score's `confidence` so the parts genuinely
  SUM to the headline (dividing by 100 instead understated them fourfold). Day one is
  user-changeable via the Journal's `Calendar` sheet, stored in
  `insights/anchorMemory.ts` and part of the cache key. Every
  measurement lives in `src/features/insights/style.ts`, which lifts them from
  `CardView` and is imported by BOTH the content and the skeleton, so the two
  cannot drift; `ProgressSkeleton` copies its constants with a warning comment
  instead, which is the weaker version of the same idea. The skeleton's other two
  rules: chrome whose text never depends on data is rendered FOR REAL (titles,
  help dots, descriptions, tile labels, "Confidence", the footer), and **the skeleton
  does not rebuild a card's interior, it reproduces the card's HEIGHT**. Rebuilding
  can never be exact (a headline wraps to one line or two, a body to three or four),
  so `insights/shape.ts` (pure, tested) + `shapeMemory.ts` (flags MMKV, the
  `annual.ts`/`annualMemory.ts` split) remember both the row counts AND each card's
  measured height from `onLayout`, and the placeholder pins each card to it with
  `overflow: hidden`. Inside that height it draws the real title and `HelpDot` plus
  ONE ghost bar, nothing more. The measured-sample fallback runs once per install,
  guarded by `insights/__tests__/skeleton.test.ts`. Note the trap it fixed: text the
  real row clamps with `numberOfLines={1}` must be measured from a ONE-CHARACTER
  sample, because a full sample wraps inside the placeholder and makes it a line
  taller than the row it becomes. Two more traps it fixed: `onLayout` on a WRAPPER
  reports the child's margin too, so measuring a wrapper and pinning the card made
  every skeleton card 12pt tall (48pt down the page) — measure the card itself; and row
  heights are stored PER ROW, because observation rows genuinely differ and one figure
  put later bubbles where no row would be.
- **Four overlays share the floating pill slot, as a STACK.** `src/lib/pillStack.ts`
  (pure, tested) owns `PILL_RANK` — watch sync, health import, what's new, then the
  Insights AI button — and the recede geometry; `src/store/pillSlot.ts` keeps the live
  claims. Each pill claims its own rank and reads `pillDepth(key)`, receding one step
  per pill ABOVE it. The old binary "is anything claimed" counted a pill against
  itself, which only showed up once a third layer existed. Note the iOS trap in
  `AskAi.tsx`: a shadow and `overflow: hidden` on the same view cancel out, so the
  shadow lives on an outer layer and the clip on an inner one. The "new" dot is PER CARD (`insights/seen.ts` stores
  The header is the claim `changeSinceStart` makes — "64% better than day one", bold and coloured,
  with the reference in grey — beside a bare confidence ring. That percentage is
  PERCENTAGE POINTS on the score's own 0-100 index, never a ratio: a ratio called
  the same move "251% better", which is unbounded and hype. It scores only the
  earliest and latest fortnight of LOGGED days, so "day one" is genuinely day one
  rather than the start of the 180-day analysis window, and it falls back to stating
  the window when there is too little to compare.
- **The sleep report is the workout report's twin, and all its math is
  `src/lib/sleep/`.** Tapping the Journal's "Last night" card opens
  `<SleepReportSheet/>` (`src/features/SleepReport.tsx`) with the edit pencil in
  the sheet's action pill, exactly as an imported workout opens
  `WorkoutSummarySheet` — same `<Section>` / `<SectionHead>` blocks, now exported
  from `components/summary.tsx` rather than copied. `buildSleepReport` is pure
  (no store, no native; `addDays` is passed in) and returns one nullable field
  per section, because **absent, not empty** is the rule: a night with only bed,
  wake and quality must still read as a complete report, so a section with no
  data renders nothing rather than a dashed grid. The grade explanation comes
  from `sleepGradeParts` in `scoring/day.ts` — `sleepGrade` is now that
  function's `cat`, so the "why this grade" lines cannot drift from the
  thresholds that produced it. **Nocturnal dip** is the one piece of new math:
  the overnight low against the MEDIAN of the user's own recent `restingHr`
  readings (both registry positions count; there is no Standing option to
  exclude, and if one is ever added it must be), null below
  `DIP_MIN_BASELINE` readings so a two-reading baseline never becomes a
  percentage, banded by named constants in `sleep/dip.ts`, and it reports the
  `basis` it used ('single-minimum' today; the sleeping mean once the overnight
  series ships). Copy describes a pattern in the user's own log and never
  diagnoses. **Nothing in the report picks a colour**: the dip bands carry a
  grade `cat` and the UI resolves it through `SCORE_COLORS`, so a normal dip is
  the same green as an Excellent day. It renders as a Progress metric card —
  grade dot, the shared readout size, a dim `unit`/`when` tail, a one-line
  description — and selecting a night in the 10-night trend moves the headline,
  the band strip and the low/baseline block onto that night, the same gesture
  the Progress sparklines use. Any delta the report shows **names its window** —
  "vs month", never a vague "vs usual", which is a number the reader cannot
  use. Sleep stages are one always-overlaid chart (deep/REM/core, no
  picker: they trade against each other and the overlay IS the reading), which
  is why the numeric month deltas that preceded it are gone rather than sitting
  unused. **Awake time is not a stage** — it is the leftover and gets
  its own card, graded in MINUTES on the wake-after-sleep-onset ladder
  (`WAKE_MINUTES_BANDS`). Minutes, not a share of the night, because the scale
  has to be the number on the y-axis or the chart cannot grade itself the way
  every other chart does: zone lines, the grade-zone gradient on the trace and
  "Show zones" all need fixed boundaries, and a share-based grade's boundaries
  move with each night's length. Absolute bands are defensible there and not
  for bedtime, since how much of the night you were awake does not depend on
  WHEN you slept. **No hour of the night is ever graded** — the sleep
  schedule chart draws a rounded vertical bar per night (bed at the top, wake
  at the bottom, time running DOWNWARD) over the TRAILING rolling week as a
  soft band, and each bar is coloured by how LONG the night was
  (`SLEEP_DURATION_BANDS`, the duration ladder out of `sleepGradeParts` — move
  them together), so the colour and the bar's own length say the same thing.
  Drift stays legible as bars hanging outside the band, never as a grade:
  telling a night-shift nurse that 2am is a bad bedtime would be both wrong and
  useless. The rolling average excludes the night it sits behind, or a night
  grades against an average it is inside of. Clock times
  inside the module are **minutes past noon** so a bedtime past midnight reads
  as later rather than wrapping. Awake is charted on its own card, never as a
  fourth option in the stage picker: it is not a stage, it is the leftover.
  **The night is also kept as a SERIES, not just as totals.** `readSleep` /
  `readHistory` (and the Health Connect twin) used to fetch every overnight
  heart-rate sample and keep only min/max, and `summarizeSleep` built the stage
  and awake intervals then summed them away; both now keep what they read. The
  series — overnight HR, respiratory rate, and the hypnogram spans — goes to
  the **waveform sidecar** under `sleepWaveformId(dk)` (`sleep:<dk>`), NEVER
  into the journal, and that key must stay listed in `waveformIds` or
  `pruneWaveforms` deletes every curve on the next launch. It is thinned to
  `NIGHT_SERIES_MAX` at WRITE time, which is the only place a year-long
  backfill can be bounded. `storeSleepSeries(dk)` with no series CLEARS the
  night, which is how a hand-corrected bed/wake drops a curve that no longer
  describes its window (the same rule `stagesForWindow` applies to stages).
  Everything derived from the series is pure and tested in `sleep/night.ts`.
  Two consequences worth remembering: the dip's basis upgrades itself to
  `'rolling-low'` (the lowest settled ten minutes) whenever a curve exists,
  because a single-beat minimum moves several percent on one artifact; and the
  curve is coloured by `OVERNIGHT_HR_BANDS`, which are deliberately the same
  numbers `sleepGradeParts` demotes on, so the picture and the grade cannot
  tell different stories. **Nights imported before this shipped have no
  series** and fall back to the min/max tiles.
- **The half-off annual offer is the one offer that isn't a rotating surface.**
  `src/lib/upsell/annual.ts` (pure + tested) + `annualMemory.ts` (flags MMKV):
  at 30 / 90 / 180 / 365 **calendar days since install** — not engaged days, the
  deliberate difference from the surfaces above — a free user gets one 24-hour
  window offering a year of Pro at half price (`PROMO_YEARLY_SKU`, a SEPARATE
  product because Apple can only target a price cut through server-signed
  promotional offers; it therefore RENEWS at the discount, see `STORE_SETUP.md`
  Part 6). The same window unlocks Pro: `src/store/tier.ts` layers it over
  `deriveTier` and reports `'trial'`, never `'pro'` — nobody paid, and it ends.
  A window is spent when it OPENS (`startOffer` consumes every milestone at or
  below it), so a user returning on day 200 gets one offer, not four. It is not
  opened on a crash-alert day or during a downturn: the milestone stays due and
  fires on a calmer open rather than being wasted. `<AnnualOfferCard/>` renders
  it under the Journal's Outlook, accordion-collapsible with no ✕ (it expires on
  its own), and stamps the shared pacing clock via `noteAnnualOfferPacing()`.
- **The only thing the app sends anywhere is an anonymous cohort ping.**
  `src/store/ping.ts` (shell) over `src/lib/ping.ts` (pure + tested) GETs
  `api.autonomic.care/ping/open/D{MMDDYY}{P}` on launch and on foreground, and
  `/ping/sub/D{MMDDYY}{P}` once the store reports an entitlement. The path
  segment is the day this install FIRST ran (read from `trialStartedAt`, then
  frozen in its own flag) plus ONE letter for the platform (`I` iOS / `A`
  Android / `U` unknown, which is also how the server reads the missing letter
  older builds send); the server stamps the arrival day, so a row is
  (cohort day, platform, arrival day) → count, which is retention per store.
  There is no device id, no install id, no body, no health data — which is
  exactly why the server can't
  de-duplicate and the CLIENT must: one open ping per install per **US Eastern**
  day (the server's bucket — `easternDay` is duplicated verbatim on both sides
  and DST-aware; move one and you must move the other, or one install lands
  twice in a row), one subscribe ping per install ever, flags written
  only on a successful send so an offline launch retries. Dev builds send
  nothing; the subscribe ping also skips any build made Pro by the
  dev/TestFlight/sideload bypass (`paywallBypassed()` in `src/store/iap.ts`),
  since nobody paid there. Failures are silent and NOT sent to `logError` —
  being offline is a phone's normal state, and it would flush the 40-entry
  support log. Storage is **one DynamoDB row per day** holding a map of
  cohort+platform → count (`PK PING#OPEN`, `SK 2026-08-21`,
  `cohorts: { '082126I': 12 }`) — a map, not a list, because the nested bump is
  atomic and appending to a list would lose concurrent pings.
  Read it back with `GET /ping/report?key=`
  (shared key, `PING_REPORT_KEY`, injected by CodeBuild from SSM) or the `PINGS`
  action on the authenticated `/master` API; both return
  `{ day, total, cohorts: [{ key, cohortDate, cohort, platform, count }] }`
  rows. The `/master` dashboard renders them in its **App usage** view (`landing/master/`, tested by
  `landing/tests/master-ping.test.mjs`). Details in `sls/README.md` and
  `MASTER_DASHBOARD.md`.
- **Home-screen widgets render one shared JSON payload** built by
  `buildWidgetPayload()` (`src/lib/widgets.ts`, pure — unit-tested) and pushed by
  `initWidgetSync()` on launch, debounced journal changes, and foreground. iOS:
  `modules/widget-bridge` writes it to the `group.com.autonomic.journal` app group
  and reloads WidgetKit; the SwiftUI widgets live in `targets/widget/` (6 widgets,
  fixed pure-black, the Outlook 270° dial). Android: `react-native-android-widget`
  (pinned 0.17.1 — 0.18+ needs Expo 54); JSX renderers in `src/widgets/android.tsx`,
  headless handler registered in the custom entry `index.js`, widget list configured
  in app.json. **Android sizing gotcha:** a launcher can hand a widget a taller cell
  than its content needs; a `height: 'match_parent'` root with centered content then
  floats mid-cell with padding. Each Android widget therefore wraps its card in a
  transparent box-filling `Frame` and lets the card be `height: 'wrap_content'`,
  top-anchored (see `src/widgets/android.tsx`). Widgets show REAL data only — an
  empty journal renders "Awaiting data", never the demo month. A stale payload
  (date ≠ today) also renders as awaiting. Metric trend arrows are direction-only
  (▲/▼, no percentage). The **Protocol** widget (large, both platforms) stacks
  score & metrics over today's clean-day checklist (`buildWidgetPayload` maps
  `protocolCriteria` into `payload.protocol`). Deep links point at the Journal tab
  (query param, not a path, so expo-router never hits an unmatched route), handled by
  `useCaptureDeepLink()` in `src/features/forms.tsx`: `autonomic://?capture=hrv`
  opens HRV capture behind the freemium gate; `autonomic://?open=protocol` scrolls to
  the Progress streak card and opens it expanded (`requestExpandProtocol` /
  `scrollJournalToSection('protocol')` in `src/store/nav.ts`).
- **"What's new" is announced once per `x.x` release, and never wins the pill
  slot.** The customer-facing release log lives in `src/lib/whatsNew.ts` (product
  copy, deliberately not `CHANGELOG.md`, which stays the engineering record);
  bump it whenever `version` in `app.json` crosses to a new minor, or the card
  ships with nothing to say (a unit test enforces this).
  **What goes in is opt-in**: Austin names the changes worth announcing when a
  version is cut, and nothing else is added, however much of the release it was.
  Plumbing a user can't see (support dumps, error logs, build config, refactors)
  stays out by default. Never generate it from `CHANGELOG.md`.
  `<WhatsNewPill/>` offers it when the running build's minor differs from the last one shown
  (`src/lib/whatsNewSeen.ts`, plaintext `autonomic.flags` MMKV — so it can't ride
  an import, and erasing the journal isn't a request to be told again); a fresh
  install is stamped silently rather than shown. A patch release (1.22.0 → 1.22.1)
  is never announced. Three overlays now share the floating slot above the tab bar
  (watch sync, health import, what's new); `src/store/pillSlot.ts` arbitrates. The
  first two claim it while visible because they're transient; the What's new pill
  yields, receding to the sheet stack's stacked-card treatment at pill scale
  (0.9 scale, 13px lift, same spring) and springing back when the slot frees. It
  is therefore mounted FIRST of the three in the root layout, since siblings paint
  in order.
- **Capture failures are diagnosable from the user's own phone.** Bluetooth and
  the camera both fail in several ways that look identical from the outside, so
  each hides a support dump behind an 8-second hold on the button that would
  normally retry: "Scan for straps" (`src/lib/ble/devices.ts` `formatDiagnostics`)
  and the camera setup card's "Start over" (`src/lib/ppg/diagnostics.ts`). Both
  render into the shared `<PromptSheet/>` (copy + share), carry no health data,
  and share the APP/PLATFORM blocks from `src/lib/diagnostics/`. Collection only
  ever *reads* — never request a permission while reporting on it. The camera
  report is built around ordered milestones (`PPG_MILESTONES`, card opened →
  modules → permission → device → format → view mounted → session initialized →
  torch → frames → finger → lock): the first unreached one is the diagnosis, so
  the verdict distinguishes a refused permission from a session CameraX would not
  bind. Feeding it, `ppgTrace` is written from the camera view's *render* path,
  which is why its notifications are deferred and a no-op patch emits nothing.
  The camera also degrades rather than dying: `PPG_ATTEMPTS` walks 320×240@60 →
  320×240@device fps → device default, dropping a rung on an error OR on a
  watchdog (no `onInitialized` in 5s, no frames in 4s), since the failures that
  strand a user are the silent ones. A rung that binds at 30 fps coarsens RR
  timing but still produces a reading.
- **The app's whole state is diagnosable too.** An 8-second hold on the brand
  card at the top of Settings collects the general support dump
  (`src/lib/diagnostics/collectApp.ts` → `formatAppDiagnostics`), rendered into
  the same `<PromptSheet/>`: build/OS, permissions, native-module presence,
  entitlement + tier, Health/watch/Bluetooth state, storage sizes, journal
  **counts**, settings, and the recent error log — led by a NOTES block naming
  the likely problem. Two rules bind it. It **reads, never requests**: every
  permission is a status read, and `bleIfStarted()` exists so collecting a
  Bluetooth report can't itself raise the iOS Bluetooth prompt (constructing a
  `BleManager` builds a `CBCentralManager`). And it carries **no health data and
  nothing identifying** — journal contents become counts, timestamps become ages
  in days, the profile reports which fields are filled rather than their values,
  an import reports that it happened and not its file name (asserted in
  `src/lib/diagnostics/__tests__/collectApp.test.ts`).
- **Errors are recorded, because everything else swallows them.** The app
  degrades quietly by design, so by the time a user writes in there is no
  evidence left. `src/lib/diagnostics/errorLog.ts` keeps the last 40 failures
  (plaintext `autonomic.flags` MMKV, outside the journal: never rides
  export/import, survives "Clear all data"), consecutive repeats collapsed into
  a count so a retry loop can't flush the window (`errorBuffer.ts`, pure +
  tested). `installErrorLogging()` in the root layout also routes uncaught
  errors there on their way to the default handler — it observes, it never
  swallows. Call `logError('area.thing', e)` from a catch that would otherwise
  be silent (already wired: store persist/load, IAP, health reads, reminders,
  backups, widgets), and prefer an existing tag over a new phrasing of one.
- **Types come in two layers.** Built-ins live in the `*_TYPES` maps in
  `src/lib/registry.ts` (add an icon in `src/components/Icon.tsx` when adding one).
  Users can also create their own activities, meds/supplements, symptoms and
  triggers at runtime: `src/lib/typeCatalog.ts` layers `state.customTypes` over the
  registry (`addCustomType` / `deleteType`; deleting a built-in hides it via
  `state.hiddenTypes`, only while unused — `typeInUse` guards). Custom defs are
  pure JSON (no summary/detail functions) so they survive export/import. UI code
  must resolve types through `typesFor(state, kind)`, never the raw registry maps.
- **All logged sections share one pattern**: a section lists the day's entries;
  "+ Add" opens a `TypePicker` (or the bespoke `ReadingPicker`, which also offers
  Live HRV) of registry types; choosing one stacks its `EntryForm` to capture
  fields. See `src/features/forms.tsx` and `src/features/JournalSections.tsx`.
- **Sheets are bottom sheets that stack iOS-style** via `useSheets` /
  `src/components/Sheet.tsx` (`openSheet`, `closeSheet`, `closeAll`). The stack is
  one RN **Modal**, which paints above every sibling of `SheetProvider` — including
  `ToastProvider`, which wraps it. So **`toast()` is invisible from inside a
  sheet**: a failure path that only calls it looks to the user like the tap did
  nothing at all. Report failure inside the sheet's own content, or better, make
  the impossible option unavailable rather than tappable-then-refused.
- **Reading scoring**: on render, `computeScores(r, ctx)` categorizes each scorable
  metric (great/good/ok/bad/crash|concerning, plus a `warning` blue zone) per the
  framework thresholds; rows tint their value via the score category and sparklines
  use grade-zone bands from `bandsFor`. Edit the `s*` helpers + `computeScores` in
  `src/lib/scoring/` to adjust. Thresholds are the product — the scoring framework
  is ported **verbatim** from the original web app.

## Running / testing

Native modules (Bluetooth + HealthKit) mean **Expo Go will not work** — you need a
development build.

```bash
cd mobile
npm run ios      # expo run:ios (dev build on a simulator/device)
npm start        # expo start --dev-client
npm test         # jest (scoring + HRV unit tests)
npm run lint     # eslint
```

Device builds ship via EAS — see `mobile/EAS_UPDATE.md` and the workflows in
`.github/workflows/` (`eas-build.yml`, `eas-update.yml`).

**Android release builds are minified.** `enableProguardInReleaseBuilds` +
`enableShrinkResourcesInReleaseBuilds` are on in `expo-build-properties`, so R8
shrinks and obfuscates every release (dex 42 MB → 13 MB, 5 dex files → 2).
Consequences worth remembering: keep rules for anything reached by reflection or
from C++ live in the same `extraProguardRules` block in `app.json` (libraries
that ship their own `consumerProguardFiles` need no entry — expo,
expo-modules-core, expo-updates, reanimated, svg, health-connect,
openiap-google); `plugins/withR8Memory.js` raises the Gradle heap because R8
OOMs at the template's 2 GB; release stack traces are obfuscated, but AGP embeds
the mapping in the AAB itself
(`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`), so Play
deobfuscates crashes with no upload step. **A green build proves nothing here** —
a missing keep rule fails at
runtime, so launch the minified APK and exercise BLE / camera / Health Connect /
IAP / widgets before shipping.
