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

    // MARK: - HR monitor complication

    private static var lastHrReloadAt: Date?
    private static var lastHrBand: String?

    /// Live feed from the HR monitor (~1 Hz). Values are written every call;
    /// the widget timeline reloads immediately when the Δ color band flips
    /// (that's the POTS-critical signal) and otherwise at most every ~15 s.
    static func hrUpdate(hr: Int, low: Int, high: Int, delta: Int, deltaLow: Int, deltaHigh: Int) {
        defaults?.set(hr, forKey: "hr.last")
        defaults?.set(low, forKey: "hr.low")
        defaults?.set(high, forKey: "hr.high")
        defaults?.set(delta, forKey: "hr.delta")
        defaults?.set(deltaLow, forKey: "hr.deltaLow")
        defaults?.set(deltaHigh, forKey: "hr.deltaHigh")
        defaults?.set(true, forKey: "hr.active")
        defaults?.set(Date().timeIntervalSince1970, forKey: "hr.at")
        let band = delta >= 30 ? "red" : delta >= 20 ? "orange" : delta <= -30 ? "blue" : "green"
        let due = lastHrReloadAt.map { Date().timeIntervalSince($0) >= 15 } ?? true
        guard band != lastHrBand || due else { return }
        lastHrBand = band
        reloadHr()
    }

    /// Session started/ended: flip the live look. Last values stay behind as
    /// the idle "last recorded HR" glance.
    static func hrSessionActive(_ active: Bool) {
        defaults?.set(active, forKey: "hr.active")
        defaults?.set(Date().timeIntervalSince1970, forKey: "hr.at")
        reloadHr()
    }

    private static func reloadHr() {
        lastHrReloadAt = Date()
        WidgetCenter.shared.reloadTimelines(ofKind: "AutonomicHrComplication")
        WidgetCenter.shared.reloadTimelines(ofKind: "AutonomicHrDeltaComplication")
    }
}
