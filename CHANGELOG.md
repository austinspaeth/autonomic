# Changelog

App versions for **Autonomic Journal** (`mobile/`). Newest first.

This file is the engineering record. The **customer-facing** release notes shown
in the app's "What's new" card are a separate, deliberately plainer log in
`mobile/src/lib/whatsNew.ts` — update it whenever `version` in `mobile/app.json`
crosses to a new `x.x` (a unit test fails if the shipping minor has no entry).

## 1.25.0

- **The install trial is 14 days, not 7.** `src/store/tier.ts` doubles the local full-access window stamped on first launch; the copy that states it moved with it (paywall, Settings, `store-listing.md`, landing page). Existing installs updating into this build get a fresh 14 days, the same rule the 7-day window had. Note there is no "trial consumed" latch — the tier is re-derived from the install stamp every launch — so this also returns anyone whose install is 7 to 14 days old to `'trial'` for the remainder.
- **A live HRV reading now outlives the card that shows it.** The capture engine moved out of the view into `features/hrv/sessionStore.ts` (timer, BLE/PPG collection, rolling SDNN, breathing clock, haptics, keep-awake) in the same module-store shape as `watchSyncStore`; `Session.tsx` is a view over it. `SessionHost.tsx` (root layout, inside `SheetProvider`) owns the floating pill AND the hand-off to results/watch-sync, because a reading can finish while minimized and the card therefore cannot be the thing that opens Results. The session tears down when the sheet stack empties, not when the results sheet unmounts.
- **Readings can be MINIMIZED.** Minimizing closes the whole sheet stack rather than one card (the picker that launched the reading is still mounted underneath, and dismissing one card would leave the user looking at a setup sheet for a running reading). The pill ranks first in `PILL_RANK`. Camera readings cannot be minimized (`canMinimize`): the finger stream is served by the camera view mounted in the card beneath.
- The breathing pace is derived from the WALL CLOCK, never animated from wherever a component mounted: `lib/breathClock.ts` (pure + tested) answers "where in the breath are we now", and the card's rings and the pill's bars seed the same Reanimated pair from it, so a minimize/restore cannot jump the pattern. A paced reading whose pattern jumps is a ruined reading, not a cosmetic glitch.
- **Live metrics under the timer** (`features/hrv/LiveStats.tsx`): heart rate and SDNN sparklines drawn through a light EMA, and the beat-to-beat RR trace drawn RAW because its wobble is the measurement, which is why the signal-quality dot lives there. They are readouts, not buttons. The Apple Watch source shows one honest line beside the Mindfulness mark instead of three dashes, since nothing streams off the wrist.
- The reading card's status takes the TITLE's slot as a tinted pill ("Connecting to strap…" gold, "Signal noisy" red) rather than sitting under the charts below the fold, and focus mode (the eye button) puts rings, phase word and a dimmed timer on black with nothing moving as it toggles, with its own inline Finish button.
- **Insights: findings have hysteresis.** `insights/stability.ts` (pure) + `findingMemory.ts` (flags MMKV, wired in `cache.ts` so the engine stays pure) make a finding strict to ENTER (BH at `FDR_Q`) and retained while raw `p ≤ RETAIN_P` and the clinical bars hold, with pips computed from its current q so confidence honestly sags. This is what stops a strong claim vanishing overnight because the BH family re-formed. The memory resets on import/Clear-all and demo builds never touch it.
- **One row per driver.** `Correlation` carries `driverKey`, `groupCorrelations` folds the list, the row wears a "+N" pill and the sheet stacks every member's card and evidence chart.
- **An early tier**, run only when the strict list is empty: `findEarlySignals` over a matrix rebuilt at `EARLY_MIN_FACTOR_DAYS` with relaxed coverage but a much higher evidence bar (`|r| ≥ 0.5`, BH at `EARLY_FDR_Q`), pinned to one pip and badged "Early", measured against 14-day noise journals. Beside it, `factorProgress` feeds "Almost testable" rows on the empty screen.
- **A "No detected impact" card** (`findNoImpact`): meds and supplements only, ≥21 days on / ≥14 off / ≥5 outcomes genuinely tested and zero findings of any tier for the driver. It sits between Worth a look and Trend Watch, and its key runs through the whole `shape.ts` skeleton list.
- Water is a FACTOR, never an outcome (a fourth `CORRELATION_OUTCOMES` exclusion — drinking is a behavior, so "drug X → +0.5 L water" was backwards); it keeps its Trend Watch row.
- The tab bar shows an unseen-findings dot (`insights/seen.ts` ids + `store/insightsBadge.ts` external store, refreshed by a wrapped deferred build from the root layout, stamped seen on focus). Fresh installs stamp silently, the `whatsNewSeen` rule.
- **The founding-member offer** (`lib/upsell/founder.ts` pure + tested, `founderMemory.ts` flags MMKV, `features/FounderOffer.tsx`): fires on the first launch after five days carrying the user's OWN entries and only while the install trial still runs, so it can never be due on the same day as the annual card and grants no extra unlock. The day it claims is its whole life — `shownDk` is stamped once and the ✕ dismisses permanently (the second grey "No thanks" is gone; one card, one way to say no) — so a crash-alert day, a downturn or an open sheet DEFERS it rather than spending it, where every other surface suppresses and moves on. The one-day life is stated inside the price sentence ("Offer is only available today.") rather than as its own red line under the button, which read as a countdown ad. On iOS it sells `YEARLY_SKU` discounted by the `annual_founder_first_year` introductory offer, and every number in the copy is derived from the two prices the store returned, so the claim vanishes when StoreKit says this user isn't eligible.

