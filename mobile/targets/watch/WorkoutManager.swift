import Foundation
import HealthKit

/**
 * Live heart-rate source. An HKWorkoutSession keeps the sensor streaming at
 * workout frequency and keeps the app frontmost — watchOS returns to it on
 * wrist-raise instead of the clock face while a session runs.
 *
 * Both modes share ONE session model (the TachyMon model): a `.mindAndBody`
 * workout PAUSED the entire time. A paused session still streams heart rate
 * and still owns the frontmost slot, but accrues no active duration — so
 * neither hours of monitoring nor a stand test add exercise minutes or
 * workout-rate calorie burn to Apple Health. The session auto-pauses the
 * instant it reaches `.running`, and a zero-length resume→pause "kick"
 * fires at 0:30 and at :00/:30 past every 10 minutes (TachyMon's exact
 * cadence) to keep the sensor armed.
 *
 * `.monitor` (the free HR monitor) and `.capture` (the POTS stand test +
 * orthostatic episode) now differ only in staleness thresholds — capture
 * runs slightly tighter so a test never does delta math on a stale reading.
 * Capture used to run a live `.other` session for the builder delegate's
 * supposedly-lower-latency feed, but in practice the paused `.mindAndBody`
 * stream updates faster (an `.other` workout's samples arrive in ~5 s
 * batches; the mindfulness stream refreshes more rapidly), so the POTS
 * flows now ride the exact pipeline the monitor does.
 *
 * HR delivery is a single path: an HKAnchoredObjectQuery against the health
 * store — the only feed that works while paused (a paused builder collects
 * nothing). Ingests dedupe by sample end date, so a rebuilt query can never
 * re-show an already-seen sample or roll the display back.
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
 *   never silently inherits the monitor's bookkeeping (or vice versa).
 * Held display values are never cleared by a recovery, only by stop().
 *
 * Authorization gates the whole pipeline. start() only builds a session once
 * workout sharing is granted: undetermined → request first and begin from
 * the completion (starting anyway not only fails, it can keep watchOS from
 * ever presenting the permission sheet — the post-upgrade wedge where every
 * complication tap sat on a grey 00 for a minute, bounced back to the clock
 * face, and stayed broken until a reboot). Denied → `sharingDenied`
 * publishes so the monitor explains itself instead of imitating a sensor
 * failure. recover() honors the same gate, and refreshAuthorization()
 * (called on every app activation) retries a sheet that never presented and
 * picks up access granted in Settings while the app sat denied.
 *
 * stop()→start() back-to-back is safe: stop() releases the session
 * synchronously (so a new start() is never a silent no-op against a corpse
 * awaiting its HealthKit save callback) and its async display reset is
 * generation-guarded so a stop that raced a fresh start can't clobber the
 * new session's state.
 */
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    /// Launch permission gate. The UI shows a dedicated request screen before
    /// anything else while `.needed`: asking up front, from a fully-active
    /// app, is the reliable presentation path — the old ask-on-first-use flow
    /// could try to present mid-session-spinup and wedge (see the class doc).
    enum AuthGate { case checking, needed, resolved }

    enum StreamMode {
        /// The HR monitor.
        case monitor
        /// POTS captures — same paused session, tighter staleness thresholds.
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
    /// True once the launch orphan sweep has finished. Until then no session
    /// may be built: HealthKit allows ONE active session per app, so a session
    /// started while an unclaimed orphan is still live fails outright — and
    /// the sweep can even hand back a second handle to a session WE just
    /// started and end it (recovery builds a fresh object, so an identity
    /// check can't tell them apart). That race was the "monitor read fine,
    /// then vanished on wrist-down" quit: a complication tap cold-launches the
    /// app, the monitor starts against the previous crash's orphan, its
    /// session never sticks, nothing holds frontmost, and wrist-down suspends
    /// (then kills) the app before the watchdog can retry. beginStream() and
    /// recover() defer behind this flag; finishOrphanSweep() re-enters them.
    private var orphanSweepDone = false
    /// 1 Hz tick count since start() — drives the resume→pause kick schedule.
    private var ticks = 0

    @Published var hr: Double?
    @Published var searching = true
    /// Visual-only signal loss: `searching` held true past a grace window.
    /// UI greys on this so a short dropout looks like an unbroken connection.
    @Published var signalLost = false
    @Published var running = false
    /// Workout sharing is denied in Health settings — no session can run.
    /// The monitor UI shows how to fix it instead of a grey 00.
    @Published var sharingDenied = false
    /// Whether the launch permission screen must show before the app's UI.
    @Published var authGate: AuthGate = .checking

    private var workoutShareStatus: HKAuthorizationStatus {
        store.authorizationStatus(for: HKObjectType.workoutType())
    }

    /// The full permission set the app ever asks for. The gate check and the
    /// request must stay in lockstep — a type asked for later would present
    /// its sheet mid-session again, the exact flow the gate exists to avoid.
    private var readTypes: Set<HKObjectType> {
        [HKQuantityType.quantityType(forIdentifier: .heartRate)!]
    }
    private var shareTypes: Set<HKSampleType> {
        [HKObjectType.workoutType()]
    }

    /// Decide whether the launch permission screen is needed.
    /// `getRequestStatusForAuthorization` covers READ types too (plain
    /// `authorizationStatus` never reveals read state), so this is the only
    /// check that knows whether the sheet still has anything to present.
    func evaluateAuthGate() {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { self.authGate = .resolved }
            return
        }
        store.getRequestStatusForAuthorization(toShare: shareTypes, read: readTypes) { [weak self] status, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.sharingDenied = self.workoutShareStatus == .sharingDenied
                // .unknown (transient error) resolves rather than trapping the
                // user at the gate — start()'s own auth gate still protects
                // the session path.
                self.authGate = status == .shouldRequest ? .needed : .resolved
            }
        }
    }

    /// Claim and end a workout session orphaned by a dead previous process.
    /// An unclaimed orphan wedges the whole app: watchOS keeps relaunching it
    /// for recovery and dismisses the UI on every icon tap until the user
    /// force-quits. We never resume the orphan as a live stream — no UI mode
    /// owns it anymore — we just end it so the system lets go. Safe to call
    /// when there is nothing to recover (the completion hands back nil).
    func recoverOrphanedSession() {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { self.finishOrphanSweep() }
            return
        }
        store.recoverActiveWorkoutSession { recovered, _ in
            DispatchQueue.main.async {
                guard let recovered else { return self.finishOrphanSweep() }
                // If we own a LIVE session, the "orphan" HealthKit hands back
                // is almost certainly a second handle to that same session —
                // recovery constructs a fresh object, so `!==` alone can't
                // tell them apart, and ending it would kill our own stream.
                // A genuine orphan can't coexist with a live session anyway
                // (one active session per app).
                if let mine = self.session, mine.state != .ended, mine.state != .stopped {
                    return self.finishOrphanSweep()
                }
                let builder = recovered.associatedWorkoutBuilder()
                recovered.end()
                // Best-effort save, matching stop(); a builder that never
                // collected in this process just errors these into no-ops.
                builder.endCollection(withEnd: Date()) { _, _ in
                    builder.finishWorkout { _, _ in
                        DispatchQueue.main.async { self.finishOrphanSweep() }
                    }
                }
            }
        }
    }

    /// The orphan sweep settled (nothing to claim, or the orphan is fully
    /// ended). Sessions may build now — start a stream that was deferred
    /// behind the sweep.
    private func finishOrphanSweep() {
        orphanSweepDone = true
        guard wantsStreaming, session == nil,
              workoutShareStatus == .sharingAuthorized else { return }
        beginStream()
    }

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.sharingDenied = self.workoutShareStatus == .sharingDenied
                // The user answered (or the sheet failed) — re-check whether
                // the launch gate can come down.
                self.evaluateAuthGate()
                // A stream started before authorization resolved was deferred
                // by start()'s gate — begin it now that the user has answered.
                guard self.wantsStreaming, self.session == nil,
                      self.workoutShareStatus == .sharingAuthorized else { return }
                self.beginStream()
            }
        }
    }

    /// Re-evaluate Health authorization whenever the app becomes active:
    /// retries a permission sheet that never presented (the stuck
    /// post-upgrade state) and picks up access granted in Settings while a
    /// wanted stream sat gated. Safe to call when nothing is streaming.
    func refreshAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let status = workoutShareStatus
        DispatchQueue.main.async {
            self.sharingDenied = status == .sharingDenied
            guard self.wantsStreaming, self.session == nil else { return }
            switch status {
            case .sharingAuthorized: self.beginStream()
            case .notDetermined: self.requestAuthorization()
            default: break
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
        // Authorization gate: a session started while workout sharing is
        // undetermined fails outright AND can block watchOS from presenting
        // the permission sheet at all (see the class doc). Ask first and
        // begin from the completion; denied surfaces in the UI instead.
        switch workoutShareStatus {
        case .sharingAuthorized:
            beginStream()
        case .notDetermined:
            requestAuthorization()
        default:
            DispatchQueue.main.async { self.sharingDenied = true }
        }
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

    /// Build the session + store query. Only ever called with workout
    /// sharing authorized (start()'s gate, the auth completion, or an
    /// activation refresh) and with no session live.
    private func beginStream() {
        // Deferred until the launch orphan sweep settles (see orphanSweepDone)
        // — finishOrphanSweep() re-enters for a stream that's still wanted.
        guard orphanSweepDone else { return }
        DispatchQueue.main.async { self.sharingDenied = false }
        beginSession()
        // The store query runs in BOTH modes: monitor's only feed, capture's
        // safety net under the builder delegate.
        let began = Date()
        streamBeganAt = began
        startHrQuery(from: began)
    }

    private func beginSession() {
        let config = HKWorkoutConfiguration()
        // Both modes live paused, so the type barely matters — .mindAndBody
        // keeps the TachyMon-shaped Health record (and its fast HR stream).
        config.activityType = .mindAndBody
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
            // workout spends its whole life paused (both modes).
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
        // Save the workout: entirely paused → ~0 active duration, no calorie
        // or exercise-minute impact, the pause/resume trail — same shape
        // TachyMon leaves behind (both modes).
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
        guard wantsStreaming, orphanSweepDone else { return }
        // Same gate as start(): never rebuild into an unauthorized session —
        // while the permission sheet is up the watchdog sees "no session"
        // every second, and each of these must stay a no-op.
        guard workoutShareStatus == .sharingAuthorized else { return }
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

    /// The one HR feed, both modes: the sensor writes heart-rate samples to
    /// the store for as long as the session exists — paused included — and
    /// this anchored query surfaces each commit as it lands.
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

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    /// Unused: a paused builder collects nothing (a kick's momentary .running
    /// can catch a stray sample, but the anchored query owns all intake).
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {}

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
