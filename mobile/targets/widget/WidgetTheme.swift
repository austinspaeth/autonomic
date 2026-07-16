import SwiftUI

/**
 * Shared look for the home-screen widgets: the fixed dark surface from the
 * design comp, the waveform logo mark, and the score gauge — the same 270°
 * arc (135° start, rounded caps, soft glow underlay) as the app's Autonomic
 * Outlook card, so the widget reads as the same dial.
 */

extension Color {
    /// Parse the payload's #rrggbb strings.
    init(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(
            red: Double((v >> 16) & 0xff) / 255,
            green: Double((v >> 8) & 0xff) / 255,
            blue: Double(v & 0xff) / 255
        )
    }
}

enum WTheme {
    static let bg = Color(hex: "#000000")
    static let cell = Color(hex: "#141416")
    static let track = Color(hex: "#242427")
    static let divider = Color.white.opacity(0.05)
    static let text = Color(hex: "#f2f2f5")
    static let textDim = Color(hex: "#8a8a92")
    static let textFaint = Color(hex: "#6a6a72")
    static let accent = Color(hex: "#e03127")
}

/// One 270° arc of the score dial (fraction 0…1 of the full sweep).
private struct GaugeArc: Shape {
    var fraction: Double

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = min(rect.width, rect.height) / 2
        p.addArc(
            center: CGPoint(x: rect.midX, y: rect.midY), radius: r,
            startAngle: .degrees(135), endAngle: .degrees(135 + 270 * max(0.0001, fraction)),
            clockwise: false
        )
        return p
    }
}

/// The Autonomic Outlook dial: track + glow underlay + score arc, with the
/// score number and the outlook pill's word stacked in the middle.
struct ScoreGauge: View {
    let payload: WidgetPayload
    var size: CGFloat = 108
    var scoreFont: CGFloat = 32
    var labelFont: CGFloat = 10

