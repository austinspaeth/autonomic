import Foundation
import WatchKit

/**
 * Orthostatic-event state machine — a lighter cousin of the POTS stand test
 * for one-off transitions (stairs, sit→stand, lie→stand).
 *
 * picker → intro → baseline (capture resting HR before the move) → during
 * (the transition itself; a tap ends it) → recovery (60 s) → complete. The
 * baseline is the mean HR captured during the baseline stage; `afterHr` is the
 * HR the moment the transition ends; `hr1min` is the HR at the end of the 60 s
 * recovery. Live delta = current HR − baseline, shown from `during` onward.
 *
 * The result maps onto the app's existing `orthostatic` reading type
 * (transition / beforeHr / afterHr / hr1min).
 */
final class OrthostaticController: ObservableObject {
    enum EventType: String, CaseIterable, Identifiable {
        case stairs, sitToStand, layToStand
        var id: String { rawValue }

        var title: String {
            switch self {
            case .stairs: return "Stairs"
            case .sitToStand: return "Sit to stand"
            case .layToStand: return "Lay to stand"
            }
        }
        /// The app's `transition` select option this maps to.
        var transitionLabel: String {
            switch self {
            case .stairs: return "Climbing stairs"
            case .sitToStand: return "Sitting to standing"
            case .layToStand: return "Laying to standing"
            }
        }
        /// Button that begins the transition (baseline → during).
        var startButton: String {
            switch self {
            case .stairs: return "Start climbing"
            case .sitToStand, .layToStand: return "Start getting up"
            }
        }
        /// Button that ends the transition (during → recovery).
        var doneButton: String {
            switch self {
            case .stairs: return "Done climbing"
            case .sitToStand, .layToStand: return "I'm upright"
            }
        }
        /// Subtitle while the transition is underway.
        var duringSubtitle: String {
            switch self {
            case .stairs: return "Climbing stairs"
            case .sitToStand, .layToStand: return "Standing up"
            }
        }
    }

    enum Stage { case picker, intro, baseline, during, recovery, complete }

    static let recoveryDuration = 60

    @Published var eventType: EventType?
    @Published var stage: Stage = .picker
    @Published var stageElapsed = 0        // seconds into the recovery countdown
    @Published var delta: Double?
    @Published var baseline: Double?

    private var ticker: Timer?
    private var startTime: Date?
    private var elapsed = 0
    private var series: [(t: Int, hr: Double)] = []
    private var baselineSamples: [Double] = []
    private var afterHr: Double?
    private var transitionAt: Int?   // t when the transition began (before → during)
    private var completedAt: Int?    // t when the transition finished (during → recovery)
    private var lastComplicationBand: String?
    private(set) var lastResult: [String: Any]?

    // MARK: - Transitions

    func pick(_ type: EventType) {
        eventType = type
        stage = .intro
    }

    /// Back out of the intro to the event picker.
    func backToPicker() {
        eventType = nil
        stage = .picker
    }

