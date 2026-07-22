import Foundation
import WatchConnectivity

/// A quick-loggable symptom mirrored from the phone's registry (id + label).
struct SymptomType: Identifiable, Equatable {
    let id: String
    let label: String
}

/**
 * Watch side of the phone link.
 *
 * Outbound: finished stand-test results. Each result is persisted to a local
 * outbox before transfer and only removed when the phone acks its id — so a
 * result survives relaunches, reboots, and phone unavailability. Transfers go
 * via transferUserInfo (system-queued, delivered even when the phone app is
 * backgrounded); on every activation we re-queue outbox items that have no
 * outstanding transfer. The phone dedupes by id, so re-delivery is safe.
 *
 * Inbound: applicationContext { pro, age, sex } mirrored from the phone —
 * cached in UserDefaults for cold offline launches.
 */
final class PhoneRelay: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = PhoneRelay()

    private let outboxKey = "relay.outbox"
    private let defaults = UserDefaults.standard
    /// All outbox read-modify-writes hop here: send() comes from the main
    /// thread while acks arrive on WCSession's background queue, and two
    /// interleaved read-modify-writes of the array can drop a result or
    /// resurrect an acked one.
    private let outboxQueue = DispatchQueue(label: "relay.outbox")

    /// nil until the first context ever arrives (fresh install, phone app
    /// never opened) — the UI shows "set up on iPhone" in that state.
    @Published var pro: Bool?
    @Published var age: Int?
    @Published var sex: String?
    /// Quick-log symptom list mirrored from the phone (empty until first sync).
    @Published var symptomTypes: [SymptomType] = []

    override private init() {
        super.init()
        if defaults.object(forKey: "ctx.pro") != nil {
            pro = defaults.bool(forKey: "ctx.pro")
            age = defaults.object(forKey: "ctx.age") as? Int
            sex = defaults.string(forKey: "ctx.sex")
        }
        if let raw = defaults.array(forKey: "ctx.symptomTypes") as? [[String: Any]] {
            symptomTypes = Self.parseSymptomTypes(raw)
        }
    }

    private static func parseSymptomTypes(_ raw: [[String: Any]]) -> [SymptomType] {
        raw.compactMap { d in
            guard let id = d["id"] as? String, let label = d["label"] as? String else { return nil }
            return SymptomType(id: id, label: label)
        }
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - Results outbox

    private func outbox() -> [[String: Any]] {
        defaults.array(forKey: outboxKey) as? [[String: Any]] ?? []
    }

    private func saveOutbox(_ box: [[String: Any]]) {
        defaults.set(box, forKey: outboxKey)
    }

    func send(result: [String: Any]) {
        guard result["id"] is String else { return }
        outboxQueue.async {
            var box = self.outbox()
            box.append(result)
            self.saveOutbox(box)
            if WCSession.default.activationState == .activated {
                WCSession.default.transferUserInfo(result)
            }
        }
    }

    /// Re-queue outbox items with no outstanding transfer (e.g. after a
    /// relaunch where the system dropped the queue, or a failed transfer).
    private func flushOutbox() {
        outboxQueue.async {
            let session = WCSession.default
            guard session.activationState == .activated else { return }
            let inFlight = Set(session.outstandingUserInfoTransfers.compactMap { $0.userInfo["id"] as? String })
            for item in self.outbox() {
                guard let id = item["id"] as? String, !inFlight.contains(id) else { continue }
                session.transferUserInfo(item)
            }
        }
    }

    private func handleAck(_ id: String) {
        outboxQueue.async {
            self.saveOutbox(self.outbox().filter { ($0["id"] as? String) != id })
            for transfer in WCSession.default.outstandingUserInfoTransfers
            where (transfer.userInfo["id"] as? String) == id {
                transfer.cancel()
            }
        }
    }

    // MARK: - Inbound context

    private func applyContext(_ context: [String: Any]) {
        guard !context.isEmpty, let proFlag = context["pro"] as? Bool else { return }
        defaults.set(proFlag, forKey: "ctx.pro")
        if let a = context["age"] as? Int { defaults.set(a, forKey: "ctx.age") } else { defaults.removeObject(forKey: "ctx.age") }
        if let s = context["sex"] as? String { defaults.set(s, forKey: "ctx.sex") } else { defaults.removeObject(forKey: "ctx.sex") }
        var parsedSymptoms: [SymptomType]?
        if let raw = context["symptomTypes"] as? [[String: Any]] {
            defaults.set(raw, forKey: "ctx.symptomTypes")
            parsedSymptoms = Self.parseSymptomTypes(raw)
        }
        DispatchQueue.main.async {
            self.pro = proFlag
            self.age = context["age"] as? Int
            self.sex = context["sex"] as? String
            if let parsedSymptoms { self.symptomTypes = parsedSymptoms }
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        applyContext(session.receivedApplicationContext)
        flushOutbox()
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let ack = userInfo["ack"] as? String { handleAck(ack) }
    }

    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        // Delivery failed — the item is still in the outbox; retried on next activation.
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        flushOutbox()
    }
}
