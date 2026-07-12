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
        VStack(spacing: 10) {
            Text("POTS READING")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.dim)
            Image(systemName: "figure.stand")
                .font(.system(size: 34))
                .foregroundStyle(DS.blue)
                .frame(width: 62, height: 62)
                .background(DS.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 18))
            Text("Lie down and rest quietly. We'll record your resting heart rate, then tell you when to stand.")
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary.opacity(0.85))
            Text("5 minutes lying down, then 10 minutes standing.")
                .font(.system(size: 11))
                .multilineTextAlignment(.center)
                .foregroundStyle(DS.dim)
            Spacer(minLength: 0)
            PrimaryButton(title: "Start") { test.begin() }
            SecondaryButton(title: "Back") { onExit() }
        }
    }
}

private struct RestingView: View {
    @ObservedObject var test: StandTestController
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        VStack(spacing: 4) {
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
                VStack(spacing: 3) {
                    Text(fmtCountdown(StandTestController.restingDuration - test.stageElapsed))
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                    HStack(spacing: 4) {
                        if workout.searching {
                            Text("searching…").font(.system(size: 11)).foregroundStyle(DS.dim)
                        } else {
                            BeatingHeart(size: 11)
                            Text("\(Int((workout.hr ?? 0).rounded())) bpm")
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .foregroundStyle(DS.dim)
                        }
                    }
                }
            }
            .padding(.vertical, 6)
            SecondaryButton(title: "Skip to standing") { test.skipToStanding() }
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
        VStack(spacing: 4) {
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
                    if workout.searching {
                        Text("searching…").font(.system(size: 15, weight: .semibold)).foregroundStyle(DS.dim)
                    } else {
                        HStack(alignment: .lastTextBaseline, spacing: 3) {
                            Text("\(Int((workout.hr ?? 0).rounded()))")
                                .font(.system(size: 32, weight: .heavy, design: .rounded))
                                .monospacedDigit()
                            Text("bpm")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(DS.dim)
                        }
                    }
                    DeltaChip(delta: test.delta)
                    Text("\(fmtCountdown(StandTestController.standingDuration - test.stageElapsed)) left")
                        .font(.system(size: 12, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(DS.dim)
                }
            }
            .padding(.vertical, 6)
            SecondaryButton(title: "Finish now") { test.finishStanding() }
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
                .font(.system(size: 15, weight: .bold))
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

                let baseline = test.baseline.map { String(Int($0.rounded())) + " bpm" } ?? "—"
                let peak = test.peakHr > 0 ? String(Int(test.peakHr.rounded())) + " bpm" : "—"
                let deltaColor = DS.deltaColor(Double(test.sustainedDeltaForDisplay ?? Int(test.peakDelta.rounded())))
                row("Resting HR", baseline)
                row("Peak standing", peak)
                row(
                    "Sustained rise",
                    test.sustainedDeltaForDisplay.map { "Δ \($0 >= 0 ? "+" : "")\($0) bpm" } ?? "—",
                    color: deltaColor
                )
                row("Max increase", "Δ +\(Int(test.peakDelta.rounded())) bpm")

                Text("Check the Autonomic app for more details.")
                    .font(.system(size: 11))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(DS.dim)
                    .padding(.top, 6)
                Text("Wellness screening only — HR-based, does not measure blood pressure, and is not a diagnosis. Discuss with your doctor.")
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
