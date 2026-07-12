import SwiftUI

/**
 * Mode router + home screen. Deliberately NOT a NavigationStack: once a mode
 * is running there is no back gesture or chevron — HR Monitor exits only via
 * End, the stand test only via its own buttons — so a stray swipe can't
 * abandon a session. The whole watch app is gated by the phone subscription
 * (mirrored over applicationContext); before the first context ever arrives
 * it asks the user to open the iPhone app.
 */
struct ContentView: View {
    enum Mode { case home, hr, pots }

    @State private var mode: Mode = .home
    @EnvironmentObject private var relay: PhoneRelay
    @EnvironmentObject private var workout: WorkoutManager

    var body: some View {
        Group {
            switch mode {
            case .home: home
            case .hr: HrMonitorView { mode = .home }
            case .pots: StandTestView { mode = .home }
            }
        }
        .onAppear { WorkoutManager.shared.requestAuthorization() }
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
                        .frame(width: 84)
                        .foregroundStyle(DS.accent)
                    Text("Autonomic")
                        .font(.system(size: 15, weight: .heavy))
                    Text(gated ? "Subscription required" : "Choose a mode")
                        .font(.system(size: 11))
                        .foregroundStyle(DS.dim)
                }
                if gated {
                    lockCard
                } else {
                    modeButton(
                        title: "HR Monitor", subtitle: "Live heart rate",
                        icon: "heart.fill", tint: DS.accent
                    ) { mode = .hr }
                    modeButton(
                        title: "POTS Reading", subtitle: "Lie and stand test",
                        icon: "figure.stand", tint: DS.blue
                    ) { mode = .pots }
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
                    .font(.system(size: 18))
                    .foregroundStyle(tint)
                    .frame(width: 38, height: 38)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(.system(size: 15, weight: .bold))
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(DS.dim)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DS.dim.opacity(0.7))
            }
            .padding(12)
            .background(DS.card, in: RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
    }
}
