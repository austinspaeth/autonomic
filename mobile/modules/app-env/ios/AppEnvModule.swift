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
  }

  private static func isSandboxReceipt() -> Bool {
    guard let url = Bundle.main.appStoreReceiptURL else { return false }
    return url.lastPathComponent == "sandboxReceipt"
  }
}
