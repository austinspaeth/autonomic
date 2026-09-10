import WidgetKit
import SwiftUI

/**
 * Data plumbing for the home-screen widgets. The phone app builds one JSON
 * payload per journal change (src/lib/widgets.ts) and drops it in the shared
 * app group via modules/widget-bridge; every widget here decodes that same
 * payload. There is no fetching or computation on this side — if the payload
 * is missing or describes a day that has since rolled over, the widgets show
 * the "awaiting data" state rather than yesterday's numbers labeled today.
 */

let APP_GROUP = "group.com.autonomic.journal"
let DATA_KEY = "widget.today.v1"
// Query param on the Journal tab (not a path) so expo-router always has a
// matching route; the app listens for the param (useCaptureDeepLink).
let CAPTURE_URL = URL(string: "autonomic://?capture=hrv")!
// Opens the Journal tab scrolled to the expanded Progress streak card.
let PROTOCOL_URL = URL(string: "autonomic://?open=protocol")!

struct MetricRow: Decodable, Hashable {
    let name: String
    let value: String
    let unit: String
    let color: String
    let trend: String?
    let trendColor: String?
}

struct GridMetric: Decodable, Hashable {
    let name: String
    let value: String
    let unit: String
}

struct ProtocolItem: Decodable, Hashable {
    let key: String
    let label: String
    let done: Bool
    let broken: Bool   // hard-failed today (e.g. a trigger logged) — shows a red ✕
}

struct SparkStop: Decodable, Hashable {
    let o: Double   // gradient offset, 0 (top) → 1 (bottom)
    let c: String
}

/// Precomputed by the app to match its Sparkline card exactly — the widget
/// only draws (scale, stops, per-point grades all arrive in the payload).
struct Spark: Decodable, Hashable {
    let values: [Double?]
    let colors: [String?]
    let stops: [SparkStop]
    let ticks: [String]
    let start: String
    let end: String
}

struct PacingTile: Decodable, Hashable {
    let value: String
    let label: String
    let color: String
}

/// One moment of the pacing widget, fully resolved by the app
/// (`WidgetPacingFrame` in src/lib/widgets.ts). `at` is when it becomes true.
struct PacingFrame: Decodable, Hashable {
    let at: String
    /// healthy · ahead · over · low · paused · locked · awaiting
    let state: String
    let figure: String
    let unit: String
    let soft: Bool
    let figureColor: String
    let sub: String
    let subWide: String
    let fill: Double
    let fillColor: String
    let pace: Double?
    /// Over budget only: the ember gradient baked static, left → right.
    let ember: [SparkStop]?
    let badge: String
    let badgeColor: String
    let tiles: [PacingTile]
}

struct Pacing: Decodable {
    let frames: [PacingFrame]
}

struct WidgetPayload: Decodable {
    let date: String
    let updatedAt: String
    let hasScore: Bool
    let score: Double
    let label: String
    let color: String
    let rows: [MetricRow]
    let grid: [GridMetric]
    let spark: Spark?
    let `protocol`: [ProtocolItem]
    let protocolDone: Int
    /// Optional: a payload written by a build that predates the pacing widgets
    /// must still decode for the score widgets.
    let pacing: Pacing?
}

private func localDayKey(_ date: Date = .now) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

