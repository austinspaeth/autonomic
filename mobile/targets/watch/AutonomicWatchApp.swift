import SwiftUI

@main
struct AutonomicWatchApp: App {
    @StateObject private var relay = PhoneRelay.shared
    @StateObject private var workout = WorkoutManager.shared

    init() {
        PhoneRelay.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(relay)
                .environmentObject(workout)
        }
    }
}
