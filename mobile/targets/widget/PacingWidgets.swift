import WidgetKit
import SwiftUI

/**
 * Pacing widgets (design comp: Pacing Widgets, 41a / 41b):
 *  · Pacing (small)        — figure over the spend bar and its pace marker
 *  · Pacing detail (medium) — the same, plus a state badge and two tiles
 *
 * Every string, colour and position arrives resolved in the payload's pacing
 * frames (src/lib/widgets.ts); this file only draws. The bar is the Journal
 * strip's (features/budget/Bar.tsx): a fill that never turns green at full, a
 * pace marker where an even day would be by now, and on an over-budget day the
 * ember gradient baked static, since WidgetKit cannot animate it.
 */

private enum PTheme {
    /// The comp's near-black card gradient.
    static let background = LinearGradient(
        stops: [
            .init(color: Color(hex: "#1a1a1f"), location: 0),
            .init(color: Color(hex: "#0e0e11"), location: 0.58),
            .init(color: Color(hex: "#141418"), location: 1),
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let gold = Color(hex: "#eab308")
    static let marker = Color.white.opacity(0.84)

    /// Manrope ExtraBold, the app's `fonts.numHeavy`, bundled via Info.plist.
    static func number(_ size: CGFloat) -> Font { .custom("Manrope-ExtraBold", size: size) }
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

/// The spend bar. The caret hangs below the track, so the view reserves its
/// height (`height + 8`) rather than letting it overflow into the padding.
struct PacingBar: View {
    let frame: PacingFrame
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let over = frame.state == "over"
            let fillW = w * CGFloat(over ? 1 : min(1, max(0, frame.fill)))
            let color = Color(hex: frame.fillColor)
            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(frame.state == "paused" ? PTheme.gold.opacity(0.14) : Color.white.opacity(0.06))
                    .frame(width: w, height: height)

                if fillW > w * 0.01 {
                    // The halo the Outlook gauge wears under its arc.
                    Capsule()
                        .fill(color.opacity(over ? 0.33 : 0.16))
                        .frame(width: fillW + 6, height: height + 6)
                        .offset(x: -3, y: -3)
                        .blur(radius: 2)
                    if let ember = frame.ember, !ember.isEmpty {
                        Capsule()
                            .fill(LinearGradient(
                                stops: ember.map { .init(color: Color(hex: $0.c), location: $0.o) },
                                startPoint: .leading, endPoint: .trailing
                            ))
                            .frame(width: max(height, fillW), height: height)
                    } else {
                        Capsule()
                            .fill(color)
                            .frame(width: max(height, fillW), height: height)
                    }
                }

                if let pace = frame.pace {
                    let x = w * CGFloat(min(1, max(0, pace)))
                    RoundedRectangle(cornerRadius: 1)
                        .fill(PTheme.marker)
                        .frame(width: 2, height: height + 8)
                        .offset(x: x - 1, y: -4)
                    Caret()
                        .fill(PTheme.marker)
                        .frame(width: 10, height: 6)
                        .offset(x: x - 5, y: height + 2)
                }
            }
        }
        .frame(height: height + 8, alignment: .top)
    }
}

private struct PacingLabel: View {
    var body: some View {
        Text("PACING")
            .font(.system(size: 11, weight: .bold))
            .kerning(1.3)
            .foregroundStyle(WTheme.textDim)
    }
}

/// The figure, with "over" beside an overage. A word or an "About" figure is
/// set a step smaller so it holds the slot a bare duration fills.
private struct PacingFigure: View {
    let frame: PacingFrame
    let size: CGFloat
    let softSize: CGFloat
    let unitSize: CGFloat

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(frame.figure)
                .font(PTheme.number(frame.soft ? softSize : size))
                .monospacedDigit()
                .kerning(-0.6)
                .foregroundStyle(Color(hex: frame.figureColor))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if !frame.unit.isEmpty {
                Text(frame.unit)
                    .font(.system(size: unitSize, weight: .semibold))
                    .foregroundStyle(WTheme.textDim)
            }
        }
    }
}

// MARK: - Small

struct PacingWidgetView: View {
    let entry: PacingEntry

    var body: some View {
        let f = entry.frame
        VStack(alignment: .leading, spacing: 0) {
            PacingLabel()
            Spacer(minLength: 4)
            PacingFigure(frame: f, size: 38, softSize: 29, unitSize: 12)
            Text(f.sub)
                .font(.system(size: 10.5))
                .foregroundStyle(WTheme.textDim)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 4)
            PacingBar(frame: f, height: 9)
                .padding(.top, 11)
        }
        .padding(.horizontal, 15)
        .padding(.top, 15)
        .padding(.bottom, 9)
        .containerBackground(for: .widget) { PTheme.background }
    }
}

struct PacingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "pacing", provider: PacingProvider()) { entry in
            PacingWidgetView(entry: entry)
        }
        .configurationDisplayName("Pacing")
        .description("What today's budget has left, and how fast it is going.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

// MARK: - Medium

struct PacingDetailWidgetView: View {
    let entry: PacingEntry

    var body: some View {
        let f = entry.frame
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                PacingLabel()
                Spacer(minLength: 0)
                if !f.badge.isEmpty {
                    let c = Color(hex: f.badgeColor)
                    Text(f.badge)
                        .font(.system(size: 9.5, weight: .bold))
                        .kerning(0.5)
                        .foregroundStyle(c)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .overlay(Capsule().strokeBorder(c.opacity(0.35), lineWidth: 1))
                }
            }

            Spacer(minLength: 4)

            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    PacingFigure(frame: f, size: 43, softSize: 32, unitSize: 12.5)
                    Text(f.subWide)
                        .font(.system(size: 11))
                        .foregroundStyle(WTheme.textDim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .layoutPriority(1)
                Spacer(minLength: 0)
                if !f.tiles.isEmpty {
                    HStack(spacing: 7) {
                        ForEach(f.tiles, id: \.self) { t in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.value)
                                    .font(PTheme.number(13))
                                    .monospacedDigit()
                                    .foregroundStyle(Color(hex: t.color))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                                Text(t.label)
                                    .font(.system(size: 9))
                                    .foregroundStyle(WTheme.textDim)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            .padding(.horizontal, 9)
                            .padding(.vertical, 8)
                            .frame(width: 70, alignment: .leading)
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
            }

            PacingBar(frame: f, height: 10)
                .padding(.top, 12)
        }
        .padding(.horizontal, 17)
        .padding(.top, 16)
        .padding(.bottom, 9)
        .containerBackground(for: .widget) { PTheme.background }
    }
}

struct PacingDetailWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "pacingDetail", provider: PacingProvider()) { entry in
            PacingDetailWidgetView(entry: entry)
        }
        .configurationDisplayName("Pacing Detail")
        .description("Today's budget, what it has spent, and how fast it is going.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

// MARK: - Previews

#Preview("Pacing", as: .systemSmall) { PacingWidget() } timeline: {
    PacingEntry(date: .now, frame: .sample)
    PacingEntry(date: .now, frame: .sampleAhead)
    PacingEntry(date: .now, frame: .sampleOver)
    PacingEntry(date: .now, frame: .samplePaused)
    PacingEntry(date: .now, frame: .awaiting)
}
#Preview("Pacing detail", as: .systemMedium) { PacingDetailWidget() } timeline: {
    PacingEntry(date: .now, frame: .sample)
    PacingEntry(date: .now, frame: .sampleAhead)
    PacingEntry(date: .now, frame: .sampleOver)
    PacingEntry(date: .now, frame: .samplePaused)
}
