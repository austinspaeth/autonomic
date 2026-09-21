# The Garmin double-settle crash

**Status:** diagnosed, NOT fixed. Deferred out of 1.29.0 deliberately — the
Android AAB was already built and the crash is not new. Do this in 1.29.1.

**Needs a native build.** It is Kotlin, so it cannot go out as an OTA update.

**One file:** `mobile/modules/garmin-link/android/src/main/java/care/autonomic/garminlink/GarminLinkModule.kt`.
Android only — the iOS module has no second settle path and is sound as it
stands.

---

## What the dashboard showed

```
RuntimeException: java.lang.reflect.<id>
  (cause: Promise passed to 'unknown' was already settled. It will lead to a crash in the product…)
native.crash    5 occurrences    5 install-days    1.28.0 100% "only this build"    android    since Sep 14
```

Two things to read carefully there, because both are easy to misread:

- **`native.crash` means the process died.** That tag comes from the Java
  `UncaughtExceptionHandler` in `modules/app-env`, which only ever runs on a
  runtime that is already going down. This is not a handled failure.
- **"1.28.0 100% — only this build" does NOT mean 1.29.0 fixed it.**
  `GarminLinkModule.kt` has exactly one commit in its history
  (`9f6c21b`, the original Garmin support) and has not been touched since, so
  the file is byte-identical in 1.28.0 and 1.29.0. 1.29.0 shipped on Sep 19 and
  the window opened Sep 14; there is simply not enough 1.29.0 in the wild yet to
  have reported it. Expect the same signature to appear under 1.29.0 within a
  week of release, and do not read that as a regression.

## The bug

Three `AsyncFunction`s can settle the same `Promise` twice. expo-modules-core
throws when that happens, on the thread the second settle came in on, where no
`catch` of ours can reach it — so the throw reaches the global handler and the
process is killed.

### 1. `ackMessage` (line ~150) — the hot one, fix this first

```kotlin
AsyncFunction("ackMessage") { deviceId: String, id: String, promise: Promise ->
  val iq = connectIQ
  val device = devices[deviceId]
  if (iq == null || device == null) { promise.resolve(false); return@AsyncFunction }
  try {
    iq.sendMessage(device, IQApp(watchAppId), mapOf("ack" to id)) { _, _, status ->
      promise.resolve(status == ConnectIQ.IQMessageStatus.SUCCESS)   // settles
    }
  } catch (e: Exception) {
    promise.resolve(false)                                          // settles AGAIN
  }
}
```

Two independent ways to settle twice:

- The send listener reports **status transitions** and can be invoked more than
  once for a single `sendMessage`. Every call after the first is a second
  settle, with no exception involved at all.
- The listener can fire **synchronously** (an immediate failure status while
  Garmin Connect is not bound) and `sendMessage` can then throw on its way out
  of the AIDL call — `catch` resolves a promise the listener already settled.

This is the likeliest source of the reported occurrences because it is the hot
path: `src/lib/garmin/receiver.ts` calls `ackMessage` on **every reading that
arrives** (line 188) and on every unmappable payload (line 156).

**Note the `.catch(() => {})` on those call sites cannot help.** It handles a
rejected JS promise; this crash is raised natively on the second settle, before
any JS rejection exists. The call site looks defended and is not.

### 2. `getAppStatus` (line ~92) — same shape

```kotlin
try {
  iq.getApplicationInfo(watchAppId, device, object : ConnectIQ.IQApplicationInfoListener {
    override fun onApplicationInfoReceived(app: IQApp) { promise.resolve(...) }      // settles
    override fun onApplicationNotInstalled(applicationId: String) { promise.resolve(...) }  // settles
  })
} catch (e: Exception) {
  promise.resolve(...)                                                               // settles AGAIN
}
```

The listener can answer synchronously from a cached "not installed" before
`getApplicationInfo` returns, and the AIDL call can then throw. A
`RuntimeException` surfacing out of a reflection/AIDL boundary is exactly the
`java.lang.reflect.…` head in the reported signature.

