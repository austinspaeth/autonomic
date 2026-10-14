import Foundation
import MetricKit

/**
 * iOS half of the native crash log: MetricKit's diagnostics, written to the
 * same file the Android uncaught-exception handler writes, in the same row
 * shape, so `src/lib/diagnostics/nativeCrash.ts` reads both.
 *
 * WHY METRICKIT AND NOT A HANDLER. `NSSetUncaughtExceptionHandler` sees ObjC
 * exceptions, and almost nothing that kills an iOS build is one — a Swift
 * trap, a force-unwrap, a bad access, a watchdog kill are all signals. A
 * signal handler in-process is a real project with its own failure modes (it
 * runs in a process that is already broken, on a corrupted stack, with
 * async-signal-safety rules that MMKV, Foundation and Swift all break).
 * MetricKit is the system's own record of the same crashes, collected by the
 * OS after the fact and handed to the app on the launch after, which is also
 * exactly when the JS side already drains the Android file. The one cost is
 * that a MetricKit crash carries the WINDOW it was collected in rather than
 * the instant, which is why the row says `source: metrickit` — the JS side
 * then matches a context trail to it by session rather than by time.
 *
 * What a row carries: the signal or Mach exception as its TYPE (`SIGSEGV`,
 * `EXC_BAD_ACCESS`), the termination reason, the ObjC exception name and
 * message when there was one (iOS 17+), the crashing frame as binary name plus
 * a hex offset (the call stack tree is unsymbolicated — Xcode Organizer has the
 * readable stack; this row exists to COUNT, by build and by phone), and the
 * version that CRASHED, because the fault report stamps the version that
 * SENDS, and after an update the two differ. Hangs ride the same file as
 * `kind: hang`: a main thread stuck for seconds is what a JavaScript infinite
 * loop looks like from outside the process, and the app came back from it.
 *
 * Nothing here is identifying. The binary UUID is deliberately not kept (the
 * version names the dSYM), and every string is clipped.
 */
final class CrashLog: NSObject, MXMetricManagerSubscriber {
  static let shared = CrashLog()

  /** Same name the Android module uses, in the app's own support directory. */
  private static let fileName = "native-crashes.json"
  /** Rows kept on disk. A phone crashing six ways between two launches has
   *  one problem; the newest are the ones worth carrying. */
  private static let maxStored = 5
  /** Per-field cap. JS redacts and truncates again before anything leaves. */
  private static let maxField = 300
  /** An ObjC exception's message leads the row, so it is held shorter than a
   *  field: the reason and the frame behind it have to fit in the 140 the
   *  fault route keeps. */
  private static let maxExceptionMessage = 90

  /** Serialises file access: MetricKit calls back on its own queue. */
  private static let queue = DispatchQueue(label: "care.autonomic.appenv.crashlog")

  private var started = false
  /** Set by the module once JS is listening; a row written after launch is
   *  announced so the drain can run again without waiting for the next one. */
  var onWrite: (() -> Void)?

  /** Subscribe, once. Returns whether anything is listening. Called from the
   *  AppDelegate at real launch (deliveries arrive within seconds of it) and
   *  again, harmlessly, from JS. */
  @discardableResult
  func start() -> Bool {
    if started { return true }
    started = true
    MXMetricManager.shared.add(self)
    return true
  }

