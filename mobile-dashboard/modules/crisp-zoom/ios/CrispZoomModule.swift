import ExpoModulesCore
import UIKit

/* A container for content that is shown under a scale transform.
 *
 * A transform scales what a view has ALREADY drawn: text and charts are
 * rasterized at the screen's resolution and then stretched, which is why a
 * zoomed-in board read as blurred. Every UIView draws at its own
 * `contentScaleFactor`, so the fix is to raise that on everything inside to
 * (screen scale x zoom) and ask it to draw again. The result is drawn at the
 * size it is shown, which is the difference between resizing and stretching.
 *
 * Views come and go inside it (a card mounts, a chart re-renders) with no
 * hook this view can observe from outside, so while a zoom is in force it
 * re-walks its subtree a few times a second. The walk only touches a view
 * whose factor is wrong, so a settled board costs a traversal and nothing
 * else. At zoom 1 the timer is off and every view is left exactly as UIKit
 * made it.
 */
public class CrispZoomModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CrispZoom")

    View(CrispZoomView.self) {
      Prop("zoom") { (view: CrispZoomView, zoom: Double) in
        view.setZoom(CGFloat(zoom))
      }
    }
  }
}

final class CrispZoomView: ExpoView {
  private var zoom: CGFloat = 1
  private var timer: Timer?

  func setZoom(_ next: CGFloat) {
    let clamped = max(0.25, min(4, next.isFinite ? next : 1))
    guard clamped != zoom else { return }
    zoom = clamped
    apply()
    schedule()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    apply()
    schedule()
  }

  deinit {
    timer?.invalidate()
  }

  private func schedule() {
    timer?.invalidate()
    timer = nil
    // Nothing to keep up with at zoom 1, or once off screen.
    guard window != nil, abs(zoom - 1) > 0.001 else { return }
    let t = Timer(timeInterval: 0.3, repeats: true) { [weak self] _ in self?.apply() }
    t.tolerance = 0.1
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  private func apply() {
    let screen = window?.screen.scale ?? UIScreen.main.scale
    /* Never below the screen's own scale: drawing a zoomed-OUT board at a
       lower resolution would save nothing worth having and soften it. */
    let target = screen * max(1, zoom)
    for sub in subviews { raise(sub, to: target) }
  }

  private func raise(_ view: UIView, to target: CGFloat) {
    if abs(view.contentScaleFactor - target) > 0.01 {
      view.contentScaleFactor = target
      view.layer.contentsScale = target
      view.setNeedsDisplay()
    }
    if let subs = view.layer.sublayers {
      for layer in subs where layer.delegate == nil && abs(layer.contentsScale - target) > 0.01 {
        // Shape and text layers a view owns directly (chart paths).
        layer.contentsScale = target
        layer.setNeedsDisplay()
      }
    }
    for sub in view.subviews { raise(sub, to: target) }
  }
}