    func begin() {
        guard stage == .intro else { return }
        WorkoutManager.shared.start()
        startTime = Date()
        elapsed = 0
        stageElapsed = 0
        series = []
        baselineSamples = []
        baseline = nil
        delta = nil
        afterHr = nil
        transitionAt = nil
        completedAt = nil
        lastComplicationBand = nil
        stage = .baseline
        ComplicationStore.sessionUpdate(stage: "baseline", delta: nil, hr: nil, endsAt: nil)
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    /// baseline → during: lock the resting baseline.
    func startTransition() {
        guard stage == .baseline else { return }
        if !baselineSamples.isEmpty {
            baseline = baselineSamples.reduce(0, +) / Double(baselineSamples.count)
        }
        transitionAt = elapsed
        stage = .during
        pushComplicationDelta(force: true)
        Haptics.buzz(.start)
    }

    /// during → recovery: record the "after" HR and start the 60 s timer.
    func endTransition() {
        guard stage == .during else { return }
        afterHr = WorkoutManager.shared.hr
        completedAt = elapsed
        stage = .recovery
        stageElapsed = 0
        pushComplicationDelta(force: true)
        Haptics.buzz(.directionUp)
    }

    func endEarly() {
        guard stage == .recovery else { return }
        complete()
    }

    /// Abandon from picker/intro/baseline/during — discard everything.
    func cancel() {
        ticker?.invalidate()
        ticker = nil
        WorkoutManager.shared.stop()
        ComplicationStore.clearSession()
        stage = .picker
        eventType = nil
        delta = nil
        baseline = nil
    }

    func dismiss() {
        stage = .picker
        eventType = nil
        stageElapsed = 0
    }

    private func complete() {
        ticker?.invalidate()
        ticker = nil
        ComplicationStore.clearSession()
        stage = .complete
        Haptics.buzz(.success)
        buildResult()
        WorkoutManager.shared.stop()
        if let result = lastResult {
            PhoneRelay.shared.send(result: result)
        }
    }

    // MARK: - 1 Hz tick

    private func tick() {
        elapsed += 1
        stageElapsed += 1
        let wm = WorkoutManager.shared
        if !wm.searching, let hr = wm.hr {
            series.append((t: elapsed, hr: hr))
            if stage == .baseline { baselineSamples.append(hr) }
            if let base = baseline, stage == .during || stage == .recovery {
                delta = hr - base
            }
        } else if stage == .during || stage == .recovery {
            delta = nil // sensor gap — never fake a delta
        }
        // Keep the complication's live Δ fresh: reload the moment its color
        // band flips, otherwise every ~15 s.
        if stage == .during || stage == .recovery {
            pushComplicationDelta(force: stageElapsed % 15 == 0)
        }
        if stage == .recovery && stageElapsed >= Self.recoveryDuration {
            complete()
        }
    }

    /// Mirrors the live delta into the shared app group for the POTS Episode
    /// complication. Reloads on band changes (that's the POTS-critical signal)
    /// or when forced; skips the write otherwise to spare the widget budget.
    private func pushComplicationDelta(force: Bool) {
        let d = delta.map { Int($0.rounded()) }
        let band = d.map { $0 > 30 ? "red" : $0 > 20 ? "orange" : "default" } ?? "none"
        guard force || band != lastComplicationBand else { return }
        lastComplicationBand = band
        let ends = stage == .recovery
            ? Date().addingTimeInterval(TimeInterval(Self.recoveryDuration - stageElapsed))
            : nil
        ComplicationStore.sessionUpdate(
            stage: stage == .recovery ? "recovery" : "during",
            delta: d,
            hr: WorkoutManager.shared.hr.map { Int($0.rounded()) },
            endsAt: ends
        )
    }

    // MARK: - Result payload (maps to the app's `orthostatic` reading type)

    private func buildResult() {
        guard let start = startTime, let type = eventType else { return }
        let iso = ISO8601DateFormatter()
        let hr1min = WorkoutManager.shared.hr
        var payload: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "type": "orthostatic",
            "transition": type.transitionLabel,
            "time": iso.string(from: start),
            "source": "watch",
            "schemaVersion": 1,
            "hrSeries": series.map { ["t": $0.t, "hr": Int($0.hr.rounded())] },
            "note": "",
        ]
        if let base = baseline { payload["beforeHr"] = Int(base.rounded()) }
        if let after = afterHr { payload["afterHr"] = Int(after.rounded()) }
        if let rec = hr1min { payload["hr1min"] = Int(rec.rounded()) }
        if let transitionAt { payload["transitionAt"] = transitionAt }
        if let completedAt { payload["completedAt"] = completedAt }
        lastResult = payload
    }

    // MARK: - Display helpers

    var resultAfterHr: Int? { lastResult?["afterHr"] as? Int }
    var resultBeforeHr: Int? { lastResult?["beforeHr"] as? Int }
    var resultRecoveryHr: Int? { lastResult?["hr1min"] as? Int }
}
