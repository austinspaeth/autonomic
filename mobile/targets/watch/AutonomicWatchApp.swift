import SwiftUI
import WatchKit

/// The system relaunches the app (often in the background) when a previous
/// process died with a workout session still active; nothing but this callback
/// can claim that orphan. Without it the app is wedged: every icon tap bounces
/// straight back to the clock face until the user force-quits.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handleActiveWorkoutRecovery() {
        WorkoutManager.shared.recoverOrphanedSession()
    }
}

@main
struct AutonomicWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @StateObject private var relay = PhoneRelay.shared
    @StateObject private var workout = WorkoutManager.shared

    init() {
        PhoneRelay.shared.activate()
        // Also sweep on every cold launch: the recovery callback only fires on
        // the system's own relaunch, and a user tapping the icon after a crash
        // must clear the orphan too.
        WorkoutManager.shared.recoverOrphanedSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(relay)
                .environmentObject(workout)
        }
    }
}
