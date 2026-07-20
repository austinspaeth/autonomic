import SwiftUI

/**
 * Mode router + home screen. Deliberately NOT a NavigationStack: once a mode
 * is running there is no back gesture — HR Monitor ends only via the End
 * button on its controls page (one swipe right), the stand test only via its
 * own buttons — so a stray swipe can't abandon a session. Freemium gating is
 * per-feature: the HR Monitor is always free; the two POTS captures follow
 * the phone subscription (`pro` mirrored over applicationContext — true while
 * trialing or subscribed). Locked rows show a lock instead of a chevron and
 * explain how to unlock on tap.
 */
struct ContentView: View {
    enum Mode { case home, hr, pots, orthostatic }

    @State private var mode: Mode = .home
    @State private var showLockAlert = false
    @EnvironmentObject private var relay: PhoneRelay
    @EnvironmentObject private var workout: WorkoutManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch mode {
            case .home: home
            case .hr: HrMonitorView { mode = .home }
            case .pots: StandTestView { mode = .home }
            case .orthostatic: OrthostaticView { mode = .home }
            }
        }
        .onAppear { WorkoutManager.shared.requestAuthorization() }
        .onChange(of: scenePhase) { _, phase in
            // Every activation, not just first appear: a permission sheet
            // that failed to present gets retried instead of wedging the
            // monitor until a watch reboot (see WorkoutManager's class doc).
            if phase == .active { WorkoutManager.shared.refreshAuthorization() }
        }
        .onOpenURL { url in
            // Complication taps: episode → POTS Episode flow, hr → HR monitor.
            if url.host == "episode" || url.path.contains("episode") {
                if potsLocked { mode = .home; showLockAlert = true } else { mode = .orthostatic }
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
                modeButton(
                    title: "HR Monitor", subtitle: "Persistent heart rate",
                    icon: "heart.fill", tint: DS.accent
                ) { mode = .hr }
                modeButton(
                    title: "POTS Test", subtitle: "Lie and stand test",
                    icon: "figure.stand", tint: DS.blue, locked: potsLocked
                ) { mode = .pots }
                modeButton(
                    title: "POTS Episode", subtitle: "Stairs or other events",
                    icon: "figure.stairs", tint: DS.purple, locked: potsLocked
                ) { mode = .orthostatic }
                Text("v\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0")")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(DS.faint)
                    .padding(.top, 2)
            }
        }
        .alert("Subscription required", isPresented: $showLockAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(relay.pro == nil
                 ? "Open Autonomic on your iPhone to set up."
                 : "Subscribe in the Autonomic app on your iPhone to unlock POTS readings.")
        }
    }

    /// POTS captures are Pro (or trial). Locked until the phone has ever told
    /// us `pro`; then mirrors it live. The HR Monitor is never gated.
    private var potsLocked: Bool { relay.pro != true }

    private func modeButton(title: String, subtitle: String, icon: String, tint: Color, locked: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: { if locked { showLockAlert = true } else { action() } }) {
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
                Image(systemName: locked ? "lock.fill" : "chevron.right")
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
