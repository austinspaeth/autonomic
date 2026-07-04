# Autonomic (native)

A native, iOS-first **Expo / React Native** rebuild of the Autonomic Journal PWA
(`docs/index.html`) for tracking autonomic-nervous-system recovery. Offline-first,
no backend, all data on-device — the same philosophy and the **same data model**
as the web app, so a `export.json` from the PWA imports directly.

The scoring/grading framework is ported **verbatim** from the web app (thresholds
are the product). On top of it this app adds **live 5-minute HRV capture** from a
Bluetooth chest strap or Apple Watch with all HRV metrics computed on-device, a
guided full-screen **breathing experience**, and **Apple HealthKit** read/write.

> Medical-adjacent, **not** a medical device. It does not diagnose or treat any
> condition. Discuss protocol/medication/supplement changes with a clinician.

---

## What's here

| Area | Location |
| --- | --- |
| Routes (Journal · Analysis · Milestones · Insights + full-screen HRV) | `app/` (expo-router) |
| Scoring engine (ported verbatim) + day scoring | `src/lib/scoring/` |
| HRV pipeline (artifact correction, time- & frequency-domain, coherence) | `src/lib/hrv/` |
| Analysis / milestones / AI-insights builders | `src/lib/analysis/` |
| BLE heart-rate manager (0x180D / 0x2A37 RR parsing) | `src/lib/ble/` |
| Apple HealthKit wrapper (iOS-only, feature-flagged) | `src/lib/health/` |
| MMKV store + `save()` (stamps `meta.lastUpdated`) | `src/store/` |
| Theme (light/dark), component library, charts, sheets | `src/theme/`, `src/components/` |
| Journal / summaries / forms / live-capture / settings | `src/features/` |
| Unit tests (scoring + HRV) | `src/lib/**/__tests__/` |

## Requirements

This app uses native modules (Bluetooth + HealthKit), so **Expo Go will not
work** — you need a development build.

- Node 18+, a recent Xcode (iOS) / Android SDK.
- An Apple Developer account for a device build (HealthKit needs a real device
  and the HealthKit entitlement, already declared in `app.json`).

## Run

```bash
cd mobile
npm install

# Generate native projects (once, or after native config changes)
npx expo prebuild

# iOS — simulator works for everything except BLE + real HealthKit data
npx expo run:ios
# or a signed dev build via EAS:
#   eas build --profile development --platform ios

# Android (BLE works; HealthKit is iOS-only and auto-disabled)
npx expo run:android
```

Then start the dev server for fast refresh:

```bash
npx expo start --dev-client
```

### Verify (no device needed)

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest — scoring + HRV pipeline unit tests
npm run lint        # eslint
npx expo export --platform ios --output-dir dist-check   # full Metro bundle
```

## Pairing a heart-rate strap

1. Menu (☰) → **Devices** → **Scan for straps**. Put the strap on first (it only
   advertises the HR service while worn).
2. Tap your device to remember it. Battery is shown when the strap exposes it.
3. Readings → **+ Add** → **Live HRV reading** → source **Bluetooth strap**.

The manager subscribes to the standard Heart Rate Measurement characteristic and
parses the flags byte (uint8/uint16 HR, RR-present bit); RR intervals arrive in
1/1024-second units and are converted to milliseconds. Handles multiple RR values
per packet, reconnection, and weak signal (live artifact hint).

## Apple Health

Menu (☰) → **Apple Health** → **Connect**, then **Sync today from Health** pulls
the day's resting HR, HRV (SDNN), blood pressure, SpO₂, weight and sleep into the
journal (deduped; manual entries are never overwritten). Saving a captured HRV
reading can optionally write **HRV SDNN + a Mindfulness session** back to Health.
Everything is user-initiated and gracefully degrades where data/permission is
missing. On Android these controls are disabled.

## Live HRV & the breathing experience

Readings → **+ Add** → **Live HRV reading**:

- **Kind**: Unstructured (quiet, no pacing) or Breathing.
- **Breathing pattern**: 4/4, 4/5, **4/6 (recommended)**, 5/5 — the inhale/exhale
  seconds drive the pacing and the HF-peak grading (`expectedHf`).
- **Source**: Bluetooth strap, or Apple Watch (run a Breathe/Mindfulness session;
  beat-to-beat / SDNN is read from Health at the end).

The full-screen session shows a 5:00 progress ring, live HR, a signal-quality
hint, and — for breathing — a vertical glowing "volume-bar" visualizer paced on
the UI thread (Reanimated) with haptic phase cues and "Breathe in / out". At the
end the RR series runs through `src/lib/hrv` (artifact correction → time-domain →
Welch FFT frequency-domain → coherence), fills the **same field keys a typed-in
reading uses**, and shows the results screen (hero autonomic score, VLF/LF/HF
power bar + peaks, HR-over-time tachogram, graded metric rows with sparklines).

## Data model & import/export

One JSON object persisted under `autonomic.journal.v1` (MMKV). Shape matches the
PWA (`version`, `settings`, `profile`, `meta`, `days[YYYY-MM-DD]{sleep, readings,
activities, meds, symptoms, food, digestion}`), extended so a live HRV reading
also stores `rrRaw` / `rrClean` / `sampledHr` / `source` / `durationSec`. Import
and Export use the **exact PWA format** (Menu → Import / Export data), so you can
move data off the web app and back.

**Every mutation goes through `save()`** (`src/store/store.ts`), which stamps
`meta.lastUpdated` — never write MMKV directly.

## Notes on fidelity

- The scoring engine, `BANDS`, `bandsFor`, day composite (`scoreSet`), streaks,
  and the reading summaries are ported to match the web app to the number. Tests
  in `src/lib/scoring/__tests__` assert known inputs produce the web app's
  categories. If a threshold looks off, it still matches the web app on purpose —
  no threshold was "fixed" during the port.
- Analysis and Insights are intentionally **simplified** vs the PWA: a few clean,
  correctly-sized charts + stat tiles per category, grade-zone shaded, rather than
  dense multi-column tables. The on-device correlation math (Pearson over ≥14
  days, |r| ≥ 0.3) and the AI-report prompt builder are ported.
- `docs/` (the reference web app) is untouched.