- **Live HRV capture is unlimited on every tier.** The free tier's one-a-day cap is gone: `canCaptureHrv` / `HRV_FREE_PER_DAY` are deleted from `lib/gating.ts`, and with them the locked look on the Journal's capture button, the "Free plan: 1 capture per day used" row in `ReadingPicker`, and the paywall raised by the `autonomic://?capture=hrv` widget deep link. `hrvCaptureUsedToday` stays: the clean-day protocol counts a reading with it (`scoring/day.ts`).
- The freemium line now runs between taking a measurement and analysing it, and the five places that state it were moved together: the paywall's value rows and Free-vs-Pro grid (`features/Paywall.tsx`), the Settings subscription blurb, `store-listing.md` (both stores, character counts re-verified) and the landing page's pricing table, FAQ and JSON-LD. Nothing may advertise unlimited capture as a Pro benefit any more; Pro is the full history, Insights, POTS testing and AI reports.
- Live POTS captures, watch POTS rows, Progress week/month/year, Insights and the AI report cards are unchanged and still Pro.
- `store-listing.md`: both descriptions were a release behind and now cover Insights and the sleep report; the Play Data-safety justification was re-synced with `READ_TYPES` (respiratory rate, weight, exercise session and distance were missing). Added a per-release submission checklist naming what each console needs and what must already be configured.
- **The welcome wizard's last step is the first reading.** "You're all set" — six features that scrolled off the screen, with the morning reminder below the fold — is replaced by "Take your first HRV reading": the logo squiggle, one choice (which sensor), the two kinds of reading explained rather than offered, and the reminder card pinned above the primary. The button finishes the wizard and opens the capture card over the LIVE Journal, so the reading is never taken on top of an overlay that is fading out. It commits to a **baseline**; training is held as the next thing to try.
- `features/hrv/Setup.tsx` now exports `openCapture`, `sourceBlocker`, `defaultSource` and `defaultPeriodFor`, so the wizard and the HRV setup sheet cannot open different cards for the same choice. Picking the strap with nothing paired detours into `DevicesScreen`, the rule `HrvSetup.start` already followed.
- **No autonomic score until there is a first reading.** `<BaselineWaitingCard/>` takes the Outlook's whole slot while `hasHrvReading(days)` is false (`lib/hrvQuality.ts`, so an untrusted short import can't retire it): "Your baseline is waiting", three skeleton tiles for what stays empty, and the one button that fixes it. It wears the Outlook's own gradient border lit from the top RIGHT — `GradientBorderCard` gained a `corner` prop — so it reads as the same object in the same slot and legibly not the score. No dismiss; it retires itself when a reading lands.
- **Activation ping.** A third route, `GET /ping/act/D{MMDDYY}{P}{M}`, fires once per install the first time an HRV reading is SAVED, carrying one extra letter for the sensor (`W` watch / `B` Bluetooth strap / `F` finger). Same shape as the other two — one code, no identifier, dev builds silent, flag written only on success. Sent from `Results.tsx`'s save, never from the start of a capture: an abandoned session is the opposite of an activation.
- Server: `PING#ACT` day rows keyed `082126IB`, `decodeCohort` reads the optional method letter (unknown letters drop rather than refuse), and `/ping/report` + the dashboard's `PINGS` action answer with an `act` array and a `method` column.
- `/master` App usage: *First readings on <day>* with its sensor split, *Activated on day 0* and *Activated by D7* tiles, an **Activation** card (age at first reading, in the buckets purchase timing uses, plus the D0/D1/D7 rates with their denominators) and a **How the first reading is taken** card (per-day stacked split by sensor). `A.activation` obeys the same "immature is not zero" rule as every other rate there, and the method split follows the platform filter because Apple Watch is iOS-only.
- `/master` live alerts gained an activation card, and with it an explicit rule: **confetti is for ARRIVALS, never for usage.** A download and a sale keep the canvas; an activation gets the card, toast, notification and a two-note settling chime and no confetti at all — it is the event this dashboard hopes to see all day, and celebrating it would make a sale's confetti mean nothing. The card names the SENSOR rather than the store, and its sound and toast yield to a download or sale landing in the same refresh. A stored alert baseline written before the counter existed announces no activations, or the first refresh after the deploy would report the whole back catalogue as news.
- **The Journal's warning card now has a second detector.** `lib/scoring/strain.ts` (pure + tested) fires the same caution card when the daily score still reads fine but the markers that move BEFORE it have drifted: heart-rate recovery after a workout (`hr60` against the session peak), legs-up low HR, resting HR, overnight low HR, standing HR rise (POTS episodes and stand tests), and symptom load. Each is a median compared against that user's own previous six weeks rather than any textbook range. Heavy activity rides along as context, never as evidence.
- Restraint is the design there, not sensitivity: it takes **two distinct signals and a combined weight of three**, at least one of them a measurement, every window enforces its own coverage bar, and the card is suppressed on an Excellent day so it can never contradict the Outlook directly above it. `detectDownturn` still wins when both would fire, so only one warning card ever renders.
- It is deliberately quieter than a score downturn: **no crash notification** (a push stays reserved for the score itself sliding), but it does suppress the annual/founder offers and the review ask, since nothing should be sold to somebody the Journal just told to rest.
- `DownturnWarning` became the shared `WarningCard`, and the two explain sheets now share `WarnTile` / `InvestigateButton` / `RestNote` (`features/DaySummary.tsx`). The strain sheet lists what moved with each marker's own baseline beside it, and `buildStrainPrompt` (`lib/analysis/reports.ts`) hands the AI a 35-day window and asks for the case against the flag as well as for it, because the question here is "early warning or noise", not "what explains the drop".

