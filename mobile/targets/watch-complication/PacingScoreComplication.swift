import WidgetKit
import SwiftUI

/**
 * Score and pacing complications, per the imported design (Pacing & Score
 * Complications.dc.html, 59a–59h):
 *  · Autonomic Score — circular (59a) and corner (59d): the Outlook's 270°
 *    gauge filled to today's score in its grade colour. No grade word: the
 *    colour and the arc's length carry it, so a long grade never has to fit.
 *  · Pacing — circular (59b), corner (59e) and rectangular (59g): the arc or
 *    bar fills with what the day has SPENT and the white tick is where an even
 *    day would be by now. Filling up is the warning, never the goal.
 *  · Score & Pacing — rectangular (59h): the dial beside the pacing figure and
 *    its bar, so the two never read as the same kind of number.
 *
 * Nothing here is computed. The phone resolves both blocks (`watchScore` and
 * `watchPacing` in src/lib/watch/) off the same widget payload the home-screen
 * widgets draw; the watch app copies them into the app group
 * (ComplicationStore.todayUpdate). Pacing arrives as one frame per 15 minutes
 * of the waking day, laid out below as one timeline entry each, which is what
 * walks the pace tick on the watch's own clock without the phone. A block from
 * a day that has passed is refused: yesterday's budget is an invitation to
 * spend minutes that were already spent.
 */

private let TODAY_APP_GROUP = "group.com.autonomic.journal"
private let PACING_LINK = URL(string: "autonomic://pacing")!
private let HOME_LINK = URL(string: "autonomic://home")!

private let TRACK = Color.white.opacity(0.12)
private let TEXT = Color(hex6: "#f2f2f5")
private let DIM = Color(hex6: "#8a8a92")
private let PAUSED_TRACK = Color(hex6: "#eab308").opacity(0.14)

// MARK: - Model (the phone's shapes, decoded as sent)

struct ScoreBlock: Decodable {
    static let schema = 1
    let schemaVersion: Int
    let date: String
    let hasScore: Bool
    let score: Int
    let color: String
    let label: String
}

struct CxPacingStop: Decodable { let o: Double; let c: String }
struct CxPacingTile: Decodable { let value: String; let label: String; let color: String }

/// `WidgetPacingFrame` (src/lib/widgets.ts), as targets/watch/PacingModel.swift decodes it.
struct CxPacingFrame: Decodable {
    let at: String
    /// healthy · ahead · over · low · paused · locked · awaiting
    let state: String
    let figure: String
    let unit: String
    let soft: Bool
    let figureColor: String
    let sub: String
    let fill: Double
    let fillColor: String
    let pace: Double?
    let ember: [CxPacingStop]?
    let badge: String
    let badgeColor: String
    let tiles: [CxPacingTile]
}

struct PacingBlock: Decodable {
    static let schema = 1
    let schemaVersion: Int
    let date: String
    let frames: [CxPacingFrame]
}

private let isoFmt: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let dayFmt: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

extension CxPacingFrame {
    var date: Date? { isoFmt.date(from: at) }
    /// Words rather than a budget: nothing to draw an arc or bar for.
    var isDrawable: Bool { state != "locked" && state != "awaiting" }
    var over: Bool { state == "over" }
    var paused: Bool { state == "paused" }

    /// The arc's fill: the whole day once over.
    var arcFill: Double { over ? 1 : min(1, max(0, fill)) }

    /// The word under a circular figure. "45m" is a budget left or an overage
    /// depending on the state, so the tail is always spoken.
    var shortTail: String? {
        guard isDrawable, !paused else { return nil }
        return unit.isEmpty ? "LEFT" : unit.uppercased()
    }

    /// "3h 20m" → "3h20" and "About 3h" → "3h", so a duration fits inside a
    /// 50pt circle without shrinking to nothing. Words pass through.
    var compactFigure: String {
        var f = figure
        if f.hasPrefix("About ") { f.removeFirst(6) }
        return Self.compact(f)
    }

