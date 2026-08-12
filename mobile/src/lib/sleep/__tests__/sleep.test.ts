import { addDays } from '../../dates';
import { sleepGrade } from '../../scoring/day';
import type { DayRecord, Entry } from '../../types';
import {
  DIP_MIN_BASELINE, buildSleepReport, clockFromNoon, dipBandFor, dipHistory,
  gradeReasons, minsPastNoon, nightOf, nocturnalDip, recentNights,
  lowestRollingMean, respMedian, restingHrBaseline, scheduleSeries, sleepBalance,
  stageSeries, thinSeries, timeToFloor, typicalOvernightLow, wakeCat, wakeStats,
} from '../index';

type Days = Record<string, DayRecord>;

const day = (over: Partial<DayRecord> = {}): DayRecord => ({ readings: [], activities: [], meds: [], symptoms: [], ...over } as DayRecord);

const resting = (hr: number, i = 0): Entry => ({ id: `r${hr}-${i}`, type: 'restingHr', time: '09:00', hr, position: 'Sitting' });

const night = (bed: string, wake: string, over: Partial<{ quality: string; hrLow: number; hrHigh: number; stages: { deep: number; rem: number; core: number; awake: number } }> = {}) =>
  day({ sleep: { bed, wake, ...over } as never });

/** A run of `n` nights ending at `dk`, all identical. */
function run(dk: string, n: number, make: (i: number) => DayRecord): Days {
  const days: Days = {};
  for (let i = 0; i < n; i++) days[addDays(dk, -i)] = make(i);
  return days;
}

describe('clock helpers', () => {
  it('puts evening and morning on one continuous axis', () => {
    expect(minsPastNoon('12:00')).toBe(0);
    expect(minsPastNoon('21:00')).toBe(540);
    expect(minsPastNoon('23:50')).toBe(710);
    expect(minsPastNoon('00:10')).toBe(730); // ten minutes later, not 23h earlier
    expect(minsPastNoon('07:18')).toBe(1158);
    expect(minsPastNoon('nonsense')).toBeNull();
  });

  it('round-trips back to a clock time', () => {
    ['21:00', '23:50', '00:10', '07:18', '12:00'].forEach((t) => {
      expect(clockFromNoon(minsPastNoon(t)!)).toBe(t);
    });
  });
});

describe('nightOf', () => {
  it('measures the window across midnight', () => {
    const days: Days = { '2026-08-10': night('23:12', '07:18') };
    const n = nightOf(days, '2026-08-10')!;
    expect(n.inBedMin).toBe(8 * 60 + 6);
    expect(n.interrupted).toBe(false);
    expect(n.asleepMin).toBeNull();
  });

  it('uses staged sleep when the staging still describes the window', () => {
    const days: Days = { '2026-08-10': night('23:12', '07:18', { stages: { deep: 62, rem: 88, core: 312, awake: 24 } }) };
    const n = nightOf(days, '2026-08-10')!;
    expect(n.asleepMin).toBe(462);
  });

  it('drops staging that no longer spans a hand-corrected window', () => {
    // Stages describe a four-hour night; the user corrected bed/wake to eight.
    const days: Days = { '2026-08-10': night('23:12', '07:18', { stages: { deep: 30, rem: 40, core: 130, awake: 10 } }) };
    expect(nightOf(days, '2026-08-10')!.asleepMin).toBeNull();
  });

  it('returns null without both endpoints', () => {
    expect(nightOf({ '2026-08-10': night('23:12', '') }, '2026-08-10')).toBeNull();
    expect(nightOf({}, '2026-08-10')).toBeNull();
  });
});

