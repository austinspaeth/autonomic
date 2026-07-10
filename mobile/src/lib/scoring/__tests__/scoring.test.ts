/**
 * Regression tests: known inputs must produce the SAME categories the web app
 * (docs/index.html) produces. Expected values were derived by hand from the
 * web app's s* thresholds — do not change them without changing the web app.
 */
import type { DayRecord, Entry, Protocol } from '../../types';
import {
  BANDS, CAT_POINTS, GRADE_PTS, SCORE_RANK, bpBce, bpKerdo, bpKvas, bpMap,
  bpPP, bpRobinson, catFromBands, computeScores, expectedHf, hrvComposite,
  restingHrBands, rowScoreCategory, sHfPeak, sLfPeak, sSys, totalPower, worstCat,
} from '../index';
import {
  DEFAULT_PROTOCOL, activityGrade, blueZone, dayCleanliness, resolveProtocol, scoreCat,
  scoreSet, sleepGrade, sleepHours, streakInfo, streakTier,
} from '../day';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

describe('constants pinned to the web app', () => {
  it('CAT_POINTS / GRADE_PTS / SCORE_RANK exact values', () => {
    expect(CAT_POINTS).toEqual({ great: 90, good: 75, ok: 55, bad: 38, crash: 18, concerning: 18, warning: 72 });
    expect(GRADE_PTS).toEqual({ great: 95, good: 80, ok: 60, warning: 60, bad: 35, crash: 10, concerning: 10 });
    expect(SCORE_RANK).toEqual({ great: 0, good: 1, ok: 2, warning: 2, bad: 3, crash: 4, concerning: 4 });
  });
  it('expectedHf per breathing style', () => {
    expect(expectedHf('4/4')).toEqual([0.18, 0.21]);
    expect(expectedHf('4/5')).toEqual([0.17, 0.2]);
    expect(expectedHf('4/6')).toEqual([0.15, 0.18]);
    expect(expectedHf('5/5')).toEqual([0.16, 0.18]);
    expect(expectedHf('7/7')).toBeNull();
  });
});

describe('catFromBands', () => {
  it('returns first band whose v < max, else last cat', () => {
    expect(catFromBands(10, BANDS.rmssdS)).toBe('crash');
    expect(catFromBands(17, BANDS.rmssdS)).toBe('bad');
    expect(catFromBands(26.9, BANDS.rmssdS)).toBe('ok');
    expect(catFromBands(31.9, BANDS.rmssdS)).toBe('good');
    expect(catFromBands(32, BANDS.rmssdS)).toBe('great');
    expect(catFromBands(99999, BANDS.rmssdS)).toBe('great');
  });
});

describe('breathing HRV computeScores — fixture matches web categories', () => {
  // A realistic strong reading
  const r: Entry = {
    id: 'a', type: 'breathHrv', style: '4/6',
    sdnn: '62', hr: '61', meanRr: '980', rmssd: '35', pnn50: '12', mxdmn: '0.4',
    mode: '960', amo50: '28', cv: '7.5', vlowPower: '150', lowPower: '2500',
    highPower: '1200', lfPeak: '0.095', hfPeak: '0.16',
  };
  const s = computeScores(r);
  it('grades every metric like the web app', () => {
    expect(s.sdnn).toBe('great');
    expect(s.rmssd).toBe('great');
    expect(s.pnn50).toBe('great');
    expect(s.totalPower).toBe('great'); // 3850
    expect(s.vlf).toBe('great');
    expect(s.lfPeak).toBe('great');
    expect(s.hfPeak).toBe('great'); // in [0.15, 0.18] for 4/6
    expect(s.lfhf).toBe('good'); // 2500/1200 = 2.08 -> <=3 good
    expect(s.hr).toBe('great');
    expect(s.meanRr).toBe('great');
    expect(s.mode).toBe('great');
    expect(s.mxdmn).toBe('great');
    expect(s.amo50).toBe('great');
    expect(s.cv).toBe('great');
    expect(s.overall).toBe('great');
  });
  it('composite hero score uses documented weights', () => {
    // all six weighted metrics are "great" (90 pts) except lfhf good (75)
    // weights: rmssd25 pnn50:15 tp15 lfPeak20 hfPeak15 lfhf10
    const { score, overall } = hrvComposite(r);
    expect(overall).toBe('great');
    expect(score).toBe(Math.round((90 * 90 + 75 * 10) / 100)); // 89
  });

  it('weak reading grades bad/crash like the web app', () => {
    const weak: Entry = {
      id: 'b', type: 'breathHrv', style: '4/5',
      sdnn: '25', rmssd: '15', pnn50: '1', vlowPower: '1200', lowPower: '300',
      highPower: '25', lfPeak: '0.05', hfPeak: '0.30',
      hr: '90', meanRr: '660', mode: '650', mxdmn: '0.1', amo50: '65', cv: '2',
    };
    const w = computeScores(weak);
    expect(w.sdnn).toBe('crash');
    expect(w.rmssd).toBe('crash');
    expect(w.pnn50).toBe('crash');
    expect(w.totalPower).toBe('ok'); // 1525 >= 1500 -> ok
    expect(w.vlf).toBe('crash');
    expect(w.lfPeak).toBe('bad');
    expect(w.hfPeak).toBe('bad'); // 0.30 vs [0.17,0.20] -> d=0.10
    expect(w.lfhf).toBe('concerning'); // 12
    expect(w.hr).toBe('concerning');
    expect(w.meanRr).toBe('concerning');
    expect(w.mxdmn).toBe('crash');
    expect(w.amo50).toBe('concerning');
    expect(w.cv).toBe('crash');
    expect(w.overall).toBe('crash');
  });
});

