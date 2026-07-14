import SwiftUI

/**
 * The guided POTS stand-test screens, per the imported design: intro →
 * resting ring (blue) → stand prompt (red glow, "I'm standing") → standing
 * ring (red, live Δ chip) → results. Rendering keeps working in the
 * luminance-reduced always-on state (the workout session keeps the app
 * frontmost), so the countdown never disappears mid-test. No back path —
 * only the explicit buttons leave a stage.
 */
struct StandTestView: View {
    let onExit: () -> Void
    @StateObject private var test = StandTestController()
    @EnvironmentObject private var workout: WorkoutManager

    var body: some View {
        switch test.stage {
        case .intro: IntroView(test: test, onExit: onExit)
        case .resting: RestingView(test: test, workout: workout)
        case .prompt: StandPromptView(test: test)
        case .standing: StandingView(test: test, workout: workout)
        case .complete: ResultsView(test: test, onDone: onExit)
        }
    }
}

private struct IntroView: View {
    @ObservedObject var test: StandTestController
    let onExit: () -> Void

    var body: some View {
        // Fill one screenful so Start sits at the bottom fold; Back scrolls in below.
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 10) {
                        Text("POTS TEST")
                            .font(.system(size: 11, weight: .bold))
                            .kerning(1)
                            .foregroundStyle(DS.dim)
                        Image("potsIcon")
                            .renderingMode(.template)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 40)
                            .foregroundStyle(DS.blue)
                            .frame(width: 64, height: 44)
                            .background(DS.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                        Text("Lie down and rest quietly. We'll tell you when to stand.")
                            .font(.system(size: 13))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.primary.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 12)
                        PrimaryButton(title: "Start") { test.begin() }
                    }
                    // Leave clearance below Start so the device's rounded corners
                    // don't clip it (fills just under one screenful, not flush).
                    .frame(minHeight: geo.size.height - 30)
                    // Matches the Start button's size (secondary styling).
                    Button { onExit() } label: {
                        Text("Back")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(DS.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                }
            }
        }
    }
}

/// HR number that never shows "searching": grey "00" before the first reading,
/// the live value in `liveColor` once found, and — if the signal drops past the
/// grace window (`WorkoutManager.signalLost`) — the last value held and greyed
/// until a new sample arrives. Metric number font.
struct HrReadout: View {
    let hr: Double?
    let signalLost: Bool
    var size: CGFloat = 15
    var liveColor: Color = DS.dim

    var body: some View {
        let hasReading = hr != nil
        let stale = !hasReading || signalLost
        Text(hasReading ? "\(Int((hr ?? 0).rounded()))" : "00")
            .font(DS.number(size))
            .monospacedDigit()
            .foregroundStyle(stale ? DS.faint : liveColor)
    }
}

private struct RestingView: View {
    @ObservedObject var test: StandTestController
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        // Header + ring fit one screen; Skip sits below the fold (scroll to reveal).
        GeometryReader { geo in
            let circleD = min(geo.size.width - 24, geo.size.height - 40)
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 6) {
                        Text("RESTING")
                            .font(.system(size: 11, weight: .bold))
                            .kerning(1)
                            .foregroundStyle(DS.blue)
                        Text("Lie still & relax")
                            .font(.system(size: 12))
                            .foregroundStyle(DS.dim)
                        ZStack {
                            RingProgress(
                                progress: Double(test.stageElapsed) / Double(StandTestController.restingDuration),
                                color: DS.blue
                            )
                            VStack(spacing: 4) {
                                Text(fmtCountdown(StandTestController.restingDuration - test.stageElapsed))
                                    .font(DS.number(32))
                                    .monospacedDigit()
                                HStack(spacing: 4) {
                                    BeatingHeart(size: 12, bpm: workout.signalLost ? nil : workout.hr)
                                    HrReadout(hr: workout.hr, signalLost: workout.signalLost, size: 15)
                                    Text("bpm")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(DS.dim)
                                }
                            }
                            .padding(.horizontal, 12)   // keep the readout clear of the ring
                        }
                        .frame(width: circleD, height: circleD)
                        .padding(.top, 6)               // spacing above the circle
                    }
                    .frame(minHeight: geo.size.height, alignment: .top)
                    SecondaryButton(title: "Skip to standing") { test.skipToStanding() }
                        .padding(.top, 12)
                        .padding(.horizontal, 4)
                }
            }
        }
    }
}

private struct StandPromptView: View {
    @ObservedObject var test: StandTestController
    @State private var float = false

