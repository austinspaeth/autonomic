/**
 * migrate() is the single funnel between untrusted JSON (user-picked import
 * files, whatever is on disk) and the state object every render trusts. These
 * tests feed it hostile/malformed input and assert nothing dangerous survives.
 */
import { DATE_KEY_RE, SCHEMA_VERSION, assertImportVersion, blankDay, defaultState, migrate } from '../migrate';

describe('migrate: garbage roots', () => {
  it.each([null, undefined, 'a string', 42, true, [1, 2]])('returns defaults for %p', (v) => {
    const out = migrate(v);
    expect(out.days).toEqual({});
    expect(out.settings.theme).toBe('system');
    expect(out.version).toBe(defaultState().version);
  });
});

describe('migrate: day keys', () => {
  it('drops a "__proto__" day key without polluting any prototype', () => {
    // JSON.parse creates "__proto__" as an OWN key — an object literal would not.
    const parsed = JSON.parse(
      '{"days": {"__proto__": {"sleep": {"bed": "22:00"}}, "2026-01-01": {"readings": []}}}',
    );
    expect(Object.keys(parsed.days)).toContain('__proto__');
    const out = migrate(parsed);
    expect(Object.keys(out.days)).toEqual(['2026-01-01']);
    expect(Object.getPrototypeOf(out.days)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).sleep).toBeUndefined();
    // No phantom day records reachable through the prototype chain.
    expect((out.days as Record<string, unknown>).bed).toBeUndefined();
  });

  it('keeps only YYYY-MM-DD keys pointing at plain objects', () => {
    const out = migrate({
      days: {
        '2026-01-01': {},
        'constructor': {},
        'not-a-date': {},
        '0': {},
        '2026-1-1': {},
        '2026-02-02': 'junk',
        '2026-03-03': [1, 2],
      },
    });
    expect(Object.keys(out.days)).toEqual(['2026-01-01']);
  });

  it('DATE_KEY_RE matches day keys only', () => {
    expect(DATE_KEY_RE.test('2026-07-12')).toBe(true);
    expect(DATE_KEY_RE.test('__proto__')).toBe(false);
    expect(DATE_KEY_RE.test('2026-07-12x')).toBe(false);
  });
});

describe('migrate: logged-entry arrays', () => {
  const day = (readings: unknown) => migrate({ days: { '2026-01-01': { readings } } }).days['2026-01-01'];

  it('replaces non-arrays with empty arrays', () => {
    expect(day('nope').readings).toEqual([]);
    expect(day({ 0: {} }).readings).toEqual([]);
  });

  it('drops null / primitive / typeless entries', () => {
    const r = day([null, 7, 'x', [], { id: 'a' }, { type: '' }, { type: 42 }, { type: 'hr', id: 'ok' }]).readings;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'ok', type: 'hr' });
  });

  it('generates a string id when missing and strips non-string time/note', () => {
    const r = day([{ type: 'hr', id: 123, time: 900, note: { x: 1 }, bpm: 62 }]).readings[0];
    expect(typeof r.id).toBe('string');
    expect(r.id.length).toBeGreaterThan(0);
    expect(r.time).toBeUndefined();
    expect(r.note).toBeUndefined();
    expect(r.bpm).toBe(62);
  });

  it('passes rich HRV template fields through untouched', () => {
    const entry = {
      id: 'e1', type: 'liveHrv', time: '08:00', rmssd: 42,
      rrRaw: [800, 810, 790], sampledHr: [{ t: 0, bpm: 60 }], scores: { rmssd: 'good' },
    };
    expect(day([entry]).readings[0]).toEqual(entry);
  });

  it('applies the same envelope rules to activities, meds, symptoms and meals', () => {
    const d = migrate({
      days: {
        '2026-01-01': {
          activities: [{ type: 'walk', time: '09:00' }, null],
          meds: [{ type: 'ldn', amount: '4.5mg' }, 'junk'],
          symptoms: [{ type: 'fatigue' }, {}],
          food: { meals: [{ type: 'breakfast' }, { note: 'no type' }] },
        },
      },
    }).days['2026-01-01'];
    expect(d.activities).toHaveLength(1);
    expect(d.meds).toHaveLength(1);
    expect(d.meds[0].amount).toBe('4.5mg');
    expect(d.symptoms).toHaveLength(1);
    expect(d.food.meals).toHaveLength(1);
  });
});

