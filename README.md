# Autonomic Journal

A private, offline-first app for tracking autonomic-nervous-system recovery. All
data lives on-device (no backend) and can be exported/imported as JSON.

The app is a native **Expo / React Native** iOS-first build that lives in
[`mobile/`](mobile/). On top of the journal it adds **live 5-minute HRV capture**
from a Bluetooth chest strap or Apple Watch, a guided full-screen **breathing
experience**, and **Apple HealthKit** read/write.

See **[`mobile/README.md`](mobile/README.md)** for setup, requirements, and how to
run/build it.

> Medical-adjacent, **not** a medical device. It does not diagnose or treat any
> condition. Discuss protocol/medication/supplement changes with a clinician.

## Layout

| Path | Purpose |
| --- | --- |
| `mobile/` | The app — Expo / React Native (iOS-first) |
| `landing/` | Marketing landing page |
| `FABLE_BUILD_PROMPT.md` | Historical build spec used to bootstrap the native app |

## Data

Everything is one JSON blob stored on-device (MMKV) under the
`autonomic.journal.v1` schema. **Export regularly** — clearing app data wipes it.
Import replaces the current dataset (after a confirmation).
