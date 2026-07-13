import WidgetKit
import SwiftUI

/**
 * HR Monitor complication, per the imported redlines (HR Complications.dc.html):
 * the heart rate is the white hero everywhere; the Δ (vs the rolling 2-minute
 * average, same math as the on-watch monitor) rides alongside it, color-coded
 * by the POTS rule — green steady · ≥ +20 orange · ≥ +30 red · ≤ −30 blue.
 * The circular face draws the last-2-min HR range as an arc (end labels are
 * min and max) with a white dot marking where the current HR lands; the arc
 * dims to 45% accent when idle and brightens to full accent while a session
 * records. Tapping any family deep-links straight into the HR monitor.
 */

private let HR_APP_GROUP = "group.com.autonomic.journal"
private let HR_DEEP_LINK = URL(string: "autonomic://hr")!
private let HR_ACCENT = Color(red: 0.878, green: 0.192, blue: 0.153)   // #e03127

/// Δ color rule from the redlines: ≥ +30 red · ≥ +20 orange · ≤ −30 blue · else green.
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
    var active = false
    var at: Date?

    static func load() -> HrComplicationState {
        guard let d = UserDefaults(suiteName: HR_APP_GROUP) else { return HrComplicationState() }
        var s = HrComplicationState()
        if d.object(forKey: "hr.last") != nil { s.hr = d.integer(forKey: "hr.last") }
        if d.object(forKey: "hr.low") != nil { s.low = d.integer(forKey: "hr.low") }
        if d.object(forKey: "hr.high") != nil { s.high = d.integer(forKey: "hr.high") }
        if d.object(forKey: "hr.delta") != nil { s.delta = d.integer(forKey: "hr.delta") }
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

    static let sample = HrComplicationState(hr: 72, low: 64, high: 88, delta: 6)
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

/// Δ with the symbol at ~62% size, per the redlines. Drops render as Δ-34.
private struct HrDeltaText: View {
    let value: Int
    var size: CGFloat

    var body: some View {
        (Text("Δ").font(.system(size: size * 0.62, weight: .bold))
            + Text("\(value)").font(.system(size: size, weight: .heavy)))
            .foregroundStyle(hrDeltaColor(value))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/// Range arc: 270° sweep from bottom-left to bottom-right, dot at the current
/// HR's position, min/max labels tucked under the open ends.
private struct HrCircularView: View {
    let state: HrComplicationState

    var body: some View {
        if let hr = state.hr {
            ZStack {
                GeometryReader { geo in
                    let stroke: CGFloat = 5
                    let side = min(geo.size.width, geo.size.height)
                    let r = (side - stroke) / 2 - 1
                    let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                    let angle = (135 + 270 * state.position) * .pi / 180

                    Circle()
                        .trim(from: 0, to: 0.75)
                        .stroke(HR_ACCENT.opacity(state.active ? 1 : 0.45),
                                style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                        .rotationEffect(.degrees(135))
                        .padding(stroke / 2 + 1)
                    ZStack {
                        Circle().fill(.black).frame(width: 13, height: 13)
                        Circle().fill(.white).frame(width: 9, height: 9)
                    }
                    .position(x: center.x + r * cos(angle), y: center.y + r * sin(angle))
                }
                VStack(spacing: -1) {
                    Text("\(hr)")
                        .font(.system(size: 20, weight: .heavy))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    if let delta = state.delta { HrDeltaText(value: delta, size: 11) }
                }
            }
            .overlay(alignment: .bottom) {
                if let low = state.low, let high = state.high, high > low {
                    HStack {
                        Text("\(low)")
                        Spacer()
                        Text("\(high)")
                    }
                    .font(.system(size: 7, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    // Tucked into the arc's bottom opening — far enough in that
                    // the face's circular mask doesn't clip them.
                    .padding(.horizontal, 12)
                    .padding(.bottom, 1)
                }
            }
        } else {
            Image(systemName: "heart.fill")
                .font(.system(size: 24))
                .foregroundStyle(HR_ACCENT)
        }
    }
}

/// Corner: HR hero + Δ at the corner, bezel gauge = the 2-min range with the
/// dot at the current HR, tinted by the Δ rule.
private struct HrCornerView: View {
    let state: HrComplicationState

    var body: some View {
        if let hr = state.hr {
            VStack(spacing: -3) {
                Text("\(hr)")
                    .font(.system(size: 19, weight: .heavy))
                    .monospacedDigit()
                if let delta = state.delta { HrDeltaText(value: delta, size: 10) }
            }
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
                    .tint(state.delta.map { hrDeltaColor($0) } ?? HR_ACCENT)
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

/// Rectangular: leading tile (logo idle · heart while live), title line with the
/// 2-min range right-aligned, HR hero + BPM + Δ.
private struct HrRectangularView: View {
    let state: HrComplicationState

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(HR_ACCENT.opacity(0.15))
                    .frame(width: 34, height: 34)
                if state.active {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(HR_ACCENT)
                } else {
                    Image("logo")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 24)
                        .foregroundStyle(HR_ACCENT)
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Text(state.active ? "MONITORING" : "HEART RATE")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    if let low = state.low, let high = state.high, high > low {
                        Text("\(low)–\(high)")
                            .font(.system(size: 10, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    if let hr = state.hr {
                        Text("\(hr)")
                            .font(.system(size: 21, weight: .heavy))
                            .monospacedDigit()
                        Text("BPM")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.secondary)
                        if let delta = state.delta { HrDeltaText(value: delta, size: 14) }
                    } else {
                        Text("Tap to monitor")
                            .font(.system(size: 15, weight: .bold))
                    }
                }
            }
            Spacer(minLength: 0)
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
        .description("Last HR with its 2-minute range and delta. Tap to open the monitor.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}