## 1.24.1

- Insights findings can be OPENED. A correlation row and the Biggest change card both lead to one sheet (`features/insights/FindingSheet.tsx`) carrying the card's own tiles and confidence strip over a chart of the days behind the claim. The columns come from `lib/insights/detail.ts`, kept per finding on the report as `detail[findingId]`, so the chart can never re-derive (and disagree with) the statistics above it.
- `LineChart` gained `marks` / `markColor` (per-bucket shading, contiguous runs merged) and `divider` (a before/after rule). Unknown days are never shaded — the active-window rule in pixels — a continuous factor is split at its own median, and a lag is reported but never applied to the shading.
- `TrendMetricDef.bands` names each metric's existing grade ladder in the scoring engine's `BANDS`, so the detail chart offers "Show zones" and a graded trace with the same boundaries the reading rows use.
- Progress can be navigated to a CARD, not just a section: `requestProgressRange(mode, section, card)`, per-card offsets in `analysis.tsx` (with `CARD_BASE` for HRV, whose blocks nest a level deeper), and `METRIC_CARD` in `TrendCard.tsx`. Trend Watch rows carry chevrons and land on their own chart rather than on Power distribution or the Outlook gauge.
- Insights row grammar: one height for every row in the view (`ROW_MIN_H`), single-line correlation and observation rows, Trend Watch shows the MOVEMENT rather than the level, and the "All correlations" sheet renders the same row component as the card.
- The empty state is a real screen: a progress ring toward `INSIGHT_MIN_DAYS` (14, a display target documented against the engine's staggered floors and guarded by a test), the three things worth logging daily, and what the view becomes. The header reads "Keep logging" instead of stating a window.
- Skeleton measurement samples retargeted to the text that actually renders now (`headline` / `obsTitle` / `pair` / `watchTitle`), so the once-per-install fallback stops reserving paragraphs that were removed.

## 1.23.0

- "What's new" card: a pill offers the release notes once per `x.x` release (never for a patch), and Settings keeps a permanent entry to it. The pill yields the floating slot to the health-import and watch-sync pills, receding to the stacked-card treatment behind whichever holds it and springing back the moment that pill starts to fade.
- Customer-facing release notes live in `mobile/src/lib/whatsNew.ts`, curated opt-in: only changes explicitly called out for announcement go in, never a filtered view of this file. A unit test fails if the shipping minor has no entry.
- Seen-memory lives in the plaintext flags MMKV, so it can't ride an export/import and erasing the journal doesn't re-announce the release. Fresh installs are stamped silently.
- Reading card UI refinements.

## 1.19.1

- Health imports no longer come back empty because of a permission the app never got around to asking for. Every check asks first (silently when there is nothing left to ask), capped at one prompt per launch, and two checks firing at once can no longer stack two permission sheets. ECG is asked for in the same step instead of a second sheet behind the first.
- The "new health data" pill can't hang on "Checking…" any more: an unanswered permission sheet or a stalled health-store read now gives up quietly instead of leaving the pill spinning.
- Progress readouts carry their units, and the date rides along with them ("56 bpm on 7/27") instead of sitting in a column of its own. POTS episode readouts read as a rise off baseline ("Δ16 bpm").
- Blood pressure tiles now report the range averages, so they stop repeating the latest reading already shown above them.

## 1.19.0

- Imported HRV only counts when it carries 4+ minutes of real beat-to-beat RR. The watch's passive one-minute background samples, truncated Breathe sessions and other apps' RMSSD records are no longer treated as comparable to a seated capture, so they're kept out of the Journal list, scoring, Analysis, Progress, widgets, milestones and Insights. Nothing is deleted; older journals are repaired on load from stored waveforms.
- Deleting an imported entry is now permanent: the health sample behind it is remembered and the update pill never offers it again.
- Sleep hours follow the times you enter. Correcting bed/wake on a night the watch only half-recorded now updates the hours asleep (and drops the stale stage breakdown) instead of holding the imported stage total.
- POTS episodes chart the biggest excursion from the pre-episode baseline across the whole capture, matching how the journal row and episode summary grade it, and the stairs view is shaded and graded on the same zones.
- HRV frequency bands: the VLF floor moved to 240 s so a real 5-minute strap or watch capture reliably resolves every band, and a band the engine withheld now reads "–" over a dimmed fill instead of a confident 0.
- Health permissions are requested once rather than on tap paths.
- Medication dose fields get the normal keyboard, so a unit ("400mg", "1 scoop") can actually be typed.
- Fixed compact sheets sliding under the keyboard, and Progress section pinning landing on the wrong section.
- Android: Health Connect imports no historical HRV (the platform exposes no beat-to-beat series).

## 1.18.0

- One-time historical Health backfill (onboarding "Connect data") now pulls a full year of sleep nights (with overnight HR + stages), workouts (with HR trace), and medications, alongside HRV/blood pressure/resting HR — both platforms. The import sheet shows live progress ("Sleep · 140/312") instead of a bare spinner.
- Live HRV and orthostatic/POTS test results can have a note added right on the keep-or-discard screen, not just afterward via edit.
- Progress (Analysis) tab: range switching (Day/Week/Month/Year) holds the heavy chart rebuild until the pill's slide animation finishes, and shows a brief skeleton instead of a stale render when data changed elsewhere.
- The Outlook downturn warning is now its own card below Outlook (matching Milestones/Streak styling) instead of embedded inside it, and no longer factors in today's still-in-progress water/sleep/meds.
- Apple Watch HR monitor: Night mode (dims the readout, stops animation, keeps only the red high-HR alert) and Low Power mode (drops refresh rate, unmounts the chart page), both per-session from the controls page.
- Health-store "new data available" pill morphs smoothly between checking and found states.
- Android: release builds are now minified (R8/Proguard + resource shrinking), meaningfully shrinking install size.

## 1.17.0

- Periodic health-store import check: a floating pill quietly offers today's Apple Health / Health Connect data that the journal doesn't already have, grouped into Sleep / Readings / Exercise / Medications.
- Pull-to-refresh on the Journal runs that check on demand (iOS: brand squiggle that fills red as you pull; Android: a tinted RefreshControl).
- Dedup rules are pure and unit-tested: never re-imports this app's own write-backs, never duplicates an existing entry, and only takes HRV with real beat-to-beat RR covering 4+ minutes.
- Settings → Apple Health / Health Connect: "Check for updates" sweeps the last 24 hours ignoring the seen-memory, plus a real Disconnect action (Health Connect revokes; iOS opens the Health app with the path spelled out).
- Health read-permission status is now reported where the platform allows it, so an empty workout list can say "we may have been denied" instead of "nothing recorded".
- New multi-select logging sheet for Medications & Supplements, Symptoms and Triggers: search or create, check several, log them in one tap, with an inline edit/delete list mode.
- Progress skeletons rebuilt from the real cards, so placeholders match the exact shape and height of what they become (including the HRV section).
- Watch HR monitor refinements.

## 1.16.1

- Camera HRV is trustworthy now. Beats found while the signal doesn't read as a pulse are no longer emitted (the largest source of inflated SDNN/RMSSD), a wide 61-beat moving-median stage catches long artifact bursts the 7-beat window missed, and metrics stop reasoning across dropouts (segment boundaries stored with `rrRaw`; RMSSD/pNN50/SD1 skip seams, SDNN pools per-segment deviations). Strap, watch and ECG results are unchanged.
- HRV setup flow reworked.
- Progress range switching: the pill moves instantly on the UI thread and the rebuild happens under a skeleton veil, which also fixes the scroll reset (you land back on the section you were reading).
- Dropped the speculative Progress range pre-warm; the demand-only per-range cache stays.

## 1.16.0

- HR workout zones and a robust RR-interval candidate search for pulling HRV out of Health workouts.
- Health import sheet for bringing readings in.
- Per-reading, per-workout and per-event AI insights, with capture-source attribution in the prompts (Pro-gated).
- Staged tab and range transitions so Android hardware stays smooth.
- Watch: fixed the orphan-session race that dropped the HR monitor on wrist-down.
- Android 16 (API 36) target, as Google Play now requires.
- IAP migrated from react-native-iap to expo-iap 4.7.0 (Play Billing 9.1 / StoreKit 2), with a Kotlin stdlib pin so it builds on Expo SDK 53.

## 1.15.2

- Watch: request HealthKit workout authorization before starting a session, so the permission sheet can actually present. Fixes the post-upgrade wedge where every complication tap sat on a grey 00 and bounced back to the clock face until a reboot. Denied sharing now explains the fix instead of imitating a sensor failure.

## 1.15.1

- Red edge ring on the watch app icon (App Review flagged the all-black background).

## 1.15.0

- Watch: recover HKWorkoutSessions orphaned by a killed process — fixes the app bouncing back to the clock face on every launch until force-quit.
- Watch HR monitor: 5-minute rolling HR history chart one swipe left of the readout.
- Version label on the watch home screen; restored POTS Test/Episode icon tints when locked.

## 1.14.0

- Watch WorkoutManager: dual-path HR delivery with end-date dedupe, dead-query self-heal, and mode-switch teardown.
- Orthostatic/stand baseline uses the last 30 s before the transition.
- HRV Progress: pooled "Both" average by default, plus a "Compare" overlay.
- Analysis Outlook: latest-bucket readout row with a rolling average.
- Milestones: SDNN group, cumulative activity-agnostic exercise milestones, protocol-adherence and hydration groups, longer streak tiers.
- Day summary: "What would raise confidence" breakdown.
- Sheet sizing keyed off the safe-area frame (Android edge-to-edge correctness).

## 1.13.1

- Version bump for an iOS build.

## 1.13.0

- New "Take an HRV reading" clean-day protocol criterion (in-app captures only; Health imports don't count), with editor support.
- Large "Score & Daily Protocol" home-screen widget on Android; refined widget resize behavior.
- Reworked Analysis tab and day-summary presentation.
- Watch and widget theme refinements; insights report adjustments.

## 1.12.0

- Home-screen widgets on both platforms from one shared payload: iOS WidgetKit target + app-group bridge, Android renderers with a headless entry. Start-HRV deep link.
- Health: workout mapping and richer HealthKit / Health Connect source handling.
- Crash-warning notification alongside the morning reminder.

## 1.11.0

- Progress and Insights fall back to a deterministic 30-day demo month on an empty journal, behind a demo banner. The Journal itself never fakes entries.
- Morning reminder (settings-derived, reconciled on launch).
- Downturn detection in scoring.
- Clean-day protocol editor and prompt sheet.

## 1.10.0

- Richer AI reports, tappable metric charts, perfect-100 day score.
- Play Store listing assets.

## 1.9.0

- Freemium model (pro | trial | free) with a 7-day local trial.
- Gated: Progress week/month/year, live HRV capture (1/day free), live POTS captures, AI report cards, watch POTS rows. The root subscription gate is gone; the paywall is now an on-demand sheet.
- Camera-PPG HRV setup flow; HRV pipeline, analysis and scoring refinements.

## 1.8.0

- Android is a first-class platform: Health Connect behind the same `HealthApi`, camera PPG (torch re-assert for LEGACY-HAL devices), Google Play Billing in the shared paywall.
- Watch surfaces and copy gated to iOS; POTS flows use in-app strap capture on Android.
- Android sheet stack renders in-app, native date/time pickers, keyboard-aware onboarding, opaque header/tab bar.
- HRV source default: last deliberate pick, else paired strap, else camera.
- Local notifications removed entirely on both platforms (reintroduced deliberately in 1.11.0).

## 1.7.0

- HR complication polish (arc-matched dot, tighter Δ spacing, no label wrap at 3-digit maxes).
- Expanded type catalog: 10 Apple Workout activity types, 28 POTS/long-COVID/MCAS symptoms, 17 food and non-food triggers.
- Types are alphabetized by label, with "Other …" catch-alls pinned last.
- Default clean-day protocol sleep target is 7h (was 8h).

## 1.6.0

- De-medicalized copy for App Store review: "clinical-grade" → "lab-quality", "medical thresholds" → "research-backed", crash advice no longer names specific supplements, "POTS threshold met" → "Sustained rise ≥30 bpm".

## 1.5.0

- Watch POTS Episode capture (stairs / sit-to-stand / lay-to-stand: baseline → transition → 60 s recovery), with a complication deep link.
- Phone-side POTS features: orthostatic intro, watch arrivals, analysis categories.
- Naming synced to "POTS Test" / "POTS Episode" across the app and watch.

## 1.4.0

- Apple Watch companion: live HR monitor and guided POTS stand test.
- Milestones filter and completed-today card.

## 1.3.0

- Subscription gate and IAP store.
- HRV watch-prep flow, HealthKit sleep-stage summaries, local reminder notifications.
- Waveform sidecar storage, debounced MMKV persistence, journal store migrations.
- Analysis/charts and HRV progress updates, balance chart, scoring refinements.
- Added `NSLocationWhenInUseUsageDescription` for Apple ITMS-90683.

## 1.2.0

- UI, HRV, scoring, health and store refinements.
- Added `NSMicrophoneUsageDescription` to clear App Store validation.

## 1.1.0 and earlier

- Phone-camera (PPG) HRV capture as a third signal source.
- Backups, HRV redesign, ECG capture via a native HealthKit module, onboarding and legal screens.
- EAS Update OTA pipeline.
- Initial native Expo / React Native app, ported from the static web journal.
