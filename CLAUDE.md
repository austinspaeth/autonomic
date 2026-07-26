# CLAUDE.md — project notes

**Autonomic Journal** is a private, offline-first app for tracking autonomic
recovery. The app is a native **Expo / React Native (iOS + Android)** build that
lives in **`mobile/`**. There is **no backend** — all state is on-device. (A
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
| `FABLE_BUILD_PROMPT.md` | Historical build spec used to bootstrap the native app |

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
  `src/features/HealthUpdates.tsx`. It offers only non-duplicates not authored by
  this app (dedup rules are pure + tested in `src/lib/health/updateSet.ts`; HRV
  needs real RR ≥ 4 min). Tapping opens a grouped import sheet (Sleep / Readings /
  Exercise / Medications — meds read is a stub, see `HealthApi.readMedications`).
  Viewing the card or dismissing the pill marks those item keys "seen" (plaintext
  `autonomic.flags` MMKV, 48h TTL) so the pill never re-offers them; Settings →
  Apple Health → "Check for updates" ignores that memory and sweeps the last 24h
  (`checkHealthUpdatesLast24h`). Imports write through the normal store paths
  (scores + waveform sidecar).
- **One-time historical backfill.** Connecting Health in the welcome wizard offers
  a one-shot import of the last year (`HealthApi.readHistory`, `HISTORY_DAYS` in
  `src/features/Onboarding.tsx`): readings (HRV only with real RR ≥ 4 min on iOS),
  nights of sleep with overnight HR + stages, workouts with their HR trace, and
  meds (same platform stub). Guarded by `meta.healthHistoryImported` and written
  in a single `mutate()`. Sleep uses one range query bucketed by `groupNights`
  (`src/lib/health/sleepSummary.ts`, pure + tested) instead of 365 per-day reads;
  per-night HR and per-workout HR are the only per-item queries, pooled a few at
  a time, with `onProgress` driving the sheet's status line.
- **Progress + Insights fall back to demo data on an empty journal.** `src/lib/demo.ts`
  generates a deterministic 30-day sample month (seeded PRNG, keyed off today so it
  lands in the Analysis buckets and report ranges) that arcs from crash days up into
  the green. Both views render it behind `<DemoBanner/>` whenever `hasOwnData(days)`
  is false, and swap to real data on the user's first entry. **Never fake the Journal**
  — it's where real data goes in, so a demo entry there would be tappable fiction; the
  demo only ever feeds derived views. `hasOwnData` is deliberately broader than either
  view's "is there anything to chart" gate (a single logged glass of water counts), so
  demo data can never sit on top of real data. Insights builds its report prompts from
  `demoState()` too, resolved at press time. See `src/lib/__tests__/demo.test.ts`, which
  asserts the arc through the real scoring engine.
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
  `src/components/Sheet.tsx` (`openSheet`, `closeSheet`, `closeAll`).
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
