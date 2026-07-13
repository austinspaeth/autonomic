import WidgetKit
import SwiftUI

/**
 * POTS Episode complication — a one-tap launcher into the episode tracker.
 * Idle it is just the stairs figure (the same icon/purple as the watch app's
 * POTS Episode button); while a session runs it is the live Δ and nothing
 * else — no ring, no countdown, no labels. Δ color carries the meaning
 * (≤20 default · >20 orange · >30 red). Tap always deep-links to the
 * episode flow.
 */

private let APP_GROUP = "group.com.autonomic.journal"
private let DEEP_LINK = URL(string: "autonomic://episode")!
private let EPISODE_PURPLE = Color(red: 0.62, green: 0.42, blue: 0.96)  // DS.purple #9d6bf5

struct ComplicationState {
    var active = false
    var liveDelta: Int?
    var stageEndsAt: Date?

    static func load() -> ComplicationState {
        guard let d = UserDefaults(suiteName: APP_GROUP) else { return ComplicationState() }
        var s = ComplicationState()
        s.active = d.bool(forKey: "session.active")
        if d.object(forKey: "session.delta") != nil { s.liveDelta = d.integer(forKey: "session.delta") }
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
        ComplicationEntry(date: .now, state: ComplicationState())
    }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(ComplicationEntry(date: .now, state: context.isPreview ? ComplicationState() : .load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        let state = ComplicationState.load()
        let entry = ComplicationEntry(date: .now, state: state)
        // The app reloads the timeline as the live delta changes; a stale-session
        // backstop entry drops back to the idle icon if the app dies without
        // cleaning up.
        if state.active {
            var cleared = state
            cleared.active = false
            let ends = state.stageEndsAt ?? Date.now.addingTimeInterval(600)
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

private struct StairsIcon: View {
    var size: CGFloat

    var body: some View {
        Image(systemName: "figure.stairs")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(EPISODE_PURPLE)
    }
}

private struct CircularView: View {
    let state: ComplicationState

    var body: some View {
        if state.active {
            DeltaText(value: state.liveDelta ?? 0, size: 26)
        } else {
            StairsIcon(size: 24)
        }
    }
}

private struct CornerView: View {
    let state: ComplicationState

    var body: some View {
        if state.active {
            DeltaText(value: state.liveDelta ?? 0, size: 20)
                .widgetCurvesContent()
        } else {
            StairsIcon(size: 20)
        }
    }
}

private struct RectangularView: View {
    let state: ComplicationState

    var body: some View {
        if state.active {
            DeltaText(value: state.liveDelta ?? 0, size: 26)
        } else {
            StairsIcon(size: 26)
        }
    }
}

// MARK: - Widget

struct AutonomicComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("POTS Episode")
        .description("Tap to track a POTS episode. Shows the live delta while one runs.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}

@main
struct AutonomicComplicationBundle: WidgetBundle {
    var body: some Widget {
        AutonomicComplication()
        AutonomicHrComplication()   // HR monitor glance — HrComplication.swift
    }
}
