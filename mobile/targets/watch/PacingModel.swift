import Foundation
import SwiftUI

/**
 * The pacing frames the phone mirrors over applicationContext.
 *
 * Byte-identical to the widgets' payload (`WidgetPacingFrame` in
 * src/lib/widgets.ts, decoded by targets/widget/WidgetModel.swift): the watch
 * COMPUTES NOTHING about the budget. Every string, colour and position arrives
 * resolved, so the Outlook strip, the home-screen widgets and the wrist cannot
 * tell three different stories about the same day.
 *
 * There is a frame every 15 minutes of the waking day, which is what lets the
 * pace marker walk on the watch's own clock while the phone is out of reach.
 */

/// One stop of the baked ember gradient.
struct PacingStop: Decodable, Hashable {
    let o: Double
    let c: String
}

struct PacingTile: Decodable, Hashable {
    let value: String
    let label: String
    let color: String
}

struct PacingFrame: Decodable, Hashable {
    let at: String
    /// healthy · ahead · over · low · paused · locked · awaiting
    let state: String
    let figure: String
    let unit: String
    /// A word or an "About" figure: set a step smaller so it holds the slot a
    /// bare duration fills.
    let soft: Bool
    let figureColor: String
    let sub: String
    let subWide: String
    let fill: Double
    let fillColor: String
    /// Where an even day would be by now. Null when over, paused or locked.
    let pace: Double?
    /// Over budget only: the ember gradient, left → right.
    let ember: [PacingStop]?
    let badge: String
    let badgeColor: String
    let tiles: [PacingTile]
}

/// The whole block, as sent. A schema this build does not understand is
/// refused outright rather than half-drawn.
struct WatchPacing: Decodable {
    static let schema = 1

    let schemaVersion: Int
    /// The day key the frames describe.
    let date: String
    let frames: [PacingFrame]
}

extension PacingFrame {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    var date: Date? { PacingFrame.iso.date(from: at) }

    var isDrawable: Bool { state != "locked" && state != "awaiting" }

    /// The home row's one line. The figure alone is ambiguous — "45m" is a
    /// budget left or an overage depending on the state — so the tail is
    /// always spoken.
    var homeSubtitle: String {
        switch state {
        case "over": return "\(figure) over budget"
        case "paused": return "Paused today"
        case "locked": return "Included with Pro"
        case "awaiting": return "Open on your iPhone"
        default: return unit.isEmpty ? "\(figure) left today" : "\(figure) \(unit)"
        }
    }
}

extension WatchPacing {
    private static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// The frame to draw at `now`: the latest one that has started.
    ///
    /// A block describing a day that is no longer today is refused. Yesterday's
    /// budget is not a small error on this screen — it is an invitation to
    /// spend minutes that were already spent.
    func frame(at now: Date = Date()) -> PacingFrame? {
        guard schemaVersion <= WatchPacing.schema else { return nil }
        guard WatchPacing.dayFmt.string(from: now) == date else { return nil }
        var pick: PacingFrame?
        for f in frames {
            guard let d = f.date else { continue }
            if d <= now { pick = f } else { break }
        }
        return pick ?? frames.first
    }
}

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
