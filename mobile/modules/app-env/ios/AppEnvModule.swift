import ExpoModulesCore

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

    // Deliberately NOT `NSSetUncaughtExceptionHandler`. That catches ObjC
    // exceptions, and almost nothing that kills an iOS build is one — a Swift
    // trap, a force-unwrap, a JSI abort and an OOM are all signals, which it
    // never sees. Installing it would report a handful of crashes and imply we
    // were watching for the rest. Crash reporting on iOS is a real project with
    // a signal handler in it, not a line here.
    Function("installCrashHandler") { () -> Bool in false }
    Function("takeCrashLog") { () -> String in "" }
  }

  private static func isSandboxReceipt() -> Bool {
    guard let url = Bundle.main.appStoreReceiptURL else { return false }
    return url.lastPathComponent == "sandboxReceipt"
  }
}
