import { ACTIVITY_TYPES } from '../../registry';
import {
  HR_BAND_EDGES, HR_COUNT_MIN_COVERAGE, HR_FULL_COVERAGE, HR_GAP_HARD, HR_GAP_MAX, HR_GAP_MIN, HR_MIN_COVERAGE,
  HR_PER_MIN, STEP_EFFORT, UPRIGHT_PER_MIN,
  buildBurn, gapToleranceFor, hrBandEffort, hrBandsLess, hrMinutesAbove, hrMinutesBelow, hrMinutesBelowByHour, minutesByHour,
  thinHrCurve, uprightHours, uprightMinutes, walkingMinutes,
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
  steps: null, walkingMin: null, standMin: null, stillUprightMin: null, stillFloorBpm: null,
  uprightSpans: null, uprightByHour: null, hrAboveMin: null, hrBands: null, hrBelowMin: null, hrBelowByHour: null, hrCoverageMin: null, hrSampleGapMin: null, hrStretches: null,
  longestStretch: null, peakBpm: null, lineBpm: null, readAt: null, pricedVersion: null,
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

describe('by the hour', () => {
  const sum = (xs: number[] | null) => (xs || []).reduce((a, b) => a + b, 0);

  it('splits a span across the hours it covers and sums to walkingMinutes', () => {
    const spans = [{ startMin: 590, endMin: 620 }, { startMin: 595, endMin: 625 }, { startMin: 800, endMin: 810 }];
    const hours = minutesByHour(spans)!;
    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(10);
    expect(hours[10]).toBe(25);
    expect(hours[13]).toBe(10);
    expect(sum(hours)).toBe(walkingMinutes(spans));
  });

  it('keeps a long inferred stretch whole when uncapped', () => {
    expect(sum(minutesByHour([{ startMin: 600, endMin: 750 }], Infinity))).toBe(150);
  });

  it('puts resting minutes in the hour they happened, and agrees with the total', () => {
    const hr = Array.from({ length: 121 }, (_, i) => ({ t: (840 + i) * 60, bpm: 60 }));
    const hours = hrMinutesBelowByHour(hr, 70, [])!;
    expect(hours[14]).toBe(60);
    expect(hours[15]).toBe(60);
    expect(sum(hours)).toBe(hrMinutesBelow(hr, 70, []));
    expect(hrMinutesBelowByHour(hr, 70, [{ startMin: 840, endMin: 900 }])![14]).toBe(0);
  });

  it('draws upright hours from the source the row charged', () => {
    const walk = new Array(24).fill(0);
    walk[9] = 30;
    const stand = new Array(24).fill(0);
    stand[12] = 40;
    const byHour = { walk, still: null, stand };
    // Watch stand time outranks walking, exactly as uprightMinutes does.
    expect(uprightHours(load({ standMin: 40, walkingMin: 30, uprightByHour: byHour }))).toEqual({ walk: null, still: null, stand });
    expect(uprightHours(load({ walkingMin: 30, uprightByHour: { ...byHour, stand: null } }))!.walk).toBe(walk);
    // A watch total with no hours behind it is not redrawn from walking.
    expect(uprightHours(load({ standMin: 40, walkingMin: 30 }))).toBeNull();
  });

  it('falls back to stored spans only when they were not cut off', () => {
    const spans = [{ startMin: 540, endMin: 560, kind: 'walk' as const }, { startMin: 700, endMin: 760, kind: 'still' as const }];
    const h = uprightHours(load({ walkingMin: 20, stillUprightMin: 60, uprightSpans: spans }))!;
    expect(h.walk![9]).toBe(20);
    expect(sum(h.still)).toBe(60);
    const cut = Array.from({ length: 60 }, (_, i) => ({ startMin: i * 2, endMin: i * 2 + 1, kind: 'walk' as const }));
    expect(uprightHours(load({ walkingMin: 60, uprightSpans: cut }))).toBeNull();
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
      day: day({ load: load({ hrAboveMin: 60, hrCoverageMin: HR_COUNT_MIN_COVERAGE - 1, lineBpm: 100 }) }),
      types: TYPES, lineBpm: 100,
    });
    expect(b.rows.some((r) => r.source === 'hr')).toBe(false);
  });

  /* A watch put on for the hard part of the day. It used to charge NOTHING:
     one bar answered both "did we see enough to say how well we saw it" and
     "did we see enough to charge what we watched", and at two hours of wear
     the second answer was wrong. What the app watched is charged; how little
     of the day it saw is said by the coverage word, not by silence. */
  it('charges what a partly worn day DID see, and still calls the day thin', () => {
    const b = buildBurn({
      day: day({ load: load({ hrAboveMin: 19, hrCoverageMin: HR_MIN_COVERAGE - 5, lineBpm: 100, steps: 2000 }) }),
      types: TYPES, lineBpm: 100,
    });
    const hr = b.rows.find((r) => r.source === 'hr');
    expect(hr).toBeTruthy();
    expect(hr!.effortMin).toBeCloseTo(19 * HR_PER_MIN, 5);
    // The minutes count; the day is still not called well covered.
    expect(b.coverage).toBe('logged-only');
  });

  it('names the actual threshold in the heart-rate row title', () => {
    const b = buildBurn({
      day: day({ load: load({ hrAboveMin: 48, hrCoverageMin: 800, lineBpm: 95, hrStretches: 3 }) }),
      types: TYPES, lineBpm: 95,
    });
    const row = b.rows.find((r) => r.source === 'hr')!;
    expect(row.label).toBe('Minutes HR above 95 bpm');
    // The row's own minutes LEAD. Naming only the stretches described two
            // sub-quantities of a total the row never stated.
    expect(row.detail).toBe('48m above, in 3 stretches');
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
    expect(b.rows.find((r) => r.source === 'hr')!.detail).toBe('1h 10m above, in 2 stretches, 30m well above');
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

/**
 * The drill-in draws the row's own arithmetic and never a second extraction of
 * the day. These pin the property that made the old sheet wrong: the parts
 * have to SUM to the row they open.
 */
describe('a row explains itself', () => {
  const sum = (row: { parts?: { effortMin: number }[] }) =>
    (row.parts || []).reduce((a, b) => a + b.effortMin, 0);

  it('upright parts sum to the upright row, net of a logged walk', () => {
    const b = buildBurn({
      day: day({
        activities: [{ id: 'a1', type: 'walk', duration: 30 }],
        load: load({ walkingMin: 119, stillUprightMin: 238 }),
      }),
      types: TYPES, lineBpm: null,
    });
    const row = b.rows.find((r) => r.source === 'upright')!;
    expect(sum(row)).toBeCloseTo(row.effortMin, 5);
    // The subtraction is a LINE, not a silent adjustment.
    expect(row.parts!.some((p) => /already charged/.test(p.label))).toBe(true);
  });

  it('heart-rate parts are the NET bands, so a logged workout is not added back', () => {
    const b = buildBurn({
      day: day({
        activities: [{ id: 'a1', type: 'run', duration: 20, avgHr: 130 }],
        load: load({ hrAboveMin: 70, hrBands: [40, 10, 20], hrCoverageMin: 800, lineBpm: 95, hrStretches: 2 }),
      }),
      types: TYPES, lineBpm: 95,
    });
    const row = b.rows.find((r) => r.source === 'hr')!;
    expect(sum(row)).toBeCloseTo(row.effortMin, 5);
    // 20 minutes came off the top band, so the top band cannot still be listed
    // at its stored size.
    expect(row.parts!.some((p) => p.label.includes('20m at 120+ bpm'))).toBe(false);
  });
});

describe('Apple Stand Time is a floor, not a verdict', () => {
  it('never charges less upright time than the day demonstrably walked', () => {
    // The shape that shipped wrong: a watch credits a stand hour from a short
    // burst and writes 34m for a day holding 1h 59m of measured walking.
    const up = uprightMinutes(load({ standMin: 34, walkingMin: 119, stillUprightMin: 238 }));
    expect(up).toEqual({ min: 357, source: 'walk+still' });
  });

  it('still prefers stand time when it saw more of the day', () => {
    expect(uprightMinutes(load({ standMin: 220, walkingMin: 70, stillUprightMin: 60 })))
      .toEqual({ min: 220, source: 'stand' });
  });
});

describe('thinHrCurve', () => {
  /** A quiet day at 70 with one short climb to 128, sampled every second. */
  const dayWithSpike = () => {
    const out: { t: number; bpm: number }[] = [];
    for (let t = 0; t < 8 * 3600; t++) out.push({ t, bpm: t >= 4000 && t < 4120 ? 128 : 70 });
    return out;
  };

  it('keeps a spike that a stride decimation would drop', () => {
    const thin = thinHrCurve(dayWithSpike(), 400);
    expect(thin.length).toBeLessThanOrEqual(400);
    // The whole point: the drill-in draws this curve under a row counted from
    // the raw series, so the peak has to survive at its own height.
    expect(Math.max(...thin.map((p) => p.bpm))).toBe(128);
    expect(Math.min(...thin.map((p) => p.bpm))).toBe(70);
  });

  it('keeps the curve in clock order', () => {
    const thin = thinHrCurve(dayWithSpike(), 400);
    thin.forEach((p, i) => { if (i) expect(p.t).toBeGreaterThanOrEqual(thin[i - 1].t); });
  });

  it('leaves a series that already fits alone', () => {
    const small = [{ t: 0, bpm: 60 }, { t: 60, bpm: 90 }];
    expect(thinHrCurve(small, 400)).toEqual(small);
  });
});

describe('the gap tolerance is read off the day, not off one sensor', () => {
  /** A day sampled every `everyMin` minutes with jitter, over 16 waking hours. */
  const sampleDay = (everyMin: number, jitterMin = 0, bpm: (sec: number) => number = () => 74) => {
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const out: { t: number; bpm: number }[] = [];
    for (let t = 6 * 3600; t < 22 * 3600; t += (everyMin + (rnd() * 2 - 1) * jitterMin) * 60) {
      out.push({ t, bpm: bpm(t) });
    }
    return out;
  };

  it('leaves a continuous strap day at exactly the old threshold', () => {
    // The floor is what makes this change safe: nothing about a day that was
    // already covered end to end may move.
    expect(gapToleranceFor(sampleDay(1 / 60))).toBe(HR_GAP_MIN);
    expect(gapToleranceFor(sampleDay(1))).toBe(HR_GAP_MIN);
  });

  it('stretches to meet a background wrist', () => {
    expect(gapToleranceFor(sampleDay(3, 1))).toBeGreaterThan(HR_GAP_MIN);
    expect(gapToleranceFor(sampleDay(8, 3))).toBeGreaterThan(HR_GAP_MIN);
    expect(gapToleranceFor(sampleDay(8, 3))).toBeLessThanOrEqual(HR_GAP_MAX);
  });

  /* The ordinary cap may not decide that a regularly sampled day did not
     happen. At a 20-minute cadence a fixed 20-minute ceiling marked EVERY
     interval uncovered: 66 real minutes above the line came back as 7, and at
     30 minutes the day read as never watched at all. */
  it('never lands below the day\'s own cadence', () => {
    [20, 30, 40].forEach((cadence) => {
      const s = sampleDay(cadence, 2);
      const tol = gapToleranceFor(s);
      expect(tol).toBeGreaterThan(cadence);
      const r = hrMinutesAbove(s, 90)!;
      expect(r.coverageMin).toBeGreaterThan(HR_FULL_COVERAGE);
    });
  });

  /* ...but a handful of readings is not a cadence. Four samples a day have a
     "typical gap" of hours, and letting that raise the ceiling would report a
     day nobody watched as watched end to end. */
  it('still refuses to bridge hours, however sparse the day', () => {
    const four = [{ t: 0, bpm: 70 }, { t: 3 * 3600, bpm: 70 }, { t: 9 * 3600, bpm: 70 }, { t: 15 * 3600, bpm: 70 }];
    expect(gapToleranceFor(four)).toBe(HR_GAP_HARD);
    expect(hrMinutesAbove(four, 60)!.coverageMin).toBe(0);
  });

  it('gives a background day real coverage where it used to have almost none', () => {
    // The whole point. At an eight-minute cadence every single interval used
    // to exceed a fixed five-minute threshold, so a fully worn watch reported
    // a day the app could not see and the burn dropped its heart-rate row.
    const s = sampleDay(8, 3);
    const r = hrMinutesAbove(s, 90)!;
    expect(r.coverageMin).toBeGreaterThan(HR_FULL_COVERAGE);
    let oldCoverage = 0;
    for (let i = 1; i < s.length; i++) {
      const g = (s[i].t - s[i - 1].t) / 60;
      if (g > 0 && g <= HR_GAP_MIN) oldCoverage += g;
    }
    expect(oldCoverage).toBeLessThan(HR_MIN_COVERAGE);
  });

  it('still calls a charger break unknown', () => {
    // A tolerance fitted to the day must never swallow the case it exists to
    // catch: hours with the watch off are not a restful afternoon.
    const s = [...sampleDay(6, 2).filter((p) => p.t < 10 * 3600), ...sampleDay(6, 2).filter((p) => p.t > 16 * 3600)];
    const r = hrMinutesAbove(s, 90)!;
    expect(r.coverageMin).toBeLessThan(10 * 60);
  });

  it('answers ONE day the same at every sampling rate', () => {
    // A fixed day with four walks over the line, totalling 71 minutes,
    // resampled from a strap's cadence down to a lazy wrist's. Before the
    // crossing was interpolated the sparse rates ran 15 to 31% over, because
    // an interval was charged whole whenever its two samples AVERAGED above.
    const LINE = 90;
    const walks: [number, number][] = [[8 * 60, 8 * 60 + 25], [11 * 60, 11 * 60 + 4], [14 * 60, 14 * 60 + 40], [18 * 60, 18 * 60 + 2]];
    const truth = walks.reduce((s, [a, b]) => s + (b - a), 0);
    const bpm = (sec: number) => (walks.some(([a, b]) => sec / 60 >= a && sec / 60 < b) ? 112 : 74);
    ([[1 / 60, 0], [1, 0], [3, 1], [5, 2], [8, 3], [10, 4]] as [number, number][]).forEach(([every, jit]) => {
      const r = hrMinutesAbove(sampleDay(every, jit, bpm), LINE)!;
      expect(Math.abs(r.aboveMin - truth) / truth).toBeLessThan(0.15);
    });
  });

  it('charges only the part of an interval that was above the line', () => {
    // A ten-minute cadence with one reading of 120 in the middle of a quiet
    // day. The line is three quarters of the way from 80 to 120, so each of
    // the two intervals touching the spike was above it for a quarter of its
    // length going up and a quarter coming down: 15 minutes, not the 20 the
    // old whole-interval rule charged, and not the 0 a five-minute threshold
    // would have seen.
    const s: { t: number; bpm: number }[] = [];
    for (let i = 0; i < 40; i++) s.push({ t: i * 600, bpm: i === 20 ? 120 : 80 });
    const r = hrMinutesAbove(s, 90)!;
    expect(r.aboveMin).toBe(15);
    expect(r.peak).toBe(120);
  });
});
