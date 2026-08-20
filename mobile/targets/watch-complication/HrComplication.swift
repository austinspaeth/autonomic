import WidgetKit
import SwiftUI

/**
 * HR Monitor complication, per the imported redlines (HR & Delta
 * Complications.dc.html): the current HR is the white hero (Manrope, matching
 * the phone app's numerals) with no delta anywhere — the 2-minute low and high
 * sit at the ends of the range gauge, and a dot marks where the current HR
 * lands. The gauge breaks cleanly on both sides of the dot (nothing touches
 * it) and the dot's diameter equals the gauge stroke. The gauge dims to 45%
 * accent when idle and brightens to full accent while a session records.
 * Tapping any family deep-links straight into the HR monitor.
 */

private let HR_APP_GROUP = "group.com.autonomic.journal"
private let HR_DEEP_LINK = URL(string: "autonomic://hr")!
let HR_ACCENT = Color(red: 0.878, green: 0.192, blue: 0.153)   // #e03127

/// Metric numerals — system bold (the user preferred SF over the app's
/// Manrope here after seeing both on-device).
func hrNumberFont(_ size: CGFloat) -> Font { .system(size: size, weight: .bold) }

/// Δ color rule from the redlines (matches POTS): ≥ +30 red · ≥ +20 orange ·
/// ≤ −30 blue · else green.
func hrDeltaColor(_ d: Int) -> Color {
    d >= 30 ? Color(red: 0.937, green: 0.267, blue: 0.267)      // #ef4444
        : d >= 20 ? Color(red: 0.976, green: 0.451, blue: 0.086) // #f97316
        : d <= -30 ? Color(red: 0.290, green: 0.639, blue: 0.941) // #4aa3f0
        : Color(red: 0.243, green: 0.769, blue: 0.427)           // #3ec46d
}

struct HrComplicationState {
    var hr: Int?
    var low: Int?
    var high: Int?
    var delta: Int?
    var deltaLow: Int?
    var deltaHigh: Int?
    var active = false
    var at: Date?

    static func load() -> HrComplicationState {
        guard let d = UserDefaults(suiteName: HR_APP_GROUP) else { return HrComplicationState() }
        var s = HrComplicationState()
        if d.object(forKey: "hr.last") != nil { s.hr = d.integer(forKey: "hr.last") }
        if d.object(forKey: "hr.low") != nil { s.low = d.integer(forKey: "hr.low") }
        if d.object(forKey: "hr.high") != nil { s.high = d.integer(forKey: "hr.high") }
        if d.object(forKey: "hr.delta") != nil { s.delta = d.integer(forKey: "hr.delta") }
        if d.object(forKey: "hr.deltaLow") != nil { s.deltaLow = d.integer(forKey: "hr.deltaLow") }
        if d.object(forKey: "hr.deltaHigh") != nil { s.deltaHigh = d.integer(forKey: "hr.deltaHigh") }
        s.active = d.bool(forKey: "hr.active")
        let at = d.double(forKey: "hr.at")
        if at > 0 { s.at = Date(timeIntervalSince1970: at) }
        return s
    }

    /// 0…1 position of the current HR within the 2-min low…high range.
    var position: Double {
        guard let hr, let low, let high, high > low else { return 0.5 }
        return min(1, max(0, Double(hr - low) / Double(high - low)))
    }

    /// 0…1 position of the current Δ within the 2-min lowest…highest Δ range.
    var deltaPosition: Double {
        guard let delta, let deltaLow, let deltaHigh, deltaHigh > deltaLow else { return 0.5 }
        return min(1, max(0, Double(delta - deltaLow) / Double(deltaHigh - deltaLow)))
    }

    static let sample = HrComplicationState(hr: 72, low: 64, high: 88,
                                            delta: 22, deltaLow: 8, deltaHigh: 31)
}

struct HrComplicationEntry: TimelineEntry {
    let date: Date
    let state: HrComplicationState
    var relevance: TimelineEntryRelevance? {
        TimelineEntryRelevance(score: state.active ? 100 : 10)
    }
}