describe('resting-HR baseline', () => {
  const dk = '2026-08-10';

  it('needs a real number of readings before it claims one', () => {
    const days: Days = { [dk]: day({ readings: [resting(60), resting(62, 1)] }) };
    expect(restingHrBaseline(days, dk)).toBeNull();
  });

  it('is a median, so one outlier cannot drag it', () => {
    const days: Days = { [dk]: day({ readings: [resting(60), resting(62, 1), resting(61, 2), resting(140, 3)] }) };
    const b = restingHrBaseline(days, dk)!;
    expect(b.bpm).toBe(61.5);
    expect(b.count).toBe(4);
  });

  it('ignores readings outside the window and after the night', () => {
    const days: Days = {
      [dk]: day({ readings: [resting(60), resting(62, 1), resting(61, 2)] }),
      [addDays(dk, -40)]: day({ readings: [resting(90, 9)] }),
      [addDays(dk, 1)]: day({ readings: [resting(95, 8)] }),
    };
    expect(restingHrBaseline(days, dk)!.count).toBe(3);
  });
});

describe('nocturnal dip', () => {
  const dk = '2026-08-10';
  const withBaseline = (hrLow: number, bpm = 62): Days => ({
    [dk]: {
      ...night('23:12', '07:18', { hrLow }),
      readings: [resting(bpm), resting(bpm, 1), resting(bpm, 2)],
    } as DayRecord,
  });

  it('bands a normal night as dipping', () => {
    const dip = nocturnalDip(withBaseline(52), dk)!;
    expect(Math.round(dip.pct)).toBe(16);
    expect(dip.band.key).toBe('dipping');
    expect(dip.basis).toBe('single-minimum');
  });

  it('bands an overnight low above the baseline as reverse', () => {
    const dip = nocturnalDip(withBaseline(71), dk)!;
    expect(Math.round(dip.pct)).toBe(-15);
    expect(dip.band.key).toBe('reverse');
  });

  it('bands the middle of the range', () => {
    expect(dipBandFor(7).key).toBe('reduced');
    expect(dipBandFor(2).key).toBe('nonDipping');
    expect(dipBandFor(0).key).toBe('nonDipping');
    expect(dipBandFor(-0.5).key).toBe('reverse');
    expect(dipBandFor(10).key).toBe('dipping');
  });

  it('is absent without a baseline, however good the low', () => {
    const days: Days = { [dk]: night('23:12', '07:18', { hrLow: 48 }) };
    expect(nocturnalDip(days, dk)).toBeNull();
  });

  it('is absent without an overnight low', () => {
    const days: Days = { [dk]: { ...night('23:12', '07:18'), readings: [resting(62), resting(62, 1), resting(62, 2)] } as DayRecord };
    expect(nocturnalDip(days, dk)).toBeNull();
  });

  it('accepts a caller-supplied low and reports the basis it used', () => {
    const dip = nocturnalDip(withBaseline(71), dk, { low: 55, basis: 'sleeping-mean' })!;
    expect(dip.low).toBe(55);
    expect(dip.basis).toBe('sleeping-mean');
  });

  it('leaves nights with no low as null in the trend rather than dropping them', () => {
    const days: Days = {
      ...withBaseline(52),
      [addDays(dk, -1)]: night('23:00', '07:00'),
    };
    const hist = dipHistory(days, dk, 3, addDays);
    expect(hist.map((h) => h.dip == null)).toEqual([true, true, false]);
    // Each night carries its whole result, so selecting one in the chart can
    // re-read the low and baseline it was measured against.
    expect(hist[2].dip!.low).toBe(52);
    expect(hist[2].dip!.baseline.bpm).toBe(62);
  });

  it('bands dipping and reduced on the app’s own grade scale, not its own palette', () => {
    expect(dipBandFor(14).cat).toBe('great');
    expect(dipBandFor(7).cat).toBe('good');
    expect(dipBandFor(2).cat).toBe('bad');
    expect(dipBandFor(-4).cat).toBe('crash');
  });
});

