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
 * The screen is a three-page pager centered on the HR readout: a 5-minute
 * history chart one swipe to the left, and a controls panel one swipe to the
 * right (End session + Log symptom + the Night / Low-power mode toggles).
 * A stray swipe can't abandon the session — ending still takes a deliberate
 * tap on the controls page.
 *
 * Night mode darkens the whole readout to sleep-friendly greys (delta only
 * turns red at Δ ≥ 30); low power drops the awake display refresh to the
 * dimmed 5 s cadence and freezes animations. Neither can shorten the system
 * wake duration or slow the sensor (watchOS owns both); buzzers stay at full
 * sample rate. Both are per-session and show an outline icon (bat / bolt)
 * beside the HEART RATE label while active.
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
    /// Rolling 5-minute HR history for the chart page, each sample carrying
    /// the delta-vs-2-min-average it had when it landed (drives the POTS
    /// color bands). Sensor dropouts stay as real holes (no fake samples) —
    /// the chart breaks its line across them. Refreshed at display cadence,
    /// like every other published value.
    @Published var chartSeries: [(at: Date, hr: Double, delta: Double)] = []
    /// Session-scoped display modes (reset with the model — a new session
    /// always starts with both off). Night darkens the readout for sleep;
    /// low power drops the awake display refresh to the dimmed 5 s cadence
    /// and freezes animations. Neither touches the sensor: its ~5 s cadence
    /// is fixed by HealthKit while the session runs, and the safety buzzers
    /// stay at full sample rate in both modes.
    @Published var nightMode = false
    @Published var lowPowerMode = false

    var dimmed = false

    private var history: [(at: Date, hr: Double, delta: Double)] = []
    private var window: [(at: Date, hr: Double)] = []
    private var deltaWindow: [(at: Date, delta: Double)] = []
    private var ticker: Timer?
    private var sinceDisplay = 0
    private var deltaBuzzers = Haptics.makeDeltaBuzzers()
    private var maxBuzzer: ThresholdBuzzer?
    private var maxHr: Double?

    deinit {
        // The timer only holds `self` weakly, so without this a model
        // discarded mid-session leaves a no-op timer firing forever.
        ticker?.invalidate()
    }

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
        history = []
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
            history.append((at: now, hr: hr, delta: d))
            history.removeAll { now.timeIntervalSince($0.at) > HrHistoryChart.window }
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
        let cadence = (dimmed || lowPowerMode) ? 5 : 1
        guard sinceDisplay >= cadence else { return }
        sinceDisplay = 0
        let historySnapshot = history
        DispatchQueue.main.async {
            // Refresh even without a live sample so the chart keeps sliding
            // (its x-axis is anchored to "now"). Low power skips the publish
            // entirely — the chart page is unmounted, so every update would
            // just be wasted layout/path work; `history` keeps accumulating,
            // so toggling back on repopulates the chart on the next tick.
            if !self.lowPowerMode { self.chartSeries = historySnapshot }
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
    @EnvironmentObject private var workout: WorkoutManager
    @StateObject private var model = HrMonitorModel()
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @State private var pulse = false
    @State private var showSymptoms = false
    /// Pager position — boots on the HR readout, chart to its left,
    /// controls to its right.
    @State private var page = 1

    var body: some View {
        TabView(selection: $page) {
            // Low power unmounts the chart page: offscreen TabView pages still
            // re-run their body (domain math + path building) on every model
            // publish, so not mounting it at all is a real saving.
            if !model.lowPowerMode { chartPage.tag(0) }
            hrPage.tag(1)
            controlsPage.tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .onChange(of: isLuminanceReduced) { _, dimmed in model.dimmed = dimmed }
        .onChange(of: model.atMax) { _, _ in syncPulse() }
        .onChange(of: model.nightMode) { _, _ in syncPulse() }
        .sheet(isPresented: $showSymptoms) {
            SymptomPicker(symptoms: relay.symptomTypes, hr: model.displayHr) { showSymptoms = false }
        }
    }

    /// At-max attention pulse — suppressed in night mode (no animated
    /// movements on a sleep screen; the number still turns red).
    private func syncPulse() {
        guard model.atMax, !model.nightMode else {
            withAnimation(.easeOut(duration: 0.2)) { pulse = false }
            return
        }
        withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { pulse = true }
    }

    // MARK: - HR page

    /// Sharing denied replaces the readout: a grey 00 there would read as a
    /// sensor failure, when the fix lives in Health settings.
    @ViewBuilder private var hrPage: some View {
        if workout.sharingDenied { deniedNotice } else { hrReadout }
    }

    private var deniedNotice: some View {
        VStack(spacing: 6) {
            Image(systemName: "heart.slash.fill")
                .font(.system(size: 22))
                .foregroundStyle(DS.accent)
            Text("Health access needed")
                .font(.system(size: 14, weight: .bold))
            Text("Allow workouts for Autonomic in Health sharing settings, then come back.")
                .font(.system(size: 11.5))
                .foregroundStyle(DS.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 6)
    }

    /// Label colour steps down in night mode along with the values.
    private var labelColor: Color { model.nightMode ? DS.nightDim : DS.dim }

    private var hrReadout: some View {
        VStack(spacing: 0) {
            HStack(spacing: 5) {
                Text("HEART RATE")
                    .font(.system(size: 11, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(labelColor)
                if model.nightMode {
                    BatIcon()
                        .stroke(DS.nightDim, style: StrokeStyle(lineWidth: 1, lineJoin: .round))
                        .frame(width: 13, height: 10)
                }
                if model.lowPowerMode {
                    Image(systemName: "bolt")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(model.nightMode ? DS.nightDim : DS.gold)
                }
            }

            Spacer(minLength: 2)

            VStack(spacing: 4) {
                if !isLuminanceReduced {
                    BeatingHeart(
                        size: 22,
                        bpm: model.signalLost ? nil : model.displayHr,
                        beating: !model.lowPowerMode && !model.nightMode,
                        color: model.nightMode ? DS.nightDim : DS.accent
                    )
                    .padding(.top, 8)   // breathing room under HEART RATE
                }
                hrValue
            }

            Spacer(minLength: 2)

            HStack(spacing: 7) {
                StatTile(
                    label: "2 min avg",
                    value: model.avg2min.map { String(Int($0.rounded())) } ?? "00",
                    valueColor: model.avg2min == nil ? DS.faint : model.nightMode ? DS.night : .primary,
                    labelColor: labelColor,
                    bg: model.nightMode ? DS.nightTile : DS.tile
                )
                StatTile(
                    label: "Delta",
                    value: model.delta.map { "Δ \($0 >= 0 ? "+" : "")\(Int($0.rounded()))" } ?? "Δ 00",
                    valueColor: model.delta.map { deltaValueColor($0) } ?? DS.faint,
                    labelColor: labelColor,
                    bg: model.nightMode ? DS.nightTile : DS.tile
                )
            }
        }
        .overlay(alignment: .trailing) {
            if !isLuminanceReduced {
                SwipeChevron(color: model.nightMode ? DS.nightDim : DS.dim.opacity(0.6),
                             animated: !model.nightMode && !model.lowPowerMode)
                    .padding(.trailing, 6)
            }
        }
        .overlay(alignment: .leading) {
            // No left chevron in low power — the chart page it points at is
            // unmounted.
            if !isLuminanceReduced && !model.lowPowerMode {
                SwipeChevron(pointsLeft: true,
                             color: model.nightMode ? DS.nightDim : DS.dim.opacity(0.6),
                             animated: !model.nightMode)
                    .padding(.leading, 6)
            }
        }
    }

    // MARK: - Chart page (last 5 min)

    private var chartPage: some View {
        VStack(spacing: 4) {
            Text("LAST 5 MIN")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(labelColor)
            if model.chartSeries.count >= 2 {
                HrHistoryChart(series: model.chartSeries, live: !model.signalLost, night: model.nightMode)
            } else {
                Spacer()
                Text("Collecting data…")
                    .font(.system(size: 12.5))
                    .foregroundStyle(DS.dim)
                Spacer()
            }
        }
    }

    /// Night mode flattens the delta to the same dark grey as everything
    /// else — only a Δ ≥ 30 warning still turns red (matches the buzzer).
    private func deltaValueColor(_ delta: Double) -> Color {
        model.nightMode ? (delta >= 30 ? DS.accent : DS.night) : DS.deltaColor(delta)
    }

    /// HR readout state machine: grey "00" before the first reading, live colour
    /// once contact is made, greyed last value while the signal is lost.
    /// Night mode swaps the live colour for dark grey; the near-max/at-max red
    /// is a safety signal and deliberately overrides night mode.
    private var hrValue: some View {
        let hasReading = model.displayHr != nil
        let text = hasReading ? String(Int(model.displayHr!.rounded())) : "00"
        let color: Color = !hasReading || model.signalLost
            ? DS.faint
            : model.nearMax || model.atMax ? DS.accent
            : model.nightMode ? DS.night : .primary
        return VStack(spacing: -8) {
            Text(text)
                .font(DS.number(54))
                .monospacedDigit()
                .foregroundStyle(color)
                .opacity(model.atMax && !model.nightMode && pulse ? 0.45 : 1)
            Text("BPM")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(labelColor)
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

                Rectangle()
                    .fill(Color.white.opacity(0.1))
                    .frame(height: 1)
                    .padding(.vertical, 3)

                // Session-scoped modes — both reset to off on the next session.
                ModeToggleRow(title: "Night mode", isOn: model.nightMode) {
                    model.nightMode.toggle()
                }
                ModeToggleRow(title: "Low power", isOn: model.lowPowerMode) {
                    model.lowPowerMode.toggle()
                    // Turning it on returns to the HR readout — the point of
                    // the mode is to sit on that screen doing minimal work.
                    if model.lowPowerMode {
                        withAnimation { page = 1 }
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

/// Controls-page toggle: plain label with an On/Off state on the trailing
/// edge; the card border tints the shared night grey while active.
private struct ModeToggleRow: View {
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer(minLength: 4)
                Text(isOn ? "ON" : "OFF")
                    .font(.system(size: 10, weight: .bold))
                    .kerning(0.5)
                    .foregroundStyle(isOn ? DS.night : DS.dim.opacity(0.7))
            }
            .padding(.vertical, 11)
            .padding(.horizontal, 12)
            .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isOn ? DS.night.opacity(0.5) : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

/// Small line-art bat (no SF Symbol exists): scalloped wings, eared head,
/// stroked as an outline. Draw at ~13 pt tall next to an 11 pt label.
struct BatIcon: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * w, y: rect.minY + y * h)
        }
        var p = Path()
        // Left wing tip, along the top edge over the ears to the right tip…
        p.move(to: pt(0.02, 0.22))
        p.addQuadCurve(to: pt(0.36, 0.26), control: pt(0.20, 0.30))
        p.addLine(to: pt(0.42, 0.08))          // left ear
        p.addLine(to: pt(0.47, 0.24))
        p.addQuadCurve(to: pt(0.53, 0.24), control: pt(0.50, 0.20))
        p.addLine(to: pt(0.58, 0.08))          // right ear
        p.addLine(to: pt(0.64, 0.26))
        p.addQuadCurve(to: pt(0.98, 0.22), control: pt(0.80, 0.30))
        // …then back along the scalloped bottom edge to the tail.
        p.addQuadCurve(to: pt(0.86, 0.56), control: pt(0.90, 0.40))
        p.addQuadCurve(to: pt(0.66, 0.62), control: pt(0.72, 0.50))
        p.addQuadCurve(to: pt(0.55, 0.74), control: pt(0.58, 0.58))
        p.addQuadCurve(to: pt(0.45, 0.74), control: pt(0.50, 0.90))  // tail dip
        p.addQuadCurve(to: pt(0.34, 0.62), control: pt(0.42, 0.58))
        p.addQuadCurve(to: pt(0.14, 0.56), control: pt(0.28, 0.50))
        p.addQuadCurve(to: pt(0.02, 0.22), control: pt(0.10, 0.40))
        p.closeSubpath()
        return p
    }
}

/// A small chevron that drifts back and forth — hints that another page is
/// one swipe away (controls to the right, the history chart to the left).
private struct SwipeChevron: View {
    var pointsLeft = false
    var color: Color = DS.dim.opacity(0.6)
    /// Night mode holds the chevron still — no motion on a sleep screen.
    /// The branches are separate view identities, so flipping this tears the
    /// animated chevron down outright (a repeatForever can survive a mere
    /// parameter change).
    var animated = true
    @State private var shift = false

    var body: some View {
        if animated {
            chevron
                .offset(x: shift ? 3 : -3)
                .onAppear {
                    shift = false
                    withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { shift = true }
                }
        } else {
            chevron
        }
    }

    private var chevron: some View {
        Image(systemName: pointsLeft ? "chevron.left" : "chevron.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(color)
    }
}

/**
 * Rolling 5-minute HR line: time maps to x (right edge = now), HR to y over
 * a padded min/max domain rounded to 5s. Sensor dropouts >10 s break the
 * line — real gaps stay visible as holes, same no-fake-samples rule as the
 * logged series. A dot marks the newest sample while the signal is live.
 *
 * The line is delta-banded: each segment takes `DS.deltaColor` of the delta
 * its newer sample had against the rolling 2-min average when it was recorded
 * (green <20 · amber ≥20 · red ≥30 — same rule as the Delta tile and buzzers).
 */
struct HrHistoryChart: View {
    let series: [(at: Date, hr: Double, delta: Double)]
    var live = true
    /// Night mode: the in-range (green) band renders the dark value grey
    /// instead; the ≥20 amber and ≥30 red warnings keep their colors.
    var night = false

    static let window: TimeInterval = 300
    private static let gapBreak: TimeInterval = 10

    /// One stroke path per delta band, index-aligned with `bandPaths`
    /// (mirrors `DS.deltaColor`).
    private var bandColors: [Color] { [night ? DS.night : DS.green, DS.amber, DS.accent] }
    private static func band(_ delta: Double) -> Int {
        delta >= 30 ? 2 : delta >= 20 ? 1 : 0
    }

    var body: some View {
        let hrs = series.map(\.hr)
        let rawLo = hrs.min() ?? 0, rawHi = hrs.max() ?? 0
        let lo = ((rawLo - 4) / 5).rounded(.down) * 5
        let hi = max(((rawHi + 4) / 5).rounded(.up) * 5, lo + 20)
        VStack(spacing: 2) {
            GeometryReader { geo in
                let now = Date()
                let pt = { (s: (at: Date, hr: Double, delta: Double)) -> CGPoint in
                    CGPoint(
                        x: geo.size.width * (1 - now.timeIntervalSince(s.at) / Self.window),
                        y: geo.size.height * (1 - (s.hr - lo) / (hi - lo))
                    )
                }
                ZStack(alignment: .leading) {
                    // Domain gridlines with their bpm labels tucked above.
                    ForEach([lo, (lo + hi) / 2, hi], id: \.self) { level in
                        let y = geo.size.height * (1 - (level - lo) / (hi - lo))
                        Path { p in
                            p.move(to: CGPoint(x: 0, y: y))
                            p.addLine(to: CGPoint(x: geo.size.width, y: y))
                        }
                        .stroke(Color.white.opacity(0.08), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        Text(String(Int(level)))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(DS.dim.opacity(0.8))
                            .position(x: 9, y: max(6, y - 7))
                    }
                    let paths = bandPaths(pt: pt)
                    ForEach(paths.indices, id: \.self) { i in
                        paths[i].stroke(
                            bandColors[i],
                            style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
                        )
                    }
                    if live, let last = series.last,
                       now.timeIntervalSince(last.at) < Self.gapBreak {
                        Circle()
                            .fill(bandColors[Self.band(last.delta)])
                            .frame(width: 5, height: 5)
                            .position(pt(last))
                    }
                }
                .clipped()
            }
            HStack {
                Text("5 MIN AGO")
                Spacer()
                Text("NOW")
            }
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(DS.dim.opacity(0.8))
        }
    }

    /// Splits the line into one path per delta band. Each segment is colored by
    /// its newer sample's delta; gaps >10 s break the line in every band.
    private func bandPaths(pt: ((at: Date, hr: Double, delta: Double)) -> CGPoint) -> [Path] {
        var paths = Array(repeating: Path(), count: bandColors.count)
        var prev: (at: Date, hr: Double, delta: Double)?
        for s in series {
            if let prev, s.at.timeIntervalSince(prev.at) <= Self.gapBreak {
                let i = Self.band(s.delta)
                paths[i].move(to: pt(prev))
                paths[i].addLine(to: pt(s))
            }
            prev = s
        }
        return paths
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
