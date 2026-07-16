import SwiftUI
import WatchKit

/**
 * Free live HR monitor. Delta compares the smoothed HR against a rolling
 * 2-minute average ("delta over what my HR had been at"); safety buzzers
 * (Δ ≥ 30 / Δ > 50) and the max-HR proximity buzz run on every sample.
 *
 * Signal handling: the last good HR is held on screen. Before the first ever
 * reading the value shows a grey "00"; once a reading lands it snaps to its
 * live colour. If contact is later lost the value holds in live colour through
 * a grace window (WorkoutManager.signalLost) and only then greys out (no
 * "searching" text, no re-render); the 2-min avg + delta freeze until a new
 * reading arrives. Always-on: in luminance-reduced (wrist-down) state the
 * display updates every 5 s instead of every second; the sensor keeps
 * streaming underneath so buzzes stay timely.
 *
 * The screen is a two-page pager: the HR readout, and a controls panel one
 * swipe to the right (End session + Log symptom). A stray swipe can't abandon
 * the session — ending still takes a deliberate tap on the second page.
 */
final class HrMonitorModel: ObservableObject {
    /// Last known HR — held through signal loss; nil only before the first reading.
    @Published var displayHr: Double?
    @Published var avg2min: Double?
    @Published var delta: Double?
    @Published var everHadReading = false
    /// Searching after we'd already had a reading — value greys out but stays.
    @Published var signalLost = false
    @Published var atMax = false
    @Published var nearMax = false

    var dimmed = false

    private var window: [(at: Date, hr: Double)] = []
    private var deltaWindow: [(at: Date, delta: Double)] = []
    private var ticker: Timer?
    private var sinceDisplay = 0
    private var deltaBuzzers = Haptics.makeDeltaBuzzers()
    private var maxBuzzer: ThresholdBuzzer?
    private var maxHr: Double?

    func start() {
        WorkoutManager.shared.start()
        maxHr = computedMaxHr(age: PhoneRelay.shared.age, sex: PhoneRelay.shared.sex)
        if let maxHr { maxBuzzer = Haptics.makeMaxHrBuzzer(maxHr: maxHr) }
        deltaBuzzers = Haptics.makeDeltaBuzzers()
        ComplicationStore.hrSessionActive(true)
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        ticker?.invalidate()
        ticker = nil
        WorkoutManager.shared.stop()
        window = []
        deltaWindow = []
        ComplicationStore.hrSessionActive(false)
    }

    private func tick() {
        let wm = WorkoutManager.shared
        // Backstop self-heal: while the monitor is on screen the manager must
        // be streaming. If it isn't (any future start/stop race or a stop from
        // elsewhere), restart it — WorkoutManager's own watchdog only runs
        // while it wants to stream, so it can't recover from this state.
        if !wm.running { wm.start() }
        let now = Date()
        var liveHr: Double?
        var currentAvg: Double?
        var currentDelta: Double?
        if !wm.searching, let hr = wm.hr {
            liveHr = hr
            window.append((at: now, hr: hr))
            window.removeAll { now.timeIntervalSince($0.at) > 120 }
            let avg = window.map(\.hr).reduce(0, +) / Double(window.count)
            currentAvg = avg
            let d = hr - avg
            currentDelta = d
            // Buzzers run at full sample rate regardless of display cadence.
            deltaBuzzers.forEach { $0.update(d) }
            if maxHr != nil { maxBuzzer?.update(hr) }
            // Feed the HR + HR Delta complications: last HR with its 2-min
            // low/high range, and the delta with its own 2-min lowest/highest
            // (reload throttling lives in ComplicationStore).
            deltaWindow.append((at: now, delta: d))
            deltaWindow.removeAll { now.timeIntervalSince($0.at) > 120 }
            let hrs = window.map(\.hr)
            let deltas = deltaWindow.map(\.delta)
            ComplicationStore.hrUpdate(
                hr: Int(hr.rounded()),
                low: Int((hrs.min() ?? hr).rounded()),
                high: Int((hrs.max() ?? hr).rounded()),
                delta: Int(d.rounded()),
                deltaLow: Int((deltas.min() ?? d).rounded()),
                deltaHigh: Int((deltas.max() ?? d).rounded())
            )
        }
        sinceDisplay += 1
        let cadence = dimmed ? 5 : 1
        guard sinceDisplay >= cadence else { return }
        sinceDisplay = 0
        DispatchQueue.main.async {
            if let liveHr {
                self.displayHr = liveHr
                self.everHadReading = true
                self.signalLost = false
                self.avg2min = currentAvg
                self.delta = currentDelta
                if let maxHr = self.maxHr {
                    self.nearMax = liveHr >= maxHr - 15
                    self.atMax = liveHr >= maxHr
                }
            } else {
                // No live signal: hold the last HR/avg/delta in place. Grey only
                // once the grace in WorkoutManager expires (signalLost), so a
                // blip reads as an unbroken connection.
                self.signalLost = self.everHadReading && wm.signalLost
                self.nearMax = false
                self.atMax = false
            }
        }
    }
}

