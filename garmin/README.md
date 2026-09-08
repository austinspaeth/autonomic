# Autonomic for Garmin — Connect IQ watch app

A Connect IQ watch app that takes an HRV reading on the wrist and delivers the
raw beat-to-beat intervals to the phone over Connect IQ's device-to-app
messaging. It ships to 100+ products (see **Devices**); the Venu 4 is the one it
was written on and the only one a real reading has been taken with.
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

## Devices

The manifest lists 100+ products, and the list is DERIVED, not curated by hand.
A device qualifies only if it passes all of:

* `Sensor.HeartRateData.heartBeatIntervals` — the whole point, beat-to-beat
* `Sensor.registerSensorDataListener`, `Communications.transmit` +
  `registerForPhoneAppMessages`, `WatchUi.CustomMenu`, `Attention.vibrate`
  (that last one is what removes every Edge bike computer, correctly: they have
  no wrist sensor)
* Connect IQ **>= 3.2.0** — `SENSOR_ONBOARD_HEARTRATE` is a 3.2 API, so fenix 5
  / 5S / 5X, fenix Chronos, FR 645, FR 935, vivoactive 3, Descent Mk1 and
  Approach S62 can never be supported through this path however new the firmware
* a `watchApp` app type

Garmin's own per-API device tables are in the SDK docs
(`doc/Toybox/Sensor/HeartRateData.html` and friends) — intersect those rather
than guessing from model names.

**Those tables lag the device packages, and absence from them is not a "no".**
The SDK ships fenix 9 and Forerunner 70/170 device definitions while listing
them in NO API table at all — not `heartBeatIntervals`, and not
`Attention.vibrate` either, which every Garmin watch has had for a decade. A
device missing from every table is undocumented, not unsupported; a device
present in the tables but missing from ONE is the real exclusion. Those ten are
in the manifest on that reading, since each succeeds a listed device (fenix 9
follows fenix 8, FR 70/170 follow the FR 165) and Garmin does not drop
beat-to-beat in a newer generation.

**Compiling proves nothing; launching does.** `drawScaledBitmap` is missing on
most of the list and a compile is perfectly happy with it, so the app built
cleanly and then died on launch with `Symbol Not Found`. Every product in the
manifest has been launched in the simulator and seen to reach its home screen.

### Per-screen-family assets

Nothing scales at runtime. `tools/gen-glyphs.py` renders the heart, the dim
heart, the completion check and the logo from the 96px / 104x56 masters into
`resources-<family>/drawables/`, at the exact size each call site draws them,
and the default jungle picks those directories up on its own — no jungle
entries and no `has :drawScaledBitmap` branch. Ratios are taken FROM the 454px
Venu 4 masters, so the device the app already shipped on renders identical
pixels.

Run it after adding a product; `build.sh` refuses to build when a product's
family has no assets, which is what keeps "listing a device is a claim that it
works" true rather than a convention.

The sizes live in the script and are derived from the call sites
(`Home.mc` for the heart and the logo, `Theme.completion` for the check) — move
one and you must move the other.

### What the simulator cannot tell you

It synthesises sensor data, so a render sweep says the UI works and says
NOTHING about beat-to-beat. Only the Venu 4 has had a real reading taken on it;
`mobile/src/lib/watch/brands.ts` keeps that distinction as `verified` vs
`likely` and the two lists must move together.

Low-colour devices are usable but not pretty: on 1bpp Instinct/Descent the
accent, the tinted icon discs and the pill fills all quantise to black, leaving
white glyphs and white text. That is a deliberate accept, not an oversight. The
Instinct sub-screen also physically overlays the top-right of the display and
clips the end of centred text there; everything load-bearing is centred clear
of it.

## Layout

| File | Purpose |
| --- | --- |
| `source/RrCollector.mc` | The capture engine. Owns both rules above. |
| `source/Link.mc` | Store-and-forward to the phone: queues readings, retries with backoff, clears only on the phone's ack. |
| `source/Payload.mc` | Wire format (`SCHEMA`), local-ISO timestamps with no timezone suffix (the phone parses them as local). |
| `source/Theme.mc` | Design tokens ported from the Apple Watch's `DesignSystem.swift`, plus pill/chevron/heart drawing. CIQ has no anti-aliasing, so the heart and check are bitmaps, drawn at their own size from the per-family assets. |
| `tools/gen-glyphs.py` | Generates those per-family assets from the masters. |
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
committed. Screenshots are 454×454 for the Venu 4 and are not kept here.
