import { ACTIVITY_TYPES } from '../../registry';
import {
  HR_BAND_EDGES, HR_MIN_COVERAGE, HR_PER_MIN, STEP_EFFORT, UPRIGHT_PER_MIN,
  buildBurn, hrBandEffort, hrBandsLess, hrMinutesAbove, uprightMinutes, walkingMinutes,
} from '../burn';
import { HR_BOOST_CAP } from '../load';
import type { DayLoad, DayRecord, Entry } from '../../types';

const TYPES = ACTIVITY_TYPES;

const day = (over: Partial<DayRecord>): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const load = (over: Partial<DayLoad>): DayLoad => ({
  steps: null, walkingMin: null, standMin: null, stillUprightMin: null,
  uprightSpans: null, hrAboveMin: null, hrBands: null, hrBelowMin: null, hrCoverageMin: null, hrStretches: null,
  longestStretch: null, peakBpm: null, lineBpm: null, readAt: null,
  ...over,
});

const a = (type: string, duration: string, over: Partial<Entry> = {}): Entry =>
  ({ id: `${type}-${duration}`, type, duration, ...over } as Entry);

/* ------------------------------------------------------------------ */

describe('hrMinutesAbove', () => {
  /** One sample a minute from `from` to `to`, at `bpm`. */
  const ramp = (fromMin: number, toMin: number, bpm: number) => {
    const out: { t: number; bpm: number }[] = [];
    for (let m = fromMin; m <= toMin; m++) out.push({ t: m * 60, bpm });
    return out;
  };

  it('counts minutes above the line and finds the stretches', () => {
    const s = [...ramp(0, 30, 70), ...ramp(31, 50, 120), ...ramp(51, 80, 70), ...ramp(81, 90, 120)];
    const r = hrMinutesAbove(s, 100)!;
    expect(r.stretches).toBe(2);
    expect(r.aboveMin).toBeGreaterThan(25);
    expect(r.peak).toBe(120);
  });

  it('treats a charger gap as UNCOVERED, never as rest', () => {
    // Two hours of samples, then a six-hour hole, then more samples. The hole
    // must not appear in coverage — a watch on the charger is not a restful
    // afternoon, and reporting it as one is how a thin day looks complete.
    const s = [...ramp(0, 120, 70), ...ramp(480, 540, 70)];
    const r = hrMinutesAbove(s, 100)!;
    expect(r.coverageMin).toBeLessThan(200);
    expect(r.coverageMin).toBeGreaterThan(150);
  });

  it('reports the longest stretch', () => {
    const s = [...ramp(0, 10, 70), ...ramp(11, 20, 130), ...ramp(21, 30, 70), ...ramp(31, 70, 130)];
    const r = hrMinutesAbove(s, 100)!;
    expect(r.longest!.endMin - r.longest!.startMin).toBeGreaterThan(30);
  });

  it('is null with no series and null with no line', () => {
    expect(hrMinutesAbove(null, 100)).toBeNull();
    expect(hrMinutesAbove(ramp(0, 60, 120), null)).toBeNull();
  });
});

describe('walkingMinutes', () => {
  it('MERGES overlapping spans rather than summing them', () => {
    // The iPhone-plus-watch case: both devices write steps for the same hour.
    // Summing would report two hours of walking for one hour of it.
    const merged = walkingMinutes([
      { startMin: 600, endMin: 630 },
      { startMin: 605, endMin: 635 },
    ]);
    expect(merged).toBe(35);
  });

  it('sums spans that do not touch', () => {
    expect(walkingMinutes([{ startMin: 600, endMin: 610 }, { startMin: 700, endMin: 720 }])).toBe(30);
  });

  it('caps a provider that writes one record for the whole day', () => {
    expect(walkingMinutes([{ startMin: 0, endMin: 1440 }])).toBe(60);
  });

  it('is null with nothing to merge', () => {
    expect(walkingMinutes([])).toBeNull();
    expect(walkingMinutes(null)).toBeNull();
  });
});

