import Foundation
import WidgetKit

/**
 * Feeds the complication (targets/complication) through the shared app
 * group: the most recent stand-test delta for the idle glance, and the live
 * stage/delta/countdown while a test runs. Every write reloads the widget
 * timeline — cheap for the handful of stage transitions plus a ~30 s cadence
 * during standing (countdowns self-update in WidgetKit, so no per-second
 * churn is needed).
 */
enum ComplicationStore {
    private static let defaults = UserDefaults(suiteName: "group.com.autonomic.journal")

    static func recordResult(delta: Int?) {
        if let delta {
            defaults?.set(delta, forKey: "last.delta")
            defaults?.set(Date().timeIntervalSince1970, forKey: "last.at")
        }
        clearSession()
    }

    static func sessionUpdate(stage: String, delta: Int?, hr: Int?, endsAt: Date?) {
        defaults?.set(true, forKey: "session.active")
        defaults?.set(stage, forKey: "session.stage")
        if let delta { defaults?.set(delta, forKey: "session.delta") } else { defaults?.removeObject(forKey: "session.delta") }
        if let hr { defaults?.set(hr, forKey: "session.hr") } else { defaults?.removeObject(forKey: "session.hr") }
        if let endsAt { defaults?.set(endsAt.timeIntervalSince1970, forKey: "session.endsAt") } else { defaults?.removeObject(forKey: "session.endsAt") }
        reload()
    }

    static func clearSession() {
        defaults?.set(false, forKey: "session.active")
        defaults?.removeObject(forKey: "session.stage")
        defaults?.removeObject(forKey: "session.delta")
        defaults?.removeObject(forKey: "session.hr")
        defaults?.removeObject(forKey: "session.endsAt")
        reload()
    }

    private static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: "AutonomicComplication")
    }
}
