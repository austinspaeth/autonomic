import EXUpdates
import Expo
import ExpoModulesCore
import React
import UIKit

/**
 * Starts React Native on a launch that never gets a scene.
 *
 * THE BUG (expo/expo#52878, open). Under the UIScene life cycle — mandatory
 * for anything built with the iOS 27 SDK — Expo starts React Native from
 * `ExpoAppSceneDelegate.scene(_:willConnectTo:)` and nowhere else. When iOS
 * launches a terminated app IN THE BACKGROUND (HealthKit background delivery,
 * BGTaskScheduler) no scene connects, so the React host is never created and
 * not one line of JavaScript runs. Nothing fails and nothing logs: the
 * HealthKit observer waits out its ~25 seconds for a callback that cannot
 * come, expo-task-manager queues an event for a task that never registers,
 * and the pacing alerts and the background widget refresh simply stop.
 *
 * THE FIX. A moment after launch, if no scene has started React Native, start
 * the React HOST with no view. That loads the bundle and runs its top-level
 * code — which is exactly what the background path needs: `index.js` defines
 * the pacing task and registers the HealthKit observers at bundle load, for
 * the same reason on Android (a headless WorkManager start never mounts the
 * app either). No root component is mounted. When a scene does connect later,
 * Expo's scene delegate asks the same factory for a view and
 * `RCTRootViewFactory` reuses the host it finds, so there is never a second
 * JavaScript runtime.
 *
 * Three things have to be right, and each is a way this goes wrong quietly:
 *
 * 1. THE BUNDLE. With expo-updates the launch bundle is chosen by its
 *    `AppController`, asynchronously. The host must not start until the
 *    controller has answered, or background JavaScript would run the bundle
 *    embedded in the binary while the foreground runs the latest OTA.
 *
 * 2. THE HAND-BACK. `AppController` has ONE delegate, and expo-updates' own
 *    React delegate handler only installs itself when it is the one that
 *    calls `start()`. If a scene connects while a start WE began is still in
 *    flight, that handler is left holding a placeholder view with nobody
 *    coming to replace it: a splash screen for ever. So when the controller
 *    answers and a window already exists, the answer is forwarded to that
 *    handler and this class does nothing else.
 *
 * 3. THE FIRST LINK. A host started here has no launch URL, so
 *    `Linking.getInitialURL()` is null for the scene that connects later,
 *    and the `url` event for it fires before any component has mounted to
 *    listen. A widget tap that foregrounds a background-launched process
 *    would open the app and do nothing. The URL is therefore kept here for
 *    JavaScript to collect once (`takeSceneLaunchURL`).
 *
 * "No scene after a grace period" is the test, deliberately:
 * `UIApplication.applicationState` is `.background` inside
 * `didFinishLaunching` even on an ordinary tap under scenes, so it cannot
 * tell the two launches apart.
 *
 * Delete this module when Expo ships its own fix.
 */
@MainActor
final class BackgroundLaunch: NSObject, AppControllerDelegate {
  static let shared = BackgroundLaunch()

  /// How long a launch gets to connect a scene before it is treated as a
  /// background launch. A tapped launch connects its scene in the same turn
  /// of the run loop that `didFinishLaunching` returns to; HealthKit's
  /// observer and a BGTask both allow far longer than this.
  private static let grace: TimeInterval = 2

  private var launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  /// True once THIS class created the React host.
  private(set) var startedHost = false
  /// Why the last decision went the way it did — for the support dump.
  private(set) var outcome = "not evaluated"
  /// The URL the first scene arrived with after a host started here.
  private var sceneLaunchURL: URL?

