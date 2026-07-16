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
- **HRV waveform arrays never live in the journal.** `rrRaw` / `sampledHr` /
  `sampledSdnn` go to a sidecar MMKV instance keyed by reading id — write via
  `storeWaveform()`, read via `getWaveform()` (`src/lib/waveforms.ts` has the pure
  split/extract/import helpers). `rrClean` isn't stored at all (re-derived via
  `correctArtifacts`). Exports carry a top-level `waveforms` map; old exports with
  embedded arrays still import. A dev-build warning fires if an inline array ever
  reaches the persisted journal.
- **Imports** record `meta.lastImport` (`{ name, at }`) before calling `save()`.
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
  and reloads WidgetKit; the SwiftUI widgets live in `targets/widget/` (5 widgets,
  fixed-dark, the Outlook 270° dial). Android: `react-native-android-widget`
  (pinned 0.17.1 — 0.18+ needs Expo 54); JSX renderers in `src/widgets/android.tsx`,
  headless handler registered in the custom entry `index.js`, widget list configured
  in app.json. Widgets show REAL data only — an empty journal renders "Awaiting
  data", never the demo month. A stale payload (date ≠ today) also renders as
  awaiting. The Start HRV buttons deep-link `autonomic://?capture=hrv` (query param,
  not a path, so expo-router never hits an unmatched route), handled by
  `useCaptureDeepLink()` in `src/features/forms.tsx` behind the freemium gate.
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
