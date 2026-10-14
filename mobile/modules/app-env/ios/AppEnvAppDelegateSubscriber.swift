import ExpoModulesCore

/**
 * Subscribes to MetricKit at real app launch. Expo modules are created lazily
 * on first JS access, and MetricKit delivers the previous launch's crash
 * diagnostics within seconds of this one starting — a subscriber added from
 * JS could be registered after the delivery it exists for.
 */
public class AppEnvAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    CrashLog.shared.start()
    return true
  }
}
