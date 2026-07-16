import Foundation
import HealthKit

/**
 * Live heart-rate source. An HKWorkoutSession keeps the sensor streaming at
 * workout frequency and keeps the app frontmost — watchOS returns to it on
 * wrist-raise instead of the clock face while a session runs.
 *
 * Two modes, both a `.mindAndBody` workout:
 *
 * `.monitor` (the free HR monitor) is PAUSED the entire time (the TachyMon
 * model): a paused session still streams heart rate and still owns the
 * frontmost slot, but accrues no active duration — so hours of monitoring
 * add no exercise minutes and no workout-rate calorie burn to Apple Health.
 * The session auto-pauses the instant it reaches `.running`, and a
 * zero-length resume→pause "kick" fires at 0:30 and at :00/:30 past every
 * 10 minutes (TachyMon's exact cadence) to keep the sensor armed. The cost
 * of pausing: HealthKit only writes HR samples every ~5 s.
 *
 * `.capture` (the POTS stand test + orthostatic episode) leaves the session
 * RUNNING so HR lands at ~1 Hz — these are short, bounded tests where a
 * fast rise must show within a beat or two, and the ~5 s paused cadence
 * lagged the critical first seconds of standing. The trade-off is deliberate:
 * a running session accrues real active duration, so the saved workout
 * carries the test's minutes (and a modest calorie estimate).
 *
 * HR delivery is per mode. Monitor reads the health store via an
 * HKAnchoredObjectQuery — the only path that works while paused (a paused
 * builder collects nothing). Capture ingests from the live builder's
 * didCollectDataOf: store commits are batched (~5 s or slower even during a
 * running session), so the anchored query would throw away exactly the
 * latency a running session is paid for. On stop the workout IS saved rather
 * than discarded, so a system-finalized session after a crash matches what
 * stop() would have left behind.
 *
 * Smoothing is per mode. Capture (~1 Hz) takes the median of the last 3 raw
 * samples — spike rejection costs only ~1–2 s there and protects the recorded
 * series' peak values. Monitor (~5 s cadence) shows each sample as-is: watch
 * HR samples are already sensor-fused averages, and a median-of-3 at that
 * cadence would trail a real change by an extra ~10 s. Staleness is judged
 * per mode's expected cadence: `searching` flips when no fresh sample lands
 * in 12 s monitoring / 5 s capturing (consumers suspend delta math + buzzes
 * while it's true); `signalLost` is the visual version at 18 s / 10 s — UI
 * code greys on `signalLost`, never on `searching`, so a skipped sample or
 * two never greys the screen. Spurious 0-bpm samples are ignored outright
 * (the stale timer catches a genuine loss).
 *
 * Self-heal: watchOS occasionally kills or ends the workout session in the
 * background. While streaming is wanted, a watchdog rebuilds the session
 * whenever it lands in .ended/.stopped, errors out, or goes >30 s without a
 * sample — rate-limited so a genuinely absent wrist doesn't restart-loop.
 * Held display values are never cleared by a recovery, only by stop().
 *
 * stop()→start() back-to-back is safe: stop() releases the session
 * synchronously (so a new start() is never a silent no-op against a corpse
 * awaiting its HealthKit save callback) and its async display reset is
 * generation-guarded so a stop that raced a fresh start can't clobber the
 * new session's state. This used to be the "grey 00 until app restart" bug —
 * the lost start() left wantsStreaming false, which also disarmed the
 * watchdog that would otherwise have healed it.
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    enum StreamMode {
        /// Paused session, ~5 s samples, no active duration (the HR monitor).
        case monitor
        /// Running session, ~1 Hz samples, accrues real duration (POTS captures).
        case capture
    }

    /// No fresh sample for this long → `searching` (suspend deltas/buzzes).
    /// Scaled to the mode's cadence: ~2–3 missed samples either way.
    private var searchingAfter: TimeInterval { mode == .capture ? 5 : 12 }
    /// No fresh sample for this long → `signalLost` (UI greys the held value).
    private var signalLostAfter: TimeInterval { mode == .capture ? 10 : 18 }
    /// No fresh sample for this long → rebuild the session (self-heal).
    private static let recoverLeash: TimeInterval = 30
    /// Longer first-sample leash: initial sensor lock can be slow, and
    /// restarting mid-lock only delays it further.
    private static let firstSampleLeash: TimeInterval = 45

    private let store = HKHealthStore()
    /// Set by start() before the session exists; read by the delegate + watchdog.
    private var mode: StreamMode = .monitor
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
    /// Bumped by every start() and stop(); stop()'s async display reset only
    /// applies if no newer start() has taken ownership of the state since.
    private var generation = 0
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

    func start(mode: StreamMode = .monitor) {
        guard session == nil else { return }
        self.mode = mode
        generation += 1
        wantsStreaming = true
        lastRecoverAt = nil
        ticks = 0
        // Fresh session, fresh bookkeeping — a quick restart may have skipped
        // the previous stop()'s reset (generation guard), so clear here too.
        recent = []
        lastSampleAt = nil
        beginSession()
        // Monitor's delivery path; capture gets HR from the builder delegate.
        if mode == .monitor { startHrQuery(from: Date()) }
        DispatchQueue.main.async {
            self.hr = nil
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
        // Monitor spends its life paused, so its type barely matters (and
        // .mindAndBody keeps the TachyMon-shaped Health record). Capture RUNS
        // through real movement — stairs, standing up — and .other keeps the
        // sensor's motion-tolerant workout tuning (the pre-paused-model type).
        config.activityType = mode == .capture ? .other : .mindAndBody
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
        generation += 1
        let gen = generation
        staleTimer?.invalidate()
        staleTimer = nil
        if let q = hrQuery { store.stop(q) }
        hrQuery = nil
        hrAnchor = nil
        // Release the session SYNCHRONOUSLY so a start() right after stop()
        // sees `session == nil` and proceeds — the ended session/builder live
        // on as locals just long enough to save the workout.
        let endedSession = session
        let endedBuilder = builder
        session = nil
        builder = nil
        endedSession?.end()
        let reset = { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.generation == gen else { return }
                self.recent = []
                self.lastSampleAt = nil
                self.hr = nil
                self.searching = true
                self.signalLost = false
                self.running = false
            }
        }
        guard let b = endedBuilder else { return reset() }
        // Save the workout. Monitor mode: entirely paused → ~0 active duration,
        // no calorie or exercise-minute impact, the pause/resume trail — same
        // shape TachyMon leaves behind. Capture mode: the test's real duration,
        // an honest record of a deliberate 10–15 min session.
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
        // 0:30, then at :00 and :30 past every 10 minutes. Monitor-mode only —
        // a capture session is already running, nothing to arm.
        if mode == .monitor, ticks % 600 == 30 || (ticks % 600 == 0 && ticks > 0) {
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
        if sinceSample > searchingAfter {
            DispatchQueue.main.async { self.searching = true }
        }
        // Grey the UI only after the longer visual grace — a dropout that
        // recovers inside the window never shows on screen.
        let lostVisually = lastSampleAt != nil && sinceSample > signalLostAfter
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
    /// per 15 s so a removed watch doesn't churn sessions. Monitor's HR query
    /// keeps running across recoveries — it watches the store, not the
    /// session; capture's builder delegate reattaches with the new session.
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

    /// Monitor-mode delivery: the sensor writes heart-rate samples to the
    /// store for as long as the session exists — paused included — but the
    /// commits are batched (~5 s), so this path only serves the mode that can
    /// live with that cadence. Capture ingests from the builder delegate.
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
        if mode == .capture {
            // ~1 Hz: median of the last 3 rejects a single spurious reading
            // for ~1–2 s of lag, and keeps a lone spike out of the recorded
            // series' peak values.
            recent.append(bpm)
            if recent.count > 3 { recent.removeFirst(recent.count - 3) }
            hr = recent.sorted(by: <)[recent.count / 2]
        } else {
            // ~5 s cadence: each sample is already a sensor-fused average, and
            // a median-of-3 here would trail a real change by an extra ~10 s.
            hr = bpm
        }
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
                // Monitor mode never actually runs: pause immediately on start
                // and immediately after every kick's resume (zero-length
                // active interval → no calories, no exercise minutes).
                // Capture mode stays running — that's what buys ~1 Hz samples.
                if self.wantsStreaming && self.mode == .monitor { workoutSession.pause() }
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

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    /// Capture-mode delivery: a running builder surfaces each sample the
    /// moment the sensor produces it (~1 Hz), no waiting on store commits.
    /// Monitor mode ignores it — a kick's momentary .running can collect a
    /// sample, and the anchored query already owns that mode's intake.
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType) else { return }
        DispatchQueue.main.async {
            guard self.mode == .capture, self.wantsStreaming,
                  workoutBuilder === self.builder,
                  let stats = workoutBuilder.statistics(for: hrType),
                  let quantity = stats.mostRecentQuantity() else { return }
            self.ingest(quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
