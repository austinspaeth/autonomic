import ExpoModulesCore
import HealthKit

/**
 * The HealthKit reads and writes the kingstinct library cannot express.
 *
 * Three things live here, and they are here for the same reason: the JS
 * bridge speaks in type-identifier strings, and these are not category or
 * quantity types.
 *
 *  - ECG samples: classification, symptoms status, sampling frequency, average
 *    heart rate and the full lead-I voltage waveform (microvolts). All
 *    interval/HRV math is done in JS from the waveform (src/lib/health/ecg.ts).
 *  - Deleting a CATEGORY sample this app wrote (a replaced menstrual flow).
 *  - MEDICATION DOSE EVENTS (iOS 26+): the Health app's own medication log.
 *    `HKMedicationDoseEvent` carries the dose, the unit and the log status but
 *    NOT the medication's name — that lives on `HKUserAnnotatedMedication`,
 *    reached through its own query and joined on the concept identifier. Both
 *    halves need their own read authorization, which is why `requestMedicationAuth`
 *    is separate from the ECG request: it is asked from a tap, never from a
 *    launch path (src/lib/health/index.ts, scope 'logs').
 */
public class EcgHealthModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("EcgHealth")

    AsyncFunction("isAvailable") { () -> Bool in
      if #available(iOS 14.0, *) {
        return HKHealthStore.isHealthDataAvailable()
      }
      return false
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      guard #available(iOS 14.0, *) else {
        promise.resolve(false)
        return
      }
      var readTypes = Set<HKObjectType>()
      readTypes.insert(HKObjectType.electrocardiogramType())
      if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) {
        readTypes.insert(hr)
      }
      self.store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
        if let error = error {
          promise.reject("ECG_AUTH", error.localizedDescription)
        } else {
          promise.resolve(success)
        }
      }
    }

    // Delete the CATEGORY samples of one type that THIS APP saved inside a
    // window. The kingstinct library can only delete quantity samples, and
    // replacing a day's menstrual flow (an edit in the journal) needs the old
    // sample gone first, or every app reading Apple Health sees two flows on
    // one day. Restricted to HKSource.default() so another app's entry for the
    // same day is never touched; HealthKit would refuse that anyway.
    AsyncFunction("deleteOwnCategory") { (typeIdentifier: String, startMs: Double, endMs: Double, promise: Promise) in
      let id = HKCategoryTypeIdentifier(rawValue: typeIdentifier)
      guard let type = HKObjectType.categoryType(forIdentifier: id) else {
        promise.reject("CYCLE_TYPE", "Unknown category type \(typeIdentifier)")
        return
      }
      let window = HKQuery.predicateForSamples(
        withStart: Date(timeIntervalSince1970: startMs / 1000.0),
        end: Date(timeIntervalSince1970: endMs / 1000.0),
        options: []
      )
      let ours = HKQuery.predicateForObjects(from: HKSource.default())
      let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [window, ours])
      self.store.deleteObjects(of: type, predicate: predicate) { _, _, error in
        // "Nothing matched" is success for a replace: there was nothing of
        // ours to remove.
        if let error = error as NSError?, error.code != HKError.Code.errorNoData.rawValue {
          promise.reject("CYCLE_DELETE", error.localizedDescription)
        } else {
          promise.resolve(true)
        }
      }
    }

    // Is the Health app's medication log readable on this OS at all? iOS 26
    // introduced it; everything below is a no-op under that, and the JS side
    // treats `false` as "this phone has no medication log" rather than as a
    // failure (src/lib/health/index.ts).
    AsyncFunction("medicationsAvailable") { () -> Bool in
      guard HKHealthStore.isHealthDataAvailable() else { return false }
      if #available(iOS 26.0, *) { return true }
      return false
    }

    // Medication READ authorization: the dose events AND the medication list,
    // which is the only place a dose's name lives. Its own request, never
    // folded into the ECG one above: that one rides every launch-path
    // `requestAuth`, and a permission sheet nobody tapped anything to get is
    // the nag src/lib/health/askedAuth.ts exists to prevent.
    AsyncFunction("requestMedicationAuth") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      guard #available(iOS 26.0, *) else {
        promise.resolve(false)
        return
      }
      let readTypes: Set<HKObjectType> = [
        HKObjectType.medicationDoseEventType(),
        HKObjectType.userAnnotatedMedicationType(),
      ]
      self.store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
        // A refusal is not an error here: the caller's answer is "no doses",
        // and the JS read degrades to an empty day either way.
        if error != nil { promise.resolve(false) } else { promise.resolve(success) }
      }
    }

    // Doses the person logged as TAKEN inside [startMs, endMs). Each row
    // carries its medication's name, its dose and unit, and who wrote it.
    AsyncFunction("queryMedications") { (startMs: Double, endMs: Double, limit: Int, promise: Promise) in
      guard #available(iOS 26.0, *) else {
        promise.resolve([[String: Any]]())
        return
      }
      self.queryMedications(startMs: startMs, endMs: endMs, limit: max(1, limit), promise: promise)
    }

    // Query ECG samples recorded at or after `sinceMs` (epoch ms). `limit` caps
    // how many samples are returned, most-recent first.
    AsyncFunction("queryEcg") { (sinceMs: Double, limit: Int, promise: Promise) in
      guard #available(iOS 14.0, *) else {
        promise.resolve([[String: Any]]())
        return
      }
      self.queryEcg(sinceMs: sinceMs, limit: max(1, limit), promise: promise)
    }
  }

  @available(iOS 14.0, *)
  private func queryEcg(sinceMs: Double, limit: Int, promise: Promise) {
    let ecgType = HKObjectType.electrocardiogramType()
    let start = sinceMs > 0 ? Date(timeIntervalSince1970: sinceMs / 1000.0) : nil
    let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [])
    let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]

    let query = HKSampleQuery(sampleType: ecgType, predicate: predicate, limit: limit, sortDescriptors: sort) { [weak self] _, samples, error in
      guard let self = self else { promise.resolve([[String: Any]]()); return }
      guard error == nil, let ecgs = samples as? [HKElectrocardiogram], !ecgs.isEmpty else {
        promise.resolve([[String: Any]]())
        return
      }

      let group = DispatchGroup()
      let lock = NSLock()
      var out = [[String: Any]]()

      for ecg in ecgs {
        group.enter()
        var voltages = [Double]()

        let voltageQuery = HKElectrocardiogramQuery(ecg) { _, result in
          switch result {
          case .measurement(let measurement):
            if let q = measurement.quantity(for: .appleWatchSimilarToLeadI) {
              voltages.append(q.doubleValue(for: HKUnit.voltUnit(with: .micro)))
            }
          case .done:
            var dict: [String: Any] = [
              "uuid": ecg.uuid.uuidString,
              "start": ecg.startDate.timeIntervalSince1970 * 1000.0,
              "end": ecg.endDate.timeIntervalSince1970 * 1000.0,
              "classification": Self.classificationString(ecg.classification),
              "symptomsStatus": Self.symptomsString(ecg.symptomsStatus),
              "numberOfVoltageMeasurements": ecg.numberOfVoltageMeasurements,
              "voltages": voltages,
            ]
            if let freq = ecg.samplingFrequency?.doubleValue(for: HKUnit.hertz()) {
              dict["samplingFrequency"] = freq
            }
            let bpm = HKUnit.count().unitDivided(by: HKUnit.minute())
            if let avg = ecg.averageHeartRate?.doubleValue(for: bpm) {
              dict["averageHeartRate"] = avg
            }
            lock.lock(); out.append(dict); lock.unlock()
            group.leave()
          case .error:
            group.leave()
          @unknown default:
            group.leave()
          }
        }
        self.store.execute(voltageQuery)
      }

      group.notify(queue: .main) {
        // Preserve most-recent-first ordering from the sample query.
        out.sort { (a, b) -> Bool in
          let ta = (a["start"] as? Double) ?? 0
          let tb = (b["start"] as? Double) ?? 0
          return ta > tb
        }
        promise.resolve(out)
      }
    }
    store.execute(query)
  }

  /**
   * The medication list, then the dose events, joined on the concept identifier.
   *
   * The order matters: a dose event names its medication only by
   * `medicationConceptIdentifier`, so without the list a row has a dose and no
   * subject. A dose whose medication is not in the list (deleted from Health,
   * or the list half of the permission refused) is DROPPED rather than filed as
   * an unnamed medication — the JS side matches on the name, so a nameless row
   * could only ever become a wrong entry or a dead one.
   *
   * `HKHealthConceptIdentifier` is documented as stable and comparable, so it
   * is used directly as the dictionary key (NSMutableDictionary, which hashes
   * through isEqual/hash rather than Swift's Hashable).
   */
  @available(iOS 26.0, *)
  private func queryMedications(startMs: Double, endMs: Double, limit: Int, promise: Promise) {
    let names = NSMutableDictionary()
    var answered = false
    let lock = NSLock()
    // The promise is resolved exactly once: a results handler that reports
    // `done` after an error, or an error after a page, must not resolve twice.
    let finish: ([[String: Any]]) -> Void = { rows in
      lock.lock()
      let first = !answered
      answered = true
      lock.unlock()
      if first { promise.resolve(rows) }
    }

    let listQuery = HKUserAnnotatedMedicationQuery(predicate: nil, limit: HKObjectQueryNoLimit) { [weak self] _, med, done, error in
      if let med = med {
        let concept = med.medication
        names[concept.identifier] = [
          "name": concept.displayText,
          "nickname": med.nickname ?? "",
          "form": concept.generalForm.rawValue,
          "archived": med.isArchived,
        ] as [String: Any]
      }
      if error != nil {
        // No list means no names, which means no importable doses.
        finish([[String: Any]]())
        return
      }
      guard done else { return }
      guard let self = self else {
        finish([[String: Any]]())
        return
      }
      self.queryDoses(startMs: startMs, endMs: endMs, limit: limit, names: names, finish: finish)
    }
    store.execute(listQuery)
  }

  @available(iOS 26.0, *)
  private func queryDoses(
    startMs: Double, endMs: Double, limit: Int,
    names: NSMutableDictionary, finish: @escaping ([[String: Any]]) -> Void
  ) {
    let window = HKQuery.predicateForSamples(
      withStart: Date(timeIntervalSince1970: startMs / 1000.0),
      end: Date(timeIntervalSince1970: endMs / 1000.0),
      options: [.strictStartDate]
    )
    // TAKEN only, as a predicate rather than a filter: a skipped, snoozed or
    // untouched reminder slot is a dose that did NOT happen, and filing one
    // would put a medication in somebody's journal they deliberately did not
    // take. The JS side checks the status again on what comes back.
    let taken = HKQuery.predicateForMedicationDoseEvent(status: .taken)
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [window, taken])
    let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]

    let query = HKSampleQuery(
      sampleType: HKObjectType.medicationDoseEventType(),
      predicate: predicate, limit: limit, sortDescriptors: sort
    ) { _, samples, error in
      guard error == nil, let events = samples as? [HKMedicationDoseEvent] else {
        finish([[String: Any]]())
        return
      }
      var out = [[String: Any]]()
      for ev in events {
        guard ev.logStatus == .taken else { continue }
        guard let info = names[ev.medicationConceptIdentifier] as? [String: Any],
              let name = info["name"] as? String, !name.isEmpty else { continue }
        var row: [String: Any] = [
          "uuid": ev.uuid.uuidString,
          "start": ev.startDate.timeIntervalSince1970 * 1000.0,
          "end": ev.endDate.timeIntervalSince1970 * 1000.0,
          "name": name,
          "nickname": (info["nickname"] as? String) ?? "",
          "form": (info["form"] as? String) ?? "",
          "archived": (info["archived"] as? Bool) ?? false,
          "scheduled": ev.scheduleType == .schedule,
          "unit": ev.unit.unitString,
          "bundleId": ev.sourceRevision.source.bundleIdentifier,
          "sourceName": ev.sourceRevision.source.name,
        ]
        // The dose the person reported taking. Nil is possible and is NOT zero:
        // it means the amount was never recorded, so the entry is filed with no
        // amount rather than with "0".
        if let dose = ev.doseQuantity { row["dose"] = dose }
        if let scheduled = ev.scheduledDoseQuantity { row["scheduledDose"] = scheduled }
        if let when = ev.scheduledDate { row["scheduledAt"] = when.timeIntervalSince1970 * 1000.0 }
        out.append(row)
      }
      finish(out)
    }
    store.execute(query)
  }

  @available(iOS 14.0, *)
  private static func classificationString(_ c: HKElectrocardiogram.Classification) -> String {
    switch c {
    case .notSet: return "notSet"
    case .sinusRhythm: return "sinusRhythm"
    case .atrialFibrillation: return "atrialFibrillation"
    case .inconclusiveLowHeartRate: return "inconclusiveLowHeartRate"
    case .inconclusiveHighHeartRate: return "inconclusiveHighHeartRate"
    case .inconclusivePoorReading: return "inconclusivePoorReading"
    case .inconclusiveOther: return "inconclusiveOther"
    case .unrecognized: return "unrecognized"
    @unknown default: return "unrecognized"
    }
  }

  @available(iOS 14.0, *)
  private static func symptomsString(_ s: HKElectrocardiogram.SymptomsStatus) -> String {
    switch s {
    case .notSet: return "notSet"
    case .none: return "none"
    case .present: return "present"
    @unknown default: return "notSet"
    }
  }
}