describe('unstructured HRV', () => {
  it('uses the unstructured RMSSD thresholds (34 for great)', () => {
    expect(computeScores({ id: 'x', type: 'hrv', rmssd: '33' }).rmssd).toBe('good');
    expect(computeScores({ id: 'x', type: 'hrv', rmssd: '34' }).rmssd).toBe('great');
    // structured great at 32
    expect(computeScores({ id: 'x', type: 'breathHrv', rmssd: '32' }).rmssd).toBe('great');
  });
  it('grades pns/sns/stress via bands', () => {
    const s = computeScores({ id: 'x', type: 'hrv', pns: '-2', sns: '2', stressIndex: '400' });
    expect(s.pns).toBe('crash');
    expect(s.sns).toBe('bad');
    expect(s.stressIndex).toBe('bad');
  });
  it('both HRV kinds grade the same balance metrics', () => {
    const fields = { pns: '1', sns: '0', stressIndex: '120' };
    const u = computeScores({ id: 'u', type: 'hrv', ...fields });
    const b = computeScores({ id: 'b', type: 'breathHrv', ...fields });
    (['pns', 'sns', 'stressIndex'] as const).forEach((k) => {
      expect(u[k]).toBeDefined();
      expect(b[k]).toBe(u[k]);
    });
  });
});

describe('BP / resting HR / orthostatic', () => {
  it('sSys and sDia both-sided zones, sBP = worst', () => {
    expect(sSys('115')).toBe('great');
    expect(sSys('95')).toBe('bad');
    expect(sSys('152')).toBe('concerning');
    const s = computeScores({ id: 'x', type: 'bp', sys: '115', dia: '92' });
    expect(s.sys).toBe('great');
    expect(s.dia).toBe('bad');
    expect(s.bp).toBe('bad');
    expect(rowScoreCategory({ id: 'x', type: 'bp', sys: '115', dia: '92' })).toBe('bad');
  });
  it('resting HR depends on position', () => {
    expect(computeScores({ id: 'x', type: 'restingHr', hr: '70', position: 'Laying' }).hr).toBe('ok');
    expect(computeScores({ id: 'x', type: 'restingHr', hr: '70', position: 'Sitting' }).hr).toBe('good');
  });
  it('restingHrBands lay vs sit', () => {
    expect(catFromBands(66, restingHrBands('Laying'))).toBe('good');
    expect(catFromBands(66, restingHrBands('Sitting'))).toBe('great');
  });
  it('orthostatic increase + recovery', () => {
    const s = computeScores({ id: 'x', type: 'orthostatic', beforeHr: '65', afterHr: '95', hr1min: '80' });
    expect(s.increase).toBe('bad'); // +30 rise: 30 < 40 -> 'bad' (POTS threshold zone)
    expect(s.recovery).toBe('good'); // drop of 15: 12 <= 15 < 20 -> 'good'
    expect(s.overall).toBe('bad'); // event rated on the standing rise
  });
});