    /// The figure's tail on the rectangular glances, kept short enough to sit
    /// beside the figure: "left of 5h30", whatever the state's own sentence
    /// is ("left, running ahead" says what the bar colour already does).
    var inlineTail: String { tail(compact: true) }

    /// `compact: false` keeps "5h 30m" whole, for a tail on its own line.
    func tail(compact: Bool) -> String {
        if over { return "over budget" }
        if paused { return "" }
        if let budget = tiles.first(where: { $0.label == "Budget" })?.value {
            return "left of \(compact ? Self.compact(budget) : budget)"
        }
        return sub
    }

    /// "3h 20m" → "3h20". Minutes alone or hours alone pass through.
    static func compact(_ s: String) -> String {
        s.replacingOccurrences(of: #"(\d+)h (\d+)m"#, with: "$1h$2", options: .regularExpression)
    }

    /// The top-right badge. Paused already says so in the figure.
    var cornerBadge: String? {
        guard isDrawable, !paused, !badge.isEmpty else { return nil }
        return badge
    }

    static let sample = CxPacingFrame(
        at: "", state: "healthy", figure: "3h 20m", unit: "", soft: false, figureColor: "#f2f2f5",
        sub: "left of 5h 30m", fill: 0.39, fillColor: "#16a34a", pace: 0.46, ember: nil,
        badge: "ON TRACK", badgeColor: "#16a34a",
        tiles: [
            CxPacingTile(value: "2h 10m", label: "Spent", color: "#f2f2f5"),
            CxPacingTile(value: "5h 30m", label: "Budget", color: "#8a8a92"),
        ]
    )
}

extension ScoreBlock {
    static let sample = ScoreBlock(schemaVersion: 1, date: "", hasScore: true, score: 83,
                                   color: "#16a34a", label: "Good")
}

private func load<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
    guard let json = UserDefaults(suiteName: TODAY_APP_GROUP)?.string(forKey: key),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
}

// MARK: - Timeline

struct TodayEntry: TimelineEntry {
    let date: Date
    /// nil: nothing honest to show (never synced, a newer schema, or another day).
    let score: ScoreBlock?
    let frame: CxPacingFrame?
}

/**
 * One entry now, one at every later pacing frame, and one at midnight, when
 * both blocks expire. The phone's next push replaces the lot.
 */
struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, score: .sample, frame: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        completion(entries(now: .now).first!)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date.now
        let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
        completion(Timeline(entries: entries(now: now), policy: .after(midnight)))
    }

    private func entries(now: Date) -> [TodayEntry] {
        let score = load(ScoreBlock.self, "today.score").flatMap { $0.schemaVersion <= ScoreBlock.schema ? $0 : nil }
        let pacing = load(PacingBlock.self, "today.pacing").flatMap { $0.schemaVersion <= PacingBlock.schema ? $0 : nil }
        let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)

        func entry(at t: Date) -> TodayEntry {
            let day = dayFmt.string(from: t)
            let s = score?.date == day ? score : nil
            var f: CxPacingFrame?
            if let pacing, pacing.date == day {
                f = pacing.frames.last(where: { ($0.date ?? .distantFuture) <= t }) ?? pacing.frames.first
            }
            return TodayEntry(date: t, score: s, frame: f)
        }

        var out = [entry(at: now)]
        for f in pacing?.frames ?? [] {
            guard let d = f.date, d > now, d < midnight else { continue }
            out.append(entry(at: d))
        }
        out.append(entry(at: midnight))
        return out
    }
}

// MARK: - Shapes

/// The Outlook's 270° gauge (targets/widget ScoreGauge): opening at the bottom,
/// filled clockwise from the lower left.
private struct Arc270: Shape {
    var fraction: Double
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: min(rect.width, rect.height) / 2,
                 startAngle: .degrees(135), endAngle: .degrees(135 + 270 * max(0.0001, min(1, fraction))),
                 clockwise: false)
        return p
    }
}

