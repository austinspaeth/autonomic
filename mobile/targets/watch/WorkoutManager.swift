import Foundation
import HealthKit

/**
 * Live heart-rate source. An HKWorkoutSession keeps the sensor streaming at
 * workout frequency and keeps the app frontmost — watchOS returns to it on
 * wrist-raise instead of the clock face while a session runs.
 *
 * The session is a `.mindAndBody` workout that is PAUSED the entire time
 * (the TachyMon model): a paused session still streams heart rate and still
 * owns the frontmost slot, but accrues no active duration — so hours of
 * monitoring add no exercise minutes and no workout-rate calorie burn to
 * Apple Health. The session auto-pauses the instant it reaches `.running`,
 * and a zero-length resume→pause "kick" fires at 0:30 and at :00/:30 past
 * every 10 minutes (TachyMon's exact cadence) to keep the sensor armed.
 * Because the live builder collects nothing while paused, HR is read from
 * the health store via an HKAnchoredObjectQuery — the sensor writes samples
 * there throughout. On stop the workout IS saved (Mind & Body, ~0 active
 * duration, the pause/resume event trail) rather than discarded, so a
 * system-finalized session after a crash also carries no calorie load.
 *
 * `hr` is lightly smoothed (median of the last 3 raw samples). Paused-session
 * samples arrive every ~5 s rather than ~1 Hz, so staleness is judged
 * accordingly: `searching` flips when no fresh sample lands in 12 s
 * (consumers suspend delta math + buzzes while it's true); `signalLost` is
 * the visual version at 18 s — UI code greys on `signalLost`, never on
 * `searching`, so a skipped sample or two never greys the screen. Spurious
 * 0-bpm samples are ignored outright (the stale timer catches a genuine loss).
 *
 * Self-heal: watchOS occasionally kills or ends the workout session in the
 * background. While streaming is wanted, a watchdog rebuilds the session
 * whenever it lands in .ended/.stopped, errors out, or goes >30 s without a
 * sample — rate-limited so a genuinely absent wrist doesn't restart-loop.
 * Held display values are never cleared by a recovery, only by stop().
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    /// No fresh sample for this long → `searching` (suspend deltas/buzzes).
    private static let searchingAfter: TimeInterval = 12
    /// No fresh sample for this long → `signalLost` (UI greys the held value).
    private static let signalLostAfter: TimeInterval = 18
    /// No fresh sample for this long → rebuild the session (self-heal).
    private static let recoverLeash: TimeInterval = 30
    /// Longer first-sample leash: initial sensor lock can be slow, and
    /// restarting mid-lock only delays it further.
    private static let firstSampleLeash: TimeInterval = 45

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var hrQuery: HKAnchoredObjectQuery?
    private var hrAnchor: HKQueryAnchor?
    private var recent: [Double] = []
    /// Last real sample, across session rebuilds — staleness/greying key off
    /// this so a recovery never un-greys a genuinely stale value.
    private var lastSampleAt: Date?
    /// Whether the CURRENT session has produced a sample yet (recovery leash).
    private var sampleThisSession = false
    private var staleTimer: Timer?
    /// User intent: true between start() and stop(). Recovery only runs while set.
    private var wantsStreaming = false
    private var sessionBeganAt: Date?
    private var lastRecoverAt: Date?
    /// 1 Hz tick count since start() — drives the resume→pause kick schedule.
    private var ticks = 0

    @Published var hr: Double?
    @Published var searching = true
    /// Visual-only signal loss: `searching` held true past a grace window.
    /// UI greys on this so a short dropout looks like an unbroken connection.
    @Published var signalLost = false
    @Published var running = false

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let read: Set<HKObjectType> = [HKQuantityType.quantityType(forIdentifier: .heartRate)!]
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        store.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    func start() {
        guard session == nil else { return }
        wantsStreaming = true
        lastRecoverAt = nil
        ticks = 0
        beginSession()
        startHrQuery(from: Date())
        DispatchQueue.main.async {
            self.running = true
            self.searching = true
            self.signalLost = false
        }
        staleTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    private func beginSession() {
        let config = HKWorkoutConfiguration()
        config.activityType = .mindAndBody
        config.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            session = s
            builder = b
            let start = Date()
            sessionBeganAt = start
            sampleThisSession = false
            s.startActivity(with: start)
            b.beginCollection(withStart: start) { _, _ in }
            // The delegate pauses it the moment it reaches .running — the
            // workout spends its whole life paused (see the class doc).
        } catch {
            session = nil
            builder = nil
        }
    }

    func stop() {
        wantsStreaming = false
        staleTimer?.invalidate()
        staleTimer = nil
        if let q = hrQuery { store.stop(q) }
        hrQuery = nil
        hrAnchor = nil
        session?.end()
        let reset = { [weak self] in
            DispatchQueue.main.async {
                self?.session = nil
                self?.builder = nil
                self?.recent = []
                self?.lastSampleAt = nil
                self?.hr = nil
                self?.searching = true
                self?.signalLost = false
                self?.running = false
            }
        }
        guard let b = builder else { return reset() }
        // Save the (entirely paused) workout: ~0 active duration, no calorie
        // or exercise-minute impact, and Health shows the session record with
        // its pause/resume trail — same shape TachyMon leaves behind.
        b.endCollection(withEnd: Date()) { _, _ in
            b.finishWorkout { _, _ in }
            reset()
        }
    }

    // MARK: - 1 Hz watchdog + kick schedule

    private func tick() {
        guard wantsStreaming else { return }
        ticks += 1
        // TachyMon's sensor-arming cadence: a zero-length resume→pause at
        // 0:30, then at :00 and :30 past every 10 minutes.
        if ticks % 600 == 30 || (ticks % 600 == 0 && ticks > 0) {
            kick()
        }
        checkStale()
    }

    /// Momentarily resume the paused session; the delegate re-pauses it the
    /// instant it reaches .running, leaving a zero-length active interval.
    private func kick() {
        guard let s = session, s.state == .paused else { return }
        s.resume()
    }

    private func checkStale() {
        let now = Date()
        // Staleness (searching/greying) keys off the last REAL sample so a
        // session rebuild never makes a stale value look live again.
        let sinceSample = now.timeIntervalSince(lastSampleAt ?? sessionBeganAt ?? now)
        if sinceSample > Self.searchingAfter {
            DispatchQueue.main.async { self.searching = true }
        }
        // Grey the UI only after the longer visual grace — a dropout that
        // recovers inside the window never shows on screen.
        let lostVisually = lastSampleAt != nil && sinceSample > Self.signalLostAfter
        if lostVisually != signalLost {
            DispatchQueue.main.async { self.signalLost = lostVisually }
        }
        // The recovery leash is per-session: a fresh session gets the longer
        // first-sample allowance measured from ITS start, not from the last
        // sample of a previous incarnation.
        let sessionDead = session.map { $0.state == .ended || $0.state == .stopped } ?? true
        let leashFrom = sampleThisSession ? (lastSampleAt ?? now) : (sessionBeganAt ?? now)
        let leash = sampleThisSession ? Self.recoverLeash : Self.firstSampleLeash
        if sessionDead || now.timeIntervalSince(leashFrom) > leash {
            recover()
        }
    }

    /// Tear down whatever is left of the current session and start a fresh one,
    /// keeping the published (held) values intact. Rate-limited to one attempt
    /// per 15 s so a removed watch doesn't churn sessions. The HR query keeps
    /// running across recoveries — it watches the store, not the session.
    private func recover() {
        guard wantsStreaming else { return }
        if let lastRecoverAt, Date().timeIntervalSince(lastRecoverAt) < 15 { return }
        lastRecoverAt = Date()
        let oldSession = session
        let oldBuilder = builder
        session = nil
        builder = nil
        oldSession?.end()
        // A mid-session fragment isn't worth a Health record — discard it;
        // only stop() saves the workout.
        oldBuilder?.endCollection(withEnd: Date()) { _, _ in oldBuilder?.discardWorkout() }
        beginSession()
    }

    // MARK: - HR intake (anchored query on the health store)

    /// The sensor writes heart-rate samples to the store at workout frequency
    /// for as long as the session exists — paused included. An anchored query
    /// with an update handler is the delivery path that keeps working while
    /// paused (the live builder only collects during .running).
    private func startHrQuery(from start: Date) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [])
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, _, anchor, _ in
            DispatchQueue.main.async {
                guard let self, self.wantsStreaming else { return }
                self.hrAnchor = anchor
                guard let quantities = samples as? [HKQuantitySample], !quantities.isEmpty else { return }
                let unit = HKUnit.count().unitDivided(by: .minute())
                for sample in quantities.sorted(by: { $0.endDate < $1.endDate }) {
                    self.ingest(sample.quantity.doubleValue(for: unit))
                }
            }
        }
        let query = HKAnchoredObjectQuery(
            type: hrType, predicate: predicate, anchor: hrAnchor,
            limit: HKObjectQueryNoLimit, resultsHandler: handler
        )
        query.updateHandler = handler
        hrQuery = query
        store.execute(query)
    }

    /// Main-thread only (the query handler and delegates hop here first).
    private func ingest(_ bpm: Double) {
        // A 0-bpm sample is sensor noise, not proof of loss — drop it and let
        // the stale timer decide.
        guard bpm > 0 else { return }
        lastSampleAt = Date()
        sampleThisSession = true
        recent.append(bpm)
        // Median of the last 3 samples — enough to reject a single spurious
        // reading without adding the lag of a wider window.
        if recent.count > 3 { recent.removeFirst(recent.count - 3) }
        let smoothed = recent.sorted(by: <)[recent.count / 2]
        hr = smoothed
        searching = false
        signalLost = false
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        DispatchQueue.main.async {
            guard workoutSession === self.session else { return }
            switch toState {
            case .running:
                // The session never actually runs: pause immediately on start
                // and immediately after every kick's resume (zero-length
                // active interval → no calories, no exercise minutes).
                if self.wantsStreaming { workoutSession.pause() }
            case .ended, .stopped:
                // watchOS ended the session while we still want the stream.
                self.recover()
            default:
                break
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            guard workoutSession === self.session else { return }
            self.recover()
        }
    }
}
