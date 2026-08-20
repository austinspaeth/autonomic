import Foundation
import WatchConnectivity

/**
 * Phone-side owner of the WatchConnectivity session.
 *
 * Activated from WatchBridgeAppDelegateSubscriber at real app launch — not from
 * the (lazily created) Expo module — so userInfo transfers the system queued
 * while the app was dead are delivered promptly, including background launches.
 *
 * Incoming userInfo payloads are persisted to UserDefaults until JS explicitly
 * acks them (after the journal write succeeds), so nothing is lost if the JS
 * runtime never attaches; the watch also retries every payload until it sees
 * the ack, and the journal dedupes by id, so re-delivery is always safe.
 */
final class WatchSessionManager: NSObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  private let queueKey = "watchBridge.pendingUserInfo"
  private let queueLock = NSLock()

  var onUserInfo: (([String: Any]) -> Void)?
  var onStateChange: (([String: Any]) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  // MARK: - State

  func stateSnapshot() -> [String: Any] {
    guard WCSession.isSupported() else {
      return ["supported": false, "activated": false, "paired": false, "watchAppInstalled": false, "reachable": false]
    }
    let s = WCSession.default
    return [
      "supported": true,
      "activated": s.activationState == .activated,
      "paired": s.isPaired,
      "watchAppInstalled": s.isWatchAppInstalled,
      "reachable": s.isReachable,
    ]
  }

  // MARK: - Persisted inbox (results waiting for a JS ack)

  private func loadQueue() -> [[String: Any]] {
    UserDefaults.standard.array(forKey: queueKey) as? [[String: Any]] ?? []
  }

  private func saveQueue(_ q: [[String: Any]]) {
    UserDefaults.standard.set(q, forKey: queueKey)
  }

  func pending() -> [[String: Any]] {
    queueLock.lock(); defer { queueLock.unlock() }
    return loadQueue()
  }

  /// JS has durably stored the entry for this id: drop it from the inbox and
  /// tell the watch so it stops retrying.
  func ack(id: String) {
    queueLock.lock()
    saveQueue(loadQueue().filter { ($0["id"] as? String) != id })
    queueLock.unlock()
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    WCSession.default.transferUserInfo(["ack": id])
  }

  func updateContext(_ context: [String: Any]) throws {
    guard WCSession.isSupported() else { return }
    try WCSession.default.updateApplicationContext(context)
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    onStateChange?(stateSnapshot())
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    // Watch was switched — reactivate for the new one.
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    onStateChange?(stateSnapshot())
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    onStateChange?(stateSnapshot())
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let id = userInfo["id"] as? String, !id.isEmpty else { return }
    queueLock.lock()
    var q = loadQueue()
    if !q.contains(where: { ($0["id"] as? String) == id }) {
      q.append(userInfo)
      saveQueue(q)
    }
    queueLock.unlock()
    onUserInfo?(userInfo)
  }
}