describe('schedule + balance', () => {
  const dk = '2026-08-10';

  it('averages the rolling week BEFORE each night, never including itself', () => {
    // Five nights at 22:00, then one at 01:00.
    const days: Days = {};
    for (let i = 1; i <= 5; i++) days[addDays(dk, -i)] = night('22:00', '06:00');
    days[dk] = night('01:00', '09:00');
    const series = scheduleSeries(days, dk, addDays, 6);
    const last = series[series.length - 1];
    expect(last.avgBedAt).toBe(minsPastNoon('22:00'));   // the average excludes tonight
    expect(last.bedAt).toBe(minsPastNoon('01:00'));
  });

  it('grades each bar on how long the night was, matching sleepGrade’s ladder', () => {
    const days: Days = {};
    for (let i = 0; i <= 3; i++) days[addDays(dk, -i)] = night('22:00', '06:00');   // 8h
    days[addDays(dk, -1)] = night('23:00', '04:30');                                 // 5h30
    const series = scheduleSeries(days, dk, addDays, 4);
    expect(series[3].minutes).toBe(480);
    expect(series[3].cat).toBe('great');
    expect(series[2].cat).toBe('bad');
  });

  it('builds the first bar’s average from nights BEFORE the window, not from the window', () => {
    // A month of 22:00 nights; plot only the last three. The leftmost bar must
    // still carry an average, or the band would be "a rolling average of
    // whatever is on screen" rather than of the user's actual history.
    const days: Days = {};
    for (let i = 0; i < 20; i++) days[addDays(dk, -i)] = night('22:00', '06:00');
    const series = scheduleSeries(days, dk, addDays, 3);
    expect(series).toHaveLength(3);
    expect(series[0].avgBedAt).toBe(minsPastNoon('22:00'));
  });

  it('leaves the schedule average absent until there is enough behind it', () => {
    const days: Days = {};
    for (let i = 0; i <= 3; i++) days[addDays(dk, -i)] = night('22:00', '06:00');
    const series = scheduleSeries(days, dk, addDays, 4);
    expect(series[0].avgBedAt).toBeNull();               // nothing before it
    expect(series[1].avgBedAt).toBeNull();               // one prior night
    expect(series[2].avgBedAt).toBeNull();               // two
    expect(series[3].avgBedAt).not.toBeNull();           // three clears the bar
  });

  it('keeps unlogged nights in the schedule and stage series as gaps', () => {
    const days: Days = { [dk]: night('23:00', '07:00', { stages: { deep: 60, rem: 90, core: 300, awake: 30 } }) };
    const sched = scheduleSeries(days, dk, addDays, 3);
    expect(sched.map((n) => n.bedAt == null)).toEqual([true, true, false]);
    const stages = stageSeries(days, dk, 3, addDays);
    expect(stages.map((n) => n.stages == null)).toEqual([true, true, false]);
    expect(stages[2].stages!.deep).toBe(60);
  });

  it('runs the balance against the user’s own target', () => {
    const nights = recentNights(run(dk, 4, () => night('23:00', '05:00')), dk, 14, addDays);
    const bal = sleepBalance(nights, 7)!;
    expect(bal.avgHours).toBe(6);
    expect(bal.totalDeltaHours).toBe(-4);
    expect(bal.cumulative).toEqual([-1, -2, -3, -4]);
  });

  it('has no balance below four nights', () => {
    const nights = recentNights(run(dk, 3, () => night('23:00', '05:00')), dk, 14, addDays);
    expect(sleepBalance(nights, 7)).toBeNull();
  });

  it('skips unlogged nights rather than counting them as short', () => {
    const days: Days = { [dk]: night('23:00', '07:00'), [addDays(dk, -3)]: night('23:00', '07:00') };
    expect(recentNights(days, dk, 14, addDays).map((n) => n.dk)).toEqual([addDays(dk, -3), dk]);
  });
});

