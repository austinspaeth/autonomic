import ExpoModulesCore

/**
 * JS surface over WatchSessionManager. Events push incoming stand-test
 * payloads and session-state changes; `pendingUserInfo` lets JS drain results
 * that arrived before it attached (they stay in the native inbox until
 * `sendAck` confirms the journal write).
 */
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onUserInfo", "onStateChange")

    OnStartObserving {
      WatchSessionManager.shared.onUserInfo = { [weak self] info in
        self?.sendEvent("onUserInfo", info)
      }
      WatchSessionManager.shared.onStateChange = { [weak self] state in
        self?.sendEvent("onStateChange", state)
      }
    }

    OnStopObserving {
      WatchSessionManager.shared.onUserInfo = nil
      WatchSessionManager.shared.onStateChange = nil
    }

    AsyncFunction("getState") { () -> [String: Any] in
      WatchSessionManager.shared.stateSnapshot()
    }

    AsyncFunction("pendingUserInfo") { () -> [[String: Any]] in
      WatchSessionManager.shared.pending()
    }

    AsyncFunction("sendAck") { (id: String) in
      WatchSessionManager.shared.ack(id: id)
    }

    AsyncFunction("updateContext") { (context: [String: Any]) in
      try WatchSessionManager.shared.updateContext(context)
    }
  }
}