  // MARK: - MXMetricManagerSubscriber

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    var rows: [[String: Any]] = []
    for payload in payloads {
      let at = Int(payload.timeStampEnd.timeIntervalSince1970 * 1000)
      for crash in payload.crashDiagnostics ?? [] { rows.append(Self.crashRow(crash, at: at)) }
      for hang in payload.hangDiagnostics ?? [] { rows.append(Self.hangRow(hang, at: at)) }
    }
    if rows.isEmpty { return }
    Self.queue.sync { Self.append(rows) }
    onWrite?()
  }

  // Metric payloads (daily aggregates) are not wanted; the protocol's method is
  // optional and left unimplemented on purpose.

  // MARK: - rows

  private static func crashRow(_ c: MXCrashDiagnostic, at: Int) -> [String: Any] {
    var row: [String: Any] = ["at": at, "kind": "crash", "source": "metrickit"]
    row["type"] = signalName(c.signal?.intValue) ?? machName(c.exceptionType?.intValue) ?? "Crash"
    row["version"] = clip(c.applicationVersion)

    // Ordered by what a fix needs, because the fault route truncates the line
    // at 140 characters and truncation eats the END: the ObjC exception's own
    // words first (the whole finding, when there is one), then why the OS
    // ended the process, then the memory clause, then the frame.
    var parts: [String] = []
    if #available(iOS 17.0, *), let reason = c.exceptionReason {
      row["causeType"] = clip(reason.exceptionName)
      parts.append(String(reason.composedMessage.prefix(maxExceptionMessage)))
    }
    if let reason = c.terminationReason, !reason.isEmpty { parts.append(reason) }
    if let vm = c.virtualMemoryRegionInfo, !vm.isEmpty {
      // "0 is not in any region. Bytes before following region: 4295000064 ..."
      // — the first clause is the finding; the rest is addresses.
      parts.append(String(vm.split(separator: ".").first ?? Substring(vm)))
    }
    if let frame = topFrame(c.callStackTree) {
      row["frame"] = frame
      parts.append(frame)
    }
    row["message"] = clip(parts.joined(separator: " | "))
    return row
  }

  private static func hangRow(_ h: MXHangDiagnostic, at: Int) -> [String: Any] {
    var row: [String: Any] = ["at": at, "kind": "hang", "source": "metrickit", "type": "Hang"]
    row["version"] = clip(h.applicationVersion)
    let seconds = Int(h.hangDuration.converted(to: .seconds).value.rounded())
    var parts = ["main thread hung \(seconds)s"]
    if let frame = topFrame(h.callStackTree) {
      row["frame"] = frame
      parts.append(frame)
    }
    row["message"] = clip(parts.joined(separator: " | "))
    return row
  }

  /**
   * The crashing frame, from the unsymbolicated tree: `Binary +0xoffset`, and
   * when that binary is not this app, the nearest frame above it that is —
   * `libswiftCore +0x1a2b < Autonomic +0x3c4d` — since "which of OUR calls got
   * here" is the half a fix needs.
   *
   * The tree's roots are the OUTERMOST frames and `subFrames` descend toward
   * the crash site, so the leaf of the attributed thread's first path is it.
   */
  private static func topFrame(_ tree: MXCallStackTree) -> String? {
    guard
      let json = try? JSONSerialization.jsonObject(with: tree.jsonRepresentation()) as? [String: Any],
      let stacks = json["callStacks"] as? [[String: Any]], !stacks.isEmpty
    else { return nil }
    let stack = stacks.first { ($0["threadAttributed"] as? Bool) == true } ?? stacks[0]
    guard var frame = (stack["callStackRootFrames"] as? [[String: Any]])?.first else { return nil }
    let app = Bundle.main.infoDictionary?["CFBundleExecutable"] as? String
    var ownFrame: [String: Any]? = (frame["binaryName"] as? String) == app ? frame : nil
    var depth = 0
    while let subs = frame["subFrames"] as? [[String: Any]], let next = subs.first, depth < 512 {
      frame = next
      depth += 1
      if let app = app, (frame["binaryName"] as? String) == app { ownFrame = frame }
    }
    let leaf = describe(frame)
    if let own = ownFrame, (own["binaryName"] as? String) != (frame["binaryName"] as? String) {
      return "\(leaf) < \(describe(own))"
    }
    return leaf
  }

  private static func describe(_ frame: [String: Any]) -> String {
    let binary = (frame["binaryName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "?"
    if let offset = frame["offsetIntoBinaryTextSegment"] as? Int {
      return "\(binary) +0x\(String(offset, radix: 16))"
    }
    return binary
  }

  private static func signalName(_ n: Int?) -> String? {
    guard let n = n else { return nil }
    switch n {
    case 4: return "SIGILL"
    case 5: return "SIGTRAP"
    case 6: return "SIGABRT"
    case 7: return "SIGEMT"
    case 8: return "SIGFPE"
    case 9: return "SIGKILL"
    case 10: return "SIGBUS"
    case 11: return "SIGSEGV"
    case 12: return "SIGSYS"
    case 13: return "SIGPIPE"
    default: return "SIG\(n)"
    }
  }

  private static func machName(_ n: Int?) -> String? {
    guard let n = n else { return nil }
    switch n {
    case 1: return "EXC_BAD_ACCESS"
    case 2: return "EXC_BAD_INSTRUCTION"
    case 3: return "EXC_ARITHMETIC"
    case 5: return "EXC_SOFTWARE"
    case 6: return "EXC_BREAKPOINT"
    case 10: return "EXC_CRASH"
    case 11: return "EXC_RESOURCE"
    case 12: return "EXC_GUARD"
    default: return "EXC_\(n)"
    }
  }

  private static func clip(_ s: String?) -> String {
    guard let s = s else { return "" }
    return s.count > maxField ? String(s.prefix(maxField)) : s
  }

  // MARK: - the file

  private static var fileURL: URL {
    let fm = FileManager.default
    let dir = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? fm.temporaryDirectory
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent(fileName)
  }

  private static func readArray() -> [Any] {
    guard
      let data = try? Data(contentsOf: fileURL),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any]
    else { return [] }
    return parsed
  }

  private static func append(_ rows: [[String: Any]]) {
    var kept = readArray()
    kept.append(contentsOf: rows)
    if kept.count > maxStored { kept = Array(kept.suffix(maxStored)) }
    guard let data = try? JSONSerialization.data(withJSONObject: kept) else { return }
    try? data.write(to: fileURL, options: .atomic)
  }

  /** The stored rows as raw JSON, clearing them. `""` when there are none. */
  static func take() -> String {
    queue.sync {
      guard let data = try? Data(contentsOf: fileURL), let text = String(data: data, encoding: .utf8) else { return "" }
      try? FileManager.default.removeItem(at: fileURL)
      return text
    }
  }
}
