# Task: Garmin failures never reach the dashboard. Find out why and fix it.

## The symptom

Read `CLAUDE.md` first, especially the bullets on Garmin readings, `reportFault` / `/fault`, and the Failures tab.

The dashboard's **Failures** tab (web `/master` and `mobile-dashboard/`) has **never shown a single Garmin row**. It should show two tags:

- `garmin.noSignal`: a reading that failed on the watch (a `diag` message)
- `garmin.reading`: an event filed for every reading that arrives, not a failure

We now know for certain that failures happen. A vívoactive 5 user (iOS or Android: unknown) hit the watch's "No signal / A pulse, but no beats" screen over and over, pressing TRY AGAIN each time. The design says each of those attempts should have produced a `garmin.noSignal` row, roughly `vivoactive 5 … nobeats …`. **Nothing arrived.** The phone also kept showing "Waiting for Garmin" the whole time, so the `diag` probably never reached the phone's receiver at all. Don't take that as settled, though: confirm or rule out every link in the chain below.

## The chain, end to end

Each link is a place it can break.

1. **Watch decides to report.**
   - `garmin/source/AutonomicRrApp.mc` `finishReading()` sends `diagPayload(reason)` when `!worthSending() && worthReporting()`.
   - `worthReporting()` requires `elapsedSec() >= DIAG_MIN_SEC` (10).
   - The give-up path is `RrView.onTick` → `_c.tick()` → `finishReading(why)`.
   - TRY AGAIN in `RrDelegate.toggle()` calls `reset()` + `start()`. Check that the previous attempt's diag was already queued before `reset()` wipes the state.
2. **Watch queues and sends.**
   - `garmin/source/Link.mc`: `enqueue` → `flush` → `Communications.transmit`, retried with backoff, and cleared only on an ack.
   - Check the `phoneConnected` short-circuit, what happens on `onError`, and whether the retry timer survives the view being popped or the app closing.
   - Is a diag ever *dropped*? Look at the 8-item outbox cap and at failed readings crowding the queue.
3. **Which watch build is in the wild?**
   - Find out whether the build users install from the Connect IQ store actually contains the diag code. The diag path may be newer than the last store submission.
   - `garmin/build.sh` stamps the version from `mobile/app.json`. Compare that with what was last uploaded (git history of `garmin/`, `store/`, any release notes).
   - If the store build predates diag, that alone explains "never".
4. **Phone receives.**
   - Native modules:
     - `mobile/modules/garmin-link/ios/GarminLinkModule.swift`: `register(forAppMessages:)`, `handleMessage`, and the IQApp uuid vs store uuid.
     - `mobile/modules/garmin-link/android/.../GarminLinkModule.kt`: `registerForAppEvents`.
   - JS side: `mobile/src/lib/garmin/receiver.ts` `initGarminReceiver` / `startListening`, which is called at init, after a pick and after a URL callback.
     - Is the phone listening after a cold start, and after the app comes back from the background?
     - Is `garminLinkIntact()` or `GARMIN_RELEASED` switching it off?
   - Does a `diag` reach `receive()` at all? Readings evidently do arrive for some users. Check `PING` / `garmin.reading` data if you can.
5. **Phone parses.**
   - `mobile/src/lib/garmin/diag.ts` `parseGarminDiag`: is it stricter than what the watch sends (types, `schemaVersion`, field names)?
   - If it returns null, the message falls through to `mapWatchPayload`, which is logged as `garmin.rejected`. Is THAT on the dashboard?
6. **Phone reports.**
   - `reportFault(GARMIN_DIAG_TAG, …)` → `mobile/src/store/errorReport.ts` / `src/lib/errorReport.ts`: buffering, debounce, per-launch budget, `defer`.
   - Confirm that a report filed while the app is backgrounded still goes out later.
7. **Server stores, dashboard shows.**
   - Lambda: the `/fault` handler in `sls/`. Does it accept these tags and messages, and does `redactMessage` mangle them?
   - Dashboards: `failuresOf` in `landing/master/`, `isFailure` in `mobile-dashboard/`, and the event-tag lists (`GARMIN_EVENT_TAGS`). Is `garmin.*` filtered out, misclassified, or hidden behind a platform filter?
   - `garmin.reading` is ALSO missing, which suggests the break is upstream of the failure/event split. Prove it either way.

## How to work

- **Reproduce before you fix.** Write a test for each link you can reach from JS:
  - the diag parser fed the exact dictionary `RrCollector.diagPayload` builds (field-for-field, from the Monkey C source)
  - `receive()` → `reportFault` called with the right tag
  - the dashboards' classification of `garmin.noSignal` / `garmin.reading`
- **Watch side.** If you can run the Connect IQ simulator, drive a no-beats failure and watch the outbox. If you can't, reason from the source and say clearly that you did.
- **If you can't query production data** (the `/master` API needs Cognito; the report endpoint needs `PING_REPORT_KEY`), say so. Don't guess what the table holds.
- **Fix the actual break(s).** Keep each fix to what the failure needs. Follow the CLAUDE.md rules:
  - fault messages stay redacted
  - `reportFault` must never loop back into `logError`
  - a lambda change must be deployed before any build that depends on it
  - a watch-side change needs a Connect IQ store release, not an OTA. Say which of your fixes need which.
- **Add a way to see the chain.** If "is the phone receiving anything from the watch" can't be answered today, add it to the support dump (`src/lib/diagnostics/collectApp.ts`): last Garmin message received, its type, its age, and how many diags and readings arrived this install. That's counts and ages only, never health data. "Never received anything" should be visible in a support dump without a debugger.

## Related work already in flight

[austinspaeth/autonomic#137](https://github.com/austinspaeth/autonomic/pull/137) (branch `claude/optimistic-ramanujan-bbzbt1`) makes the phone end its "Waiting for Garmin" spinner when a `diag` arrives. **That fix only works if diags arrive**, which is exactly what this task is about. Build on that branch, or rebase onto main once it merges.

Also check whether the watch's own `nobeats` sentence ("Snug the band one notch…") in `garmin/source/RrView.mc` should change. Its phone-side twin in #137 no longer blames the band, because a visible pulse proves the sensor has contact.

## Done looks like

- Each link in the chain above is marked **verified working**, **broken (fixed, with test)** or **can't verify from here (why)**.
- Fixes are committed with tests, and `npm test` / `npm run lint` pass in `mobile/` plus the relevant `landing/` and `sls/` tests.
- A PR exists, and its description lists the deploy order: lambda → phone OTA → watch store release, whichever apply.
