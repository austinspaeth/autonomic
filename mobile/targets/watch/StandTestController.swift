import Foundation
import WatchKit

/**
 * The guided POTS stand-test state machine.
 *
 * intro → resting (5:00) → stand prompt (buzz; "I'm standing" tap or 15 s
 * auto-start) → standing (10:00) → complete. A 1 Hz ticker records the HR
 * series for the whole test (sensor dropouts leave gaps — no fake samples),
 * computes the supine baseline (mean of the last 2 min of resting), live
 * delta vs baseline, peak values, and the sustained delta (mean Δ over the
 * final minute of standing). Safety buzzers (Δ ≥ 30 / Δ > 50, hysteresis)
 * run while standing.
 *
 * "Skip to standing" is allowed during rest — the baseline then comes from
 * whatever rest data exists and the result is flagged `baselineUnstable`
 * when there was under 2 min of it. "Finish now" during standing computes
 * the result from the data so far and flags `endedEarly`. Abort during
 * intro/rest discards everything.
 */
final class StandTestController: ObservableObject {
    enum Stage { case intro, resting, prompt, standing, complete }

    static let restingDuration = 300
    static let promptTimeout = 15
    static let standingDuration = 600

    @Published var stage: Stage = .intro
    @Published var stageElapsed = 0
    @Published var delta: Double?
    @Published var baseline: Double?
    @Published var peakHr: Double = 0
    @Published var peakDelta: Double = 0

    private var ticker: Timer?
    private var testStart: Date?
    private var testElapsed = 0
    private var standAt: Int?
    private var series: [(t: Int, hr: Double)] = []
    private var restSeconds = 0
    private var maxHrSeen: Double = 0
    private var deltaBuzzers = Haptics.makeDeltaBuzzers()

    private(set) var lastResult: [String: Any]?

    deinit {
        // The timer only holds `self` weakly, so without this a controller
        // discarded mid-test leaves a no-op timer firing forever.
        ticker?.invalidate()
    }

    // MARK: - Stage transitions

