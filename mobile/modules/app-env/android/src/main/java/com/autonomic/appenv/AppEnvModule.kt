package com.autonomic.appenv

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android half of the AppEnv module (the iOS half reports the sandbox
 * receipt for TestFlight detection). Exposes which store installed the app:
 * empty/other = sideload (adb, direct APK), "com.android.vending" = Google
 * Play. The paywall uses this the way iOS uses TestFlight detection —
 * sideloaded builds can't purchase through Play Billing at all, so they are
 * let through; Play-installed builds stay gated.
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
  }
}
