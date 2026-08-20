import ExpoModulesCore
import WidgetKit

/**
 * Phone side of the home-screen widgets: hands the JS-built payload
 * (src/lib/widgets.ts) to the widget extension. Widgets run in their own
 * process, so the payload crosses over via the shared app-group defaults;
 * the reload call tells WidgetKit the timelines are stale.
 */
private let APP_GROUP = "group.com.autonomic.journal"
private let DATA_KEY = "widget.today.v1"

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("setWidgetData") { (json: String) in
      guard let defaults = UserDefaults(suiteName: APP_GROUP) else {
        throw Exception(name: "AppGroupUnavailable", description: "App group \(APP_GROUP) is not available — check entitlements")
      }
      defaults.set(json, forKey: DATA_KEY)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
