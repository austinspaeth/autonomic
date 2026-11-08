import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The permission-set keys are the once-only ask latch (../askedAuth). Changing
 * one makes `hasAskedAuth` read false for every install that already answered,
 * and the next background update check presents a HealthKit sheet the user
 * tapped nothing to get.
 *
 * The pacing budget adds step and stand reads. They go in their OWN set with
 * their OWN key, asked for only from a tap, so the core key is untouched. This
 * test is what keeps that true: it reads the source rather than importing it,
 * because ../index pulls in native modules a unit test has no business loading.
 */
const SRC = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
const HC = readFileSync(join(__dirname, '..', 'healthConnect.ts'), 'utf8');

const block = (name: string, src: string) => {
  const i = src.indexOf(`const ${name} = [`);
  if (i < 0) throw new Error(`${name} not found`);
  return src.slice(i, src.indexOf('];', i));
};

describe('iOS permission sets', () => {
  it('keeps the CORE read set exactly as it shipped', () => {
    const core = block('CORE_READ_IDS', SRC);
    // The literal list, in order. If this test fails, the change either has to
    // be reverted or has to be a deliberate, announced re-prompt for everyone.
    [
      'QID.restingHr', 'QID.heartRate', 'QID.hrvSdnn', 'QID.respiratoryRate',
      'QID.systolic', 'QID.diastolic', 'QID.bodyMass', 'CID.sleep',
      'HEARTBEAT_SERIES', 'WORKOUT_TYPE', 'CID.mindful',
    ].forEach((id) => expect(core).toContain(id));
    expect(core).not.toContain('QID.steps');
    expect(core).not.toContain('QID.standTime');
  });

  it('derives the core latch key from the core set alone', () => {
    expect(SRC).toContain('const HK_SET_KEY = `hk1:${CORE_READ_IDS.join(\',\')}|${WRITE_IDS.join(\',\')}`');
  });

  it('puts steps and stand time in their own set under their own key', () => {
    expect(block('STEPS_READ_IDS', SRC)).toContain('QID.steps');
    expect(block('STEPS_READ_IDS', SRC)).toContain('QID.standTime');
    expect(SRC).toContain('HK_STEPS_SET_KEY');
  });

  it('keeps the symptom/medication reads out of the core set, under their own key', () => {
    // 1.39's "import what you log in Health" set. Same rule as steps and the
    // cycle: its own latch, asked from a tap. The core set must not name a
    // single symptom type, or every existing install meets a new sheet.
    expect(SRC).toContain('const LOGS_READ_IDS = SYMPTOM_READ_IDS;');
    expect(SRC).toContain('HK_LOGS_SET_KEY');
    expect(block('CORE_READ_IDS', SRC)).not.toContain('SYMPTOM');
    expect(block('CORE_READ_IDS', SRC)).not.toContain('LOGS');
  });

  it('puts the connect ask in its own set under its own key', () => {
    // The two Connect buttons ask for core + the symptom reads in ONE sheet:
    // what the user logs in Health is an ordinary read permission. It still
    // cannot join CORE_READ_IDS, whose key is every background path's
    // once-only ask latch, so it is its own scope under its own key — the
    // arrangement steps and the cycle already use.
    expect(SRC).toContain('const HK_CONNECT_SET_KEY = `hk1connect:${[...CORE_READ_IDS, ...LOGS_READ_IDS].join(\',\')}|${WRITE_IDS.join(\',\')}`');
    expect(SRC).toContain("const connect = opts?.scope === 'connect';");
    expect(SRC).toContain('connect ? HK_CONNECT_SET_KEY');
    // And the core set still names no symptom type, which is the whole point.
    expect(block('CORE_READ_IDS', SRC)).not.toContain('SYMPTOM');
  });

  it('asks for the medication log separately, and only in the logs tap', () => {
    // A dose event is not a category type, so it cannot ride the bridge's
    // set; it is a second native sheet and must never be raised from a launch
    // path (requestAuth's ECG leg runs on every call, this one does not).
    expect(SRC).toContain('if (logs) await requestMedicationAuth();');
  });
});

