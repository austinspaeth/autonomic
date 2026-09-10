import SwiftUI

/**
 * Mode router + home screen. Deliberately NOT a NavigationStack: once a mode
 * is running there is no back gesture — HR Monitor ends only via the End
 * button on its controls page (one swipe right), the stand test only via its
 * own buttons — so a stray swipe can't abandon a session.
 *
 * NOTHING HERE IS GATED. The two POTS captures used to follow the phone
 * subscription (`pro`, still mirrored over applicationContext for other uses)
 * and showed a lock instead of a chevron. They no longer do: a stand test and
 * an episode happen at a moment that cannot be rescheduled around a
 * subscription, and a watch that refuses to record one loses it for good. The
 * freemium line sits where every other capture's does — on READING the result
 * in the phone app (src/features/PotsLock.tsx), which is Pro. The reading is
 * still captured, synced and saved to the journal on every tier.
 */
struct ContentView: View {
    enum Mode { case home, pacing, hr, pots, orthostatic }

    @State private var mode: Mode = .home
    @EnvironmentObject private var relay: PhoneRelay
    @EnvironmentObject private var workout: WorkoutManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch workout.authGate {
            case .checking:
                // Sub-second while getRequestStatusForAuthorization resolves;
                // a logo beat, never a flash of the home screen.
                Image("logo")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 64)
                    .foregroundStyle(DS.accent)
            case .needed:
                HealthPermissionView()
            case .resolved:
                switch mode {
                case .home: home
                case .pacing: PacingView { mode = .home }
                case .hr: HrMonitorView { mode = .home }
                case .pots: StandTestView { mode = .home }
                case .orthostatic: OrthostaticView { mode = .home }
                }
            }
        }
        .onAppear { WorkoutManager.shared.evaluateAuthGate() }
        .onChange(of: scenePhase) { _, phase in
            // Every activation, not just first appear: a permission sheet
            // that failed to present gets retried instead of wedging the
            // monitor until a watch reboot (see WorkoutManager's class doc),
            // and access granted in Settings while the app sat denied is
            // picked up here too.
            if phase == .active {
                WorkoutManager.shared.evaluateAuthGate()
                WorkoutManager.shared.refreshAuthorization()
            }
        }
        .onOpenURL { url in
            // Complication taps: episode → POTS Episode flow, hr → HR monitor.
            // Only route from home — a tap must never yank a live session out
            // from under its own screen (the discarded controller would leave
            // the workout and complication session state orphaned).
            guard mode == .home else { return }
            if url.host == "episode" || url.path.contains("episode") {
                mode = .orthostatic
            } else if url.host == "hr" || url.path.contains("hr") {
                mode = .hr
            }
        }
    }

    // MARK: - Home

    private var home: some View {
        ScrollView {
            VStack(spacing: 8) {
                VStack(spacing: 2) {
                    Image("logo")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 64)
                        .foregroundStyle(DS.accent)
                    Text("Autonomic")
                        .font(.system(size: 15, weight: .heavy))
                }
                // Pacing leads. HR Monitor and the two POTS captures are
                // things you START; pacing is a thing you CHECK, several times
                // a day, so it takes the top slot and carries today's figure
                // in its subtitle rather than a description of itself.
                modeButton(
                    title: "Pacing", subtitle: pacingSubtitle,
                    icon: "bolt.batteryblock", tint: DS.gold
                ) { mode = .pacing }
                modeButton(
                    title: "HR Monitor", subtitle: "Persistent heart rate",
                    icon: "heart.fill", tint: DS.accent
                ) { mode = .hr }
                modeButton(
                    title: "POTS Test", subtitle: "Lie and stand test",
                    icon: "figure.stand", tint: DS.blue
                ) { mode = .pots }
                modeButton(
                    title: "POTS Episode", subtitle: "Stairs or other events",
                    icon: "figure.stairs", tint: DS.purple
                ) { mode = .orthostatic }
                Text("v\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0")")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(DS.faint)
                    .padding(.top, 2)
            }
        }
    }

    /// Today's figure, or where to get one. Never a stale figure: a budget
    /// whose day has passed decodes to nil (see `WatchPacing.frame(at:)`).
    private var pacingSubtitle: String {
        relay.pacing?.frame()?.homeSubtitle ?? "Open on your iPhone"
    }

    // MARK: - Permission gate

    /// Shown before any other UI while Health authorization has never been
    /// asked. The sheet fires automatically a beat after the screen appears
    /// (the app is fully active by then — the reliable presentation window);
    /// the button is the retry for a sheet that failed to present, which is
    /// exactly the wedge this screen exists to escape.
    private struct HealthPermissionView: View {
        @State private var autoRequested = false

        var body: some View {
            ScrollView {
                VStack(spacing: 8) {
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(DS.accent)
                    Text("Health access")
                        .font(.system(size: 15, weight: .heavy))
                    Text("Autonomic needs Health permission to read your live heart rate and record sessions.")
                        .font(.system(size: 12))
                        .foregroundStyle(DS.dim)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    PrimaryButton(title: "Continue") {
                        WorkoutManager.shared.requestAuthorization()
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 4)
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    guard !autoRequested else { return }
                    autoRequested = true
                    WorkoutManager.shared.requestAuthorization()
                }
            }
        }
    }

    private func modeButton(title: String, subtitle: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(.system(size: 15, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(DS.dim)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DS.dim.opacity(0.7))
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 11)
            .background(DS.card, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}
