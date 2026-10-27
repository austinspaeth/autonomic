import ExpoModulesCore
import HealthKit

/**
 * Reads Apple Health ECG samples that the kingstinct HealthKit library does not
 * expose. Returns, per ECG: classification, symptoms status, sampling frequency,
 * average heart rate, and the full lead-I voltage waveform (in microvolts). All
 * interval/HRV math is done in JS from the waveform (see src/lib/health/ecg.ts).
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