struct HrMonitorView: View {
    let onEnd: () -> Void
    @EnvironmentObject private var relay: PhoneRelay
    @StateObject private var model = HrMonitorModel()
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @State private var pulse = false
    @State private var showSymptoms = false

    var body: some View {
        TabView {
            hrPage.tag(0)
            controlsPage.tag(1)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .onChange(of: isLuminanceReduced) { _, dimmed in model.dimmed = dimmed }
        .onChange(of: model.atMax) { _, at in
            guard at else { pulse = false; return }
            withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { pulse = true }
        }
        .sheet(isPresented: $showSymptoms) {
            SymptomPicker(symptoms: relay.symptomTypes, hr: model.displayHr) { showSymptoms = false }
        }
    }

    // MARK: - HR page

    private var hrPage: some View {
        VStack(spacing: 0) {
            Text("HEART RATE")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.dim)

            Spacer(minLength: 2)

            VStack(spacing: 4) {
                if !isLuminanceReduced {
                    BeatingHeart(size: 22, bpm: model.signalLost ? nil : model.displayHr)
                        .padding(.top, 8)   // breathing room under HEART RATE
                }
                hrValue
            }

            Spacer(minLength: 2)

            HStack(spacing: 7) {
                StatTile(
                    label: "2 min avg",
                    value: model.avg2min.map { String(Int($0.rounded())) } ?? "00",
                    valueColor: model.avg2min == nil ? DS.faint : .primary
                )
                StatTile(
                    label: "Delta",
                    value: model.delta.map { "Δ \($0 >= 0 ? "+" : "")\(Int($0.rounded()))" } ?? "Δ 00",
                    valueColor: model.delta.map { DS.deltaColor($0) } ?? DS.faint
                )
            }
        }
        .overlay(alignment: .trailing) {
            if !isLuminanceReduced { SwipeChevron().padding(.trailing, 6) }
        }
    }

    /// HR readout state machine: grey "00" before the first reading, live colour
    /// once contact is made, greyed last value while the signal is lost.
    private var hrValue: some View {
        let hasReading = model.displayHr != nil
        let text = hasReading ? String(Int(model.displayHr!.rounded())) : "00"
        let color: Color = !hasReading || model.signalLost
            ? DS.faint
            : (model.nearMax || model.atMax ? DS.accent : .primary)
        return VStack(spacing: -8) {
            Text(text)
                .font(DS.number(54))
                .monospacedDigit()
                .foregroundStyle(color)
                .opacity(model.atMax && pulse ? 0.45 : 1)
            Text("BPM")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(DS.dim)
        }
        .padding(.bottom, 8)   // BPM hugs the number, sits farther from the tiles
    }

    // MARK: - Controls page

    private var controlsPage: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("SESSION")
                    .font(.system(size: 11, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(DS.dim)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)

                Button(action: onEnd) {
                    Text("End session")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(DS.accent, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)

                Button { showSymptoms = true } label: {
                    Text("Log symptom")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 2)
        }
    }
}

/// A small right-pointing chevron that drifts back and forth — hints that the
/// controls page is one swipe away.
private struct SwipeChevron: View {
    @State private var shift = false
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(DS.dim.opacity(0.6))
            .offset(x: shift ? 3 : -3)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { shift = true }
            }
    }
}

/// Full-screen picker of the phone's symptom registry. Tapping one transfers a
/// symptom log (with the live HR + a timestamp) to the phone, which persists it
/// to the journal; empty until the phone has synced its list at least once.
struct SymptomPicker: View {
    let symptoms: [SymptomType]
    let hr: Double?
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Log symptom")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity, alignment: .leading)

                if symptoms.isEmpty {
                    Text("Open Autonomic on your iPhone to sync your symptoms.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(DS.dim)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 24)
                } else {
                    ForEach(symptoms) { s in
                        Button { log(s) } label: {
                            Text(s.label)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 11)
                                .padding(.horizontal, 12)
                                .background(DS.card, in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                    Text("Add more symptoms in the Autonomic app and they'll show up here.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(DS.dim)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func log(_ s: SymptomType) {
        var payload: [String: Any] = [
            "id": UUID().uuidString,
            "type": "symptom",
            "schemaVersion": 1,
            "symptomType": s.id,
            "time": ISO8601DateFormatter().string(from: Date()),
        ]
        if let hr { payload["hr"] = Int(hr.rounded()) }
        PhoneRelay.shared.send(result: payload)
        Haptics.buzz(.success)
        onDone()
    }
}
