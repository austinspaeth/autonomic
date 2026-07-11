# Build prompt — Camera (PPG) HRV capture

Add **phone camera** as a third signal source for live HRV readings in the
Autonomic Journal mobile app (`mobile/`, Expo / React Native, iOS-first). The
user covers the rear camera + torch with a fingertip; each heartbeat appears as
a brightness swing in the red channel (photoplethysmography). Extract inter-beat
intervals from that signal and feed them into the **existing** HRV session
pipeline unchanged.

Read `CLAUDE.md` and `mobile/README.md` first. The scoring framework and HRV
math are the product — do not modify `src/lib/scoring/` or the analysis in
`src/lib/hrv/index.ts` beyond what's listed here.

## Why this is cheap architecturally

`src/features/hrv/Session.tsx` doesn't care where beats come from — it consumes
`{ hr, rr[] }` callbacks (see the BLE path in `begin()`), and everything
downstream (rolling SDNN, `correctArtifacts` hint, `HrvResults`, scoring)
operates on RR arrays. Camera capture is just a third emitter with the same
callback shape as `BleManagerApi.connect` in `src/lib/ble/manager.ts`.

## Quality framing (product requirement)

Camera PPG is genuinely lower fidelity than a chest strap (~16 ms beat-timing
resolution at 60 fps vs ~1 ms ECG-grade RR; artifact-prone from finger
pressure/movement). The UI must be honest about this hierarchy:

- **Bluetooth strap** — "Best accuracy · ECG-grade beat timing"
- **Apple Watch** — "High accuracy · ECG syncs in after"