// Correction: verify the orthostatic bands directly rather than trusting the comment above.
describe('orthostatic bands exact', () => {
  it('increase of 30 is "bad" zone start (30 < 40)', () => {
    expect(catFromBands(30, BANDS.orthoIncrease)).toBe('bad');
    expect(catFromBands(29, BANDS.orthoIncrease)).toBe('ok');
    expect(catFromBands(45, BANDS.orthoIncrease)).toBe('concerning');
  });
  it('recovery of 15 is "good" (12 <= 15 < 20)', () => {
    expect(catFromBands(15, BANDS.orthoRecovery)).toBe('good');
    expect(catFromBands(-2, BANDS.orthoRecovery)).toBe('concerning');
  });
});

describe('sLfPeak / sHfPeak edges', () => {
  it('lfPeak above 0.105 falls back to good', () => {
    expect(sLfPeak('0.10')).toBe('great');
    expect(sLfPeak('0.12')).toBe('good');
    expect(sLfPeak('0.04')).toBe('concerning');
  });
  it('hfPeak distance grading', () => {
    expect(sHfPeak('0.19', '4/6')).toBe('good'); // 0.01 over
    expect(sHfPeak('0.21', '4/6')).toBe('ok'); // 0.03 over
    expect(sHfPeak('0.25', '4/6')).toBe('bad');
  });
});

describe('BP derived indexes', () => {
  const r: Entry = { id: 'x', type: 'bp', sys: '120', dia: '75', pulse: '60' };
  it('formulas', () => {
    expect(bpMap(r)).toBeCloseTo((120 + 150) / 3);
    expect(bpPP(r)).toBe(45);
    expect(bpKerdo(r)).toBeCloseTo((1 - 75 / 60) * 100);
    expect(bpRobinson(r)).toBeCloseTo(72);
    expect(bpKvas(r)).toBeCloseTo((10 * 60) / 45);
    expect(bpBce(r)).toBe(45 * 60);
  });
});

describe('totalPower / worstCat', () => {
  it('sums present bands only', () => {
    expect(totalPower({ id: 'x', type: 'hrv', vlowPower: '100', lowPower: '200' })).toBe(300);
    expect(totalPower({ id: 'x', type: 'hrv' })).toBeNull();
  });
  it('worstCat ranks concerning with crash', () => {
    expect(worstCat(['great', 'ok', 'concerning'])).toBe('concerning');
    expect(worstCat(['good', 'warning'])).toBe('warning');
    expect(worstCat([])).toBeNull();
  });
});

