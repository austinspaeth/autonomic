import Foundation
import HealthKit

/**
 * Live heart-rate source. An HKWorkoutSession + HKLiveWorkoutBuilder keeps the
 * sensor streaming (~1 Hz) with the wrist down and keeps the app frontmost —
 * watchOS returns to it on wrist-raise instead of the clock face while a
 * session runs. The workout itself is discarded on stop (we only want the
 * live stream, not Health workout entries).
 *
 * `hr` is lightly smoothed (median of the last 5 raw samples). `searching`
 * flips when the sensor loses contact (no fresh sample in 5 s, or a 0 value);
 * consumers suspend delta math + buzzes while it's true.
 *
 * Self-heal: watchOS occasionally kills or ends the workout session in the
 * background (returning to the monitor shows no sensor light and a greyed
 * value). While streaming is wanted, a watchdog rebuilds the session whenever
 * it lands in .ended/.stopped, errors out, or goes >15 s without a sample —
 * rate-limited so a genuinely absent wrist doesn't restart-loop. Held display
 * values are never cleared by a recovery, only by stop().
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var recent: [Double] = []
    private var lastSampleAt: Date?
    private var staleTimer: Timer?
    /// User intent: true between start() and stop(). Recovery only runs while set.
    private var wantsStreaming = false
    private var sessionBeganAt: Date?
    private var lastRecoverAt: Date?

    @Published var hr: Double?
    @Published var searching = true
    @Published var running = false
    @Published var authorized: Bool?

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { self.authorized = false }
            return
        }
        let read: Set<HKObjectType> = [HKQuantityType.quantityType(forIdentifier: .heartRate)!]
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        store.requestAuthorization(toShare: share, read: read) { ok, _ in
            DispatchQueue.main.async { self.authorized = ok }
        }
    }

    func start() {
        guard session == nil else { return }
        wantsStreaming = true
        lastRecoverAt = nil
        beginSession()
        DispatchQueue.main.async {
            self.running = true
            self.searching = true
        }
        staleTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.checkStale()
        }
    }

    private func beginSession() {
        let config = HKWorkoutConfiguration()
        config.activityType = .other
        config.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            let start = Date()
            sessionBeganAt = start
            lastSampleAt = nil
            s.startActivity(with: start)
            b.beginCollection(withStart: start) { _, _ in }
        } catch {
            session = nil
            builder = nil
        }
    }

    func stop() {
        wantsStreaming = false
        staleTimer?.invalidate()
        staleTimer = nil
        session?.end()
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.discardWorkout()
            DispatchQueue.main.async {
                self?.session = nil
                self?.builder = nil
                self?.recent = []
                self?.lastSampleAt = nil
                self?.hr = nil
                self?.searching = true
                self?.running = false
            }
        }
    }

    private func checkStale() {
        guard wantsStreaming else { return }
        // Sensor silent past the normal gap → show "searching"; way past it, or
        // the session died underneath us → rebuild the session (self-heal).
        let sinceSample = Date().timeIntervalSince(lastSampleAt ?? sessionBeganAt ?? Date())
        if sinceSample > 5 {
            DispatchQueue.main.async { self.searching = true }
        }
        let sessionDead = session.map { $0.state == .ended || $0.state == .stopped } ?? true
        // Longer leash before the first-ever sample: initial sensor lock can be
        // slow, and restarting mid-lock only delays it further.
        let leash: TimeInterval = lastSampleAt == nil ? 45 : 15
        if sessionDead || sinceSample > leash {
            recover()
        }
    }

    /// Tear down whatever is left of the current session and start a fresh one,
    /// keeping the published (held) values intact. Rate-limited to one attempt
    /// per 15 s so a removed watch doesn't churn sessions.
    private func recover() {
        guard wantsStreaming else { return }
        if let lastRecoverAt, Date().timeIntervalSince(lastRecoverAt) < 15 { return }
        lastRecoverAt = Date()
        let oldSession = session
        let oldBuilder = builder
        session = nil
        builder = nil
        oldSession?.end()
        oldBuilder?.endCollection(withEnd: Date()) { _, _ in oldBuilder?.discardWorkout() }
        beginSession()
    }

    private func ingest(_ bpm: Double) {
        guard bpm > 0 else {
            DispatchQueue.main.async { self.searching = true }
            return
        }
        lastSampleAt = Date()
        recent.append(bpm)
        // Median of the last 3 samples — enough to reject a single spurious
        // reading without adding the lag of a wider window.
        if recent.count > 3 { recent.removeFirst(recent.count - 3) }
        let smoothed = recent.sorted(by: <)[recent.count / 2]
        DispatchQueue.main.async {
            self.hr = smoothed
            self.searching = false
        }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        // watchOS ended the session while we still want the stream → self-heal.
        guard toState == .ended || toState == .stopped else { return }
        DispatchQueue.main.async {
            guard workoutSession === self.session else { return }
            self.searching = true
            self.recover()
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.searching = true
            guard workoutSession === self.session else { return }
            self.recover()
        }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType),
              let stats = workoutBuilder.statistics(for: hrType),
              let quantity = stats.mostRecentQuantity() else { return }
        ingest(quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