describe('the medication permission', () => {
  /**
   * 1.39.0 (92) crashed every phone that turned "Symptoms and medications" on.
   * A medication is a PER-OBJECT authorization, and naming one in
   * `requestAuthorization(toShare:read:)` does not fail — HealthKit RAISES
   * (`_throwIfAuthorizationDisallowedForSharing:types:`), which no Swift catch
   * can reach, so the process aborts. Nothing in JS can test a Swift call, so
   * the shape of the call is pinned from the source the way the latch keys are.
   */
  const SWIFT = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'modules', 'ecg-health', 'ios', 'EcgHealthModule.swift'),
    'utf8',
  );

  it('asks through the per-object API, for the medication list', () => {
    expect(SWIFT).toContain('requestPerObjectReadAuthorization(');
    expect(SWIFT).toContain('for: HKObjectType.userAnnotatedMedicationType()');
  });

  it('reopens the picker without marking any latch, and only from a tap', () => {
    // The picker is presented on EVERY call, granted or not, so there is a
    // second way in (Settings -> Apple Health) and it must not latch: a latch
    // would be a claim about a sheet that always shows. Nor may it go through
    // requestAuth, which would re-run the settled symptom batch for nothing.
    const i = SRC.indexOf('export async function openMedicationPicker(');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n}', i));
    expect(body).toContain('requestMedicationAuth()');
    expect(body).not.toContain('markAskedAuth');
    expect(body).not.toContain('HK_LOGS_SET_KEY');
    expect(body).not.toContain('requestAuth(');
  });

  it('presents the picker on the main queue and resolves a reason, not a bool', () => {
    const i = SWIFT.indexOf('AsyncFunction("requestMedicationAuth")');
    const next = SWIFT.indexOf('AsyncFunction(', i + 20);
    const body = SWIFT.slice(i, next > -1 ? next : SWIFT.length);
    // The call's whole purpose is to present a sheet, and an Expo
    // AsyncFunction body does not run on the main queue.
    expect(body).toContain('DispatchQueue.main.async');
    // A bare `false` made one JS sentence stand for four outcomes, two of
    // which are not failures (a closed picker, an empty medication list).
    expect(body).not.toContain('promise.resolve(false)');
    expect(body).toContain('EcgHealthModule.hkCode(err)');
    expect(body).toContain('"code": "unsupported"');
    expect(body).toContain('"code": "unavailable"');
    // Promise.resolve takes Any?, so each payload is annotated rather than
    // inferred — an inferred heterogeneous literal is one warning from
    // failing the build.
    expect(body).toContain('let out: [String: Any]');
  });

  it('maps each HealthKit error to one stable word, and keeps the unknown one', () => {
    const i = SWIFT.indexOf('private static func hkCode(');
    expect(i).toBeGreaterThan(-1);
    const body = SWIFT.slice(i, SWIFT.indexOf('\n  }', i));
    // Guarded on the domain, or a non-HealthKit error would be read as one.
    expect(body).toContain('err.domain == HKError.errorDomain');
    expect(body).toContain('HKError.Code(rawValue: err.code)');
    ([
      ['.errorUserCanceled', 'canceled'],
      ['.errorNoData', 'nodata'],
      ['.errorAuthorizationDenied', 'denied'],
      ['.errorRequiredAuthorizationDenied', 'denied'],
      ['.errorAuthorizationNotDetermined', 'notdetermined'],
      ['.errorHealthDataUnavailable', 'unavailable'],
      ['.errorHealthDataRestricted', 'restricted'],
      ['.errorInvalidArgument', 'invalid'],
      ['.errorDatabaseInaccessible', 'locked'],
    ] as const).forEach(([swiftCase, word]) => {
      expect(body).toContain(swiftCase);
      expect(body).toContain(`"${word}"`);
    });
    // The case nobody anticipated stays identifiable from a support dump
    // rather than being flattened into the general failure.
    expect(body).toContain('return "hk\\(err.code)"');
  });

  it('never reaches the batch API from the medication request', () => {
    // The body of the exported function, up to the next one. The crash was a
    // `requestAuthorization(toShare:read:)` HERE, over a type set assigned a
    // few lines above it — so the batch call and the medication types have to
    // be checked in the same scope, not as two greps over the whole file.
    const i = SWIFT.indexOf('AsyncFunction("requestMedicationAuth")');
    expect(i).toBeGreaterThan(-1);
    const next = SWIFT.indexOf('AsyncFunction(', i + 20);
    const body = SWIFT.slice(i, next > -1 ? next : SWIFT.length);
    expect(body).toContain('requestPerObjectReadAuthorization(');
    expect(body).not.toContain('requestAuthorization(toShare:');
    // And the dose type is not asked for anywhere: authorizing a medication
    // grants its doses, and the type is read-only to third parties.
    expect(body).not.toContain('medicationDoseEventType');
  });
});

describe('Android permission sets', () => {
  /**
   * The consent-loop trap: a record type requested with no
   * android.permission.health.* declared behind it can never be granted, and
   * Health Connect re-presents the sheet forever. This has shipped once
   * already, so the manifest and the read list are checked against each other.
   */
  it('declares a manifest permission for every read type it asks for', () => {
    const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'app.json'), 'utf8'));
    const perms: string[] = appJson.expo.android.permissions;
    const declared = new Set(
      perms.filter((p) => p.startsWith('android.permission.health.READ_'))
        .map((p) => p.replace('android.permission.health.READ_', '').replace(/_/g, '').toLowerCase()),
    );
    const types = block('READ_TYPES', HC)
      .match(/'([A-Za-z]+)'/g)!
      .map((q) => q.replace(/'/g, ''));

    // Record type -> the permission name it needs, where they differ.
    const PERMISSION_OF: Record<string, string> = {
      SleepSession: 'sleep',
      ExerciseSession: 'exercise',
      HeartRateVariabilityRmssd: 'heartratevariability',
      BloodPressure: 'bloodpressure',
      RestingHeartRate: 'restingheartrate',
      HeartRate: 'heartrate',
      RespiratoryRate: 'respiratoryrate',
    };
    types.forEach((t) => {
      const want = PERMISSION_OF[t] || t.toLowerCase();
      expect({ type: t, declared: declared.has(want) }).toEqual({ type: t, declared: true });
    });
  });

  it('asks for Steps, the passive floor a phone provides with no wearable', () => {
    expect(block('READ_TYPES', HC)).toContain("'Steps'");
  });
});
