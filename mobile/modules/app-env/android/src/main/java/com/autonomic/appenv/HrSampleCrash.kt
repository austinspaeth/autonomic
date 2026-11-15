package com.autonomic.appenv

/**
 * The ONE uncaught exception this app survives instead of dying of.
 *
 * Android's Health Connect validates a heart-rate record in the Builder's
 * constructor (`HeartRateRecord.Builder`: "record samples should not be
 * empty"), and the READ path builds every returned record through it. So a
 * stored HeartRate record with no samples, written by some other app, throws
 * while the platform converts our read result. Play Console's trace (Galaxy
 * S25+, Android 17, 1.37.0) puts the throw here:
 *
 *   HeartRateRecord$Builder.<init>
 *   HeartRateRecordInternal.toExternalRecord
 *   InternalExternalRecordConverter.getExternalRecords
 *   HealthConnectManager$ReadRecordsResponseCallback.lambda$onResult$0
 *   kotlinx.coroutines.scheduling.CoroutineScheduler.runSafely
 *
 * That is, inside the executor Jetpack handed the platform
 * (`Dispatchers.Default`), not inside any coroutine of ours, so no `catch` of
 * ours sees it. `runSafely` hands it to the default uncaught handler and then
 * KEEPS THE WORKER RUNNING, which is what makes swallowing it safe: nothing is
 * half-torn-down afterwards. The read's result callback simply never fires, so
 * the JS read awaiting it never settles; `readHr` times out and falls back.
 *
 * Matched as narrowly as it can be: that exact message, on an
 * IllegalArgumentException, with a Health Connect read frame in its own stack,
 * and NEVER on the main thread, where swallowing would leave the UI loop dead.
 * Everything else still crashes exactly as before.
 */
object HrSampleCrash {
  /** The platform's words, verbatim (also `HR_EMPTY_SAMPLES_SIG` in JS). */
  const val MESSAGE = "record samples should not be empty"

  /** Every frame of the read callback lives in this class or a nested one
   *  (`$ReadRecordsResponseCallback` on Android 17, an anonymous `$N` on older
   *  releases). The message alone is unique; this keeps it to the read path. */
  private const val READ_FRAME_CLASS = "android.health.connect.HealthConnectManager"

  private const val MAX_CAUSE_DEPTH = 8

  fun matches(error: Throwable, onMainThread: Boolean): Boolean {
    if (onMainThread) return false
    var t: Throwable? = error
    var depth = 0
    while (t != null && depth <= MAX_CAUSE_DEPTH) {
      if (t is IllegalArgumentException && t.message == MESSAGE &&
        t.stackTrace.any { it.className.startsWith(READ_FRAME_CLASS) }
      ) {
        return true
      }
      val next = t.cause
      if (next === t) break
      t = next
      depth += 1
    }
    return false
  }

  /**
   * The exception a debug build throws to rehearse this (`simulateHrSampleCrash`).
   * Its stack is the real one's top, so it passes `matches` for the same reason
   * the real one does; nothing else could create it, since no app can write an
   * empty heart-rate record on a current Health Connect.
   */
  fun simulated(): IllegalArgumentException = IllegalArgumentException(MESSAGE).apply {
    stackTrace = arrayOf(
      StackTraceElement("android.health.connect.datatypes.HeartRateRecord\$Builder", "<init>", "HeartRateRecord.java", 250),
      StackTraceElement("android.health.connect.HealthConnectManager\$ReadRecordsResponseCallback", "lambda\$onResult\$0", "HealthConnectManager.java", 2647),
      StackTraceElement("com.autonomic.appenv.HrSampleCrash", "simulated", "HrSampleCrash.kt", 0),
    )
  }
}