struct HrComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> HrComplicationEntry {
        HrComplicationEntry(date: .now, state: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (HrComplicationEntry) -> Void) {
        completion(HrComplicationEntry(date: .now, state: context.isPreview ? .sample : .load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HrComplicationEntry>) -> Void) {
        let state = HrComplicationState.load()
        let entry = HrComplicationEntry(date: .now, state: state)
        // The app reloads the timeline while monitoring; a stale backstop entry
        // drops back to the idle look if the app dies without cleaning up.
        if state.active {
            var idle = state
            idle.active = false
            let fallback = HrComplicationEntry(date: (state.at ?? .now).addingTimeInterval(180), state: idle)
            completion(Timeline(entries: [entry, fallback], policy: .atEnd))
        } else {
            completion(Timeline(entries: [entry], policy: .never))
        }
    }
}

// MARK: - Range gauges (shared with the HR Delta glance)

/// Circular gauge geometry: a 240° arc over the top, opening at the bottom.
/// The 120° opening leaves the min/max labels clear of the arc ends
/// (screen-clockwise degrees from 3 o'clock).
private let ARC_SWEEP: Double = 240
private let ARC_START: Double = 90 + (360 - ARC_SWEEP) / 2

/// The 2-min range as an arc, split into two segments that both stop short of
/// the position dot so nothing touches it. Dot diameter == arc stroke, same
/// color, per the redlines.
struct RangeArcGauge: View {
    var position: Double   // 0…1 along the arc, low → high
    var color: Color
    var stroke: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let r = (side - stroke) / 2 - 1
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let dotDeg = ARC_START + ARC_SWEEP * position
            // Break on each side: round cap radius + dot radius + ~3pt clear,
            // converted to arc degrees at this radius.
            let gapDeg = Double(stroke + 3) / Double(r) * 180 / .pi
            let dotRad = CGFloat(dotDeg * .pi / 180)

            Path { p in
                addArcSegment(&p, center: center, r: r, from: ARC_START, to: dotDeg - gapDeg)
                addArcSegment(&p, center: center, r: r, from: dotDeg + gapDeg, to: ARC_START + ARC_SWEEP)
            }
            .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            Circle()
                .fill(color)
                .frame(width: stroke, height: stroke)
                .position(x: center.x + r * cos(dotRad), y: center.y + r * sin(dotRad))
        }
    }

    /// Skips segments the dot has squeezed out at the ends of the range.
    private func addArcSegment(_ p: inout Path, center: CGPoint, r: CGFloat, from: Double, to: Double) {
        let a = max(from, ARC_START), b = min(to, ARC_START + ARC_SWEEP)
        guard b - a > 1 else { return }
        p.move(to: CGPoint(x: center.x + r * cos(a * .pi / 180), y: center.y + r * sin(a * .pi / 180)))
        p.addArc(center: center, radius: r, startAngle: .degrees(a), endAngle: .degrees(b), clockwise: false)
    }
}

/// The same range gauge flattened for the rectangular family: a horizontal
/// track breaking around the dot.
struct RangeTrack: View {
    var position: Double
    var color: Color
    var stroke: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            let y = geo.size.height / 2
            let inset = stroke / 2
            let usable = geo.size.width - stroke
            let x = inset + usable * CGFloat(min(1, max(0, position)))
            let gap = stroke + 3
            Path { p in
                if x - gap > inset + 0.5 {
                    p.move(to: CGPoint(x: inset, y: y))
                    p.addLine(to: CGPoint(x: x - gap, y: y))
                }
                if x + gap < inset + usable - 0.5 {
                    p.move(to: CGPoint(x: x + gap, y: y))
                    p.addLine(to: CGPoint(x: inset + usable, y: y))
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            Circle()
                .fill(color)
                .frame(width: stroke, height: stroke)
                .position(x: x, y: y)
        }
    }
}

// MARK: - Views

