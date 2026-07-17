import Foundation
import HealthKit

/**
 * Live heart-rate source. An HKWorkoutSession keeps the sensor streaming at
 * workout frequency and keeps the app frontmost — watchOS returns to it on
 * wrist-raise instead of the clock face while a session runs.
 *
 * Two modes:
 *
 * `.monitor` (the free HR monitor) is a `.mindAndBody` workout PAUSED the
 * entire time (the TachyMon model): a paused session still streams heart
 * rate and still owns the frontmost slot, but accrues no active duration —
 * so hours of monitoring add no exercise minutes and no workout-rate calorie
 * burn to Apple Health. The session auto-pauses the instant it reaches
 * `.running`, and a zero-length resume→pause "kick" fires at 0:30 and at
 * :00/:30 past every 10 minutes (TachyMon's exact cadence) to keep the
 * sensor armed.
 *
 * `.capture` (the POTS stand test + orthostatic episode) is an `.other`
 * workout left RUNNING so samples surface with the lowest latency HealthKit
 * offers — these are short, bounded tests where a fast rise must show the
 * moment the sensor sees it. The trade-off is deliberate: a running session
 * accrues real active duration, so the saved workout carries the test's
 * minutes (and a modest calorie estimate).
 *
 * HR delivery is dual-path. Both modes run an HKAnchoredObjectQuery against
 * the health store — the only path that works while paused (a paused builder
 * collects nothing) and the safety net if the builder delegate goes quiet.
 * Capture ALSO ingests from the live builder's didCollectDataOf, which
 * surfaces each sample as the sensor commits it — store writes are batched
 * (~5 s or slower), so the builder path is the latency a running session is
 * paid for. The two feeds dedupe by sample end date, so no sample is shown
 * twice and a late store commit can't roll the display back.
 *
 * No smoothing in either mode: watch HR samples are already sensor-fused
 * averages, and at the ~5 s cadence the optical sensor actually produces
 * (even in a running session it rarely beats that) any median window trails
 * a real rise by 10 s+ — exactly the seconds a POTS capture exists to
 * record. Every fresh sample shows the moment it lands. Staleness is judged
 * against that ~5 s cadence: `searching` flips when no fresh sample lands in
 * 10 s capturing / 12 s monitoring, i.e. ~2 missed samples (consumers
 * suspend delta math + buzzes while it's true); `signalLost` is the visual
 * version at 15 s / 18 s — UI code greys on `signalLost`, never on
 * `searching`, so one skipped sample never greys the screen. Spurious 0-bpm
 * samples are ignored outright (the stale timer catches a genuine loss).
 *
 * Self-heal, because a session must never sit on "00" until an app restart:
 * - watchOS occasionally kills or ends the session in the background: the
 *   1 Hz watchdog rebuilds the session AND the query whenever the session
 *   dies, errors out, or goes >30 s without a sample (45 s before the first
 *   sample — initial sensor lock is slow and restarting mid-lock only
 *   delays it). Rate-limited so an absent wrist doesn't restart-loop.
 * - The anchored query can be born dead: executed before the user answered
 *   the Health permission prompt, it errors once and never fires again.
 *   That was the old "grey 00 until app restart" state — recoveries only
 *   rebuilt the session, never the dead query. Now a query error rebuilds
 *   the query (rate-limited), recover() always rebuilds both halves, and
 *   authorization completing while a sample-less stream wants data forces an
 *   immediate recovery instead of waiting out the watchdog leash.
 * - start() in a mode other than the live session's tears the old session
 *   down first (saving it) and rebuilds in the new mode, so a POTS capture
 *   can never silently inherit the monitor's paused session.
 * Held display values are never cleared by a recovery, only by stop().
 *
 * stop()→start() back-to-back is safe: stop() releases the session
 * synchronously (so a new start() is never a silent no-op against a corpse
 * awaiting its HealthKit save callback) and its async display reset is
 * generation-guarded so a stop that raced a fresh start can't clobber the
 * new session's state.
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    enum StreamMode {
        /// Paused session, no active duration (the HR monitor).
        case monitor
        /// Running session, lowest-latency samples, accrues real duration
        /// (POTS captures).
        case capture
    }

    /// No fresh sample for this long → `searching` (suspend deltas/buzzes).
    /// Both scale to the sensor's real ~5 s cadence (~2 missed samples);
    /// capture runs slightly tighter so a test never does delta math on a
    /// stale reading.
    private var searchingAfter: TimeInterval { mode == .capture ? 10 : 12 }
    /// No fresh sample for this long → `signalLost` (UI greys the held value).
    private var signalLostAfter: TimeInterval { mode == .capture ? 15 : 18 }
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
    /// When start() began this stream — the anchored query's capture window
    /// (survives session rebuilds; a rebuilt query re-covers the same span).
    private var streamBeganAt: Date?
    /// End date of the newest ingested sample — dedupes the two delivery
    /// paths, which can hand over the same sample.
    private var lastIngestEnd: Date?
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
    private var lastQueryRestartAt: Date?
    /// Set when the anchored query errors (it will never fire again). Sticky:
    /// the 1 Hz tick keeps retrying the rebuild until one takes, so an error
    /// landing inside the restart rate limit isn't silently dropped.
    private var hrQueryDead = false
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
        store.requestAuthorization(toShare: share, read: read) { [weak self] _, _ in
            DispatchQueue.main.async {
                // If streaming started before the user answered the permission
                // prompt, the session and/or query were born dead. Rebuild
                // both now instead of waiting out the watchdog leash.
                guard let self, self.wantsStreaming, !self.sampleThisSession else { return }
                self.lastRecoverAt = nil
                self.recover()
            }
        }
    }

    func start(mode: StreamMode = .monitor) {
        if session != nil {
            // Already streaming in this mode — nothing to do.
            guard self.mode != mode else { return }
            // Mode switch against a live session (e.g. a POTS capture right
            // behind a still-closing monitor): tear it down properly so the
            // new mode's session model actually applies — the old silent
            // no-op left captures on the monitor's paused ~5 s session.
            stop()
        }
        self.mode = mode
        generation += 1
        wantsStreaming = true
        lastRecoverAt = nil
        lastQueryRestartAt = nil
        hrQueryDead = false
        ticks = 0
        // Fresh session, fresh bookkeeping — a quick restart may have skipped
        // the previous stop()'s reset (generation guard), so clear here too.
        lastSampleAt = nil
        lastIngestEnd = nil
        beginSession()
        // The store query runs in BOTH modes: monitor's only feed, capture's
        // safety net under the builder delegate.
        let began = Date()
        streamBeganAt = began
        startHrQuery(from: began)
        DispatchQueue.main.async {
            self.hr = nil
            self.running = true
            self.searching = true
            self.signalLost = false
        }
        staleTimer?.invalidate()
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
            // Monitor mode: the delegate pauses it the moment it reaches
            // .running — that workout spends its whole life paused.
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
                self.lastSampleAt = nil
                self.lastIngestEnd = nil
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
        if hrQueryDead { restartHrQuery() }
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

    /// Tear down whatever is left of the current session and start a fresh
    /// one, keeping the published (held) values intact. Rate-limited to one
    /// attempt per 15 s so a removed watch doesn't churn sessions. The HR
    /// query is rebuilt alongside — it can be the dead half (see the class
    /// doc); the kept anchor means no re-ingest of already-seen samples.
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
        lastQueryRestartAt = nil
        restartHrQuery()
    }

    // MARK: - HR intake (anchored query on the health store)

    /// Store-watcher feed, both modes: the sensor writes heart-rate samples
    /// to the store for as long as the session exists — paused included —
    /// but the commits are batched (~5 s or slower). Monitor lives entirely
    /// on this path; capture uses it as backfill under the builder delegate
    /// (the end-date dedupe in ingest keeps the two honest).
    private func startHrQuery(from start: Date) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [])
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] query, samples, _, anchor, error in
            DispatchQueue.main.async {
                guard let self, self.wantsStreaming, query === self.hrQuery else { return }
                if error != nil {
                    // An errored anchored query NEVER fires again (classic
                    // cause: executed before Health authorization was
                    // determined). Leaving it dead was the unrecoverable
                    // "00" state — replace it.
                    self.hrQueryDead = true
                    self.restartHrQuery()
                    return
                }
                self.hrAnchor = anchor
                guard let quantities = samples as? [HKQuantitySample], !quantities.isEmpty else { return }
                let unit = HKUnit.count().unitDivided(by: .minute())
                for sample in quantities.sorted(by: { $0.endDate < $1.endDate }) {
                    self.ingest(sample.quantity.doubleValue(for: unit), endingAt: sample.endDate)
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

    /// Stop and re-execute the anchored query. Rate-limited: a query that
    /// errors instantly (authorization still undetermined) would otherwise
    /// rebuild itself in a tight loop.
    private func restartHrQuery() {
        guard wantsStreaming else { return }
        if let lastQueryRestartAt, Date().timeIntervalSince(lastQueryRestartAt) < 5 { return }
        lastQueryRestartAt = Date()
        hrQueryDead = false
        if let q = hrQuery { store.stop(q) }
        hrQuery = nil
        startHrQuery(from: streamBeganAt ?? Date())
    }

    /// Main-thread only (the query handler and delegates hop here first).
    private func ingest(_ bpm: Double, endingAt end: Date?) {
        // A 0-bpm sample is sensor noise, not proof of loss — drop it and let
        // the stale timer decide.
        guard bpm > 0 else { return }
        // The two delivery paths can hand over the same sample; its end date
        // dedupes them and drops store-commit stragglers older than what the
        // builder already showed.
        if let end {
            if let last = lastIngestEnd, end <= last { return }
            lastIngestEnd = end
        }
        lastSampleAt = Date()
        sampleThisSession = true
        // Shown as-is: watch HR samples are already sensor-fused averages,
        // and any median window at the sensor's real ~5 s cadence would trail
        // a real rise by 10 s+ (see the class doc).
        hr = bpm
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
                // Capture mode stays running — that's what buys the builder's
                // low-latency samples.
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
    /// Capture-mode delivery: a running builder surfaces each sample as the
    /// sensor commits it, no waiting on batched store writes. Monitor mode
    /// ignores it — a kick's momentary .running can collect a sample, and
    /// the anchored query already owns that mode's intake.
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType) else { return }
        DispatchQueue.main.async {
            guard self.mode == .capture, self.wantsStreaming,
                  workoutBuilder === self.builder,
                  let stats = workoutBuilder.statistics(for: hrType),
                  let quantity = stats.mostRecentQuantity() else { return }
            self.ingest(
                quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
                endingAt: stats.mostRecentQuantityDateInterval()?.end
            )
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