### 3. `initialize` (line ~47) — milder, fix it anyway

`onSdkReady()` and `onInitializeError()` both resolve the same promise. One
listener instance per `initialize` call, so this needs the SDK to report ready
and *then* error to bite. Rare, but free to close with the same guard.

`onSdkShutDown()` correctly resolves nothing. Leave it that way.

## The fix

A settle-once latch per promise. Deliberately a tiny local helper rather than a
flag at each call site, so a fourth async function added later gets it by
writing one word:

```kotlin
/**
 * A Promise that can be settled once, silently ignoring every settle after
 * the first.
 *
 * The Connect IQ listeners are not once-callbacks: `sendMessage` reports
 * status transitions and may fire several times for one send, and both it and
 * `getApplicationInfo` can answer SYNCHRONOUSLY and then throw out of the AIDL
 * call, so the `catch` that follows settles a promise the listener already
 * settled. expo-modules-core raises on the second settle, on whichever thread
 * it arrived on, where no catch of ours can reach it — which is a process kill
 * and was this module's only reported crash.
 *
 * Dropping the later settles is right rather than merely safe: the FIRST
 * answer is the real one. A second status transition is the same send being
 * narrated, and an exception thrown after a listener has already answered is
 * the SDK unwinding, not a better answer than the one in hand.
 */
private class Once(private val promise: Promise) {
  private var settled = false
  fun resolve(value: Any?) {
    if (settled) return
    settled = true
    promise.resolve(value)
  }
}
```

Then each function wraps once and uses `once` everywhere it used `promise`:

```kotlin
AsyncFunction("ackMessage") { deviceId: String, id: String, promise: Promise ->
  val once = Once(promise)
  val iq = connectIQ
  val device = devices[deviceId]
  if (iq == null || device == null) { once.resolve(false); return@AsyncFunction }
  try {
    iq.sendMessage(device, IQApp(watchAppId), mapOf("ack" to id)) { _, _, status ->
      once.resolve(status == ConnectIQ.IQMessageStatus.SUCCESS)
    }
  } catch (e: Exception) {
    once.resolve(false)
  }
}
```

Same treatment for `getAppStatus` and `initialize`. Nothing else in the file
takes a `Promise`.

### Thread safety

`Once` is touched from the Connect IQ callback thread and from the caller's
thread, so make `settled` an `AtomicBoolean` (`compareAndSet`) rather than a
plain `Boolean` if you want it airtight. A plain flag closes the reported crash
in practice — the two settles are not simultaneous, one follows the other — but
`AtomicBoolean` costs nothing here and removes the argument.

### Do NOT "fix" it by removing the catch

Deleting the `catch` blocks would also stop the double settle, and would replace
it with a promise that never settles when the SDK throws — a JS `await` that
hangs for ever on a path that currently at least returns `false`. Keep the
catch; latch the settle.

## Verifying it

A green Gradle build proves nothing, and neither does an emulator: this needs
Garmin Connect and a real paired watch, and the module is additionally gated by
`garminLinkIntact()` (R8 keep rules, see CLAUDE.md), so a wrong build shows no
Garmin surfaces at all rather than a crash.

1. Build the **minified release** AAB/APK, not a debug build — R8 is part of the
   story on this module.
2. Pair a Garmin, take a reading on the watch, let it deliver. That drives
   `ackMessage` on the arrival path.
3. The sharper repro: let the watch deliver **while Garmin Connect is being
   killed or restarted**, so `sendMessage` answers synchronously and then throws.
   That is the shape that produced the reported signature.
4. Confirm the support dump's `garmin link` row still reads intact, and that the
   error log carries no new `garmin.*` tag.

## After it ships

The signature is `native.crash` on the Failures tab. It is ranked by
**install-days**, not occurrences, so watch that column: it should go to zero.
If occurrences drop but install-days hold, something else in the module is
settling twice and the latch only hid the frequency.

Rows expire after 120 days (`expiresAt` TTL), so the pre-fix history will age
out on its own; do not read that as the fix working.
