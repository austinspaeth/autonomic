import SwiftUI

/**
 * Orthostatic-event screens: pick an event → intro → before / during (one tap
 * ends the transition) → 60 s recovery → result. Purple accent throughout. HR
 * + delta readouts mirror the stand test; no timer until the recovery stage.
 */
struct OrthostaticView: View {
    let onExit: () -> Void
    @StateObject private var ortho = OrthostaticController()
    @EnvironmentObject private var workout: WorkoutManager

    var body: some View {
        switch ortho.stage {
        case .picker:            EventPickerView(ortho: ortho, onExit: onExit)
        case .intro:             OrthoIntroView(ortho: ortho)
        case .baseline, .during: OrthoMeasureView(ortho: ortho, workout: workout)
        case .recovery:          OrthoRecoveryView(ortho: ortho, workout: workout)
        case .complete:          OrthoResultsView(ortho: ortho, onDone: onExit)
        }
    }
}

// MARK: - Event picker

private struct EventPickerView: View {
    @ObservedObject var ortho: OrthostaticController
    let onExit: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("POTS EPISODE")
                    .font(.system(size: 11, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(DS.purple)
                    .padding(.bottom, 2)
                ForEach(OrthostaticController.EventType.allCases) { type in
                    Button { ortho.pick(type) } label: {
                        HStack(spacing: 8) {
                            Text(type.title)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.primary)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(DS.dim.opacity(0.7))
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 12)
                        .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }
                Button { onExit() } label: {
                    Text("Back")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(DS.dim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(DS.card, in: RoundedRectangle(cornerRadius: 15))
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            .padding(.horizontal, 2)
        }
    }
}

// MARK: - Intro

private struct OrthoIntroView: View {
    @ObservedObject var ortho: OrthostaticController

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 8) {
                        Text("POTS EPISODE")
                            .font(.system(size: 11, weight: .bold))
                            .kerning(1)
                            .foregroundStyle(DS.purple)
                        Image(systemName: "figure.stairs")
                            .font(.system(size: 30))
                            .foregroundStyle(DS.purple)
                            .frame(width: 64, height: 44)
                            .background(DS.purple.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                        Text("First we'll capture your heart rate before the transition.")
                            .font(.system(size: 13))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.primary.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 12)
                        PrimaryButton(title: "Start", color: DS.purple) { ortho.begin() }
                    }
                    .frame(minHeight: geo.size.height - 30, alignment: .top)
                    Button { ortho.backToPicker() } label: {
                        Text("Back")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(DS.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                }
            }
        }
    }
}

// MARK: - Before / During (HR + delta + a single action button)

private struct OrthoMeasureView: View {
    @ObservedObject var ortho: OrthostaticController
    @ObservedObject var workout: WorkoutManager

    private var isDuring: Bool { ortho.stage == .during }

    var body: some View {
        let event = ortho.eventType
        VStack(spacing: 8) {
            Text(isDuring ? "DURING" : "BEFORE")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.purple)
            Text(isDuring ? (event?.duringSubtitle ?? "") : "Capturing resting HR")
                .font(.system(size: 12))
                .foregroundStyle(DS.dim)

            Spacer(minLength: 6)
            VStack(spacing: 4) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    BeatingHeart(size: 16, bpm: workout.signalLost ? nil : workout.hr)
                    HrReadout(hr: workout.hr, signalLost: workout.signalLost, size: 40, liveColor: .primary)
                    Text("bpm")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DS.dim)
                }
                DeltaChip(delta: ortho.delta)
            }
            Spacer(minLength: 8)

            PrimaryButton(
                title: isDuring ? (event?.doneButton ?? "Done") : (event?.startButton ?? "Start"),
                color: DS.purple
            ) {
                if isDuring { ortho.endTransition() } else { ortho.startTransition() }
            }
            .padding(.bottom, 10)   // clear the device's rounded corner
        }
        .padding(.horizontal, 6)
    }
}

// MARK: - Recovery (60 s ring; End early below the fold)

private struct OrthoRecoveryView: View {
    @ObservedObject var ortho: OrthostaticController
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        GeometryReader { geo in
            let circleD = min(geo.size.width - 24, geo.size.height - 40)
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 6) {
                        Text("AFTER")
                            .font(.system(size: 11, weight: .bold))
                            .kerning(1)
                            .foregroundStyle(DS.purple)
                        Text("Recovery")
                            .font(.system(size: 12))
                            .foregroundStyle(DS.dim)
                        ZStack {
                            RingProgress(
                                progress: Double(ortho.stageElapsed) / Double(OrthostaticController.recoveryDuration),
                                color: DS.purple
                            )
                            VStack(spacing: 4) {
                                HStack(alignment: .lastTextBaseline, spacing: 3) {
                                    HrReadout(hr: workout.hr, signalLost: workout.signalLost, size: 28, liveColor: .primary)
                                    Text("bpm")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(DS.dim)
                                }
                                DeltaChip(delta: ortho.delta)
                                Text("\(fmtCountdown(OrthostaticController.recoveryDuration - ortho.stageElapsed)) left")
                                    .font(.system(size: 12, weight: .semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(DS.dim)
                            }
                            .padding(.horizontal, 10)
                        }
                        .frame(width: circleD, height: circleD)
                        .padding(.top, 6)
                    }
                    .frame(minHeight: geo.size.height, alignment: .top)
                    SecondaryButton(title: "End early") { ortho.endEarly() }
                        .padding(.top, 12)
                        .padding(.horizontal, 4)
                }
            }
        }
    }
}

// MARK: - Results

private struct OrthoResultsView: View {
    @ObservedObject var ortho: OrthostaticController
    let onDone: () -> Void

    private func row(_ label: String, _ value: Int?) -> some View {
        HStack {
            Text(label).font(.system(size: 12.5)).foregroundStyle(DS.dim)
            Spacer()
            Text(value.map { "\($0) bpm" } ?? "00 bpm")
                .font(DS.number(15))
                .monospacedDigit()
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(DS.tile, in: RoundedRectangle(cornerRadius: 12))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(DS.purple)
                Text("Event recorded")
                    .font(.system(size: 15, weight: .heavy))
                    .padding(.bottom, 4)

                row("Before HR", ortho.resultBeforeHr)
                row("After HR", ortho.resultAfterHr)
                row("HR after 1 min", ortho.resultRecoveryHr)

                Text("Check the Autonomic app for more details.")
                    .font(.system(size: 11))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .padding(.top, 6)
                Text("Wellness screening only. HR-based, does not measure blood pressure, and is not a diagnosis. Discuss with your doctor.")
                    .font(.system(size: 10))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(DS.dim.opacity(0.8))

                PrimaryButton(title: "Done", color: DS.purple) {
                    ortho.dismiss()
                    onDone()
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 2)
        }
    }
}