describe('migrate: sleep', () => {
  const sleepOf = (sleep: unknown, meta: object = { sleepReframed: true }) =>
    migrate({ meta, days: { '2026-01-01': { sleep } } }).days['2026-01-01'].sleep;

  it('replaces non-object sleep with a blank record', () => {
    expect(sleepOf('22:00')).toEqual({ bed: '', wake: '' });
    expect(sleepOf([1])).toEqual({ bed: '', wake: '' });
  });

  it('coerces bed/wake to strings and validates quality/hr bounds', () => {
    const s = sleepOf({ bed: 2200, wake: '06:30', quality: 'amazing', hrLow: { a: 1 }, hrHigh: 88 });
    expect(s).toEqual({ bed: '', wake: '06:30', hrHigh: 88 });
  });

  it('keeps well-formed stages and drops malformed ones', () => {
    expect(sleepOf({ bed: '', wake: '', stages: { deep: 90, rem: '80', core: 200, awake: null } }).stages)
      .toEqual({ deep: 90, rem: 80, core: 200, awake: 0 });
    expect(sleepOf({ bed: '', wake: '', stages: 'lots' }).stages).toBeUndefined();
  });

  it('still reframes bed from the previous day exactly once', () => {
    const days = {
      '2026-01-01': { sleep: { bed: '22:00', wake: '06:00' } },
      '2026-01-02': { sleep: { bed: '23:30', wake: '07:00' } },
    };
    const first = migrate({ days });
    expect(first.days['2026-01-02'].sleep).toEqual({ bed: '22:00', wake: '07:00' });
    expect(first.meta.sleepReframed).toBe(true);
    // Round-trip through export/import: already reframed, nothing moves.
    const second = migrate(JSON.parse(JSON.stringify(first)));
    expect(second.days['2026-01-02'].sleep).toEqual({ bed: '22:00', wake: '07:00' });
  });
});

describe('migrate: food & digestion', () => {
  it('coerces water/calories and sanitizes triggers', () => {
    const f = migrate({
      meta: { sleepReframed: true },
      days: { '2026-01-01': { food: { water: '2.5', calories: {}, triggers: { caffeine: '2', gluten: 0, alcohol: 'no' } } } },
    }).days['2026-01-01'].food;
    expect(f.water).toBe(2.5);
    expect(f.calories).toBe(0);
    expect(f.triggers).toEqual({ caffeine: 2 });
  });

  it('defaults malformed food/digestion wholesale', () => {
    const d = migrate({ days: { '2026-01-01': { food: 'pizza', digestion: { movements: 'twice' } } } }).days['2026-01-01'];
    expect(d.food).toEqual({ water: 0, calories: 0, triggers: {}, meals: [] });
    expect(d.digestion.movements).toEqual([]);
  });

  it('keeps object movements and ensures ids', () => {
    const m = migrate({ days: { '2026-01-01': { digestion: { movements: [{ time: '08:00', kind: 'normal' }, null] } } } })
      .days['2026-01-01'].digestion.movements;
    expect(m).toHaveLength(1);
    expect(typeof m[0].id).toBe('string');
  });
});

