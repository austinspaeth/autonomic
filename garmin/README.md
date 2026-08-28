# Autonomic for Garmin — Connect IQ watch app

A Venu 4 watch app that takes an HRV reading on the wrist and delivers the raw
beat-to-beat intervals to the phone over Connect IQ's device-to-app messaging.
**No Garmin cloud API is involved**: nothing leaves the watch except to the
paired phone, which is the same privacy contract the rest of Autonomic keeps.

It carries two captures — HRV reading and HR monitor — mirroring the Apple
Watch companion in `mobile/targets/watch/`. The orthostatic / POTS captures the
Apple Watch offers are deliberately NOT here: the Connect IQ store rejected
them, so `StandTest.mc` / `Orthostatic.mc` / `Views.mc` were removed rather
than hidden. Do not re-add them to this target.

## The two rules that make the sensor work

Both were expensive to find and neither is discoverable from the docs. They are
commented at length in `source/RrCollector.mc`; do not "clean up" either one.

1. **`SENSOR_ONBOARD_HEARTRATE`, never `SENSOR_HEARTRATE`.** `SensorType` is
   split into `RemoteSensorType` and `OnboardSensorType`. `SENSOR_HEARTRATE` is
   the *remote chest strap*. Asking for it yields a working heart rate and no
   beat-to-beat intervals, which is indistinguishable from a broken sensor.
2. **Only the FIRST `registerSensorDataListener` after launch yields
   beat-to-beat.** Unregister and register again and every callback returns an
   empty interval array while HR keeps working perfectly. So the listener is
   armed once, left up between readings, and released only when the app closes.
   `setEnabledSensors` is likewise called exactly once, in `arm()`. A second
   call anywhere breaks it.

## Layout

| File | Purpose |
| --- | --- |
| `source/RrCollector.mc` | The capture engine. Owns both rules above. |
| `source/Link.mc` | Store-and-forward to the phone: queues readings, retries with backoff, clears only on the phone's ack. |
| `source/Payload.mc` | Wire format (`SCHEMA`), local-ISO timestamps with no timezone suffix (the phone parses them as local). |
| `source/Theme.mc` | Design tokens ported from the Apple Watch's `DesignSystem.swift`, plus pill/chevron/heart drawing. CIQ has no anti-aliasing, so the heart and check are bitmaps. |
| `source/Home.mc` | The `CustomMenu` home screen. |
| `source/RrView.mc`, `HrMonitor.mc` | The two captures. |

The phone side is `mobile/modules/garmin-link/` (the native module, wrapping
Garmin's Companion SDK) and `mobile/src/lib/garmin/receiver.ts` (which writes
the sidecar and entry, flushes, and only then acks).

## Build

```bash
./build.sh sim      # run in the simulator
./build.sh device   # sideloadable dist/AutonomicRr.prg
./build.sh store    # signed dist/AutonomicRr.iq for the Connect IQ store
```

`build.sh` generates `resources/strings/version.xml` from `mobile/app.json`, so
the watch app's version always matches the phone app's.

**The simulator cannot validate the sensor.** It synthesises sensor data, so
plausible-looking intervals there mean nothing. Simulator runs check layout,
compilation and navigation only; every sensor claim must be made on hardware.

Sideloading: copy `dist/AutonomicRr.prg` into `GARMIN/APPS/` on the watch over
MTP, then eject. Note the watch refuses to create *new* files over MTP from
some clients (it wedges OpenMTP) while overwriting an existing app works fine.

## Signing key

`~/.garmin-ciq/developer_key.der`, generated with openssl (not the SDK Manager):

```bash
openssl genrsa -out developer_key.pem 4096
openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt
```

**Back this up somewhere outside this repo.** It is the identity of every app
published to the Connect IQ store; losing it means you can never ship an update
to an app users have already installed. This repo is PUBLIC — the key is
gitignored (`developer_key*`) and must never be committed.

## Store listing

`store/` holds the submitted assets (`cover-500.png`, `icon-128.png`) and IS
committed. Screenshots are 454×454 for this device and are not kept here.
