package com.autonomic.appenv

import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Looper
import android.os.Process
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.system.exitProcess

/**
 * Android half of the AppEnv module — facts about THIS BINARY that JS cannot
 * see from inside itself. Three of them now, and the two new ones exist for the
 * same reason: R8 rewrites the release build, and a JS bundle has no way to
 * tell what it did.
 *
 *  1. Which store installed the app (the original job). The paywall uses this
 *     the way iOS uses TestFlight detection — a sideloaded build cannot
 *     purchase through Play Billing at all, so it is let through.
 *
 *  2. `missingClasses` — are these classes still here, under these names?
 *     Anything resolved by NAME across a process boundary (a Parcelable
 *     arriving in an Intent extra is looked up by its class-name string through
 *     our own ClassLoader) breaks silently when R8 renames it, and breaks
 *     INSIDE the library's own code where no `catch` of ours can reach. Asking
 *     the question at startup turns a keep rule we forgot into a feature that
 *     switches itself off, instead of a crash on somebody's phone.
 *
 *  3. `installCrashHandler` / `takeCrashLog` — a Java uncaught-exception
 *     handler. `installErrorLogging()` on the JS side hooks React Native's
 *     `ErrorUtils`, which sees JavaScript throws and nothing else, so a Java
 *     exception on the main thread killed the process leaving the on-device
 *     error log completely empty. That is not a gap in what we recorded, it is
 *     a gap in what we could record.
 *
 *     It also SURVIVES one exception, and only one: Health Connect's
 *     empty-heart-rate-record throw on a background worker (see
 *     `HrSampleCrash`). `takeSwallowedHrRead` tells the JS read that timed out
 *     waiting for it what happened.
 */
class AppEnvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppEnv")

    Constants {
      val context = appContext.reactContext
      val installer = try {
        if (context == null) null
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
          @Suppress("DEPRECATION")
          context.packageManager.getInstallerPackageName(context.packageName)
        }
      } catch (e: Exception) {
        null
      }
      mapOf("installerPackage" to (installer ?: ""))
    }

    /**
     * Of these fully-qualified class names, which are NOT resolvable here?
     *
     * Loaded with `initialize = false`: the question is whether the name still
     * exists, and running a class's static initializer to find out would be a
     * side effect for a diagnostic. A renamed class and a shrunk-away one both
     * answer the same way, which is correct — either one breaks a
     * name-resolved lookup identically.
     */
    Function("missingClasses") { names: List<String> ->
      names.filter { name ->
        try {
          Class.forName(name, false, AppEnvModule::class.java.classLoader)
          false
        } catch (t: Throwable) {
          true
        }
      }
    }

    Function("installCrashHandler") {
      val context = appContext.reactContext ?: return@Function false
      installHandler(File(context.applicationContext.filesDir, CRASH_FILE))
    }

    /** The stored crashes as raw JSON, clearing them. `""` when there are none. */
    Function("takeCrashLog") {
      val context = appContext.reactContext ?: return@Function ""
      takeLog(File(context.applicationContext.filesDir, CRASH_FILE))
    }

    /**
     * Was an empty-heart-rate-record throw swallowed at or after `sinceMs`?
     * Consumes the one it reports, so two reads that both hung on two bad
     * records each find their own. JS asks this only from a read that timed
     * out, which is the one way such a read ends.
     */
    Function("takeSwallowedHrRead") { sinceMs: Double ->
      takeSwallowed(sinceMs.toLong())
    }

    /**
     * DEBUG BUILDS ONLY: throw `HrSampleCrash.simulated()` on a background
     * thread, to rehearse the swallow. Nobody can create the real record any
     * more, so this is the only way to exercise the handler. Returns false (and
     * throws nothing) in a release build.
     */
    Function("simulateHrSampleCrash") {
      val context = appContext.reactContext ?: return@Function false
      if ((context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) return@Function false
      Thread({ throw HrSampleCrash.simulated() }, "hr-sample-sim").start()
      true
    }
  }

  companion object {
    private const val CRASH_FILE = "native-crashes.json"

    /** Crashes kept on disk. A phone crashing in six different ways between two
     *  launches has one problem; the newest are the ones worth carrying. */
    private const val MAX_STORED = 5

    /** Per-field cap. The useful part of a crash message is its first clause,
     *  and JS redacts and truncates again before any of it leaves the phone. */
    private const val MAX_FIELD = 300

    /** How far to walk `cause` looking for the real failure. Bounded because a
     *  cause chain can be circular in ways `!==` alone will not catch. */
    private const val MAX_CAUSE_DEPTH = 8

    private var installed = false

    /** When each swallowed empty-record throw happened, oldest first. In memory
     *  only: the process survived, so the read that hung is still waiting. */
    private val swallowedAt = ArrayDeque<Long>()
    private const val MAX_SWALLOWED = 16

    /**
     * Install the handler, once.
     *
     * Two rules govern everything below. It runs in a process that is ALREADY
     * DYING, so the work is one synchronous file write and nothing else — no
     * network, no MMKV (that is JSI, and the JS runtime may be gone), no
     * allocation worth speaking of. And it must not change whether a crash is a
     * crash: the previous handler is always called, so the process still dies
     * exactly as it would have. This observes, it does not rescue.
     *
     * With ONE exception, `HrSampleCrash`: Health Connect's empty-record throw
     * on a background worker is recorded (as `kind: swallowed`, which JS files
     * as non-fatal) and then NOT chained, so the process lives.
     *
     * The report is picked up on the NEXT launch, which is also what makes it
     * safe: `reportFault` already buffers to disk and drains at startup, so a
     * crash reaches the dashboard through the same path an offline failure
     * does.
     */
    @Synchronized
    fun installHandler(file: File): Boolean {
      if (installed) return true
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        val swallow = try {
          HrSampleCrash.matches(error, thread === Looper.getMainLooper().thread)
        } catch (t: Throwable) {
          false
        }
        try {
          record(file, thread, error, if (swallow) "swallowed" else null)
        } catch (t: Throwable) {
          // A handler that throws while handling turns one crash into a worse
          // one. There is nowhere left to report this to; drop it.
        }
        if (swallow) {
          noteSwallowed()
          return@setDefaultUncaughtExceptionHandler
        }
        if (previous != null) {
          previous.uncaughtException(thread, error)
        } else {
          // No prior handler is not a state Android normally leaves us in, but
          // returning from here would hang the thread instead of ending it.
          Process.killProcess(Process.myPid())
          exitProcess(10)
        }
      }
      installed = true
      return true
    }

    @Synchronized
    private fun noteSwallowed() {
      swallowedAt.addLast(System.currentTimeMillis())
      while (swallowedAt.size > MAX_SWALLOWED) swallowedAt.removeFirst()
    }

    @Synchronized
    private fun takeSwallowed(sinceMs: Long): Boolean {
      val it = swallowedAt.iterator()
      while (it.hasNext()) {
        if (it.next() >= sinceMs) {
          it.remove()
          return true
        }
      }
      return false
    }

    private fun record(file: File, thread: Thread, error: Throwable, kind: String?) {
      // The ROOT cause is the diagnosis. A BadParcelableException's message
      // names the wrapper; its cause names the class that could not be found,
      // which is the fact a fix needs.
      var root: Throwable = error
      var depth = 0
      while (root.cause != null && root.cause !== root && depth < MAX_CAUSE_DEPTH) {
        root = root.cause!!
        depth += 1
      }

      val row = JSONObject()
      row.put("at", System.currentTimeMillis())
      row.put("thread", thread.name ?: "")
      if (kind != null) row.put("kind", kind)
      row.put("type", error.javaClass.name)
      row.put("message", clip(error.message))
      if (root !== error) {
        row.put("causeType", root.javaClass.name)
        row.put("causeMessage", clip(root.message))
      }
      // One frame, not a stack: a release build's frames are obfuscated and
      // worth little, and Play Console already holds the deobfuscated trace.
      // This is here to say WHERE among our own code, when it happens to be us.
      root.stackTrace.firstOrNull()?.let { row.put("frame", clip(it.toString())) }

      val kept = JSONArray()
      val existing = readArray(file)
      val start = maxOf(0, existing.length() - (MAX_STORED - 1))
      for (i in start until existing.length()) kept.put(existing.get(i))
      kept.put(row)
      file.writeText(kept.toString())
    }

    private fun readArray(file: File): JSONArray = try {
      if (file.exists()) JSONArray(file.readText()) else JSONArray()
    } catch (t: Throwable) {
      // Truncated by the crash that wrote it, or written by an older build.
      // A corrupt log is not worth keeping anyone from recording the next one.
      JSONArray()
    }

    private fun takeLog(file: File): String = try {
      if (!file.exists()) {
        ""
      } else {
        val text = file.readText()
        file.delete()
        text
      }
    } catch (t: Throwable) {
      ""
    }

    private fun clip(s: String?): String {
      val v = s ?: return ""
      return if (v.length > MAX_FIELD) v.substring(0, MAX_FIELD) else v
    }
  }
}
