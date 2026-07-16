import WidgetKit
import SwiftUI

/**
 * Home-screen widgets (design comp: iOS Widgets, turn 17):
 *  · Score (small)            — the Outlook dial + today's category word
 *  · Start HRV (small)        — one-tap capture launcher
 *  · Score & metrics (medium) — dial beside graded SDNN/RMSSD/Sleep averages
 *  · Today's numbers (medium) — 2×3 grid of the day's numbers
 *  · Overview (large)         — dial + rows + 7-day RMSSD + capture button
 */

// MARK: - Small · score dial

struct ScoreWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Autonomic")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(WTheme.textDim)
                Spacer()
            }
            Spacer(minLength: 2)
            ScoreGauge(payload: entry.payload, size: 112, scoreFont: 33, labelFont: 10)
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(WTheme.bg, for: .widget)
    }
}

struct ScoreWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "score", provider: TodayProvider()) { entry in
            ScoreWidgetView(entry: entry)
        }
        .configurationDisplayName("Autonomic Score")
        .description("Today's autonomic score and how the day is grading.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

// MARK: - Small · start HRV

struct StartHrvWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Quick reading")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color(hex: "#e8807c"))
            Spacer()
            HStack {
                Spacer()
                ZStack {
                    Circle()
                        .fill(WTheme.accent)
                        .frame(width: 60, height: 60)
                        .shadow(color: WTheme.accent.opacity(0.4), radius: 12, y: 6)
                    Image(systemName: "heart.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(.white)
                }
                Spacer()
            }
            Spacer()
            Text("Start HRV")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(WTheme.text)
        }
        .padding(15)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(hex: "#2a0e10"), WTheme.bg, WTheme.bg],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
        .widgetURL(CAPTURE_URL)
    }
}

struct StartHrvWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "startHrv", provider: TodayProvider()) { _ in
            StartHrvWidgetView()
        }
        .configurationDisplayName("Start HRV")
        .description("Jump straight into an HRV reading.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

// MARK: - Medium · score + graded metrics

struct ScoreMetricsWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        HStack(spacing: 16) {
            ScoreGauge(payload: entry.payload, size: 104, scoreFont: 30, labelFont: 9.5)
                .frame(maxHeight: .infinity)
            Rectangle().fill(WTheme.divider).frame(width: 1)
            MetricRows(rows: entry.payload.rows)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .containerBackground(WTheme.bg, for: .widget)
    }
}

struct ScoreMetricsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "scoreMetrics", provider: TodayProvider()) { entry in
            ScoreMetricsWidgetView(entry: entry)
        }
        .configurationDisplayName("Score & Metrics")
        .description("Today's score with graded SDNN, RMSSD and sleep averages.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

// MARK: - Medium · today's numbers

struct TodayNumbersWidgetView: View {
    let entry: TodayEntry

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                WaveformLogo().frame(width: 15, height: 10)
                Text("Today's numbers")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(WTheme.textDim)
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(entry.payload.grid, id: \.name) { m in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(m.name)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(WTheme.textDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        (Text(m.value).font(.system(size: 18, weight: .semibold)).foregroundStyle(WTheme.text)
                            + Text(" \(m.unit)").font(.system(size: 10)).foregroundStyle(WTheme.textFaint))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(WTheme.cell, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(15)
        .containerBackground(WTheme.bg, for: .widget)
    }
}

struct TodayNumbersWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "todayNumbers", provider: TodayProvider()) { entry in
            TodayNumbersWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Numbers")
        .description("SDNN, RMSSD, pNN50, resting HR, sleep and water at a glance.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

// MARK: - Large · overview

struct OverviewWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                WaveformLogo().frame(width: 17, height: 12)
                Text("Autonomic")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(hex: "#cfcfd6"))
                Spacer()
                Text("Today")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(WTheme.textFaint)
            }
            .padding(.bottom, 12)

            HStack(spacing: 16) {
                ScoreGauge(payload: entry.payload, size: 110, scoreFont: 32, labelFont: 10)
                MetricRows(rows: entry.payload.rows)
                    .frame(maxWidth: .infinity)
            }
            .padding(.bottom, 12)

            Rectangle().fill(WTheme.divider).frame(height: 1)
                .padding(.bottom, 10)

            Text("RMSSD · 14 DAYS")
                .font(.system(size: 10, weight: .bold))
                .kerning(0.5)
                .foregroundStyle(Color(hex: "#7c7c85"))
                .padding(.bottom, 4)
            if let spark = entry.payload.spark {
                AppSparkline(spark: spark)
                    .frame(height: 62)
            } else {
                Text("Not enough readings yet")
                    .font(.system(size: 11))
                    .foregroundStyle(WTheme.textFaint)
                    .frame(maxWidth: .infinity, minHeight: 62)
            }

            Spacer(minLength: 10)

            Link(destination: CAPTURE_URL) {
                HStack(spacing: 8) {
                    Image(systemName: "heart.fill").font(.system(size: 14))
                    Text("Start HRV Reading").font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(WTheme.accent, in: RoundedRectangle(cornerRadius: 13))
            }
        }
        .padding(18)
        .containerBackground(WTheme.bg, for: .widget)
    }
}

struct OverviewWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "overview", provider: TodayProvider()) { entry in
            OverviewWidgetView(entry: entry)
        }
        .configurationDisplayName("Autonomic Overview")
        .description("Score, graded metrics, the RMSSD week and one-tap capture.")
        .supportedFamilies([.systemLarge])
        .contentMarginsDisabled()
    }
}

// MARK: - Bundle

@main
struct AutonomicWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ScoreWidget()
        ScoreMetricsWidget()
        OverviewWidget()
        TodayNumbersWidget()
        StartHrvWidget()
    }
}

// MARK: - Previews

#Preview("Score", as: .systemSmall) { ScoreWidget() } timeline: {
    TodayEntry(date: .now, payload: .sample)
    TodayEntry(date: .now, payload: .awaiting)
}
#Preview("Score & metrics", as: .systemMedium) { ScoreMetricsWidget() } timeline: {
    TodayEntry(date: .now, payload: .sample)
}
#Preview("Overview", as: .systemLarge) { OverviewWidget() } timeline: {
    TodayEntry(date: .now, payload: .sample)
}