describe('uprightMinutes source order', () => {
  it('prefers stand time when a watch wrote it', () => {
    expect(uprightMinutes(load({ standMin: 220, walkingMin: 70, stillUprightMin: 60 })))
      .toEqual({ min: 220, source: 'stand' });
  });

  it('adds inferred standing to walking when there is a series', () => {
    expect(uprightMinutes(load({ walkingMin: 70, stillUprightMin: 60 })))
      .toEqual({ min: 130, source: 'walk+still' });
  });

  it('falls back to walking alone on a phone with no heart rate', () => {
    expect(uprightMinutes(load({ walkingMin: 70 }))).toEqual({ min: 70, source: 'walk' });
  });

  it('claims nothing with nothing measured', () => {
    expect(uprightMinutes(load({}))).toBeNull();
    expect(uprightMinutes(null)).toBeNull();
  });
});

describe('buildBurn', () => {
  it('charges logged activities and names them', () => {
    const b = buildBurn({
      day: day({ activities: [a('errands', '45'), a('shower', '15')] }),
      types: TYPES, lineBpm: null,
    });
    expect(b.effortMin).toBeCloseTo(45 + 9, 5);
    const row = b.rows.find((r) => r.source === 'activities')!;
    expect(row.detail).toContain('Errands');
  });

  it('REFUNDS a restorative entry: spend falls and the row is negative', () => {
    const without = buildBurn({ day: day({ activities: [a('errands', '100')] }), types: TYPES, lineBpm: null });
    const with_ = buildBurn({
      day: day({ activities: [a('errands', '100'), a('legsUp', '30')] }),
      types: TYPES, lineBpm: null,
    });
    expect(with_.effortMin).toBeLessThan(without.effortMin);
    const credit = with_.rows.find((r) => r.source === 'credits')!;
    expect(credit.effortMin).toBeLessThan(0);
    expect(credit.label).toBe('Recovery time');
    expect(with_.creditedMin).toBeGreaterThan(0);
  });

  it('caps the refund, so a day of rest cannot manufacture a budget', () => {
    const b = buildBurn({
      day: day({ activities: [a('errands', '60'), a('legsUp', '600')] }),
      types: TYPES, lineBpm: null,
    });
    // 600 minutes of legs-up is 210 effort minutes of credit uncapped, which
    // would take a 60-minute day negative. It cannot.
    expect(b.creditedMin).toBeCloseTo(60 * 0.25, 5);
    expect(b.effortMin).toBeGreaterThanOrEqual(0);
  });

  it('puts the credit row last so the reader ends on the good news', () => {
    const b = buildBurn({
      day: day({ activities: [a('errands', '100'), a('legsUp', '30')] }),
      types: TYPES, lineBpm: null,
    });
    expect(b.rows[b.rows.length - 1].source).toBe('credits');
  });

  it('treats steps as a FLOOR, never a sum', () => {
    // A big logged day plus a step count: the steps must not be added on top.
    const busy = buildBurn({
      day: day({ activities: [a('errands', '200')], load: load({ steps: 4000 }) }),
      types: TYPES, lineBpm: null,
    });
    expect(busy.effortMin).toBeCloseTo(200, 5);
    expect(busy.rows.some((r) => r.source === 'steps')).toBe(false);

    // A quiet day with nothing logged: the floor is what there is.
    const quiet = buildBurn({ day: day({ load: load({ steps: 8000 }) }), types: TYPES, lineBpm: null });
    expect(quiet.effortMin).toBeCloseTo(8000 * STEP_EFFORT, 5);
    expect(quiet.rows.find((r) => r.source === 'steps')!.detail).toContain('nothing else logged');
  });

  it('does not charge a workout twice through its own heart rate', () => {
    const both = buildBurn({
      day: day({
        activities: [a('run', '40', { avgHr: '150' })],
        load: load({ hrAboveMin: 40, hrCoverageMin: 700, lineBpm: 100 }),
      }),
      types: TYPES, lineBpm: 100,
    });
    // The 40 minutes above the line were the run. The heart-rate row nets to
    // nothing rather than billing the same 40 minutes a second time.
    expect(both.rows.some((r) => r.source === 'hr')).toBe(false);
  });

  it('ignores a heart-rate row with too little coverage to mean anything', () => {
    const b = buildBurn({
      day: day({ load: load({ hrAboveMin: 60, hrCoverageMin: HR_MIN_COVERAGE - 1, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    expect(b.rows.some((r) => r.source === 'hr')).toBe(false);
  });

  it('names the actual threshold in the heart-rate row title', () => {
    const b = buildBurn({
      day: day({ load: load({ hrAboveMin: 48, hrCoverageMin: 800, lineBpm: 95, hrStretches: 3 }) }),
      types: TYPES, lineBpm: 95,
    });
    const row = b.rows.find((r) => r.source === 'hr')!;
    expect(row.label).toBe('Minutes HR above 95 bpm');
    expect(row.detail).toBe('In 3 stretches');
  });

  it('charges upright time and names what it measured', () => {
    const stand = buildBurn({ day: day({ load: load({ standMin: 220 }) }), types: TYPES, lineBpm: null });
    const row = stand.rows.find((r) => r.source === 'upright')!;
    expect(row.effortMin).toBeCloseTo(220 * UPRIGHT_PER_MIN, 5);
    expect(row.detail).toContain('standing or walking');

    const est = buildBurn({
      day: day({ load: load({ walkingMin: 70, stillUprightMin: 60 }) }),
      types: TYPES, lineBpm: null,
    });
    expect(est.rows.find((r) => r.source === 'upright')!.detail).toContain('estimated');

    const phone = buildBurn({ day: day({ load: load({ walkingMin: 70 }) }), types: TYPES, lineBpm: null });
    expect(phone.rows.find((r) => r.source === 'upright')!.detail).toContain('walking');
    expect(phone.rows.find((r) => r.source === 'upright')!.detail).not.toContain('estimated');
  });

  it('pays back the minutes the heart spent settled, not just logged rest', () => {
    // The credit nobody has to remember to log. Symmetric with the cost row:
    // above the exertion line the day is charged, below the recovery line it
    // is paid back.
    const without = buildBurn({
      day: day({ activities: [a('errands', '200')], load: load({ hrAboveMin: 0, hrCoverageMin: 800, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    const settled = buildBurn({
      day: day({
        activities: [a('errands', '200')],
        load: load({ hrAboveMin: 0, hrBelowMin: 120, hrCoverageMin: 800, lineBpm: 100 }),
      }),
      types: TYPES, lineBpm: 100,
    });
    expect(settled.effortMin).toBeLessThan(without.effortMin);
    const row = settled.rows.find((r) => r.source === 'credits')!;
    expect(row.label).toBe('Recovery time');
    expect(row.detail).toContain('resting');
  });

  it('will not credit settled minutes it could not see', () => {
    // Below the coverage bar the heart-rate row is not trusted for COSTS, and
    // it must not be trusted for credits either.
    const b = buildBurn({
      day: day({
        activities: [a('errands', '200')],
        load: load({ hrBelowMin: 300, hrCoverageMin: HR_MIN_COVERAGE - 1, lineBpm: 100 }),
      }),
      types: TYPES, lineBpm: 100,
    });
    expect(b.creditedMin).toBe(0);
  });

  it('does not re-charge a logged walk as upright time', () => {
    const withWalk = buildBurn({
      day: day({ activities: [a('walk', '60')], load: load({ walkingMin: 60 }) }),
      types: TYPES, lineBpm: null,
    });
    expect(withWalk.rows.some((r) => r.source === 'upright')).toBe(false);
  });

  it('applies a named multiplier, capped', () => {
    const plain = buildBurn({ day: day({ activities: [a('errands', '100')] }), types: TYPES, lineBpm: null });
    const worse = buildBurn({
      day: day({ activities: [a('errands', '100')] }),
      types: TYPES, lineBpm: null,
      multiplier: { label: 'Short sleep', detail: 'Your log runs 1.2x costlier under 7h', factor: 1.2 },
    });
    expect(worse.effortMin).toBeCloseTo(plain.effortMin * 1.2, 5);

    const wild = buildBurn({
      day: day({ activities: [a('errands', '100')] }),
      types: TYPES, lineBpm: null,
      multiplier: { label: 'X', detail: 'y', factor: 9 },
    });
    expect(wild.effortMin).toBeCloseTo(plain.effortMin * 1.25, 5);
  });

  it('states its coverage honestly', () => {
    expect(buildBurn({ day: day({}), types: TYPES, lineBpm: null }).coverage).toBe('none');
    expect(buildBurn({ day: day({ activities: [a('walk', '20')] }), types: TYPES, lineBpm: null }).coverage).toBe('logged-only');
    expect(buildBurn({
      day: day({ load: load({ hrAboveMin: 10, hrCoverageMin: 300, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    }).coverage).toBe('partial');
    expect(buildBurn({
      day: day({ load: load({ hrAboveMin: 10, hrCoverageMin: 800, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    }).coverage).toBe('full');
  });

  it('spends nothing on an empty day', () => {
    const b = buildBurn({ day: day({}), types: TYPES, lineBpm: null });
    expect(b.effortMin).toBe(0);
    expect(b.rows).toEqual([]);
  });
});


/* ------------------------------------------------------------------ */

describe('heart-rate intensity', () => {
  const ramp = (fromMin: number, toMin: number, bpm: number) => {
    const out: { t: number; bpm: number }[] = [];
    for (let m = fromMin; m <= toMin; m++) out.push({ t: m * 60, bpm });
    return out;
  };

  it('splits the minutes above the line by how far above they sat', () => {
    // 20 minutes just over the line, 20 well over, 20 far over.
    const s = [...ramp(0, 20, 105), ...ramp(21, 41, 118), ...ramp(42, 62, 140)];
    const r = hrMinutesAbove(s, 100)!;
    expect(r.bands.length).toBe(HR_BAND_EDGES.length);
    expect(r.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(r.aboveMin, 0);
    expect(r.bands[0]).toBeGreaterThan(15);
    expect(r.bands[1]).toBeGreaterThan(15);
    expect(r.bands[2]).toBeGreaterThan(15);
  });

  it('prices a hard hour above a gentle one, and never past the cap', () => {
    const gentle = buildBurn({
      day: day({ load: load({ hrAboveMin: 60, hrBands: [60, 0, 0], hrCoverageMin: 800, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    const hard = buildBurn({
      day: day({ load: load({ hrAboveMin: 60, hrBands: [0, 0, 60], hrCoverageMin: 800, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    expect(hard.effortMin).toBeGreaterThan(gentle.effortMin);
    // The same sixty minutes, and the spread between them is bounded by the
    // one cap the whole feature shares.
    expect(hard.effortMin).toBeLessThanOrEqual(60 * HR_PER_MIN * (1 + HR_BOOST_CAP) + 0.001);
    expect(gentle.effortMin).toBeGreaterThanOrEqual(60 * HR_PER_MIN);
  });

  it('charges a day stored before bands existed flat, not upward', () => {
    // Unknown intensity is UNKNOWN. The repair in store/budget re-prices it
    // from the sidecar curve; until then it must not be guessed at.
    const unknown = buildBurn({
      day: day({ load: load({ hrAboveMin: 60, hrCoverageMin: 800, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    expect(unknown.effortMin).toBeCloseTo(60 * HR_PER_MIN, 5);
  });

  it('says how much of the time was the expensive kind', () => {
    const b = buildBurn({
      day: day({ load: load({ hrAboveMin: 70, hrBands: [40, 10, 20], hrCoverageMin: 800, lineBpm: 95, hrStretches: 2 }) }),
      types: TYPES, lineBpm: 95,
    });
    expect(b.rows.find((r) => r.source === 'hr')!.detail).toBe('In 2 stretches, 30m well above');
  });

  it('nets a logged workout off the TOP bands, never the cheapest', () => {
    // The run was the hard part of the day. Taking its minutes off the bottom
    // would leave the expensive minutes standing and bill them twice.
    expect(hrBandsLess([30, 20, 40], 50)).toEqual([30, 10, 0]);

    const withRun = buildBurn({
      day: day({
        activities: [a('run', '40', { avgHr: '150' })],
        load: load({ hrAboveMin: 60, hrBands: [20, 10, 30], hrCoverageMin: 800, lineBpm: 100 }),
      }),
      types: TYPES, lineBpm: 100,
    });
    const hr = withRun.rows.find((r) => r.source === 'hr')!;
    // 20 minutes left, all of them in the cheapest band.
    expect(hr.effortMin).toBeCloseTo(hrBandEffort([20, 0, 0])! * HR_PER_MIN, 5);
  });
});
