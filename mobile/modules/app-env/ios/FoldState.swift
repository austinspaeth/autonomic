import UIKit

/**
 * What a folding iPhone (iPhone Duo) is doing right now, for the JS navigation
 * layout (src/lib/fold.ts decides, src/store/fold.ts is the shell).
 *
 * Apple deliberately ships NO "is this an iPhone Duo" API and says to adapt to
 * the environment instead, so this reports environment facts and nothing that
 * names a model:
 *
 * - `hinge`: the UIHingeInteraction's status, or nil. A hinge is only ever
 *   reported by a device that has one, which is the honest version of "is this
 *   a foldable". It is nil until the first update lands and on every other
 *   phone, so JS reads nil as "not a foldable" and keeps the ordinary layout.
 * - `hSize` / `vSize`: the window's size classes. Apple's own rule for "which
 *   display": the inner display is regular in both, the outer one is not.
 * - `occlusions`: reserved regions of kind occlusion (the camera on the outer
 *   display), in window points. iOS 27.1 only; empty below it.
 * - `insets`: the window's safe area, which on the outer display carries the
 *   trailing strip the system keeps clear beside the camera.
 *
 * Everything here touches UIKit, so every entry point is called on main.
 */
@MainActor
final class FoldState {
  static let shared = FoldState()

  /** Called on main whenever something JS lays out against may have moved. */
  var onChange: (() -> Void)?

  /** -1 = no hinge has reported (not a foldable, or not yet). */
  private var hingeStatus: Int = -1
  private weak var window: UIWindow?
  private var interaction: UIInteraction?
  private var traitToken: AnyObject?

  private func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let active = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return active?.keyWindow ?? active?.windows.first
  }

  /**
   * Attach the observers to the current key window. Idempotent, and re-attaches
   * when the window changed (a scene that disconnected and came back), since an
   * interaction on a dead window reports nothing.
   */
  @discardableResult
  func start() -> Bool {
    guard let win = keyWindow() else { return false }
    if win === window { return true }
    detach()
    window = win

    if #available(iOS 27.1, *) {
      let hinge = UIHingeInteraction { [weak self] _, update in
        guard let self else { return }
        // A nil hinge means the interaction left a hierarchy that reports one.
        if let h = update.hinge {
          switch h.status {
          case .closed: self.hingeStatus = 1
          case .partiallyOpen: self.hingeStatus = 2
          case .fullyOpen: self.hingeStatus = 3
          default: self.hingeStatus = 0
          }
        } else {
          self.hingeStatus = -1
        }
        self.onChange?()
      }
      win.addInteraction(hinge)
      interaction = hinge
    }

    if #available(iOS 17.0, *) {
      let traits: [UITrait] = [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
      traitToken = win.registerForTraitChanges(traits) { [weak self] (_: UIWindow, _: UITraitCollection) in
        self?.onChange?()
      } as AnyObject
    }
    return true
  }

  private func detach() {
    if let win = window, let i = interaction { win.removeInteraction(i) }
    if #available(iOS 17.0, *), let win = window, let t = traitToken as? UITraitChangeRegistration {
      win.unregisterForTraitChanges(t)
    }
    interaction = nil
    traitToken = nil
    hingeStatus = -1
  }

  private static func sizeClass(_ c: UIUserInterfaceSizeClass) -> String {
    switch c {
    case .compact: return "compact"
    case .regular: return "regular"
    default: return "unspecified"
    }
  }

  private static func rect(_ r: CGRect) -> [String: Double] {
    ["x": Double(r.origin.x), "y": Double(r.origin.y), "w": Double(r.width), "h": Double(r.height)]
  }

  /** The current facts, or an empty dictionary with no window to read. */
  func snapshot() -> [String: Any] {
    start()
    guard let win = window else { return [:] }
    let t = win.traitCollection
    let i = win.safeAreaInsets
    var out: [String: Any] = [
      "hSize": FoldState.sizeClass(t.horizontalSizeClass),
      "vSize": FoldState.sizeClass(t.verticalSizeClass),
      "width": Double(win.bounds.width),
      "height": Double(win.bounds.height),
      "insets": ["top": Double(i.top), "left": Double(i.left), "bottom": Double(i.bottom), "right": Double(i.right)],
      "occlusions": [[String: Double]](),
    ]
    switch hingeStatus {
    case 0: out["hinge"] = "unknown"
    case 1: out["hinge"] = "closed"
    case 2: out["hinge"] = "partial"
    case 3: out["hinge"] = "open"
    default: break
    }
    if #available(iOS 27.1, *) {
      out["occlusions"] = win.reservedRegions(kind: .occlusion)
        .filter { $0.isActive }
        .map { FoldState.rect($0.frame) }
    }
    return out
  }
}