describe('overnight series', () => {
  const curve = (pts: [number, number][]) => pts.map(([t, bpm]) => ({ t, bpm }));

  it('thins a long series but keeps both ends', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => i);
    const out = thinSeries(rows, 400);
    expect(out).toHaveLength(400);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(4999);
    // Short series pass through untouched.
    expect(thinSeries([1, 2, 3], 400)).toEqual([1, 2, 3]);
  });

  it('measures the dip floor from a settled stretch, not one stray beat', () => {
    // A flat 60 bpm night with a single 38 bpm artifact dropped into it.
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) pts.push([i * 60, i === 40 ? 38 : 60]);
    const hr = curve(pts);
    // The single minimum is the artifact; the ten-minute floor is not.
    expect(Math.min(...hr.map((q) => q.bpm))).toBe(38);
    expect(lowestRollingMean(hr)).toBeGreaterThan(55);
  });

  it('finds the real floor when the night actually settles', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 180; i++) pts.push([i * 60, i >= 60 && i < 90 ? 48 : 66]);
    expect(lowestRollingMean(curve(pts))).toBeCloseTo(48, 0);
  });

  it('measures every night in the dip trend the same way as the headline', () => {
    // A flat 70 bpm night whose stored hrLow is a 40 bpm artifact. Given the
    // curve, both the bar and the headline must read the settled stretch — the
    // bug was the headline using it and the bar not, so the number jumped the
    // moment you touched the bar it was already showing.
    const flat = [];
    for (let i = 0; i <= 120; i++) flat.push({ t: i * 60, bpm: i === 30 ? 40 : 70 });
    const days: Days = {
      [dkSeries]: {
        ...night('23:00', '07:00', { hrLow: 40 }),
        readings: [resting(80), resting(80, 1), resting(80, 2)],
      } as DayRecord,
    };
    const rep = buildSleepReport(days, dkSeries, addDays, {}, null, {
      hr: flat, hrByDay: { [dkSeries]: flat },
    })!;
    const lastBar = rep.dipTrend[rep.dipTrend.length - 1].dip!;
    expect(rep.dip!.pct).toBe(lastBar.pct);
    expect(rep.dip!.basis).toBe('rolling-low');
    // A ten-minute mean dilutes the artifact instead of being defined by it:
    // the single minimum is 40, the settled floor is up near the real rate.
    expect(rep.dip!.low).toBeGreaterThan(65);
  });

  it('has no floor without a full window of samples', () => {
    expect(lowestRollingMean(curve([[0, 60], [120, 58]]))).toBeNull();
    expect(lowestRollingMean([])).toBeNull();
  });

  it('reports how long the night took to reach its lowest point', () => {
    const pts: [number, number][] = [[0, 70], [3600, 62], [7200, 51], [10800, 58]];
    expect(timeToFloor(curve(pts))).toBe(7200);
  });

  it('counts wake-ups off the hypnogram, ignoring brief stirrings', () => {
    const spans: { s: number; d: number; v: 'deep' | 'rem' | 'core' | 'awake' }[] = [
      { s: 0, d: 1800, v: 'core' },
      { s: 1800, d: 60, v: 'awake' },      // a stirring, not a wake-up
      { s: 1860, d: 3600, v: 'deep' },
      { s: 5460, d: 900, v: 'awake' },     // fifteen minutes — a wake-up
    ];
    const w = wakeStats(spans)!;
    expect(w.count).toBe(1);
    expect(w.totalMin).toBe(16);
    expect(w.longestMin).toBe(15);
    expect(w.blocks).toHaveLength(2);
  });

  it('has no wakefulness without spans', () => {
    expect(wakeStats(null)).toBeNull();
    expect(wakeStats([])).toBeNull();
  });

  it('takes a median respiratory rate, so one wild sample cannot move it', () => {
    expect(respMedian([{ t: 0, br: 15 }, { t: 60, br: 16 }, { t: 120, br: 40 }])).toBe(16);
    expect(respMedian([])).toBeNull();
    expect(respMedian(null)).toBeNull();
  });

  it('reads the typical low as a median of prior nights only', () => {
    const days: Days = {};
    for (let i = 1; i <= 5; i++) days[addDays(dkSeries, -i)] = night('23:00', '07:00', { hrLow: 50 + i });
    days[dkSeries] = night('23:00', '07:00', { hrLow: 90 });   // tonight is excluded
    expect(typicalOvernightLow(days, dkSeries)).toBe(53);
  });
});

const dkSeries = '2026-08-10';

