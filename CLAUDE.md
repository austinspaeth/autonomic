# CLAUDE.md — project notes

**Autonomic Journal** is a private, offline-first app for tracking autonomic
recovery. The app is a native **Expo / React Native (iOS-first)** build that lives
in **`mobile/`**. There is **no backend** — all state is on-device. (A previous
pure-static-HTML PWA under `docs/` has been removed; the mobile app is the app.)

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
| Type registry (`READING_TYPES` / `ACTIVITY_TYPES` / `MED_TYPES` / `SYMPTOM_TYPES` / `TRIGGER_TYPES` / `MEAL_TYPES`) + field/summary helpers | `src/lib/registry.ts` |
| Scoring/grading (`computeScores`, `bandsFor`, `rowScoreCategory`, `hrvComposite`) | `src/lib/scoring/` |
| HRV pipeline (artifact correction, time/frequency domain, coherence) | `src/lib/hrv/` |
| Analysis / milestones / AI-insights builders | `src/lib/analysis/` |
| BLE heart-rate manager (0x180D / 0x2A37 RR parsing) | `src/lib/ble/` |
| Apple HealthKit wrapper (iOS-only, feature-flagged) | `src/lib/health/` |
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
  "settings": { "theme": "light" | "dark" },
  "profile": { "sex", "weight", "height" },  // feeds reading scores (e.g. sex-adjusted QTc)
  "meta": {
    "lastUpdated": "<ISO timestamp>",      // stamped by save(); see rule below
    "lastImport":  { "name": "file.json", "at": "<ISO timestamp>" }
  },
  "days": {
    "YYYY-MM-DD": {
      "sleep":      { "bed": "HH:MM", "wake": "HH:MM", "quality", "hrLow?", "hrHigh?" },
      // readings/activities/meds/symptoms are logged-entry ARRAYS, each item
      // { id, type, time, note, ...templateFields }, where `type` keys into a
      // registry map (READING_TYPES / ACTIVITY_TYPES / MED_TYPES / SYMPTOM_TYPES).
      // No user-defined/custom types. Entries use an ordered, typed field schema
      // (number / select / time / check / text / textarea / {divider:true}).
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
- **Imports** record `meta.lastImport` (`{ name, at }`) before calling `save()`.
- **Adding a type**: add it to the relevant `*_TYPES` map in `src/lib/registry.ts`
  (and an icon in `src/components/Icon.tsx`). There are no user-defined types.
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
