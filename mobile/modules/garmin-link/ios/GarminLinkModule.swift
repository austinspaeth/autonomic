import ExpoModulesCore
import ConnectIQ

/**
 * Connect IQ companion link.
 *
 * On iOS the companion SDK talks to the watch DIRECTLY over BLE — Garmin
 * Connect is needed only to discover devices and to install the watch app, not
 * as a live transport. So a reading arrives here without Garmin Connect running
 * and without anything touching Garmin's cloud, which is what lets this sit
 * inside an app that promises health data never leaves the phone.
 *
 * Delivery is acknowledged, not fire-and-forget. `transmit` on the watch fails
 * outright when the phone is unreachable, so the watch queues readings and
 * retries until we ack the id. Everything here is therefore addressed by id and
 * `ackMessage` is a first-class call rather than a convenience.
 */
/**
 * Garmin's delegates are Objective-C protocols, which in Swift can only be
 * adopted by an NSObject subclass — and ExpoModulesCore's `Module` is not one.
 * So the callbacks live on this small forwarder and the module holds it.
 */
private class GarminDelegates: NSObject, IQUIOverrideDelegate, IQDeviceEventDelegate, IQAppMessageDelegate {

  weak var owner: GarminLinkModule?

  func needsToInstallConnectMobile() {
    owner?.handleNeedsGarminConnect()
  }

  func deviceStatusChanged(_ device: IQDevice, status: IQDeviceStatus) {
    owner?.handleDeviceStatus(device, status)
  }

  func receivedMessage(_ message: Any, from app: IQApp) {
    owner?.handleMessage(message, from: app)
  }
}

public class GarminLinkModule: Module {

  /// The watch app's Connect IQ id (garmin/manifest.xml).
  private static let watchAppUuid = UUID(uuidString: "D9EF6511-63FA-4339-A11E-1CED0E8E9036")!

  // Held strongly: ConnectIQ keeps only a weak reference to its delegates, so
  // without this they would be deallocated the moment initialize() returned and
  // no message would ever arrive.
  private let delegates = GarminDelegates()
  private var devices: [UUID: IQDevice] = [:]
  private var apps: [UUID: IQApp] = [:]
  private var initialized = false

