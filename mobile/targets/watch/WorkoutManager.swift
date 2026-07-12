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
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var recent: [Double] = []
    private var lastSampleAt: Date?
    private var staleTimer: Timer?

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
            s.startActivity(with: start)
            b.beginCollection(withStart: start) { _, _ in }
            DispatchQueue.main.async {
                self.running = true
                self.searching = true
            }
            staleTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                self?.checkStale()
            }
        } catch {
            session = nil
            builder = nil
        }
    }

    func stop() {
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
        guard let last = lastSampleAt else { return }
        if Date().timeIntervalSince(last) > 5 {
            DispatchQueue.main.async { self.searching = true }
        }
    }

    private func ingest(_ bpm: Double) {
        guard bpm > 0 else {
            DispatchQueue.main.async { self.searching = true }
            return
        }
        lastSampleAt = Date()
        recent.append(bpm)
        if recent.count > 5 { recent.removeFirst(recent.count - 5) }
        let smoothed = recent.sorted(by: <)[recent.count / 2]
        DispatchQueue.main.async {
            self.hr = smoothed
            self.searching = false
        }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { self.searching = true }
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
