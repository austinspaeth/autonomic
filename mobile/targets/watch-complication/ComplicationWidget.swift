import WidgetKit
import SwiftUI

/**
 * Quick-capture complication, per the imported redlines (Watch
 * Complications.dc.html): a one-tap launcher into the POTS test plus a
 * last-result glance. The delta is the hero everywhere; its color carries
 * the meaning (≤20 default · >20 orange · >30 red). Idle shows the last
 * stand-test delta against the +30 threshold; while a session runs the
 * complication switches to the live delta and stage countdown (countdown
 * text/rings self-update — no timeline spam; the app reloads the timeline
 * on stage changes). Never a live-HR readout when idle.
 */

private let APP_GROUP = "group.com.autonomic.journal"
private let DEEP_LINK = URL(string: "autonomic://episode")!

struct ComplicationState {
    var lastDelta: Int?
    var active = false
    var stage: String?
    var liveDelta: Int?
    var liveHr: Int?
    var stageEndsAt: Date?

    static func load() -> ComplicationState {
        guard let d = UserDefaults(suiteName: APP_GROUP) else { return ComplicationState() }
        var s = ComplicationState()
        if d.object(forKey: "last.delta") != nil { s.lastDelta = d.integer(forKey: "last.delta") }
        s.active = d.bool(forKey: "session.active")
        s.stage = d.string(forKey: "session.stage")
        if d.object(forKey: "session.delta") != nil { s.liveDelta = d.integer(forKey: "session.delta") }
        if d.object(forKey: "session.hr") != nil { s.liveHr = d.integer(forKey: "session.hr") }
        let ends = d.double(forKey: "session.endsAt")
        if ends > 0 { s.stageEndsAt = Date(timeIntervalSince1970: ends) }
        return s
    }
}

/// Δ color rule from the redlines: ≤20 default text · >20 orange · >30 red.
func deltaColor(_ d: Int) -> Color {
    d > 30 ? Color(red: 0.937, green: 0.267, blue: 0.267)
        : d > 20 ? Color(red: 0.976, green: 0.451, blue: 0.086)
        : .primary
}

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let state: ComplicationState
    var relevance: TimelineEntryRelevance? {
        TimelineEntryRelevance(score: state.active ? 100 : 10)
    }
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: .now, state: ComplicationState(lastDelta: 38))
    }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(ComplicationEntry(date: .now, state: context.isPreview ? ComplicationState(lastDelta: 38) : .load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        let state = ComplicationState.load()
        let entry = ComplicationEntry(date: .now, state: state)
        // Countdown text/gauges self-update; the app reloads the timeline on
        // stage changes and completion. A stale-session backstop entry clears
        // the active look if the app dies without cleaning up.
        if state.active, let ends = state.stageEndsAt {
            var cleared = state
            cleared.active = false
            let fallback = ComplicationEntry(date: ends.addingTimeInterval(120), state: cleared)
            completion(Timeline(entries: [entry, fallback], policy: .atEnd))
        } else {
            completion(Timeline(entries: [entry], policy: .never))
        }
    }
}

// MARK: - Views

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCorner: CornerView(state: entry.state)
            case .accessoryRectangular: RectangularView(state: entry.state)
            default: CircularView(state: entry.state)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(DEEP_LINK)
    }
}

/// Big Δ with the symbol at ~58% size, per the redlines.
private struct DeltaText: View {
    let value: Int
    var size: CGFloat

    var body: some View {
        (Text("Δ").font(.system(size: size * 0.58, weight: .bold))
            + Text("\(value)").font(.system(size: size, weight: .heavy)))
            .foregroundStyle(deltaColor(value))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

private struct CircularView: View {
    let state: ComplicationState

    var body: some View {
        if state.active {
            // Live: ring drains with the stage countdown, live Δ hero.
            ZStack {
                if let ends = state.stageEndsAt, ends > .now {
                    ProgressView(timerInterval: Date.now...ends, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                        .progressViewStyle(.circular)
                        .tint(state.liveDelta.map { deltaColor($0) } ?? .primary)
                }
                VStack(spacing: 0) {
                    DeltaText(value: state.liveDelta ?? 0, size: 20)
                    if let ends = state.stageEndsAt, ends > .now {
                        Text(timerInterval: Date.now...ends, countsDown: true)
                            .font(.system(size: 11, weight: .bold))
                            .monospacedDigit()
                            .multilineTextAlignment(.center)
                    }
                }
            }
        } else if let last = state.lastDelta {
            // Idle: last delta vs the +30 POTS threshold.
            Gauge(value: min(Double(last), 40), in: 0...40) { EmptyView() } currentValueLabel: {
                VStack(spacing: 0) {
                    DeltaText(value: last, size: 19)
                    Text("LAST").font(.system(size: 7, weight: .semibold)).foregroundStyle(.secondary)
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(deltaColor(last))
        } else {
            // Never used: no launcher icon substitute needed beyond the mark.
            Image("logo")
                .renderingMode(.template)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .padding(8)
                .foregroundStyle(Color(red: 0.878, green: 0.192, blue: 0.153))
        }
    }
}

private struct CornerView: View {
    let state: ComplicationState

    var body: some View {
        if state.active {
            DeltaText(value: state.liveDelta ?? 0, size: 18)
                .widgetCurvesContent()
                .widgetLabel {
                    if let ends = state.stageEndsAt, ends > .now {
                        Text(timerInterval: Date.now...ends, countsDown: true)
                            .monospacedDigit()
                    } else {
                        Text("running")
                    }
                }
        } else if let last = state.lastDelta {
            DeltaText(value: last, size: 18)
                .widgetCurvesContent()
                .widgetLabel {
                    Gauge(value: min(Double(last), 40), in: 0...40) { Text("last Δ") }
                        .tint(deltaColor(last))
                }
        } else {
            Image("logo")
                .renderingMode(.template)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .foregroundStyle(Color(red: 0.878, green: 0.192, blue: 0.153))
                .widgetLabel { Text("POTS Test") }
        }
    }
}

private struct RectangularView: View {
    let state: ComplicationState

    private var accent = Color(red: 0.878, green: 0.192, blue: 0.153)

    init(state: ComplicationState) { self.state = state }

    var body: some View {
        if state.active {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill((state.liveDelta.map { deltaColor($0) } ?? accent).opacity(0.16))
                        .frame(width: 34, height: 34)
                    Circle()
                        .fill(state.liveDelta.map { deltaColor($0) } ?? accent)
                        .frame(width: 7, height: 7)
                }
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text((state.stage ?? "session").uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if let ends = state.stageEndsAt, ends > .now {
                            (Text(timerInterval: Date.now...ends, countsDown: true) + Text(" left"))
                                .font(.system(size: 10, weight: .bold))
                                .monospacedDigit()
                        }
                    }
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        DeltaText(value: state.liveDelta ?? 0, size: 19)
                        if let hr = state.liveHr {
                            Text("\(hr) bpm").font(.system(size: 10.5)).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } else {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(accent.opacity(0.14))
                        .frame(width: 34, height: 34)
                    Image("logo")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 24)
                        .foregroundStyle(accent)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text("POTS TEST")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        if let last = state.lastDelta {
                            DeltaText(value: last, size: 19)
                            Text("· tap to start").font(.system(size: 10.5)).foregroundStyle(.secondary)
                        } else {
                            Text("Tap to start").font(.system(size: 15, weight: .bold))
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Widget

struct AutonomicComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("POTS Test")
        .description("Your last stand-test delta. Tap to start a reading.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}

@main
struct AutonomicComplicationBundle: WidgetBundle {
    var body: some Widget {
        AutonomicComplication()
    }
}
