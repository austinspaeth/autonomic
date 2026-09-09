package com.autonomic.appenv

import android.os.Build
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
        try {
          record(file, thread, error)
        } catch (t: Throwable) {
          // A handler that throws while handling turns one crash into a worse
          // one. There is nowhere left to report this to; drop it.
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

    private fun record(file: File, thread: Thread, error: Throwable) {
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