/// Track + fill, with an optional pace tick cut across the arc (59b).
private struct DialGauge: View {
    var fraction: Double
    var color: Color
    var track: Color = TRACK
    var tick: Double?
    var stroke: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let inset = stroke / 2 + 1
            let r = side / 2 - inset
            let c = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                Arc270(fraction: 1)
                    .stroke(track, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .padding(inset)
                if fraction > 0.005 {
                    Arc270(fraction: fraction)
                        .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                        .padding(inset)
                        .widgetAccentable()
                }
                if let tick {
                    let a = (135 + 270 * min(1, max(0, tick))) * Double.pi / 180
                    let r0 = r - stroke / 2 - 2, r1 = r + stroke / 2 + 2
                    let tickPath = Path { p in
                        p.move(to: CGPoint(x: c.x + r0 * cos(a), y: c.y + r0 * sin(a)))
                        p.addLine(to: CGPoint(x: c.x + r1 * cos(a), y: c.y + r1 * sin(a)))
                    }
                    // A black cut first, so the white tick reads on any fill.
                    tickPath.stroke(.black, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                    tickPath.stroke(.white, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                }
            }
        }
    }
}

/// The spend bar at complication scale (targets/widget PacingBar): the ember is
/// baked static, since WidgetKit cannot animate it.
private struct MiniPacingBar: View {
    let frame: CxPacingFrame
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let fillW = w * CGFloat(frame.arcFill)
            let color = Color(hex6: frame.fillColor)
            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(frame.paused ? PAUSED_TRACK : TRACK)
                    .frame(width: w, height: height)
                if fillW > w * 0.01 {
                    Group {
                        if let ember = frame.ember, !ember.isEmpty {
                            Capsule().fill(LinearGradient(
                                stops: ember.map { .init(color: Color(hex6: $0.c), location: $0.o) },
                                startPoint: .leading, endPoint: .trailing
                            ))
                        } else {
                            Capsule().fill(color)
                        }
                    }
                    .frame(width: max(height, fillW), height: height)
                    .widgetAccentable()
                }
                if let pace = frame.pace {
                    let x = w * CGFloat(min(1, max(0, pace)))
                    RoundedRectangle(cornerRadius: 1)
                        .fill(.white)
                        .frame(width: 2, height: height + 6)
                        .offset(x: x - 1, y: -3)
                }
            }
            .offset(y: 3)
        }
        .frame(height: height + 6)
    }
}

// MARK: - Score views

/// 59a: the gauge with the score in the middle, in white; the arc says the grade.
private struct ScoreCircular: View {
    let score: ScoreBlock?
    var numberSize: CGFloat = 20