extension WidgetPayload {
    static func load() -> WidgetPayload? {
        guard let defaults = UserDefaults(suiteName: APP_GROUP),
              let json = defaults.string(forKey: DATA_KEY),
              let data = json.data(using: .utf8),
              let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data)
        else { return nil }
        // Stale payload (app hasn't run since yesterday): the metrics would be
        // for a previous day, so fall back to the awaiting state.
        guard payload.date == localDayKey() else { return nil }
        return payload
    }

    /// Empty journal / stale data: dim gauge at 0, dashes everywhere.
    static let awaiting = WidgetPayload(
        date: "", updatedAt: "", hasScore: false, score: 0,
        label: "Awaiting data", color: "#8a8a92",
        rows: [
            MetricRow(name: "SDNN", value: "–", unit: "ms", color: "#8a8a92", trend: nil, trendColor: nil),
            MetricRow(name: "RMSSD", value: "–", unit: "ms", color: "#8a8a92", trend: nil, trendColor: nil),
            MetricRow(name: "Sleep", value: "–", unit: "h", color: "#8a8a92", trend: nil, trendColor: nil),
        ],
        grid: [
            GridMetric(name: "SDNN", value: "–", unit: "ms"),
            GridMetric(name: "RMSSD", value: "–", unit: "ms"),
            GridMetric(name: "pNN50", value: "–", unit: "%"),
            GridMetric(name: "Resting HR", value: "–", unit: "bpm"),
            GridMetric(name: "Sleep", value: "–", unit: "h"),
            GridMetric(name: "Water", value: "–", unit: "L"),
        ],
        spark: nil,
        protocol: [],
        protocolDone: 0,
        pacing: nil
    )

    /// Gallery preview / placeholder numbers (mirrors the design comp).
    static let sample = WidgetPayload(
        date: "", updatedAt: "", hasScore: true, score: 82,
        label: "Good", color: "#16a34a",
        rows: [
            MetricRow(name: "SDNN", value: "55", unit: "ms", color: "#16a34a", trend: "▲", trendColor: "#16a34a"),
            MetricRow(name: "RMSSD", value: "42", unit: "ms", color: "#2ee06a", trend: "▲", trendColor: "#16a34a"),
            MetricRow(name: "Sleep", value: "7.2", unit: "h", color: "#16a34a", trend: "▲", trendColor: "#16a34a"),
        ],
        grid: [
            GridMetric(name: "SDNN", value: "55", unit: "ms"),
            GridMetric(name: "RMSSD", value: "42", unit: "ms"),
            GridMetric(name: "pNN50", value: "12", unit: "%"),
            GridMetric(name: "Resting HR", value: "58", unit: "bpm"),
            GridMetric(name: "Sleep", value: "7.2", unit: "h"),
            GridMetric(name: "Water", value: "1.5", unit: "L"),
        ],
        spark: Spark(
            values: [24, 27, 23, 29, 31, 28, 33, 36, 34, 39, 42, 40, 45, 46],
            colors: ["#eab308", "#eab308", "#eab308", "#16a34a", "#16a34a", "#16a34a",
                     "#2ee06a", "#2ee06a", "#2ee06a", "#2ee06a", "#2ee06a", "#2ee06a",
                     "#2ee06a", "#2ee06a"],
            stops: [
                SparkStop(o: 0, c: "#2ee06a"), SparkStop(o: 0.599, c: "#2ee06a"),
                SparkStop(o: 0.599, c: "#16a34a"), SparkStop(o: 0.796, c: "#16a34a"),
                SparkStop(o: 0.796, c: "#eab308"), SparkStop(o: 1, c: "#eab308"),
            ],
            ticks: ["21.9", "34.5", "47.2"],
            start: "Jul 3", end: "Jul 16"
        ),
        protocol: [
            ProtocolItem(key: "hrv", label: "HRV reading", done: true, broken: false),
            ProtocolItem(key: "water", label: "Water 2.5 L", done: true, broken: false),
            ProtocolItem(key: "sleep", label: "Sleep 7h", done: true, broken: false),
            ProtocolItem(key: "triggers", label: "Avoid triggers", done: false, broken: false),
            ProtocolItem(key: "med:magnesium", label: "Magnesium", done: false, broken: false),
        ],
        protocolDone: 3,
        pacing: Pacing(frames: [.sample])
    )
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, payload: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let payload = context.isPreview ? .sample : (WidgetPayload.load() ?? .awaiting)
        completion(TodayEntry(date: .now, payload: payload))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: .now, payload: WidgetPayload.load() ?? .awaiting)
        completion(Timeline(entries: [entry], policy: .after(nextMidnight())))
    }
}

/// The app pushes a reload on every journal change; the only scheduled refresh
/// the widgets need of their own is the midnight rollover, when today's
/// payload stops being today's.
func nextMidnight() -> Date {
    Calendar.current.nextDate(
        after: .now, matching: DateComponents(hour: 0, minute: 0, second: 30),
        matchingPolicy: .nextTime
    ) ?? .now.addingTimeInterval(6 * 3600)
}

// MARK: - Pacing timeline

extension PacingFrame {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    var date: Date? { PacingFrame.iso.date(from: at) }

    /// Nothing honest to show: an empty journal, or a payload from yesterday.
    static let awaiting = PacingFrame(
        at: "", state: "awaiting", figure: "Awaiting", unit: "", soft: true, figureColor: "#8a8a92",
        sub: "Open Autonomic to update", subWide: "Open Autonomic to update your budget",
        fill: 0, fillColor: "#8a8a92", pace: nil, ember: nil,
        badge: "", badgeColor: "#8a8a92", tiles: []
    )