  func arm(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
    self.launchOptions = launchOptions
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.grace) { [weak self] in
      self?.evaluate()
    }
  }

  /// A URL delivered through the app delegate. Under scenes that is every
  /// opened URL, the connecting scene's own included.
  func noteOpened(url: URL) {
    // Only the launch link of the first scene after a host we started: every
    // other URL reaches JavaScript by the ordinary routes.
    guard startedHost, sceneLaunchURL == nil, !rootMounted else { return }
    sceneLaunchURL = url
  }

  func takeSceneLaunchURL() -> String? {
    rootMounted = true
    defer { sceneLaunchURL = nil }
    return sceneLaunchURL?.absoluteString
  }

  /// Set the first time JavaScript asks for the launch URL, which it does from
  /// a mounted component: from then on `url` events have a listener.
  private var rootMounted = false

  // MARK: - Decision

  private var provider: ExpoReactNativeFactoryProvider? {
    UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider
  }

  /// A scene has asked for (or already has) a React Native view.
  private var sceneHasStarted: Bool {
    provider?.window != nil || Self.hasHost(provider?.reactNativeFactory)
  }

  /// Whether the factory already owns a React host. Read through KVC:
  /// `RCTRootViewFactory.reactHost` is typed `RCTHost`, a class Swift only sees
  /// forward-declared from this header, so the property is not importable.
  private static func hasHost(_ factory: RCTReactNativeFactory?) -> Bool {
    factory?.rootViewFactory.value(forKey: "reactHost") != nil
  }

  private func evaluate() {
    guard let factory = provider?.reactNativeFactory else {
      outcome = "no React Native factory on the app delegate"
      return
    }
    if sceneHasStarted {
      outcome = "a scene started React Native"
      return
    }
    // A development client loads its bundle through its own launcher UI.
    if NSClassFromString("EXDevLauncherController") != nil {
      outcome = "development client: left alone"
      return
    }

    AppController.initializeWithoutStarting()
    let controller = AppController.sharedInstance
    guard controller.isActiveController else {
      // Updates are off in this build: the factory's own bundle is the bundle.
      startHost(factory: factory, bundleURL: nil, why: "no scene; updates inactive")
      return
    }
    if controller.isStarted {
      if let url = controller.launchAssetUrl() {
        startHost(factory: factory, bundleURL: url, why: "no scene; updates already started")
      } else {
        // Somebody else's start is in flight and they hold the delegate slot.
        outcome = "no scene; updates starting elsewhere"
      }
      return
    }
    outcome = "no scene; waiting on updates"
    controller.delegate = self
    controller.start()
  }

  // MARK: - AppControllerDelegate

  nonisolated func appController(_ appController: AppControllerInterface, didStartWithSuccess success: Bool) {
    MainActor.assumeIsolated {
      self.updatesDidStart(appController, success: success)
    }
  }

  private func updatesDidStart(_ appController: AppControllerInterface, success: Bool) {
    guard let factory = provider?.reactNativeFactory else { return }
    if Self.hasHost(factory) {
      outcome = "a scene started React Native while updates loaded"
      return
    }
    if provider?.window != nil {
      // A scene connected while our start was in flight. expo-updates' handler
      // is holding a placeholder and was never made the delegate — give it the
      // answer it is waiting for (see THE HAND-BACK above).
      let handler = ExpoAppDelegateSubscriberRepository.reactDelegateHandlers
        .compactMap { $0 as? ExpoUpdatesReactDelegateHandler }
        .first
      handler?.appController(appController, didStartWithSuccess: success)
      outcome = handler != nil
        ? "handed the updates answer back to a scene"
        : "a scene is waiting and no updates handler was found"
      return
    }
    startHost(
      factory: factory,
      bundleURL: appController.launchAssetUrl(),
      why: success ? "no scene; updates ready" : "no scene; updates failed, embedded bundle"
    )
  }

  // MARK: - The start

  private func startHost(factory: RCTReactNativeFactory, bundleURL: URL?, why: String) {
    let rootViewFactory = factory.rootViewFactory
    guard !Self.hasHost(factory) else { return }

    // The host reads its bundle URL from the root view factory's configuration
    // block, not from the bundle configuration alone — the same pair
    // `ExpoReactNativeFactory.recreateRootView` sets for a normal launch.
    if let bundleURL,
      let configuration = rootViewFactory.value(forKey: "_configuration") as? RCTRootViewFactoryConfiguration {
      configuration.bundleURLBlock = { bundleURL }
    }
    let bundleConfiguration: RCTBundleConfiguration = bundleURL != nil
      ? ExpoBundleConfiguration.configuration(bundleURL: bundleURL)
      : factory.bundleConfiguration

    rootViewFactory.initializeReactHost(
      launchOptions: launchOptions,
      bundleConfiguration: bundleConfiguration,
      devMenuConfiguration: factory.devMenuConfiguration ?? RCTDevMenuConfiguration.default()
    )
    startedHost = true
    outcome = "started the React host (\(why))"
  }
}

public class BackgroundLaunchAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    BackgroundLaunch.shared.arm(launchOptions: launchOptions)
    return true
  }

  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    BackgroundLaunch.shared.noteOpened(url: url)
    // Observed, never claimed: every other subscriber still gets the URL.
    return false
  }
}

public class BackgroundLaunchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackgroundLaunch")

    /// The URL the first scene arrived with after a scene-less start, once.
    Function("takeSceneLaunchURL") { () -> String? in
      return DispatchQueue.main.sync { BackgroundLaunch.shared.takeSceneLaunchURL() }
    }

    /// What the launch decision was, for the support dump.
    Function("status") { () -> [String: Any] in
      return DispatchQueue.main.sync {
        [
          "startedHost": BackgroundLaunch.shared.startedHost,
          "outcome": BackgroundLaunch.shared.outcome,
        ]
      }
    }
  }
}