    var body: some View {
        VStack(spacing: 12) {
            Spacer(minLength: 0)
            Image(systemName: "arrow.up")
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(DS.accent)
                .offset(y: float ? -5 : 3)
                .onAppear {
                    withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { float = true }
                }
            VStack(spacing: 2) {
                Text("Stand up")
                    .font(.system(size: 26, weight: .heavy))
                Text("Then hold still")
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.8))
            }
            Spacer(minLength: 0)
            PrimaryButton(title: "I'm standing") { test.confirmStanding() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RadialGradient(
                colors: [DS.accent.opacity(0.18), .clear],
                center: .init(x: 0.5, y: 0.38), startRadius: 8, endRadius: 120
            )
        )
    }
}

private struct StandingView: View {
    @ObservedObject var test: StandTestController
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        // Header + ring fit one screen; Finish sits below the fold (scroll to reveal).
        GeometryReader { geo in
            let circleD = min(geo.size.width - 24, geo.size.height - 40)
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 6) {
                        Text("STANDING")
                            .font(.system(size: 11, weight: .bold))
                            .kerning(1)
                            .foregroundStyle(DS.accent)
                        Text("Hold still, don't move")
                            .font(.system(size: 12))
                            .foregroundStyle(DS.dim)
                        ZStack {
                            RingProgress(
                                progress: Double(test.stageElapsed) / Double(StandTestController.standingDuration),
                                color: DS.accent
                            )
                            VStack(spacing: 4) {
                                HStack(alignment: .lastTextBaseline, spacing: 3) {
                                    HrReadout(hr: workout.hr, signalLost: workout.signalLost, size: 28, liveColor: .primary)
                                    Text("bpm")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(DS.dim)
                                }
                                DeltaChip(delta: test.delta, stale: workout.signalLost)
                                Text("\(fmtCountdown(StandTestController.standingDuration - test.stageElapsed)) left")
                                    .font(.system(size: 12, weight: .semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(DS.dim)
                            }
                            .padding(.horizontal, 10)   // keep the readout clear of the ring
                        }
                        .frame(width: circleD, height: circleD)
                        .padding(.top, 6)               // spacing above the circle
                    }
                    .frame(minHeight: geo.size.height, alignment: .top)
                    SecondaryButton(title: "Finish now") { test.finishStanding() }
                        .padding(.top, 12)
                        .padding(.horizontal, 4)
                }
            }
        }
    }
}

private struct ResultsView: View {
    @ObservedObject var test: StandTestController
    let onDone: () -> Void

    private func row(_ label: String, _ value: String, color: Color? = nil) -> some View {
        HStack {
            Text(label).font(.system(size: 12.5)).foregroundStyle(color ?? DS.dim)
            Spacer()
            Text(value)
                .font(DS.number(15))
                .monospacedDigit()
                .foregroundStyle(color ?? .primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background((color ?? Color.clear).opacity(color == nil ? 0 : 0.1), in: RoundedRectangle(cornerRadius: 12))
        .background(color == nil ? AnyView(RoundedRectangle(cornerRadius: 12).fill(DS.tile)) : AnyView(EmptyView()))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(DS.green)
                Text("Test complete")
                    .font(.system(size: 15, weight: .heavy))
                    .padding(.bottom, 4)

                let baseline = test.baseline.map { String(Int($0.rounded())) + " bpm" } ?? "00 bpm"
                let peak = test.peakHr > 0 ? String(Int(test.peakHr.rounded())) + " bpm" : "00 bpm"
                let deltaColor = DS.deltaColor(Double(test.sustainedDeltaForDisplay ?? Int(test.peakDelta.rounded())))
                row("Resting HR", baseline)
                row("Peak standing", peak)
                row(
                    "Sustained rise",
                    test.sustainedDeltaForDisplay.map { "Δ \($0 >= 0 ? "+" : "")\($0) bpm" } ?? "Δ 00 bpm",
                    color: deltaColor
                )
                row("Max increase", "Δ +\(Int(test.peakDelta.rounded())) bpm")

                Text("Check the Autonomic app for more details.")
                    .font(.system(size: 11))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .padding(.top, 6)
                Text("Wellness screening only. HR-based, does not measure blood pressure, and is not a diagnosis. Discuss with your doctor.")
                    .font(.system(size: 10))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(DS.dim.opacity(0.8))

                PrimaryButton(title: "Done") {
                    test.dismiss()
                    onDone()
                }
                .padding(.top, 6)
            }
        }
    }
}
