import Foundation
import WatchKit

/**
 * Fire-once threshold haptics. Each buzzer fires when the value crosses its
 * threshold upward and re-arms only after the value falls at least `rearm`
 * below it — never per-sample.
 */
final class ThresholdBuzzer {
    private let threshold: Double
    private let rearm: Double
    private let fire: () -> Void
    private var armed = true

    init(threshold: Double, rearm: Double = 5, fire: @escaping () -> Void) {
        self.threshold = threshold
        self.rearm = rearm
        self.fire = fire
    }

    func update(_ value: Double) {
        if armed && value >= threshold {
            fire()
            armed = false
        } else if !armed && value <= threshold - rearm {
            armed = true
        }
    }

    func reset() { armed = true }
}

enum Haptics {
    static func buzz(_ type: WKHapticType = .notification) {
        WKInterfaceDevice.current().play(type)
    }

    /// Two distinguishable pulses for the Δ > 50 alert.
    static func doubleBuzz() {
        buzz(.notification)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { buzz(.notification) }
    }

    /// The safety set shared by both modes: Δ ≥ 30 → one buzz, Δ > 50 → two.
    static func makeDeltaBuzzers() -> [ThresholdBuzzer] {
        [
            ThresholdBuzzer(threshold: 30) { buzz(.notification) },
            ThresholdBuzzer(threshold: 51) { doubleBuzz() },
        ]
    }

    /// Max-HR proximity: within 15 bpm of the computed ceiling → one buzz.
    static func makeMaxHrBuzzer(maxHr: Double) -> ThresholdBuzzer {
        ThresholdBuzzer(threshold: maxHr - 15) { buzz(.notification) }
    }
}

/// Tanaka (208 − 0.7×age); Gulati (206 − 0.88×age) for female profiles.
func computedMaxHr(age: Int?, sex: String?) -> Double? {
    guard let age, age > 0 else { return nil }
    if let sex, sex.lowercased().hasPrefix("f") { return 206 - 0.88 * Double(age) }
    return 208 - 0.7 * Double(age)
}