describe('day scoring', () => {
  it('sleepHours spans midnight (same-day bed last night -> wake this morning)', () => {
    const days = {
      '2026-07-02': day({ sleep: { bed: '22:30', wake: '06:30' } }),
      '2026-07-03': day({ sleep: { bed: '', wake: '06:30' } }),
    };
    expect(sleepHours(days, '2026-07-02')).toBe(8);
    expect(sleepHours(days, '2026-07-03')).toBeNull(); // no bedtime
  });
  it('sleepGrade thresholds', () => {
    const days = {
      '2026-07-02': day({ sleep: { bed: '23:00', wake: '07:30', quality: 'good' } }),
    };
    expect(sleepGrade(days, '2026-07-02')).toBe('great'); // 8.5h good
    days['2026-07-02'].sleep.quality = 'interrupted';
    expect(sleepGrade(days, '2026-07-02')).toBe('ok'); // 8.5h but interrupted: >=7 -> interrupted gives 'ok'
  });
  it('sleepGrade interrupted 7h -> ok, 6h good -> ok, 5h -> bad, <5 -> crash', () => {
    const mk = (bed: string, wake: string, quality: 'good' | 'interrupted') => {
      const days = {
        '2026-07-02': day({ sleep: { bed, wake, quality } }),
      };
      return sleepGrade(days, '2026-07-02');
    };
    expect(mk('23:00', '06:30', 'interrupted')).toBe('ok'); // 7.5h interrupted
    expect(mk('23:30', '05:45', 'good')).toBe('ok'); // 6.25h good
    expect(mk('23:30', '04:45', 'good')).toBe('bad'); // 5.25h
    expect(mk('23:30', '03:00', 'good')).toBe('crash'); // 3.5h
  });
  it('activityGrade', () => {
    const a = (type: string): Entry => ({ id: 'x', type });
    expect(activityGrade([])).toBeNull();
    expect(activityGrade([a('walk')])).toBe('good');
    expect(activityGrade([a('upperBody'), a('coreWorkout')])).toBe('ok');
    expect(activityGrade([a('strenuousWork')])).toBe('bad');
    expect(activityGrade([a('upperBody'), a('coreWorkout'), a('indoorBike')])).toBe('bad');
  });
  it('scoreSet: RMSSD-only reading redistributes weight', () => {
    const readings: Entry[] = [{ id: 'x', type: 'breathHrv', rmssd: '35', time: '08:00' }];
    const d = day({ readings });
    const res = scoreSet(readings, d, '2026-07-02', { '2026-07-02': d });
    // components: HRV (great -> 95). No total power/pnn50/vlf/lfPeak (missing).
    // hr missing on the reading, so no resting HR either.
    expect(res.comps.map((c) => c.label)).toEqual(['HRV (RMSSD)']);
    expect(res.score).toBe(95);
    expect(res.confidence).toBe(25);
  });
  it('scoreSet: structured + unstructured blends RMSSD 70/30', () => {
    const readings: Entry[] = [
      { id: 'u', type: 'hrv', rmssd: '20', time: '08:00' }, // bad -> 35
      { id: 's', type: 'breathHrv', rmssd: '35', time: '08:30' }, // great -> 95
    ];
    const d = day({ readings });
    const res = scoreSet(readings, d, '2026-07-02', { '2026-07-02': d });
    const hrv = res.comps.find((c) => c.label === 'HRV (RMSSD)')!;
    expect(hrv.p).toBeCloseTo(0.7 * 95 + 0.3 * 35);
  });
  it('scoreCat bands', () => {
    expect(scoreCat(90).short).toBe('Excellent');
    expect(scoreCat(84).short).toBe('Good');
    expect(scoreCat(55).short).toBe('Moderate');
    expect(scoreCat(41).short).toBe('Compromised');
    expect(scoreCat(30).short).toBe('Bad');
    expect(scoreCat(5).short).toBe('Crash');
  });
  it('blueZone', () => {
    const readings: Entry[] = [
      { id: 'u', type: 'hrv', readiness: '92' },
      { id: 's', type: 'breathHrv', rmssd: '24' }, // ok
    ];
    expect(blueZone(readings)).toBe(true);
    expect(blueZone([{ id: 'u', type: 'hrv', readiness: '80' }, { id: 's', type: 'breathHrv', rmssd: '24' }])).toBe(false);
  });
  it('dayCleanliness criteria', () => {
    const days: Record<string, DayRecord> = {
      '2026-07-02': day({
        sleep: { bed: '22:00', wake: '06:00' },
        meds: [
          { id: '1', type: 'allegra' },
          { id: '2', type: 'pepsidAc' },
          { id: '3', type: 'magGlycinate' },
        ] as Entry[],
        food: { water: 3, calories: 0, triggers: {}, meals: [{ id: 'm', type: 'dinner', time: '16:30' }] },
      }),
    };
    const c = dayCleanliness(days, '2026-07-02')!;
    expect(c.clean).toBe(true);
    // add a trigger -> hard broken
    days['2026-07-02'].food.triggers.pizza = 1;
    const c2 = dayCleanliness(days, '2026-07-02')!;
    expect(c2.clean).toBe(false);
    expect(c2.criteria.find((x) => x.key === 'triggers')!.broken).toBe(true);
  });
  it('dayCleanliness honors a custom protocol', () => {
    const days: Record<string, DayRecord> = {
      '2026-07-02': day({
        sleep: { bed: '23:30', wake: '05:00' }, // 5.5h
        activities: [{ id: 'a', type: 'walk' }] as Entry[],
        food: { water: 1.5, calories: 0, triggers: { caffeine: 1 }, meals: [] },
      }),
    };
    // Default protocol: fails (no meds, low water, <7h sleep, a trigger logged).
    expect(dayCleanliness(days, '2026-07-02')!.clean).toBe(false);
    // Custom protocol: only require a walk + 1L water, everything else off.
    const proto: Protocol = {
      triggers: { enabled: false, types: [] },
      water: { enabled: true, liters: 1 },
      meds: { enabled: false, types: [] },
      activities: { enabled: true, types: ['walk'] },
      sleep: { enabled: false, hours: 7 },
    };
    const c = dayCleanliness(days, '2026-07-02', proto)!;
    expect(c.clean).toBe(true);
    expect(c.criteria.map((x) => x.key).sort()).toEqual(['activities:walk', 'water']);
  });
  it('each required medication is its own criterion', () => {
    const days: Record<string, DayRecord> = {
      '2026-07-02': day({ meds: [{ id: '1', type: 'allegra' }] as Entry[] }),
    };
    const proto: Protocol = { ...DEFAULT_PROTOCOL, triggers: { enabled: false, types: [] }, water: { enabled: false, liters: 0 }, sleep: { enabled: false, hours: 0 }, meds: { enabled: true, types: ['allegra', 'pepsidAc', 'magGlycinate'] } };
    const c = dayCleanliness(days, '2026-07-02', proto)!;
    const medCrit = c.criteria.filter((x) => x.key.startsWith('meds:'));
    expect(medCrit.map((x) => x.key)).toEqual(['meds:allegra', 'meds:pepsidAc', 'meds:magGlycinate']);
    expect(medCrit.find((x) => x.key === 'meds:allegra')!.pass).toBe(true);
    expect(medCrit.find((x) => x.key === 'meds:pepsidAc')!.pass).toBe(false);
  });
  it('protocol trigger selection narrows which triggers break the day', () => {
    const days: Record<string, DayRecord> = {
      '2026-07-02': day({ food: { water: 5, calories: 0, triggers: { caffeine: 1 }, meals: [] } }),
    };
    const only = (types: string[]): Protocol => ({ ...DEFAULT_PROTOCOL, triggers: { enabled: true, types }, water: { enabled: false, liters: 0 }, meds: { enabled: false, types: [] }, sleep: { enabled: false, hours: 0 } });
    // Caffeine logged but we only avoid alcohol -> triggers criterion passes.
    expect(dayCleanliness(days, '2026-07-02', only(['alcohol']))!.criteria.find((x) => x.key === 'triggers')!.pass).toBe(true);
    // Now avoiding caffeine -> broken.
    expect(dayCleanliness(days, '2026-07-02', only(['caffeine']))!.criteria.find((x) => x.key === 'triggers')!.broken).toBe(true);
  });
  it('resolveProtocol fills defaults and DEFAULT_PROTOCOL matches legacy rules', () => {
    expect(resolveProtocol(null)).toEqual(DEFAULT_PROTOCOL);
    expect(resolveProtocol({ water: { enabled: true, liters: 3 } }).water.liters).toBe(3);
    expect(resolveProtocol({ water: { enabled: true, liters: 3 } }).meds.types).toEqual(['allegra', 'pepsidAc', 'magGlycinate']);
  });
  it('streakTier labels', () => {
    expect(streakTier(0).tier).toBe('Start fresh');
    expect(streakTier(2).tier).toBe('Building');
    expect(streakTier(5).tier).toBe('Established');
    expect(streakTier(10).tier).toBe('Excellent');
    expect(streakTier(20).tier).toBe('Outstanding');
    expect(streakTier(45).tier).toBe('Elite');
  });
  it('streakInfo counts consecutive clean days', () => {
    const clean = () =>
      day({
        sleep: { bed: '21:00', wake: '06:00' },
        meds: [{ id: '1', type: 'allegra' }, { id: '2', type: 'pepsidAc' }, { id: '3', type: 'magGlycinate' }] as Entry[],
        food: { water: 3, calories: 0, triggers: {}, meals: [{ id: 'm', type: 'dinner', time: '16:30' }] },
      });
    const days: Record<string, DayRecord> = {
      '2026-06-29': clean(),
      '2026-06-30': clean(),
      '2026-07-01': clean(),
    };
    const si = streakInfo(days, '2026-07-01');
    // Each day now carries its own bed + wake (9h), so all three are clean.
    expect(si.current).toBe(3);
    expect(si.longest).toBe(3);
  });
});
