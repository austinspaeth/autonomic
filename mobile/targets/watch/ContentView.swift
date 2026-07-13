import SwiftUI

/**
 * Mode router + home screen. Deliberately NOT a NavigationStack: once a mode
 * is running there is no back gesture — HR Monitor ends only via the End
 * button on its controls page (one swipe right), the stand test only via its
 * own buttons — so a stray swipe can't abandon a session. The whole watch app
 * is gated by the phone subscription
 * (mirrored over applicationContext); before the first context ever arrives
 * it asks the user to open the iPhone app.
 */
struct ContentView: View {
    enum Mode { case home, hr, pots, orthostatic }

    @State private var mode: Mode = .home
    @EnvironmentObject private var relay: PhoneRelay
    @EnvironmentObject private var workout: WorkoutManager

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
        .onOpenURL { url in
            // Complication taps: episode → POTS Episode flow, hr → HR monitor.
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
                if gated {
                    lockCard
                } else {
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
                }
            }
        }
    }

    /// Locked until the phone has ever told us `pro`; then mirrors it live.
    private var gated: Bool { relay.pro != true }

    private var lockCard: some View {
        VStack(spacing: 8) {
            Image(systemName: relay.pro == nil ? "iphone" : "lock.fill")
                .font(.system(size: 26))
                .foregroundStyle(DS.dim)
            Text(relay.pro == nil
                 ? "Open Autonomic on your iPhone to set up."
                 : "Subscribe in the Autonomic app on your iPhone to unlock.")
                .font(.system(size: 12.5))
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 12)
        .background(DS.card, in: RoundedRectangle(cornerRadius: 20))
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
