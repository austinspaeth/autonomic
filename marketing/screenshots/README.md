# How these screenshots are made

`INDEX.md` is the catalogue for marketing. This file is how to re-shoot it.

## The rule

**Nothing is faked.** Every still is a screenshot of the real app rendering a
real journal that the real scoring, pacing and insights engines graded. The
harness only puts a plausible journal on disk and opens the card; it never draws
a number. A composited screenshot drifts from the product the moment the product
moves, and a graded figure that was typed in is a claim we cannot stand behind.

## The pieces

| Where | What |
| --- | --- |
| `mobile/src/dev/shots.tsx` | The shot registry — id, purpose, fixture, tier and how to open it. **Source of truth for `INDEX.md`.** Also the `ShotDriver`, an invisible listener for `autonomic://?shot=<id>`. |
| `mobile/src/dev/fixtures.ts` | The journals. Built on `lib/demo.ts`'s deterministic 60-day recovery arc, written in as the user's OWN data (the demo fallback wears a banner), plus synthesised pacing load, which the demo predates. |
| `capture.sh` | Deep-links one shot, waits, screenshots. |

Both dev files are behind `__DEV__` — `app/_layout.tsx` requires the driver
inside a `__DEV__` branch, so none of it reaches a release bundle.

## Running it

One-time setup:

```bash
# A simulator of its own. Never drive the one you are using: a fixture import
# REPLACES the journal on that device.
xcrun simctl create "Autonomic Shots" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcrun simctl boot <udid>

# Install the Debug build (copy the .app from another sim, or `expo run:ios`)
xcrun simctl install <udid> /path/to/Autonomic.app

# Pre-approve the app's URL scheme, or the first deep link raises an
# untappable "Open in Autonomic?" dialog. The VALUE is the bundle id.
xcrun simctl spawn <udid> defaults write com.apple.launchservices.schemeapproval \
  "com.apple.CoreSimulator.CoreSimulatorBridge-->autonomic" -string "com.autonomic.journal"
```

Then, with Metro running (`npm start` in `mobile/`):

```bash
./capture.sh journal-good          # one shot
./capture.sh insights 18000        # with a longer settle
```

`capture.sh` finds the simulator by name; override with `SHOT_SIM=<udid>`.

## Things that cost time to rediscover

- **Settle times matter.** Progress and Insights build behind a skeleton on a
  deferred queue. Under-wait and you photograph the skeleton. Insights wants
  ~15-18s on a cold fixture, Progress ~16s, a plain Journal ~9s.
- **The live-capture shots run in REAL TIME, because the session clock is the
  real wall clock.** `hrv-results` takes five minutes, and `stand-test` is
  deliberately stopped partway: a WHOLE guided stand test is 15:15 (300 s lying,
  a 15 s stand prompt, 600 s standing), and that shot wants the standing phase,
  so its settle stops the clock at 8:20 with the dial live. The settle values in
  the registry are sized for all of this; do not shorten them expecting the app
  to catch up. Run them in the background and leave them alone.
- **A card a capture WRITES does not need the capture.** The stand test's result
  was filed as a gap on the assumption that photographing it meant sitting
  through the full 15:15 live. It does not: `demo.ts` already writes `standTest`
  readings into the fixture journal, and `openReadingReport` is the single choke
  point every journal row goes through — so `pots-result`, `pots-positive` and
  `pots-locked` are each one call on an entry that already exists, and the last
  of them gets the lock card for free, since `openPotsLockIfNeeded` sits at the
  top of that same function. Before deciding a screen needs a live run, check
  whether the fixture journal already holds the entry behind it.
- **The live-capture sensor is a replay strap behind `ble()`**
  (`src/dev/replayStrap.ts`, installed by `setDevBleManager`). It emits the same
  `HrSample` a real strap does, about once a second, so the HRV session and the
  stand test both run their own real code. The intervals come from
  `src/dev/beats.ts` and are the only synthetic thing in the library — see the
  caveat at the top of INDEX.md. `beats.ts` is pinned by
  `src/dev/__tests__/beatcheck.test.ts`, which measures the series through the
  real `computeHrv`: if you retune it, that test is the thing that says whether
  it is still a person.
- **There is no tap tooling.** idb and axe will not build, and Apple events are
  blocked from here, which is the whole reason the driver exists. Anything that
  can only be reached by a thumb needs a registry entry that opens it directly.
- **Never set `healthEnabled` in a fixture.** The quiet import check then runs on
  the next foreground and raises the HealthKit permission sheet, a system modal
  nothing here can dismiss, and it lands on top of every shot until the app is
  terminated.
- **Notification permission cannot be granted at all on a shots simulator, and
  there is no human fallback.** `simctl privacy grant notifications` answers
  "Operation not permitted" on iOS 26.5 and `grant all` does not cover it; and
  there is no Simulator.app on this machine (Xcode 27.2 ships without one here),
  so the sims are headless and no system alert can ever be tapped. Without the
  grant, every card that asks for notifications stands permanently on top of the
  feature being photographed — `pacing-sheet` led with the "turn on pacing
  alerts" ask instead of the budget. The driver therefore pins what the UI
  READS, via `setDevNotificationPermission('granted')` in `src/lib/reminders.ts`:
  no notification is scheduled and no OS state is touched, so the shot shows the
  screen a user who granted notifications genuinely sees. Same pattern as
  `setDevTier` / `setDevPreviewPaywall` — a runtime pin beside the real answer,
  never an edit to the real answer.
- **A stuck system alert belongs to SpringBoard**, not the app, so it survives
  relaunching. Clear it with
  `xcrun simctl spawn <udid> launchctl stop com.apple.SpringBoard` (back in ~10s).
- **The status bar clock is the real clock,** set per capture. The app's copy
  names the hour, so a cosmetic 9:41 contradicts the screen under it. For the
  same reason `fixtures.ts` trims today's evening READING when shooting in the
  morning — the Outlook card retitles itself "Reflectance" once one lands.
- **Claims survive a fixture swap.** The Trend card's headline, the Insights
  cache and the pacing pause list live in the plaintext flags MMKV, which an
  import does not touch. The driver resets all three per shot, after the import.
- **Progress `mode` is the GROUPING, not the window.** A Month view of a two
  month journal is three points on a twelve month axis. Use `day` or `week`.
- **The dev build is always `isPro`.** `PaywallCard` closes itself on that, so a
  free-tier shot needs `setDevPreviewPaywall(true)` as well as `setDevTier`;
  the driver does both from `shot.tier`.

## Adding a shot

1. Add an entry to `SHOTS` in `mobile/src/dev/shots.tsx`, with a `purpose`
   written for somebody choosing a still, not for somebody maintaining the file.
2. `./capture.sh <id> <settle>`, and look at it.
3. Add the row to `INDEX.md`.
