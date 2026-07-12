import ExpoModulesCore

/**
 * Activates the WCSession at real app launch. Expo modules are created lazily
 * on first JS access, which is too late when the system launches the app in
 * the background to deliver a queued watch transfer — the delegate must be in
 * place before those callbacks fire.
 */
public class WatchBridgeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchSessionManager.shared.activate()
    return true
  }
}
