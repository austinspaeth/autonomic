/**
 * Dedup rules for the periodic health-store update check: only items that
 * aren't ours and wouldn't duplicate a journal entry may be offered.
 */
import {
  allItemKeys, buildUpdateSet, dayAlreadyHas, filterDeclined, filterSeen, importFingerprint,
  sleepItemKey, updateCount, updateSignature, type RawHealthDay,
} from '../updateSet';
import type { ImportedReading, ImportedWorkout, SleepImport } from '../index';
import { MED_TYPES } from '../../registry';
import type { DayRecord, Entry } from '../../types';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '', quality: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const raw = (over: Partial<RawHealthDay> = {}): RawHealthDay => ({
  imports: [], workouts: [], sleep: null, meds: [], ...over,
});

const entry = (over: Partial<Entry>): Entry => ({ id: 'x', type: 'hrv', time: '07:00', note: '', ...over } as Entry);

/** RR series summing to `min` minutes. */
const rrOf = (min: number): number[] => Array(min * 60).fill(1000);

const hrvImport = (over: Partial<ImportedReading> = {}): ImportedReading => ({
  type: 'hrv', time: '06:52', startMs: 1000, ownApp: false,
  fields: { sdnn: '48', rmssd: '38' }, rr: rrOf(5), ...over,
});

const workout = (over: Partial<ImportedWorkout> = {}): ImportedWorkout => ({
  type: 'walk', time: '07:15', startMs: 2000, durationMin: 42, distanceMi: 2.1,
  avgHr: 128, minHr: 90, maxHr: 150, hrSeries: null, sourceName: 'Apple Watch',
  ownApp: false, ...over,
});

const night: SleepImport = {
  bed: '23:04', wake: '06:41', bedISO: '', wakeISO: '',
  hrLow: 52, hrHigh: 74, interrupted: false, minutesAsleep: 432, stages: null,
  hrSeries: null, respSeries: null, spans: [],
};

const DK = '2026-07-25';