    var body: some View {
        let has = score?.hasScore == true
        ZStack {
            DialGauge(fraction: has ? Double(score!.score) / 100 : 0,
                      color: Color(hex6: score?.color ?? "#8a8a92"))
            Text(has ? "\(score!.score)" : "–")
                .font(hrNumberFont(numberSize))
                .foregroundStyle(has ? TEXT : DIM)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

/// 59d: the gauge rides the bezel as the corner's label, so the number gets
/// the whole corner.
private struct ScoreCorner: View {
    let score: ScoreBlock?

    var body: some View {
        if let score, score.hasScore {
            Text("\(score.score)")
                .font(hrNumberFont(22))
                .foregroundStyle(TEXT)
                .widgetLabel {
                    Gauge(value: Double(score.score), in: 0...100) {
                        Text("Score")
                    }
                    .tint(Color(hex6: score.color))
                }
        } else {
            Text("–")
                .font(hrNumberFont(22))
                .foregroundStyle(DIM)
                .widgetLabel { Text("Autonomic") }
        }
    }
}

// MARK: - Pacing views

/// 59b: the day as an arc filled to what was spent, the tick where an even day
/// would be by now, and the figure with its tail spoken under it.
private struct PacingCircular: View {
    let frame: CxPacingFrame?

    var body: some View {
        if let frame, frame.isDrawable {
            ZStack {
                DialGauge(fraction: frame.arcFill,
                          color: Color(hex6: frame.fillColor),
                          track: frame.paused ? PAUSED_TRACK : TRACK,
                          tick: frame.pace)
                Text(frame.compactFigure)
                    .font(hrNumberFont(frame.soft && frame.paused ? 11 : 13))
                    .foregroundStyle(Color(hex6: frame.figureColor))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 7)
            }
            .overlay(alignment: .bottom) {
                if let tail = frame.shortTail {
                    Text(tail)
                        .font(.system(size: 8, weight: .bold))
                        .kerning(0.6)
                        .foregroundStyle(DIM)
                        .padding(.bottom, 3)
                }
            }
        } else if frame?.state == "locked" {
            PacingIdleIcon(frame: frame)
        } else {
            // Nothing synced: the same empty dial as an unscored day.
            ScoreCircular(score: nil)
        }
    }
}

/// 59e: the spent arc along the bezel, the figure in the corner.
private struct PacingCorner: View {
    let frame: CxPacingFrame?

    var body: some View {
        if let frame, frame.isDrawable {
            Text(frame.compactFigure)
                .font(hrNumberFont(frame.paused ? 13 : 18))
                .foregroundStyle(Color(hex6: frame.figureColor))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .widgetLabel {
                    Gauge(value: frame.arcFill) {
                        Text("Pacing")
                    }
                    .tint(Color(hex6: frame.fillColor))
                }
        } else if frame?.state == "locked" {
            PacingIdleIcon(frame: frame)
                .widgetLabel { Text("Pacing · Pro") }
        } else {
            Text("–")
                .font(hrNumberFont(22))
                .foregroundStyle(DIM)
                .widgetLabel { Text("Pacing") }
        }
    }
}

/// Locked or nothing synced: no number to invent, so the glance is a mark.
private struct PacingIdleIcon: View {
    let frame: CxPacingFrame?
    var body: some View {
        Image(systemName: frame?.state == "locked" ? "lock.fill" : "gauge.with.dots.needle.33percent")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(DIM)
    }
}

/// The figure and its tail. Words (Paused) are set a step smaller.
private struct PacingFigureLine: View {
    let frame: CxPacingFrame
    var size: CGFloat
    var tailSize: CGFloat = 10.5

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(frame.figure)
                .font(hrNumberFont(frame.soft && !frame.paused ? size * 0.78 : size))
                .foregroundStyle(Color(hex6: frame.figureColor))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .layoutPriority(1)
            if !frame.inlineTail.isEmpty {
                Text(frame.inlineTail)
                    .font(.system(size: tailSize, weight: .semibold))
                    .foregroundStyle(DIM)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

/// The "nothing honest to show" line both rectangular glances fall back to.
private struct PacingNotice: View {
    let frame: CxPacingFrame?
    var body: some View {
        Text(frame?.state == "locked" ? "Included with Pro" : "Open Autonomic on your iPhone")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(DIM)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
    }
}

/// 59g: label and badge, figure, bar. The Ultra's tall slot only sets the
/// figure a step larger: the spent/budget row repeated what the tail says.
private struct PacingRectangular: View {
    let frame: CxPacingFrame?

    var body: some View {
        GeometryReader { geo in
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("PACING")
                        .font(.system(size: 11, weight: .heavy))
                        .kerning(1.2)
                        .foregroundStyle(DIM)
                    Spacer(minLength: 4)
                    if let frame, let badge = frame.cornerBadge {
                        Text(badge)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Color(hex6: frame.badgeColor))
                            .lineLimit(1)
                    }
                }
                if let frame, frame.isDrawable, geo.size.height > 90 {
                    // The Ultra's tall slot: the tail gets its own line under
                    // the figure, and the block sits centred rather than
                    // pinned to the top and bottom edges.
                    Text(frame.figure)
                        .font(hrNumberFont(frame.soft && !frame.paused ? 20 : 26))
                        .foregroundStyle(Color(hex6: frame.figureColor))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .padding(.top, 4)
                    if !frame.paused {
                        Text(frame.tail(compact: false))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(DIM)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    MiniPacingBar(frame: frame, height: 8)
                        .padding(.top, 8)
                } else if let frame, frame.isDrawable {
                    PacingFigureLine(frame: frame, size: 22)
                        .padding(.top, 2)
                    Spacer(minLength: 2)
                    MiniPacingBar(frame: frame, height: 6)
                } else {
                    Spacer(minLength: 2)
                    PacingNotice(frame: frame)
                    Spacer(minLength: 0)
                }
            }
            .frame(maxHeight: geo.size.height > 90 ? .infinity : nil, alignment: .center)
        }
    }
}

/// 59h: score dial | pacing. The one to set when only one slot is spare.
private struct ScorePacingRectangular: View {
    let entry: TodayEntry

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.height, 120)
            HStack(spacing: 8) {
                ScoreCircular(score: entry.score, numberSize: side * 0.36)
                    .frame(width: side, height: side)
                Rectangle()
                    .fill(Color.white.opacity(0.12))
                    .frame(width: 1)
                    .padding(.vertical, 6)
                VStack(alignment: .leading, spacing: 0) {
                    Text("PACING")
                        .font(.system(size: 10, weight: .heavy))
                        .kerning(1.1)
                        .foregroundStyle(DIM)
                    if let frame = entry.frame, frame.isDrawable {
                        Text(frame.figure)
                            .font(hrNumberFont(frame.soft && !frame.paused ? 15 : 19))
                            .foregroundStyle(Color(hex6: frame.figureColor))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .padding(.top, 1)
                        Text(frame.inlineTail)
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(DIM)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Spacer(minLength: 2)
                        MiniPacingBar(frame: frame, height: 5)
                    } else {
                        Spacer(minLength: 2)
                        PacingNotice(frame: entry.frame)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
}

// MARK: - Widgets

struct ScoreComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry
    var body: some View {
        Group {
            switch family {
            case .accessoryCorner: ScoreCorner(score: entry.score)
            default: ScoreCircular(score: entry.score)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(HOME_LINK)
    }
}

struct PacingComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry
    var body: some View {
        Group {
            switch family {
            case .accessoryCorner: PacingCorner(frame: entry.frame)
            case .accessoryRectangular: PacingRectangular(frame: entry.frame)
            default: PacingCircular(frame: entry.frame)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(PACING_LINK)
    }
}

struct AutonomicScoreComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicScoreComplication", provider: TodayProvider()) { entry in
            ScoreComplicationView(entry: entry)
        }
        .configurationDisplayName("Autonomic Score")
        .description("Today's score, in its grade colour.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct AutonomicPacingComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicPacingComplication", provider: TodayProvider()) { entry in
            PacingComplicationView(entry: entry)
        }
        .configurationDisplayName("Pacing")
        .description("What today's budget has left, and where an even day would be by now.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}

struct AutonomicScorePacingComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AutonomicScorePacingComplication", provider: TodayProvider()) { entry in
            ScorePacingRectangular(entry: entry)
                .containerBackground(.black, for: .widget)
                .widgetURL(PACING_LINK)
        }
        .configurationDisplayName("Score & Pacing")
        .description("Today's score beside what the pacing budget has left.")
        .supportedFamilies([.accessoryRectangular])
    }
}

extension Color {
    /// Parse the payload's #rrggbb strings.
    init(hex6: String) {
        var h = hex6.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255,
                  green: Double((v >> 8) & 0xff) / 255,
                  blue: Double(v & 0xff) / 255)
    }
}
