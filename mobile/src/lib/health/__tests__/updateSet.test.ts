/**
 * Dedup rules for the periodic health-store update check: only items that
 * aren't ours and wouldn't duplicate a journal entry may be offered.
 */
import {
  allItemKeys, buildUpdateSet, dayAlreadyHas, filedFromSample, filterDeclined, filterSeen, importFingerprint,
  sleepItemKey, sleepToFile, splitForReview, updateCount, updateSignature, type RawHealthDay,
} from '../updateSet';
import type { ImportedMed, ImportedReading, ImportedSymptom, ImportedWorkout, SleepImport } from '../index';
import { MED_TYPES, SYMPTOM_TYPES } from '../../registry';
import type { DayRecord, Entry } from '../../types';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '', quality: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const raw = (over: Partial<RawHealthDay> = {}): RawHealthDay => ({
  imports: [], workouts: [], sleep: null, meds: [], symptoms: [], ...over,
});

/** The catalogs the build names things through: the built-in registry, which is
 *  what an install with no custom types holds. */
const TYPES = { meds: MED_TYPES, symptoms: SYMPTOM_TYPES };

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

const dose = (over: Partial<ImportedMed> = {}): ImportedMed => ({
  name: 'Magnesium Glycinate', time: '21:02', startMs: 4, amount: '400 mg', ownApp: false, ...over,
});

const symptom = (over: Partial<ImportedSymptom> = {}): ImportedSymptom => ({
  type: 'lightHeaded', time: '14:20', startMs: 9, severity: 'Moderate', ownApp: false, ...over,
});

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
    }), TYPES);
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
    }), TYPES);
    expect(updateCount(set)).toBe(0);
  });

  it('requires RR covering at least 4 minutes for HRV', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [
        hrvImport({ startMs: 1, rr: rrOf(3) }),          // too short
        hrvImport({ startMs: 2, rr: undefined }),        // SDNN-only, no series
        hrvImport({ startMs: 3, time: '09:00' }),        // qualifies
      ],
    }), TYPES);
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
    }), TYPES);
    expect(set.readings).toHaveLength(0);
  });

  it('drops a sample the journal already holds under its own key', () => {
    // The watch-sync card files the reading the session was for, stamped with
    // the sample's key. The clock the entry claims can then be edited, or the
    // card can have filed it under a kind that renames the type — neither
    // changes which sample it IS, and the quiet check must not offer it back.
    const d = day({ readings: [entry({ type: 'breathHrv', time: '23:30', healthKey: 'hrv-1000' })] });
    const set = buildUpdateSet(DK, d, raw({ imports: [hrvImport()] }), TYPES);
    expect(set.readings).toHaveLength(0);
  });

  it('finds the entry that already holds a sample, by key or by the clock', () => {
    const byKey = entry({ id: 'k', type: 'breathHrv', time: '23:30', healthKey: 'hrv-1000' });
    const byClock = entry({ id: 'c', type: 'hrv', time: '06:55' });
    expect(filedFromSample(day({ readings: [byKey] }), 'reading', 'hrv-1000', 'hrv', '06:52')?.id).toBe('k');
    expect(filedFromSample(day({ readings: [byClock] }), 'reading', 'hrv-1000', 'hrv', '06:52')?.id).toBe('c');
    // A different sample at a different time is not it.
    expect(filedFromSample(day({ readings: [entry({ time: '12:00' })] }), 'reading', 'hrv-1000', 'hrv', '06:52')).toBeUndefined();
    expect(filedFromSample(day(), 'reading', 'hrv-1000', 'hrv', '06:52')).toBeUndefined();
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
    }), TYPES);
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
    }), TYPES);
    expect(set.workouts.map((w) => w.type)).toEqual(['strength']);
  });

  it('withholds sleep once the day has a night the user logged', () => {
    const d = day({ sleep: { bed: '23:00', wake: '06:30', quality: 'good' } });
    expect(buildUpdateSet(DK, d, raw({ sleep: night }), TYPES).sleep).toBeNull();
  });

  it('finishes an imported night that was read early', () => {
    // The reported case: filed at 6am as 1:27 to 5:56, the whole night ran to 10:40.
    const d = day({ sleep: { bed: '01:27', wake: '05:56', quality: 'good', imported: true } });
    const whole = { ...night, bed: '01:27', wake: '10:40' };
    expect(buildUpdateSet(DK, d, raw({ sleep: whole }), TYPES).sleep).toBe(whole);
  });
});

