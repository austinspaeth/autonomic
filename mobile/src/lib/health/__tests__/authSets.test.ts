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