describe('time awake', () => {
  const st = (awake: number) => ({ deep: 60, rem: 90, core: 270, awake });

  it('grades on the wake-after-sleep-onset ladder', () => {
    expect(wakeCat(st(10))).toBe('great');
    expect(wakeCat(st(24))).toBe('good');
    expect(wakeCat(st(40))).toBe('ok');
    expect(wakeCat(st(50))).toBe('bad');
    expect(wakeCat(st(120))).toBe('crash');
  });

  it('grades the same minutes the same way whatever the night’s length', () => {
    // The scale is the number itself, so it can be drawn as zone lines on the
    // chart's own axis — which a share-based grade could not be.
    expect(wakeCat({ deep: 60, rem: 90, core: 500, awake: 24 })).toBe('good');
    expect(wakeCat({ deep: 30, rem: 30, core: 90, awake: 24 })).toBe('good');
  });

  it('is absent without staging', () => {
    expect(wakeCat(null)).toBeNull();
    expect(wakeCat(undefined)).toBeNull();
  });
});

describe('grade reasons', () => {
  const dk = '2026-08-10';

  it('explain the grade the scoring engine actually gave', () => {
    const days: Days = { [dk]: night('23:12', '07:18', { hrLow: 71, hrHigh: 104 }) };
    expect(sleepGrade(days, dk)).toBe('good'); // 8h06 uninterrupted = great, demoted one step by a 71 low
    const reasons = gradeReasons(days, dk);
    expect(reasons).toHaveLength(3);
    expect(reasons[0].text).toContain('uninterrupted');
    expect(reasons[1].cat).toBe('bad');
    expect(reasons[1].text).toContain('71 bpm');
    expect(reasons[2].cat).toBeNull();
    expect(reasons[2].text).toContain('cost nothing');
  });

  it('name the interruption when the user marked one', () => {
    const days: Days = { [dk]: night('00:40', '08:05', { quality: 'interrupted' }) };
    const reasons = gradeReasons(days, dk);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].text).toContain('interrupted');
  });

  it('are empty without a night', () => {
    expect(gradeReasons({}, dk)).toEqual([]);
  });
});

describe('buildSleepReport', () => {
  const dk = '2026-08-10';

  it('returns null when no night was recorded', () => {
    expect(buildSleepReport({ [dk]: day() }, dk, addDays)).toBeNull();
  });

  it('reads as a complete report on a times-only night', () => {
    const days: Days = { [dk]: night('23:00', '07:00') };
    const rep = buildSleepReport(days, dk, addDays)!;
    expect(rep.grade).toBe('great');
    expect(rep.reasons).toHaveLength(1);
    expect(rep.gradeNote).toContain('no overnight heart rate');
    // Everything that needs data it does not have is absent, not empty.
    expect(rep.dip).toBeNull();
    expect(rep.dipPrompt).toBeNull();
    expect(rep.stageNights.every((n) => n.stages == null)).toBe(true);
    expect(rep.schedule).toBeNull();
    expect(rep.balance).toBeNull();
    expect(rep.nextDay).toEqual([]);
    expect(rep.shared).toEqual([]);
  });

  it('offers the dip prompt when the low is known but the baseline is thin', () => {
    const days: Days = {
      [dk]: { ...night('23:00', '07:00', { hrLow: 66 }), readings: [resting(62)] } as DayRecord,
    };
    const rep = buildSleepReport(days, dk, addDays)!;
    expect(rep.dip).toBeNull();
    expect(rep.dipPrompt).toEqual({ low: 66, baselineCount: 1, needed: DIP_MIN_BASELINE });
  });

  it('fills the dip in once the baseline exists', () => {
    const days: Days = {
      [dk]: { ...night('23:00', '07:00', { hrLow: 52 }), readings: [resting(62), resting(62, 1), resting(62, 2)] } as DayRecord,
    };
    const rep = buildSleepReport(days, dk, addDays)!;
    expect(rep.dipPrompt).toBeNull();
    expect(rep.dip!.band.key).toBe('dipping');
    expect(rep.dipTrend).toHaveLength(10);
  });

  it('uses the user’s own sleep target for the balance', () => {
    const days = run(dk, 6, () => night('23:00', '05:00'));
    const rep = buildSleepReport(days, dk, addDays, {}, { sleep: { enabled: true, hours: 8 } } as never)!;
    expect(rep.balance!.targetHours).toBe(8);
    expect(rep.balance!.totalDeltaHours).toBe(-12);
  });
});
