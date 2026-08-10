# Changelog

App versions for **Autonomic Journal** (`mobile/`). Newest first.

This file is the engineering record. The **customer-facing** release notes shown
in the app's "What's new" card are a separate, deliberately plainer log in
`mobile/src/lib/whatsNew.ts` — update it whenever `version` in `mobile/app.json`
crosses to a new `x.x` (a unit test fails if the shipping minor has no entry).

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