    func begin() {
        guard stage == .intro else { return }
        // Capture mode: the HR monitor's exact pipeline, with tighter
        // staleness thresholds — the stand-up rise must show as soon as the
        // sensor sees it, never off a stale reading.
        WorkoutManager.shared.start(mode: .capture)
        testStart = Date()
        testElapsed = 0
        stageElapsed = 0
        series = []
        restSeconds = 0
        standAt = nil
        baseline = nil
        delta = nil
        peakHr = 0
        peakDelta = 0
        maxHrSeen = 0
        deltaBuzzers = Haptics.makeDeltaBuzzers()
        stage = .resting
        ComplicationStore.sessionUpdate(stage: "resting", delta: nil, hr: nil, endsAt: Date().addingTimeInterval(TimeInterval(Self.restingDuration)))
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func skipToStanding() {
        guard stage == .resting else { return }
        enterPrompt()
    }

    func confirmStanding() {
        guard stage == .prompt else { return }
        enterStanding()
    }

    func finishStanding() {
        guard stage == .standing else { return }
        complete(early: stageElapsed < Self.standingDuration)
    }

    /// Abort from intro/resting/prompt: discard everything captured so far.
    func abort() {
        ticker?.invalidate()
        ticker = nil
        WorkoutManager.shared.stop()
        ComplicationStore.clearSession()
        stage = .intro
        stageElapsed = 0
        series = []
        baseline = nil
        delta = nil
    }

    private func enterPrompt() {
        computeBaseline()
        stage = .prompt
        stageElapsed = 0
        Haptics.buzz(.directionUp)
        ComplicationStore.sessionUpdate(stage: "stand up", delta: nil, hr: nil, endsAt: nil)
    }

    private func enterStanding() {
        standAt = testElapsed
        stage = .standing
        stageElapsed = 0
        peakHr = baseline ?? 0
        peakDelta = 0
        deltaBuzzers.forEach { $0.reset() }
        ComplicationStore.sessionUpdate(stage: "standing", delta: 0, hr: WorkoutManager.shared.hr.map { Int($0.rounded()) }, endsAt: Date().addingTimeInterval(TimeInterval(Self.standingDuration)))
    }

    private func complete(early: Bool) {
        ticker?.invalidate()
        ticker = nil
        stage = .complete
        Haptics.buzz(.success)
        buildResult(early: early)
        WorkoutManager.shared.stop()
        ComplicationStore.recordResult(delta: (lastResult?["sustainedDelta"] as? Int) ?? (lastResult?["peakDelta"] as? Int))
        if let result = lastResult {
            PhoneRelay.shared.send(result: result)
        }
    }

    /// Reset back to the intro after the results screen is dismissed.
    func dismiss() {
        stage = .intro
        stageElapsed = 0
    }

    // MARK: - 1 Hz tick

    private func tick() {
        testElapsed += 1
        stageElapsed += 1

        let wm = WorkoutManager.shared
        if !wm.searching, let hr = wm.hr {
            series.append((t: testElapsed, hr: hr))
            maxHrSeen = max(maxHrSeen, hr)
            if stage == .resting { restSeconds += 1 }
            if stage == .standing || stage == .prompt, let base = baseline {
                let d = hr - base
                delta = d
                if stage == .standing {
                    peakHr = max(peakHr, hr)
                    peakDelta = max(peakDelta, d)
                    deltaBuzzers.forEach { $0.update(d) }
                }
            }
        }
        // Sensor gap: hold the last delta on screen (the UI greys it via
        // signalLost) — the series itself keeps the gap, no fake samples.

        // Refresh the complication's live delta every 30 s while standing
        // (the countdown self-updates; only the delta snapshot goes stale).
        if stage == .standing && stageElapsed > 0 && stageElapsed % 30 == 0 {
            ComplicationStore.sessionUpdate(
                stage: "standing",
                delta: delta.map { Int($0.rounded()) },
                hr: WorkoutManager.shared.hr.map { Int($0.rounded()) },
                endsAt: Date().addingTimeInterval(TimeInterval(Self.standingDuration - stageElapsed))
            )
        }

        switch stage {
        case .resting where stageElapsed >= Self.restingDuration:
            enterPrompt()
        case .prompt where stageElapsed >= Self.promptTimeout:
            enterStanding() // no tap — start anyway so the timing stays honest
        case .standing where stageElapsed >= Self.standingDuration:
            complete(early: false)
        default:
            break
        }
    }

    /// Supine baseline = mean HR over the last 2 min of resting (or whatever
    /// rest data exists when the user skipped ahead).
    private func computeBaseline() {
        // Called at prompt entry, so everything captured so far is rest data.
        let restSamples = series
        let windowStart = testElapsed - 120
        let window = restSamples.filter { $0.t > windowStart }
        let used = window.isEmpty ? restSamples : window
        guard !used.isEmpty else { return }
        baseline = used.map(\.hr).reduce(0, +) / Double(used.count)
    }

    // MARK: - Result payload (shared contract, schema v1)

    private func buildResult(early: Bool) {
        guard let start = testStart else { return }
        let standMark = standAt ?? testElapsed
        let standing = series.filter { $0.t > standMark }
        let base = baseline

        let lastMinute = standing.filter { $0.t > testElapsed - 60 }
        var sustained: Double?
        if let base, !lastMinute.isEmpty {
            sustained = lastMinute.map { $0.hr - base }.reduce(0, +) / Double(lastMinute.count)
        }

        let age = PhoneRelay.shared.age
        let potsThreshold: Double = (age != nil && age! >= 12 && age! <= 19) ? 40 : 30
        let met = (sustained ?? 0) >= potsThreshold

        let iso = ISO8601DateFormatter()
        var payload: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "type": "standTest",
            "time": iso.string(from: start),
            "source": "watch",
            "schemaVersion": 1,
            "metThreshold": met,
            "standAt": standMark,
            "hrSeries": series.map { ["t": $0.t, "hr": Int($0.hr.rounded())] },
            "note": "",
        ]
        if let base { payload["baselineHr"] = Int(base.rounded()) }
        if !standing.isEmpty {
            payload["peakHr"] = Int(peakHr.rounded())
            if base != nil { payload["peakDelta"] = Int(peakDelta.rounded()) }
        }
        if let sustained { payload["sustainedDelta"] = Int(sustained.rounded()) }
        if maxHrSeen > 0 { payload["maxHrReached"] = Int(maxHrSeen.rounded()) }
        if let maxHr = computedMaxHr(age: age, sex: PhoneRelay.shared.sex) {
            payload["maxHrComputed"] = Int(maxHr.rounded())
        }
        if early { payload["endedEarly"] = true }
        if restSeconds < 120 { payload["baselineUnstable"] = true }
        lastResult = payload
    }

    var sustainedDeltaForDisplay: Int? {
        lastResult?["sustainedDelta"] as? Int
    }
    var metThresholdForDisplay: Bool {
        lastResult?["metThreshold"] as? Bool ?? false
    }
}