describe('sleepToFile', () => {
  const imported = { bed: '01:27', wake: '05:56', quality: 'good' as const, imported: true };

  it('files any night into an empty day', () => {
    expect(sleepToFile(undefined, night)).toBe(night);
    expect(sleepToFile({ bed: '', wake: '' }, night)).toBe(night);
  });

  it('replaces an imported night only with a longer one', () => {
    expect(sleepToFile(imported, { ...night, bed: '01:27', wake: '10:40' })).not.toBeNull();
    expect(sleepToFile(imported, { ...night, bed: '02:00', wake: '05:30' })).toBeNull();
    expect(sleepToFile(imported, { ...night, bed: '01:27', wake: '05:56' })).toBeNull();
  });

  it('measures a night across midnight', () => {
    const lateBed = { ...imported, bed: '01:00', wake: '06:00' };
    expect(sleepToFile(lateBed, { ...night, bed: '23:30', wake: '06:00' })).not.toBeNull();
  });

  it('never replaces a night the user typed or corrected', () => {
    const whole = { ...night, bed: '01:27', wake: '10:40' };
    expect(sleepToFile({ ...imported, imported: undefined }, whole)).toBeNull();
    expect(sleepToFile({ ...imported, edited: true }, whole)).toBeNull();
  });

  it('answers null with nothing read', () => {
    expect(sleepToFile(imported, null)).toBeNull();
  });

  it('filterSeen drops exactly the already-shown items', () => {
    const set = buildUpdateSet(DK, day(), raw({
      imports: [hrvImport()], workouts: [workout()], sleep: night,
    }), TYPES);
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
    const set = buildUpdateSet(DK, day(), raw({ imports: [hrvImport()], workouts: [workout()] }), TYPES);
    const fresh = filterDeclined(set, new Set([set.readings[0].key]));
    expect(fresh.readings).toHaveLength(0);
    expect(fresh.workouts).toHaveLength(1);
  });

  it('filterDeclined matches pre-healthKey entries by day/kind/type/time', () => {
    const set = buildUpdateSet(DK, day(), raw({ imports: [hrvImport()], workouts: [workout()] }), TYPES);
    const byFingerprint = new Set([
      importFingerprint(DK, 'reading', 'hrv', '06:52'),
      importFingerprint(DK, 'workout', 'walk', '07:15'),
    ]);
    expect(updateCount(filterDeclined(set, byFingerprint))).toBe(0);
    // A different day's identical sample is a different item.
    expect(updateCount(filterDeclined(set, new Set([importFingerprint('2000-01-01', 'reading', 'hrv', '06:52')])))).toBe(2);
    // Sleep is day-level, not an entry the user can delete — never declined.
    const withSleep = buildUpdateSet(DK, day(), raw({ sleep: night }), TYPES);
    expect(filterDeclined(withSleep, new Set()).sleep).not.toBeNull();
  });

  /* A deleted import is a tombstone with the journal's own tolerance. One
     workout reaches a health store more than once, and the copy that syncs in
     later starts a minute or two either side of the one that was deleted. */
  it('filterDeclined drops a later copy of a deleted workout', () => {
    const deleted = new Set([importFingerprint(DK, 'workout', 'walk', '07:15'), 'walk-2000']);
    const check = (workouts: ImportedWorkout[]) =>
      filterDeclined(buildUpdateSet(DK, day(), raw({ workouts }), TYPES), deleted).workouts;
    // The mirror starts EARLIER, so it wins the in-set dedup over the original.
    const mirror = workout({ time: '07:13', startMs: 1900, sourceName: 'Garmin Connect' });
    expect(check([mirror, workout()])).toHaveLength(0);
    // The store re-wrote the session under a new start instant.
    expect(check([workout({ time: '07:16', startMs: 2060 })])).toHaveLength(0);
    // A different activity at that moment, or the same one later, is its own item.
    expect(check([workout({ type: 'run', startMs: 2001 })])).toHaveLength(1);
    expect(check([workout({ time: '07:40', startMs: 3500 })])).toHaveLength(1);
    // Another day's delete says nothing about today.
    const other = new Set([importFingerprint('2000-01-01', 'workout', 'walk', '07:15')]);
    expect(filterDeclined(buildUpdateSet(DK, day(), raw({ workouts: [workout()] }), TYPES), other).workouts).toHaveLength(1);
  });

  it('filterDeclined reads a type holding a colon and ignores a timeless delete', () => {
    const set = buildUpdateSet(DK, day(), raw({ workouts: [workout()] }), TYPES);
    expect(filterDeclined(set, new Set([importFingerprint(DK, 'workout', 'a:b', '07:15')])).workouts).toHaveLength(1);
    expect(filterDeclined(set, new Set([importFingerprint(DK, 'workout', 'walk', '')])).workouts).toHaveLength(1);
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

  describe('splitForReview', () => {
    const clean = { artifactPct: 3, confidence: 'high' as const, beatCount: 300 };
    const poor = { artifactPct: 22, confidence: 'fair' as const, beatCount: 300 };

    it('files everything when nothing is poor, and hands back the same set', () => {
      const set = buildUpdateSet(DK, day(), raw({
        imports: [hrvImport({ quality: clean })], workouts: [workout()], sleep: night,
      }), TYPES);
      const { auto, review } = splitForReview(set);
      expect(review).toEqual([]);
      expect(auto).toBe(set);
    });

    it('holds back a poor reading and files the rest', () => {
      const set = buildUpdateSet(DK, day(), raw({
        imports: [
          hrvImport({ quality: poor }),
          hrvImport({ startMs: 9000, time: '12:30', quality: clean }),
        ],
        workouts: [workout()],
        sleep: night,
      }), TYPES);
      const { auto, review } = splitForReview(set);
      expect(review.map((r) => (r.kind === 'reading' ? r.reading.time : null))).toEqual(['06:52']);
      expect(auto.readings.map((r) => r.time)).toEqual(['12:30']);
      // Nothing else carries a quality verdict, so nothing else is held for it.
      expect(auto.sleep).toBe(set.sleep);
      expect(auto.workouts).toHaveLength(1);
    });

    it('holds back a dose that would CREATE a type, and files one that would not', () => {
      const set = buildUpdateSet(DK, day(), raw({
        meds: [dose(), dose({ name: 'Ivabradine 5 mg tablet', startMs: 77, time: '08:00' })],
      }), TYPES);
      const { auto, review } = splitForReview(set);
      // A silent foreground check may file an entry; it may not reach into the
      // type catalog on its own.
      expect(review.map((r) => (r.kind === 'med' ? r.med.create?.label : null)))
        .toEqual(['Ivabradine 5 mg tablet']);
      expect(auto.meds.map((m) => m.type)).toEqual(['magGlycinate']);
    });

    it('never holds a reading with no series to grade', () => {
      // An SDNN-only sample has no beats behind it, so it cannot be called poor
      // — unknown is not the same as bad (see isPoorImport).
      const set = buildUpdateSet(DK, day(), raw({ imports: [hrvImport()] }), TYPES);
      expect(splitForReview(set).review).toEqual([]);
    });

    it('accounts for every item exactly once', () => {
      const set = buildUpdateSet(DK, day(), raw({
        imports: [hrvImport({ quality: poor }), hrvImport({ startMs: 9000, time: '12:30', quality: clean })],
        workouts: [workout()], sleep: night,
      }), TYPES);
      const { auto, review } = splitForReview(set);
      expect(updateCount(auto) + review.length).toBe(updateCount(set));
    });
  });

  it('signature changes when the found set changes', () => {
    const a = buildUpdateSet(DK, day(), raw({ sleep: night }), TYPES);
    const b = buildUpdateSet(DK, day(), raw({ sleep: night, workouts: [workout()] }), TYPES);
    expect(updateSignature(a)).not.toEqual(updateSignature(b));
  });
});

describe('medications', () => {
  it('files a dose under the user\u2019s own type, with the dose intact', () => {
    const set = buildUpdateSet(DK, day(), raw({ meds: [dose()] }), TYPES);
    expect(set.meds).toHaveLength(1);
    expect(set.meds[0].type).toBe('magGlycinate');
    expect(set.meds[0].amount).toBe('400 mg');
    expect(set.meds[0].create).toBeUndefined();
    expect(set.meds[0].sub).toContain('400 mg');
  });

  it('matches through the canonical name, not the label', () => {
    const set = buildUpdateSet(DK, day(), raw({
      meds: [dose({ name: 'Fexofenadine Hydrochloride 180 mg tablet' })],
    }), TYPES);
    expect(set.meds[0].type).toBe('allegra');
    expect(set.meds[0].title).toBe('Allegra');
  });

  it('OFFERS a medication with no type yet, and says it would create one', () => {
    const set = buildUpdateSet(DK, day(), raw({ meds: [dose({ name: 'Ivabradine 5 mg tablet' })] }), TYPES);
    expect(set.meds).toHaveLength(1);
    expect(set.meds[0].create).toEqual({ label: 'Ivabradine 5 mg tablet' });
    // The row says so with a chip, not in the sub-line, which holds the dose.
    expect(set.meds[0].sub).not.toContain('New type');
  });

  it('names a new type the way the person named it in Health', () => {
    const set = buildUpdateSet(DK, day(), raw({
      meds: [dose({ name: 'Ivabradine 5 mg tablet', nickname: 'Corlanor' })],
    }), TYPES);
    expect(set.meds[0].create).toEqual({ label: 'Corlanor' });
    expect(set.meds[0].title).toBe('Corlanor');
  });

  it('skips a dose already logged in the journal, and a second copy of itself', () => {
    const d = day({ meds: [{ id: 'm', type: 'magGlycinate', time: '21:30' } as Entry] });
    expect(buildUpdateSet(DK, d, raw({ meds: [dose()] }), TYPES).meds).toHaveLength(0);
    const twice = buildUpdateSet(DK, day(), raw({
      meds: [dose(), dose({ startMs: 5, time: '21:40' })],
    }), TYPES);
    expect(twice.meds).toHaveLength(1);
  });

  it('keys a dose on the SAMPLE, so a created type cannot change its identity', () => {
    const a = buildUpdateSet(DK, day(), raw({ meds: [dose({ name: 'Ivabradine' })] }), TYPES).meds[0];
    const b = buildUpdateSet(DK, day(), raw({ meds: [dose({ name: 'Ivabradine' })] }),
      { ...TYPES, meds: { ...TYPES.meds, 'custom-ivabradine': { label: 'Ivabradine', icon: 'pill', fields: [] } } }).meds[0];
    expect(a.key).toBe(b.key);
    expect(b.create).toBeUndefined();
  });

  it('never re-offers a dose the user imported and then deleted', () => {
    const set = buildUpdateSet(DK, day(), raw({ meds: [dose()] }), TYPES);
    const stone = new Set([importFingerprint(DK, 'med', 'magGlycinate', '21:02')]);
    expect(filterDeclined(set, stone).meds).toHaveLength(0);
  });
});

describe('symptoms', () => {
  it('offers a symptom with its grade', () => {
    const set = buildUpdateSet(DK, day(), raw({ symptoms: [symptom()] }), TYPES);
    expect(set.symptoms).toHaveLength(1);
    expect(set.symptoms[0].type).toBe('lightHeaded');
    expect(set.symptoms[0].title).toBe('Light Headed/Dizzy');
    expect(set.symptoms[0].severity).toBe('Moderate');
    expect(set.symptoms[0].sub).toContain('Moderate');
    expect(updateCount(set)).toBe(1);
  });

  it('skips our own write-backs and a type the user deleted', () => {
    expect(buildUpdateSet(DK, day(), raw({ symptoms: [symptom({ ownApp: true })] }), TYPES).symptoms).toHaveLength(0);
    const without = { ...TYPES, symptoms: { ...TYPES.symptoms } };
    delete (without.symptoms as Record<string, unknown>).lightHeaded;
    expect(buildUpdateSet(DK, day(), raw({ symptoms: [symptom()] }), without).symptoms).toHaveLength(0);
  });

  it('treats one episode logged in both places as one, with a 45 minute window', () => {
    const d = day({ symptoms: [{ id: 'y', type: 'lightHeaded', time: '14:50' } as Entry] });
    expect(buildUpdateSet(DK, d, raw({ symptoms: [symptom()] }), TYPES).symptoms).toHaveLength(0);
    const later = day({ symptoms: [{ id: 'y', type: 'lightHeaded', time: '15:30' } as Entry] });
    expect(buildUpdateSet(DK, later, raw({ symptoms: [symptom()] }), TYPES).symptoms).toHaveLength(1);
    expect(dayAlreadyHas(d, 'symptom', 'lightHeaded', '14:20')).toBe(true);
  });

  it('collapses two HealthKit types that mean one journal symptom', () => {
    const set = buildUpdateSet(DK, day(), raw({
      // runny nose and sinus congestion both map to "Congestion / runny nose"
      symptoms: [symptom({ type: 'congestion', time: '09:00', startMs: 1 }),
        symptom({ type: 'congestion', time: '09:20', startMs: 2 })],
    }), TYPES);
    expect(set.symptoms).toHaveLength(1);
  });

  it('is in the keys, the signature and the declined filter', () => {
    const set = buildUpdateSet(DK, day(), raw({ symptoms: [symptom()] }), TYPES);
    expect(allItemKeys(set)).toEqual([set.symptoms[0].key]);
    expect(updateSignature(set)).toContain(set.symptoms[0].key);
    expect(filterSeen(set, new Set([set.symptoms[0].key])).symptoms).toHaveLength(0);
    const stone = new Set([importFingerprint(DK, 'symptom', 'lightHeaded', '14:20')]);
    expect(filterDeclined(set, stone).symptoms).toHaveLength(0);
  });

  it('is never held back for review: there is no series to grade', () => {
    const set = buildUpdateSet(DK, day(), raw({ symptoms: [symptom()], meds: [dose()] }), TYPES);
    const { auto, review } = splitForReview(set);
    expect(review).toEqual([]);
    expect(auto.symptoms).toHaveLength(1);
    expect(auto.meds).toHaveLength(1);
  });
});