    var body: some View {
        let color = Color(hex: payload.color)
        let frac = min(1, max(0, payload.score / 100))
        let stroke = size / 11
        ZStack {
            GaugeArc(fraction: 1)
                .stroke(WTheme.track, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            if payload.hasScore {
                GaugeArc(fraction: frac)
                    .stroke(color.opacity(0.16), style: StrokeStyle(lineWidth: stroke + 6, lineCap: .round))
                GaugeArc(fraction: frac)
                    .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            }
            VStack(spacing: 1) {
                Text("\(Int(payload.score.rounded()))")
                    .font(.system(size: scoreFont, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(payload.hasScore ? WTheme.text : WTheme.textDim.opacity(0.5))
                Text(payload.label)
                    .font(.system(size: labelFont, weight: .semibold))
                    .foregroundStyle(payload.hasScore ? color : WTheme.textDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, stroke)
        }
        .padding(stroke / 2 + 3)
        .frame(width: size, height: size)
    }
}

/// SDNN · RMSSD · Sleep rows: grade dot, name, day average, up/down vs the
/// trailing week.
struct MetricRows: View {
    let rows: [MetricRow]
    var showTrend = true

    var body: some View {
        VStack(spacing: 11) {
            ForEach(rows, id: \.name) { m in
                HStack(spacing: 8) {
                    Circle().fill(Color(hex: m.color)).frame(width: 7, height: 7)
                    Text(m.name)
                        .font(.system(size: 12.5))
                        .foregroundStyle(WTheme.textDim)
                    Spacer(minLength: 4)
                    (Text(m.value).font(.system(size: 16, weight: .semibold)).foregroundStyle(WTheme.text)
                        + Text(" \(m.unit)").font(.system(size: 10)).foregroundStyle(WTheme.textFaint))
                        .monospacedDigit()
                        .lineLimit(1)
                    if showTrend {
                        Text(m.trend ?? "")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color(hex: m.trendColor ?? "#6a6a72"))
                            .frame(width: 14, alignment: .trailing)
                    }
                }
            }
        }
    }
}

/// One protocol requirement's status mark: a green tick when done, a red ✕
/// when hard-broken (a trigger logged / sleep missed), else an empty ring.
struct ProtocolCheck: View {
    let item: ProtocolItem

    var body: some View {
        ZStack {
            if item.broken {
                Circle().strokeBorder(WTheme.accent, lineWidth: 2)
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(WTheme.accent)
            } else if item.done {
                Circle().fill(Color(hex: "#16a34a"))
                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
            } else {
                Circle().strokeBorder(Color(hex: "#3a3a40"), lineWidth: 2)
            }
        }
        .frame(width: 18, height: 18)
    }
}

/// Today's clean-day checklist: a status mark + label per requirement, capped
/// with a "+N more" line so a long protocol never overflows the widget.
struct ProtocolChecklist: View {
    let items: [ProtocolItem]
    var limit = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(items.prefix(limit), id: \.key) { it in
                HStack(spacing: 9) {
                    ProtocolCheck(item: it)
                    Text(it.label)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(it.done ? WTheme.text : WTheme.textDim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Spacer(minLength: 0)
                }
            }
            if items.count > limit {
                Text("+\(items.count - limit) more")
                    .font(.system(size: 12))
                    .foregroundStyle(WTheme.textFaint)
                    .padding(.leading, 27)
            }
        }
    }
}

/// The same smoothing the app's Sparkline uses (charts.tsx smoothPath, t=0.16).
private func smoothPath(_ pts: [CGPoint]) -> Path {
    var path = Path()
    guard pts.count >= 2 else { return path }
    path.move(to: pts[0])
    let t: CGFloat = 0.16
    for i in 0..<(pts.count - 1) {
        let p0 = i > 0 ? pts[i - 1] : pts[i]
        let p1 = pts[i], p2 = pts[i + 1]
        let p3 = i + 2 < pts.count ? pts[i + 2] : p2
        path.addCurve(
            to: p2,
            control1: CGPoint(x: p1.x + (p2.x - p0.x) * t, y: p1.y + (p2.y - p0.y) * t),
            control2: CGPoint(x: p2.x - (p3.x - p1.x) * t, y: p2.y - (p3.y - p1.y) * t)
        )
    }
    return path
}

/// The app's Sparkline card, drawn from the precomputed payload: min/mid/max
/// gridlines with tick labels, a smooth trace stroked with the vertical
/// grade-zone gradient, a graded dot per day, and the date range underneath.
/// Missing days are bridged, exactly like a Progress card with gaps.
struct AppSparkline: View {
    let spark: Spark

    var body: some View {
        Canvas { ctx, size in
            let padL: CGFloat = 26, padR: CGFloat = 4, padT: CGFloat = 5, padB: CGFloat = 13
            let plotW = size.width - padL - padR
            let plotH = size.height - padT - padB

            // Gridlines + tick labels: ticks arrive [min, mid, max].
            for (i, tick) in spark.ticks.enumerated() {
                let y = padT + plotH * (1 - CGFloat(i) / CGFloat(max(spark.ticks.count - 1, 1)))
                var line = Path()
                line.move(to: CGPoint(x: padL, y: y))
                line.addLine(to: CGPoint(x: padL + plotW, y: y))
                ctx.stroke(line, with: .color(WTheme.track.opacity(0.6)), lineWidth: 1)
                ctx.draw(
                    Text(tick).font(.system(size: 8)).foregroundColor(WTheme.textDim),
                    at: CGPoint(x: padL - 4, y: y), anchor: .trailing
                )
            }

            let n = spark.values.count
            let pts: [(Int, Double)] = spark.values.enumerated().compactMap { i, v in v.map { (i, $0) } }
            if pts.count >= 2 {
                // Same scale the stops were computed against: data range ± 5%.
                let present = pts.map(\.1)
                let dataMin = present.min()!, dataMax = present.max()!
                var span = dataMax - dataMin
                if span == 0 { span = abs(dataMax) != 0 ? abs(dataMax) : 1 }
                let lo = dataMin - span * 0.05, hi = dataMax + span * 0.05
                let xy = pts.map { (i, v) in
                    CGPoint(
                        x: padL + plotW * CGFloat(i) / CGFloat(max(n - 1, 1)),
                        y: padT + plotH * CGFloat(1 - (v - lo) / (hi - lo))
                    )
                }
                let gradient = Gradient(stops: spark.stops.map {
                    .init(color: Color(hex: $0.c), location: $0.o)
                })
                ctx.stroke(
                    smoothPath(xy),
                    with: .linearGradient(
                        gradient,
                        startPoint: CGPoint(x: 0, y: padT),
                        endPoint: CGPoint(x: 0, y: padT + plotH)
                    ),
                    style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
                )
                for (idx, pt) in pts.enumerated() {
                    let color = pt.0 < spark.colors.count ? spark.colors[pt.0] : nil
                    let dot = CGRect(x: xy[idx].x - 2.4, y: xy[idx].y - 2.4, width: 4.8, height: 4.8)
                    ctx.fill(Path(ellipseIn: dot), with: .color(Color(hex: color ?? "#8a8a92")))
                }
            }

            // Date range, like the card's footer.
            ctx.draw(
                Text(spark.start).font(.system(size: 9)).foregroundColor(WTheme.textDim),
                at: CGPoint(x: padL, y: size.height), anchor: .bottomLeading
            )
            ctx.draw(
                Text(spark.end).font(.system(size: 9)).foregroundColor(WTheme.textDim),
                at: CGPoint(x: padL + plotW, y: size.height), anchor: .bottomTrailing
            )
        }
    }
}