    /// Gallery preview (the comp's healthy state).
    static let sample = PacingFrame(
        at: "", state: "healthy", figure: "3h 20m", unit: "", soft: false, figureColor: "#f2f2f5",
        sub: "left of 5h 30m", subWide: "left of 5h 30m today",
        fill: 0.39, fillColor: "#16a34a", pace: 0.46, ember: nil,
        badge: "ON TRACK", badgeColor: "#16a34a",
        tiles: [
            PacingTile(value: "2h 10m", label: "Spent", color: "#f2f2f5"),
            PacingTile(value: "5h 30m", label: "Budget", color: "#8a8a92"),
        ]
    )

    static let sampleAhead = PacingFrame(
        at: "", state: "ahead", figure: "1h 05m", unit: "", soft: false, figureColor: "#f2f2f5",
        sub: "left, running ahead", subWide: "Runs out around 4:10pm",
        fill: 0.8, fillColor: "#eab308", pace: 0.58, ember: nil,
        badge: "AHEAD", badgeColor: "#eab308",
        tiles: [
            PacingTile(value: "4h 25m", label: "Spent", color: "#f2f2f5"),
            PacingTile(value: "1h 12m", label: "HR above 95", color: "#eab308"),
        ]
    )

    static let sampleOver = PacingFrame(
        at: "", state: "over", figure: "45m", unit: "over", soft: false, figureColor: "#e03127",
        sub: "Resting brings this down", subWide: "Resting now brings this back down",
        fill: 1, fillColor: "#e03127", pace: nil,
        ember: [
            SparkStop(o: 0, c: "#e03127"), SparkStop(o: 0.22, c: "#f08568"),
            SparkStop(o: 0.46, c: "#e03127"), SparkStop(o: 0.7, c: "#e96451"),
            SparkStop(o: 1, c: "#e03127"),
        ],
        badge: "OVER", badgeColor: "#e03127",
        tiles: [
            PacingTile(value: "6h 15m", label: "Spent", color: "#f2f2f5"),
            PacingTile(value: "5h 30m", label: "Budget", color: "#8a8a92"),
        ]
    )

    static let samplePaused = PacingFrame(
        at: "", state: "paused", figure: "Paused", unit: "", soft: true, figureColor: "#f2f2f5",
        sub: "Take it easy today", subWide: "Take it easy, resume tomorrow",
        fill: 0, fillColor: "#8a8a92", pace: nil, ember: nil,
        badge: "PAUSED", badgeColor: "#eab308",
        tiles: [
            PacingTile(value: "21", label: "HRV, ms", color: "#eab308"),
            PacingTile(value: "78", label: "Resting HR", color: "#eab308"),
        ]
    )
}

struct PacingEntry: TimelineEntry {
    let date: Date
    let frame: PacingFrame
}

/**
 * One timeline entry per frame the app computed, so the pace marker walks
 * across the day on WidgetKit's own schedule between app launches. The spend
 * behind it cannot move without the app (nothing here reads health data), so
 * only the clock-dependent parts differ from entry to entry.
 */
struct PacingProvider: TimelineProvider {
    func placeholder(in context: Context) -> PacingEntry {
        PacingEntry(date: .now, frame: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (PacingEntry) -> Void) {
        if context.isPreview {
            completion(PacingEntry(date: .now, frame: .sample))
            return
        }
        completion(entries().first ?? PacingEntry(date: .now, frame: .awaiting))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PacingEntry>) -> Void) {
        let list = entries()
        let timeline = list.isEmpty
            ? [PacingEntry(date: .now, frame: .awaiting)]
            : list
        completion(Timeline(entries: timeline, policy: .after(nextMidnight())))
    }

    /// The frame already in force (dated now), then every later one at its own time.
    private func entries() -> [PacingEntry] {
        guard let frames = WidgetPayload.load()?.pacing?.frames, !frames.isEmpty else { return [] }
        let now = Date.now
        let dated = frames.map { ($0.date ?? now, $0) }
        let current = dated.last(where: { $0.0 <= now })?.1 ?? dated[0].1
        var out = [PacingEntry(date: now, frame: current)]
        for (date, frame) in dated where date > now {
            out.append(PacingEntry(date: date, frame: frame))
        }
        return out
    }
}