describe('migrate: top-level sections', () => {
  it('narrows theme and keeps known settings extras', () => {
    const s = migrate({ settings: { theme: 'neon', lastBleDeviceId: 'dev1', lastBleDeviceName: { evil: 1 }, healthEnabled: 1 } }).settings;
    expect(s.theme).toBe('system');
    expect(s.lastBleDeviceId).toBe('dev1');
    expect(s.lastBleDeviceName).toBeUndefined();
    expect(s.healthEnabled).toBe(true);
  });

  it('drops a structurally-broken protocol, keeps a valid one', () => {
    const broken = migrate({ settings: { protocol: { triggers: { enabled: true } } } }).settings.protocol;
    expect(broken).toBeUndefined();
    const valid = {
      triggers: { enabled: true, types: [] },
      water: { enabled: true, liters: 2 },
      meds: { enabled: false, types: ['ldn'] },
      activities: { enabled: false, types: [] },
      sleep: { enabled: true, hours: 7.5 },
    };
    expect(migrate({ settings: { protocol: valid } }).settings.protocol).toEqual(valid);
  });

  it('coerces profile fields to strings', () => {
    expect(migrate({ profile: { sex: 'Male', weight: 180, height: null } }).profile)
      .toEqual({ sex: 'Male', birthday: '', weight: '', height: '' });
  });

  it('sanitizes meta and custom/hidden types', () => {
    const out = migrate({
      meta: { lastUpdated: 42, lastImport: { name: 'x.json' }, onboarded: '2026-01-01T00:00:00Z' },
      customTypes: {
        meds: { good: { label: 'Good', icon: 'pill', fields: [{ key: 'amount' }, null] }, bad: { label: 'No fields' } },
        bogusSection: { x: { label: 'X', icon: 'x', fields: [] } },
      },
      hiddenTypes: { meds: ['ldn', 7, null], activities: 'all' },
    });
    expect(out.meta.lastUpdated).toBeNull();
    expect(out.meta.lastImport).toBeNull();
    expect(out.meta.onboarded).toBe('2026-01-01T00:00:00Z');
    expect(Object.keys(out.customTypes!)).toEqual(['meds']);
    expect(Object.keys(out.customTypes!.meds!)).toEqual(['good']);
    expect(out.customTypes!.meds!.good.fields).toEqual([{ key: 'amount' }]);
    expect(out.hiddenTypes).toEqual({ meds: ['ldn'] });
  });
});

describe('SCHEMA_VERSION contract', () => {
  // migrate() rebuilds these records with fixed keys and silently drops
  // anything it does not know, and assertImportVersion() only protects users
  // if the version number moves with the shape. If this test fails, you
  // changed the persisted shape: bump SCHEMA_VERSION, teach migrate() the new
  // fields, and re-pin these keys.
  it('pins the persisted shape migrate() preserves for version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(Object.keys(defaultState()).sort()).toEqual(
      ['days', 'hiddenTypes', 'meta', 'profile', 'settings', 'version'],
    );
    expect(Object.keys(blankDay()).sort()).toEqual(
      ['activities', 'digestion', 'food', 'meds', 'readings', 'sleep', 'symptoms'],
    );
    expect(Object.keys(blankDay().food).sort()).toEqual(['calories', 'meals', 'triggers', 'water']);
  });
});

describe('assertImportVersion', () => {
  it('accepts current-version, legacy (unversioned), and non-numeric-version files', () => {
    expect(() => assertImportVersion({ version: SCHEMA_VERSION, days: {} })).not.toThrow();
    expect(() => assertImportVersion({ days: {} })).not.toThrow();
    expect(() => assertImportVersion({ version: 'v9', days: {} })).not.toThrow();
    expect(() => assertImportVersion(null)).not.toThrow();
  });

  it('rejects files stamped with a newer schema version', () => {
    expect(() => assertImportVersion({ version: SCHEMA_VERSION + 1, days: {} })).toThrow(/newer version/);
  });
});

describe('migrate: idempotence', () => {
  it('re-migrating produces the identical state', () => {
    const messy = {
      settings: { theme: 'dark', junk: 1 },
      meta: { sleepReframed: true },
      days: {
        '2026-01-01': {
          sleep: { bed: '22:00', wake: '06:00' },
          readings: [{ id: 'r1', type: 'hr', time: '08:00', bpm: 55 }, null],
          food: { water: '3', triggers: { caffeine: 1 } },
        },
        garbage: {},
      },
    };
    const once = migrate(messy);
    expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});
