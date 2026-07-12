import SwiftUI
import WatchKit

/**
 * Free live HR monitor. Delta compares the smoothed HR against a rolling
 * 2-minute average ("delta over what my HR had been at"); safety buzzers
 * (Δ ≥ 30 / Δ > 50) and the max-HR proximity buzz run on every sample.
 *
 * Always-on behavior: in luminance-reduced (wrist-down) state the display
 * updates every 5 s instead of every second and drops the chrome; the sensor
 * keeps streaming at full rate underneath so buzzes stay timely. The screen
 * has no back path — the only exit is End.
 */
final class HrMonitorModel: ObservableObject {
    @Published var displayHr: Double?
    @Published var avg2min: Double?
    @Published var delta: Double?
    @Published var searching = true
    @Published var atMax = false
    @Published var nearMax = false

    var dimmed = false

    private var window: [(at: Date, hr: Double)] = []
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
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        ticker?.invalidate()
        ticker = nil
        WorkoutManager.shared.stop()
        window = []
    }

    private func tick() {
        let wm = WorkoutManager.shared
        let now = Date()
        var currentDelta: Double?
        if !wm.searching, let hr = wm.hr {
            window.append((at: now, hr: hr))
            window.removeAll { now.timeIntervalSince($0.at) > 120 }
            let avg = window.map(\.hr).reduce(0, +) / Double(window.count)
            let d = hr - avg
            currentDelta = d
            // Buzzers run at full rate regardless of display cadence.
            deltaBuzzers.forEach { $0.update(d) }
            if let maxHr {
                maxBuzzer?.update(hr)
                DispatchQueue.main.async {
                    self.nearMax = hr >= maxHr - 15
                    self.atMax = hr >= maxHr
                }
            }
        }
        sinceDisplay += 1
        let cadence = dimmed ? 5 : 1
        guard sinceDisplay >= cadence else { return }
        sinceDisplay = 0
        let avg = window.isEmpty ? nil : window.map(\.hr).reduce(0, +) / Double(window.count)
        DispatchQueue.main.async {
            self.searching = wm.searching
            self.displayHr = wm.searching ? nil : wm.hr
            self.avg2min = avg
            self.delta = wm.searching ? nil : currentDelta
        }
    }
}

struct HrMonitorView: View {
    let onEnd: () -> Void
    @StateObject private var model = HrMonitorModel()
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 0) {
            Text("HEART RATE")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.dim)

            Spacer(minLength: 2)

            VStack(spacing: 2) {
                if !isLuminanceReduced { BeatingHeart(size: 22) }
                if model.searching {
                    Text("searching…")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(DS.dim)
                        .padding(.vertical, 14)
                } else {
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text(model.displayHr.map { String(Int($0.rounded())) } ?? "—")
                            .font(.system(size: 54, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(model.nearMax || model.atMax ? DS.accent : .primary)
                            .opacity(model.atMax && pulse ? 0.45 : 1)
                        Text("BPM")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(DS.dim)
                    }
                }
            }

            Spacer(minLength: 2)

            HStack(spacing: 7) {
                StatTile(label: "2-min avg", value: model.avg2min.map { String(Int($0.rounded())) } ?? "—")
                StatTile(
                    label: "Delta",
                    value: model.delta.map { "\($0 >= 0 ? "+" : "")\(Int($0.rounded()))" } ?? "—",
                    valueColor: model.delta.map { DS.deltaColor($0) } ?? DS.dim
                )
            }

            if !isLuminanceReduced {
                Button(action: onEnd) {
                    Text("End")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(DS.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(DS.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .onChange(of: isLuminanceReduced) { _, dimmed in model.dimmed = dimmed }
        .onChange(of: model.atMax) { _, at in
            guard at else { pulse = false; return }
            withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}