  public func definition() -> ModuleDefinition {
    Name("GarminLink")

    Events("onMessage", "onDeviceStatus", "onNeedsGarminConnect")

    /// Must run before anything else. `urlScheme` has to match the CFBundleURLSchemes
    /// entry the config plugin writes, or Garmin Connect cannot hand devices back.
    AsyncFunction("initialize") { (urlScheme: String) -> Bool in
      guard !self.initialized else { return true }
      self.delegates.owner = self
      ConnectIQ.sharedInstance().initialize(withUrlScheme: urlScheme,
                                            uiOverrideDelegate: self.delegates)
      self.initialized = true
      return true
    }

    /// Opens Garmin Connect's device picker. The chosen devices come back via
    /// a URL callback into `handleUrl`.
    AsyncFunction("showDeviceSelection") {
      ConnectIQ.sharedInstance().showDeviceSelection()
    }

    /// Feed the URL from the app delegate's open-url handler. Returns the
    /// devices Garmin Connect selected.
    AsyncFunction("handleUrl") { (url: String) -> [[String: Any]] in
      guard let parsed = URL(string: url),
            let found = ConnectIQ.sharedInstance().parseDeviceSelectionResponse(from: parsed)
              as? [IQDevice] else {
        return []
      }
      var out: [[String: Any]] = []
      for device in found {
        self.register(device)
        out.append(self.describe(device))
      }
      return out
    }

    /// Devices already known to this session, with live status.
    AsyncFunction("getDevices") { () -> [[String: Any]] in
      return self.devices.values.map { self.describe($0) }
    }

    /// Whether the Autonomic watch app is installed on that device. A
    /// sideloaded build can report not-installed while still working, so this
    /// is advisory: never gate sending on it.
    AsyncFunction("getAppStatus") { (deviceId: String, promise: Promise) in
      guard let app = self.app(for: deviceId) else {
        promise.resolve(["installed": false, "version": 0, "known": false])
        return
      }
      ConnectIQ.sharedInstance().getAppStatus(app) { status in
        promise.resolve([
          "installed": status?.isInstalled ?? false,
          "version": Int(status?.version ?? 0),
          "known": status != nil,
        ])
      }
    }

    /// Start listening for readings from that device.
    AsyncFunction("startListening") { (deviceId: String) -> Bool in
      guard let device = self.devices[UUID(uuidString: deviceId) ?? UUID()],
            let app = self.app(for: deviceId) else { return false }
      ConnectIQ.sharedInstance().register(forDeviceEvents: device, delegate: self.delegates)
      ConnectIQ.sharedInstance().register(forAppMessages: app, delegate: self.delegates)
      return true
    }

    AsyncFunction("stopListening") {
      ConnectIQ.sharedInstance().unregister(forAllAppMessages: self.delegates)
      ConnectIQ.sharedInstance().unregister(forAllDeviceEvents: self.delegates)
    }

    /// Acknowledge a delivered reading so the watch can drop it from its
    /// outbox. Until this lands the watch keeps retrying, which is exactly the
    /// behaviour we want if it fails.
    AsyncFunction("ackMessage") { (deviceId: String, id: String, promise: Promise) in
      guard let app = self.app(for: deviceId) else {
        promise.resolve(false)
        return
      }
      ConnectIQ.sharedInstance().sendMessage(["ack": id], to: app, progress: nil) { result in
        promise.resolve(result == .success)
      }
    }


    /// Send Autonomic's Connect IQ store page, for when the watch app is missing.
    AsyncFunction("openStoreForApp") { (deviceId: String) in
      if let app = self.app(for: deviceId) {
        // NS_SWIFT_NAME'd by the SDK: the Obj-C selector is
        // showConnectIQStoreForApp: but Swift sees showStore(for:).
        ConnectIQ.sharedInstance().showStore(for: app)
      }
    }
  }

  // MARK: - Helpers

  private func register(_ device: IQDevice) {
    devices[device.uuid] = device
    apps[device.uuid] = IQApp(uuid: Self.watchAppUuid, store: UUID(), device: device)
  }

  private func app(for deviceId: String) -> IQApp? {
    guard let uuid = UUID(uuidString: deviceId) else { return nil }
    return apps[uuid]
  }

  private func describe(_ device: IQDevice) -> [String: Any] {
    let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
    return [
      "id": device.uuid.uuidString,
      "name": device.friendlyName ?? device.modelName ?? "Garmin",
      "model": device.modelName ?? "",
      "status": Self.statusName(status),
      "connected": status == .connected,
    ]
  }

  private static func statusName(_ s: IQDeviceStatus) -> String {
    switch s {
    case .invalidDevice: return "invalid"
    case .bluetoothNotReady: return "bluetoothNotReady"
    case .notFound: return "notFound"
    case .notConnected: return "notConnected"
    case .connected: return "connected"
    @unknown default: return "unknown"
    }
  }

  // MARK: - Delegate callbacks (forwarded from GarminDelegates)

  /// Garmin Connect isn't installed. Surfaced to JS rather than letting the SDK
  /// throw up its own App Store sheet, so the app can explain why it's needed.
  fileprivate func handleNeedsGarminConnect() {
    sendEvent("onNeedsGarminConnect", [:])
  }

  fileprivate func handleDeviceStatus(_ device: IQDevice, _ status: IQDeviceStatus) {
    sendEvent("onDeviceStatus", [
      "id": device.uuid.uuidString,
      "status": Self.statusName(status),
      "connected": status == .connected,
    ])
  }

  /// A reading has arrived. The payload is passed through as-is; parsing and
  /// validation belong in JS (src/lib/watch/payload.ts already owns that
  /// contract for the Apple Watch, and Garmin emits the same shapes).
  fileprivate func handleMessage(_ message: Any, from app: IQApp) {
    guard let dict = message as? [String: Any] else { return }
    var payload = dict
    payload["deviceId"] = app.device.uuid.uuidString
    sendEvent("onMessage", payload)
  }
}
