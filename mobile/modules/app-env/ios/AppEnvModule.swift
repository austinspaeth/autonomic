import ExpoModulesCore
import UIKit

/**
 * Reports whether the running build uses a StoreKit *sandbox* receipt.
 *
 * TestFlight and Xcode/dev installs carry an `appStoreReceiptURL` whose last
 * path component is `sandboxReceipt`; App Store installs carry `receipt`. A
 * TestFlight build and the promoted App Store build are the *same binary*, so
 * this runtime receipt check is the only reliable way to tell them apart — a
 * build-time flag would leak into production. JS uses this to let TestFlight
 * testers past the subscription paywall while real App Store customers still
 * hit it (see src/store/iap.ts).
 */
public class AppEnvModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppEnv")

    Constants([
      "isSandboxReceipt": AppEnvModule.isSandboxReceipt()
    ])

    // The Android twin of this module answers two more questions, both of them
    // about what R8 did to the release build. Neither exists here — nothing
    // renames a Swift or ObjC class in an App Store build, and there is no
    // second process resolving our classes by name — so these are stubs that
    // keep ONE JS interface across the two platforms rather than making every
    // caller branch on `Platform.OS`.
    //
    // Nothing is missing, so nothing is disabled.
    Function("missingClasses") { (_: [String]) -> [String] in [] }

    // Crash recording. Deliberately NOT `NSSetUncaughtExceptionHandler`: that
    // catches ObjC exceptions, and almost nothing that kills an iOS build is
    // one — a Swift trap, a force-unwrap, a JSI abort and a watchdog kill are
    // all signals, which it never sees. MetricKit is the system's own record
    // of those, delivered on the launch after (see CrashLog.swift). The
    // subscriber is started from the AppDelegate; this call connects it to the
    // event below so a delivery after the launch-time drain is drained too.
    Events("onCrashLog")
    OnCreate {
      CrashLog.shared.onWrite = { [weak self] in
        DispatchQueue.main.async { self?.sendEvent("onCrashLog", [:]) }
      }
    }
    Function("installCrashHandler") { () -> Bool in CrashLog.shared.start() }
    Function("takeCrashLog") { () -> String in CrashLog.take() }

    // Background time for a pacing refresh (src/store/pacingBackground.ts). A
    // HealthKit background-delivery launch gets a few seconds before iOS
    // suspends it, and a health read plus a budget build can outlast that. The
    // expiration handler ends the task itself, so a JS side that never answers
    // cannot get the app killed for overrunning.
    AsyncFunction("beginBackgroundTask") { (name: String) -> Int in
      var task: UIBackgroundTaskIdentifier = .invalid
      task = UIApplication.shared.beginBackgroundTask(withName: name) {
        UIApplication.shared.endBackgroundTask(task)
        task = .invalid
      }
      return task.rawValue
    }.runOnQueue(.main)

    AsyncFunction("endBackgroundTask") { (raw: Int) in
      let task = UIBackgroundTaskIdentifier(rawValue: raw)
      if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
    }.runOnQueue(.main)
  }

  private static func isSandboxReceipt() -> Bool {
    guard let url = Bundle.main.appStoreReceiptURL else { return false }
    return url.lastPathComponent == "sandboxReceipt"
  }
}
