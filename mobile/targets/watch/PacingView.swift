import SwiftUI

/**
 * Pacing on the wrist (design comp: Watch Pacing, 42a).
 *
 * A thing you CHECK, not a thing you start — which is why it takes the top
 * slot on the home list and why it has no controls at all beyond Back. Every
 * other mode here owns a session; this one owns nothing.
 *
 * The three parts are the phone's, in the phone's order: figure, the spend bar
 * with its pace marker, then two tiles. Someone who has read the Outlook card
 * does not have to learn a second layout on the wrist. Two tiles and not
 * three: at this width a third drops the figure below 16pt, and Spent beside
 * Budget already answers the question the screen was opened to ask.
 *
 * Nothing is computed here. `PhoneRelay.pacing` holds frames resolved on the
 * phone, one per 15 minutes of the waking day, so the marker keeps walking
 * while the phone is out of reach — and the minute timeline below is only
 * choosing which of them is current.
 */
struct PacingView: View {
    let onExit: () -> Void
    @EnvironmentObject private var relay: PhoneRelay

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    TimelineView(.everyMinute) { ctx in
                        if let frame = relay.pacing?.frame(at: ctx.date) {
                            PacingBody(frame: frame)
                        } else {
                            PacingEmpty(everSynced: relay.pacing != nil)
                        }
                    }
                    // Leave clearance below so the device's rounded corners
                    // don't clip the content (just under one screenful).
                    .frame(minHeight: geo.size.height - 30, alignment: .top)

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

// MARK: - The reading

private struct PacingBody: View {
    let frame: PacingFrame

    var body: some View {
        VStack(spacing: 0) {
            Text("PACING")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.dim)

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(frame.figure)
                    .font(DS.number(frame.soft ? 25 : 34))
                    .monospacedDigit()
                    .foregroundStyle(Color(hex: frame.figureColor))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if !frame.unit.isEmpty {
                    Text(frame.unit)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DS.dim)
                }
            }
            .padding(.top, 8)

            Text(frame.sub)
                .font(.system(size: 11.5))
                .foregroundStyle(DS.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 5)

            if frame.isDrawable {
                PacingBar(frame: frame)
                    .padding(.top, 12)
            }

            if !frame.tiles.isEmpty {
                HStack(spacing: 5) {
                    ForEach(frame.tiles, id: \.self) { t in
                        StatTile(label: t.label, value: t.value, valueColor: Color(hex: t.color))
                    }
                }
                .padding(.top, 11)
            }

            Spacer(minLength: 0)
        }
        // The bar and the tiles are full-bleed rows: without this they run
        // into the bezel's curve at the corners of a round-rect screen.
        .padding(.horizontal, 3)
    }
}

/// Nothing to mirror yet. The phone is the only place a budget exists, so this
/// says where to go rather than inventing a figure.
private struct PacingEmpty: View {
    /// A budget HAS arrived before, it just isn't today's — a different thing
    /// from a watch that has never been paired to a phone with pacing on it.
    let everSynced: Bool

    var body: some View {
        VStack(spacing: 8) {
            Text("PACING")
                .font(.system(size: 11, weight: .bold))
                .kerning(1)
                .foregroundStyle(DS.dim)
            Spacer(minLength: 6)
            Image(systemName: "iphone")
                .font(.system(size: 22))
                .foregroundStyle(DS.dim)
            Text(everSynced
                 ? "Today's budget hasn't reached your watch yet."
                 : "Open Autonomic on your iPhone to set up pacing.")
                .font(.system(size: 12.5))
                .foregroundStyle(DS.dim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - The bar

/**
 * The Journal strip's bar (features/budget/Bar.tsx), at watch scale: a fill
 * that never turns green at full, a pace marker where an even day would be by
 * now, and the ember on an over-budget day.
 *
 * The caret hangs below the track, so the view reserves its height rather than
 * letting it overflow into whatever sits underneath.
 */
private struct PacingBar: View {
    let frame: PacingFrame
    var height: CGFloat = 11

    /// Slow motion reads as heat rather than as loading, which is the only
    /// reason the one continuous animation in the app is allowed to be here.
    @State private var drift = false

    private func startDrift() {
        guard frame.ember != nil, !drift else { return }
        withAnimation(.linear(duration: 3.4).repeatForever(autoreverses: false)) { drift = true }
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let over = frame.state == "over"
            let fillW = w * CGFloat(over ? 1 : min(1, max(0, frame.fill)))
            let color = Color(hex: frame.fillColor)
            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(frame.state == "paused" ? DS.amber.opacity(0.14) : Color.white.opacity(0.07))
                    .frame(width: w, height: height)

                if fillW > w * 0.01 {
                    Capsule()
                        .fill(color.opacity(over ? 0.33 : 0.16))
                        .frame(width: fillW + 6, height: height + 6)
                        .offset(x: -3, y: -3)
                        .blur(radius: 2)
                    if let ember = frame.ember, !ember.isEmpty {
                        EmberFill(stops: ember, width: max(height, fillW), height: height, drift: drift)
                    } else {
                        Capsule()
                            .fill(color)
                            .frame(width: max(height, fillW), height: height)
                    }
                }

                if let pace = frame.pace {
                    let x = w * CGFloat(min(1, max(0, pace)))
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.white.opacity(0.84))
                        .frame(width: 2, height: height + 8)
                        .offset(x: x - 1, y: -4)
                    Caret()
                        .fill(Color.white.opacity(0.84))
                        .frame(width: 10, height: 6)
                        .offset(x: x - 5, y: height + 2)
                }
            }
        }
        .frame(height: height + 8, alignment: .top)
        .onAppear { startDrift() }
        // Frames are replaced every minute, but the bar keeps its identity, so
        // a day that crosses into over-budget has to be told to catch light.
        .onChange(of: frame.ember != nil) { _, _ in startDrift() }
    }
}

/// The ember, drifting. The payload carries ONE cycle of the gradient, so a
/// doubled copy slid by exactly its own width repeats seamlessly.
private struct EmberFill: View {
    let stops: [PacingStop]
    let width: CGFloat
    let height: CGFloat
    let drift: Bool

    var body: some View {
        let cycle = stops.map { Gradient.Stop(color: Color(hex: $0.c), location: $0.o) }
        let doubled = cycle + stops.map { Gradient.Stop(color: Color(hex: $0.c), location: 1 + $0.o) }
        LinearGradient(
            stops: doubled.map { .init(color: $0.color, location: $0.location / 2) },
            startPoint: .leading, endPoint: .trailing
        )
        .frame(width: width * 2, height: height)
        .offset(x: drift ? -width : 0)
        .frame(width: width, height: height, alignment: .leading)
        .clipShape(Capsule())
    }
}

private struct Caret: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}