describe('buildUpdateSet', () => {
  it('offers qualifying items and counts them', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [
        hrvImport(),
        { type: 'restingHr', time: '00:00', startMs: 2, ownApp: false, fields: { hr: '58', position: 'Laying' } },
        { type: 'bp', time: '08:12', startMs: 3, ownApp: false, fields: { sys: '118', dia: '76' } },
      ],
      workouts: [workout()],
      sleep: night,
      meds: [{ name: 'Magnesium Glycinate', time: '21:02', startMs: 4, amount: '400 mg', ownApp: false }],
    }), MED_TYPES);
    expect(set.sleep).toBe(night);
    expect(set.readings.map((r) => r.type).sort()).toEqual(['bp', 'hrv', 'restingHr']);
    expect(set.workouts).toHaveLength(1);
    // "Magnesium Glycinate" matches the built-in med type by label.
    expect(set.meds.map((m) => m.type)).toEqual(
      Object.keys(MED_TYPES).filter((k) => MED_TYPES[k].label === 'Magnesium Glycinate'));
    expect(updateCount(set)).toBe(6);
  });

  it('skips samples this app authored', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [hrvImport({ ownApp: true })],
      workouts: [workout({ ownApp: true })],
    }), MED_TYPES);
    expect(updateCount(set)).toBe(0);
  });

  it('requires RR covering at least 4 minutes for HRV', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [
        hrvImport({ startMs: 1, rr: rrOf(3) }),          // too short
        hrvImport({ startMs: 2, rr: undefined }),        // SDNN-only, no series
        hrvImport({ startMs: 3, time: '09:00' }),        // qualifies
      ],
    }), MED_TYPES);
    expect(set.readings).toHaveLength(1);
    expect(set.readings[0].time).toBe('09:00');
  });

  it('drops readings that duplicate journal entries', () => {
    const d = day({
      readings: [
        entry({ type: 'breathHrv', time: '06:55' }),          // within 10 min of the HRV import
        entry({ id: 'r2', type: 'restingHr', time: '09:00', hr: '58' }),  // same value, different time
        entry({ id: 'r3', type: 'bp', time: '08:10', sys: '120', dia: '80' }),  // within 10 min of the BP import
      ],
    });
    const set = buildUpdateSet(DK, d, raw({
      imports: [
        hrvImport(),
        { type: 'restingHr', time: '00:00', startMs: 2, ownApp: false, fields: { hr: '58', position: 'Laying' } },
        { type: 'bp', time: '08:12', startMs: 3, ownApp: false, fields: { sys: '118', dia: '76' } },
      ],
    }), MED_TYPES);
    expect(set.readings).toHaveLength(0);
  });

  it('offers one row per sample when the health store returns duplicates', () => {
    // Phone and watch both write the day's resting HR; a mirroring app repeats
    // a workout and a dose. Same sample twice must never become two rows (they
    // shared an item key, so ticking one ticked the other).
    const set = buildUpdateSet(DK, day(), raw({
      imports: [
        { type: 'restingHr', time: '00:00', startMs: 2, ownApp: false, fields: { hr: '58', position: 'Laying' } },
        { type: 'restingHr', time: '00:00', startMs: 2, ownApp: false, fields: { hr: '58', position: 'Laying' } },
        { type: 'restingHr', time: '14:20', startMs: 5, ownApp: false, fields: { hr: '58', position: 'Laying' } },  // same value, later
        { type: 'bp', time: '08:12', startMs: 3, ownApp: false, fields: { sys: '118', dia: '76' } },
        { type: 'bp', time: '08:12', startMs: 3, ownApp: false, fields: { sys: '118', dia: '76' } },
        hrvImport(),
        hrvImport({ startMs: 1001, time: '06:54' }),  // same session, a shade later
      ],
      workouts: [workout(), workout({ startMs: 2500, time: '07:16' })],
      meds: [
        { name: 'Magnesium Glycinate', time: '21:02', startMs: 4, amount: '400 mg', ownApp: false },
        { name: 'Magnesium Glycinate', time: '21:02', startMs: 4, amount: '400 mg', ownApp: false },
      ],
    }), MED_TYPES);
    expect(set.readings.map((r) => r.type)).toEqual(['restingHr', 'hrv', 'bp']);
    expect(set.workouts).toHaveLength(1);
    expect(set.meds).toHaveLength(1);
    const keys = allItemKeys(set);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('drops workouts already logged at the same time, keeps others', () => {
    const d = day({ activities: [entry({ type: 'walk', time: '07:18' })] });
    const set = buildUpdateSet(DK, d, raw({
      workouts: [workout(), workout({ startMs: 9, type: 'strength', time: '17:40', distanceMi: null })],
    }), MED_TYPES);
    expect(set.workouts.map((w) => w.type)).toEqual(['strength']);
  });

  it('withholds sleep once the day has bed and wake', () => {
    const d = day({ sleep: { bed: '23:00', wake: '06:30', quality: 'good' } });
    expect(buildUpdateSet(DK, d, raw({ sleep: night }), MED_TYPES).sleep).toBeNull();
  });

  it('filterSeen drops exactly the already-shown items', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [hrvImport()], workouts: [workout()], sleep: night,
    }), MED_TYPES);
    expect(allItemKeys(set)).toHaveLength(3);
    const seen = new Set([sleepItemKey(night), set.workouts[0].key]);
    const fresh = filterSeen(set, seen);
    expect(fresh.sleep).toBeNull();
    expect(fresh.workouts).toHaveLength(0);
    expect(fresh.readings).toHaveLength(1);
    expect(updateCount(fresh)).toBe(1);
    // Nothing seen → untouched.
    expect(updateCount(filterSeen(set, new Set()))).toBe(3);
  });

  it('filterDeclined drops a deleted import by its item key', () => {
    const set = buildUpdateSet(DK, day(), raw({ imports: [hrvImport()], workouts: [workout()] }), MED_TYPES);
    const fresh = filterDeclined(set, new Set([set.readings[0].key]));
    expect(fresh.readings).toHaveLength(0);
    expect(fresh.workouts).toHaveLength(1);
  });

  it('filterDeclined matches pre-healthKey entries by day/kind/type/time', () => {
    const set = buildUpdateSet(DK, day(), raw({ imports: [hrvImport()], workouts: [workout()] }), MED_TYPES);
    const byFingerprint = new Set([
      importFingerprint(DK, 'reading', 'hrv', '06:52'),
      importFingerprint(DK, 'workout', 'walk', '07:15'),
    ]);
    expect(updateCount(filterDeclined(set, byFingerprint))).toBe(0);
    // A different day's identical sample is a different item.
    expect(updateCount(filterDeclined(set, new Set([importFingerprint('2000-01-01', 'reading', 'hrv', '06:52')])))).toBe(2);
    // Sleep is day-level, not an entry the user can delete — never declined.
    const withSleep = buildUpdateSet(DK, day(), raw({ sleep: night }), MED_TYPES);
    expect(filterDeclined(withSleep, new Set()).sleep).not.toBeNull();
  });

  /* The historical backfill's only defence against writing a second copy of a
     week the daily import pill already brought in. */
  describe('dayAlreadyHas', () => {
    const withReading = (e: Partial<Entry>) => day({ readings: [{ id: 'a', time: '06:52', type: 'hrv', ...e } as Entry] });

    it('matches the same sample within the near window, on either side', () => {
      expect(dayAlreadyHas(withReading({}), 'reading', 'hrv', '06:52')).toBe(true);
      expect(dayAlreadyHas(withReading({}), 'reading', 'hrv', '07:01')).toBe(true);
      expect(dayAlreadyHas(withReading({}), 'reading', 'hrv', '06:43')).toBe(true);
    });

    it('lets a genuinely separate reading through', () => {
      expect(dayAlreadyHas(withReading({}), 'reading', 'hrv', '07:03')).toBe(false);
      expect(dayAlreadyHas(withReading({}), 'reading', 'bp', '06:52')).toBe(false);
      expect(dayAlreadyHas(undefined, 'reading', 'hrv', '06:52')).toBe(false);
      expect(dayAlreadyHas(day(), 'reading', 'hrv', '06:52')).toBe(false);
    });

    it('treats a watch Breathe session as the same measurement as an HRV reading', () => {
      expect(dayAlreadyHas(withReading({ type: 'breathHrv' }), 'reading', 'hrv', '06:52')).toBe(true);
    });

    it('reads the right list per kind, and meds get the wider window', () => {
      const d = day({
        activities: [{ id: 'w', time: '07:15', type: 'walk' } as Entry],
        meds: [{ id: 'm', time: '08:00', type: 'magnesium' } as Entry],
      });
      expect(dayAlreadyHas(d, 'workout', 'walk', '07:20')).toBe(true);
      expect(dayAlreadyHas(d, 'reading', 'walk', '07:20')).toBe(false);
      // 60 minutes for a dose, 10 for everything else.
      expect(dayAlreadyHas(d, 'med', 'magnesium', '08:55')).toBe(true);
      expect(dayAlreadyHas(d, 'med', 'magnesium', '09:05')).toBe(false);
    });
  });

  it('signature changes when the found set changes', () => {
    const a = buildUpdateSet(DK, day(), raw({ sleep: night }), MED_TYPES);
    const b = buildUpdateSet(DK, day(), raw({ sleep: night, workouts: [workout()] }), MED_TYPES);
    expect(updateSignature(a)).not.toEqual(updateSignature(b));
  });
});
