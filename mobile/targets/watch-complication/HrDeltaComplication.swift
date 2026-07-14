import WidgetKit
import SwiftUI

/**
 * HR Delta complication, per the imported redlines (HR & Delta
 * Complications.dc.html): the mirror of the HR glance that shows only the Δ
 * (vs the rolling 2-minute average, same math as the on-watch monitor). The
 * gauge spans the 2-minute lowest…highest Δ with the dot at the current Δ,
 * breaking cleanly on both sides of the dot. Everything is tinted by the
 * POTS rule — green steady · ≥ +20 orange · ≥ +30 red · ≤ −30 blue.
 * Shares state/provider/gauges with HrComplication.swift. Tapping any family
 * deep-links straight into the HR monitor.
 */

private let DELTA_DEEP_LINK = URL(string: "autonomic://hr")!

/// Signed delta label: +8 · -12 · +0.
private func deltaLabel(_ d: Int) -> String { d < 0 ? "\(d)" : "+\(d)" }

/// Hero delta value — just the signed number (no Δ mark, per the redline
/// follow-up), colored to match the gauge.
private struct DeltaHero: View {
    let value: Int
    var size: CGFloat
    var color: Color

    var body: some View {
        Text(deltaLabel(value))
            .font(hrNumberFont(size))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

struct HrDeltaComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HrComplicationEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCorner: DeltaCornerView(state: entry.state)
            case .accessoryRectangular: DeltaRectangularView(state: entry.state)
            default: DeltaCircularView(state: entry.state)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(DELTA_DEEP_LINK)
    }
}

/// Circular: Δ hero in the middle, the 2-min Δ range as the arc with the dot
/// at the current Δ, lowest/highest labels in the bottom opening.
private struct DeltaCircularView: View {
    let state: HrComplicationState

    var body: some View {
        if let delta = state.delta {
            // Number + labels share the arc's exact tint (incl. the idle dim).
            let tint = hrDeltaColor(delta).opacity(state.active ? 1 : 0.45)
            ZStack {
                RangeArcGauge(position: state.deltaPosition, color: tint)
                DeltaHero(value: delta, size: 21, color: tint)
                    .padding(.horizontal, 12)
            }
            .overlay(alignment: .bottom) {
                if let low = state.deltaLow, let high = state.deltaHigh, high > low {
                    HStack {
                        Text(deltaLabel(low))
                        Spacer(minLength: 0)
                        Text(deltaLabel(high))
                    }
                    .font(hrNumberFont(9))
                    .lineLimit(1)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 2)
                }
            }
        } else {
            Text("Δ")
                .font(hrNumberFont(24))
                .foregroundStyle(HR_ACCENT)
        }
    }
}

/// Corner: Δ hero at the corner, bezel gauge = the 2-min Δ range with the dot
/// at the current Δ, tinted by the POTS rule.
private struct DeltaCornerView: View {
    let state: HrComplicationState

    var body: some View {
        if let delta = state.delta {
            DeltaHero(value: delta, size: 20, color: hrDeltaColor(delta))
                .widgetLabel {
                    if let low = state.deltaLow, let high = state.deltaHigh, high > low {
                        Gauge(value: Double(delta), in: Double(low)...Double(high)) {
                            Text("Δ")
                        } currentValueLabel: {
                            Text(deltaLabel(delta))
                        } minimumValueLabel: {
                            Text(deltaLabel(low))
                        } maximumValueLabel: {
                            Text(deltaLabel(high))
                        }
                        .tint(hrDeltaColor(delta))
                    } else {
                        Text("HR Delta")
                    }
                }
        } else {
            Text("Δ")
                .font(hrNumberFont(20))
                .foregroundStyle(HR_ACCENT)
                .widgetLabel { Text("HR Delta") }
        }
    }
}

/// Rectangular: Δ hero on the left, the Δ range track breaking around the dot
/// on the right with lowest/highest beneath its ends.
private struct DeltaRectangularView: View {
    let state: HrComplicationState

    var body: some View {
        if let delta = state.delta {
            let tint = hrDeltaColor(delta).opacity(state.active ? 1 : 0.45)
            HStack(spacing: 12) {
                DeltaHero(value: delta, size: 28, color: tint)
                if let low = state.deltaLow, let high = state.deltaHigh, high > low {
                    VStack(spacing: 3) {
                        RangeTrack(position: state.deltaPosition, color: tint)
                            .frame(height: 8)
                        HStack {
                            Text(deltaLabel(low))
                            Spacer(minLength: 0)
                            Text(deltaLabel(high))
                        }
                        .font(hrNumberFont(10))
                        .lineLimit(1)
                        .foregroundStyle(tint)
                    }
                } else {
                    Spacer(minLength: 0)
                }
            }
        } else {
            HStack(spacing: 10) {
                Text("Δ")
                    .font(hrNumberFont(20))
                    .foregroundStyle(HR_ACCENT)
                Text("Tap to monitor")
                    .font(.system(size: 15, weight: .bold))
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Widget

struct AutonomicHrDeltaComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicHrDeltaComplication", provider: HrComplicationProvider()) { entry in
            HrDeltaComplicationView(entry: entry)
        }
        .configurationDisplayName("HR Delta")
        .description("Live Δ vs the 2-minute average with its range. Tap to open the monitor.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}