struct HrComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HrComplicationEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCorner: HrCornerView(state: entry.state)
            case .accessoryRectangular: HrRectangularView(state: entry.state)
            default: HrCircularView(state: entry.state)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(HR_DEEP_LINK)
    }
}

/// Circular: HR hero + BPM caption in the middle, range arc breaking around
/// the dot, low/high labels in the bottom opening.
private struct HrCircularView: View {
    let state: HrComplicationState

    var body: some View {
        if let hr = state.hr {
            // Number + labels share the arc's exact tint (incl. the idle dim),
            // per the redline follow-up.
            let tint = HR_ACCENT.opacity(state.active ? 1 : 0.45)
            ZStack {
                RangeArcGauge(position: state.position, color: tint)
                Text("\(hr)")
                    // Drop a couple of points at triple digits so the number
                    // stays inside the arc instead of relying on scale-down.
                    .font(hrNumberFont(hr >= 100 ? 17 : 19))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .overlay(alignment: .bottom) {
                if let low = state.low, let high = state.high, high > low {
                    // Spacer(minLength: 0) + lineLimit — the default spacer
                    // minimum wraps a 3-digit label onto two lines. The labels
                    // sit under the arc ends, in the bottom opening.
                    HStack {
                        Text("\(low)")
                        Spacer(minLength: 0)
                        Text("\(high)")
                    }
                    .font(hrNumberFont(9))
                    .lineLimit(1)
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 2)
                }
            }
        } else {
            Image(systemName: "heart.fill")
                .font(.system(size: 24))
                .foregroundStyle(HR_ACCENT)
        }
    }
}

/// Corner: HR hero at the corner, bezel gauge = the 2-min range with the dot
/// at the current HR and the low/high at the ends.
private struct HrCornerView: View {
    let state: HrComplicationState

    var body: some View {
        if let hr = state.hr {
            Text("\(hr)")
                .font(hrNumberFont(20))
                .foregroundStyle(HR_ACCENT)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .widgetLabel {
                    if let low = state.low, let high = state.high, high > low {
                        Gauge(value: Double(hr), in: Double(low)...Double(high)) {
                            Text("BPM")
                        } currentValueLabel: {
                            Text("\(hr)")
                        } minimumValueLabel: {
                            Text("\(low)")
                        } maximumValueLabel: {
                            Text("\(high)")
                        }
                        .tint(HR_ACCENT)
                    } else {
                        Text("Heart Rate")
                    }
                }
        } else {
            Image(systemName: "heart.fill")
                .font(.system(size: 22))
                .foregroundStyle(HR_ACCENT)
                .widgetLabel { Text("HR Monitor") }
        }
    }
}

/// Rectangular: HR hero + BPM on the left, the range track breaking around
/// the dot on the right with low/high beneath its ends.
private struct HrRectangularView: View {
    let state: HrComplicationState

    var body: some View {
        if let hr = state.hr {
            let tint = HR_ACCENT.opacity(state.active ? 1 : 0.45)
            HStack(spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(hr)")
                        .font(hrNumberFont(26))
                        .foregroundStyle(tint)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("BPM")
                        .font(.system(size: 9, weight: .bold))
                        .kerning(0.6)
                        .foregroundStyle(.secondary)
                }
                if let low = state.low, let high = state.high, high > low {
                    VStack(spacing: 3) {
                        RangeTrack(position: state.position, color: tint)
                            .frame(height: 8)
                        HStack {
                            Text("\(low)")
                            Spacer(minLength: 0)
                            Text("\(high)")
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
                Image(systemName: "heart.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(HR_ACCENT)
                Text("Tap to monitor")
                    .font(.system(size: 15, weight: .bold))
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Widget

struct AutonomicHrComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicHrComplication", provider: HrComplicationProvider()) { entry in
            HrComplicationView(entry: entry)
        }
        .configurationDisplayName("Heart Rate")
        .description("Last HR with its 2-minute range. Tap to open the monitor.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}
