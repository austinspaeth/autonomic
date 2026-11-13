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
- **There is no tap tooling.** idb and axe will not build, and Apple events are
  blocked from here, which is the whole reason the driver exists. Anything that
  can only be reached by a thumb needs a registry entry that opens it directly.
- **Never set `healthEnabled` in a fixture.** The quiet import check then runs on
  the next foreground and raises the HealthKit permission sheet, a system modal
  nothing here can dismiss, and it lands on top of every shot until the app is
  terminated.
- **Notification permission cannot be granted from the CLI.** `simctl privacy
  grant notifications` answers "Operation not permitted" on iOS 26.5 and
  `grant all` does not cover it. That is why `pacing-sheet` leads with the "turn
  on pacing alerts" ask. **Tap Allow once by hand on the shots simulator** and
  every later run of that shot leads with the budget instead.
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
