/**
 * Sleep summarization tests. Fixtures model the HealthKit realities the
 * module exists for: overlapping iPhone + Watch samples for the same night
 * (union, not sum) and naps inside the evening→afternoon query window
 * (main session, not earliest→latest).
 */
import { groupNights, nightKeyOf, summarizeSleep, SleepSample } from '../sleepSummary';

// HKCategoryValueSleepAnalysis values.
const IN_BED = 0;
const ASLEEP = 1;
const AWAKE = 2;
const CORE = 3;
const DEEP = 4;
const REM = 5;

/** Sample on a fixed night: "23:30" = night of Jan 10, "07:00" = Jan 11. */
const at = (hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 0, h >= 18 ? 10 : 11, h, m, 0);
};
const s = (value: number, start: string, end: string): SleepSample =>
  ({ value, startDate: at(start), endDate: at(end) });

describe('summarizeSleep', () => {
  it('returns null when there are no asleep samples', () => {
    expect(summarizeSleep([])).toBeNull();
    expect(summarizeSleep([s(IN_BED, '23:00', '07:00')])).toBeNull();
  });

  it('summarizes a single plain asleep block', () => {
    const out = summarizeSleep([s(ASLEEP, '23:30', '07:00')])!;
    expect(out.bed).toEqual(at('23:30'));
    expect(out.wake).toEqual(at('07:00'));
    expect(out.minutesAsleep).toBe(450);
    expect(out.stages).toBeNull();
    expect(out.interrupted).toBe(false);
  });

  it('does not double-count overlapping iPhone + Watch samples', () => {
    const out = summarizeSleep([
      // Watch: staged night, 23:00–07:00 with a 06:00–06:30 awake hole.
      s(CORE, '23:00', '02:00'),
      s(DEEP, '02:00', '03:00'),
      s(REM, '03:00', '06:00'),
      s(AWAKE, '06:00', '06:30'),
      s(CORE, '06:30', '07:00'),
      // iPhone: the same night as one unstaged block.
      s(ASLEEP, '23:05', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('07:00'));
    // Union of asleep time is the full 8 h — not 8 h (watch) + ~8 h (phone).
    expect(out.minutesAsleep).toBe(480);
    expect(out.stages).toEqual({ core: 210, deep: 60, rem: 180, awake: 30 });
  });

  it('ignores an evening nap when picking bed time', () => {
    const out = summarizeSleep([
      s(ASLEEP, '19:00', '19:40'),   // evening nap
      s(ASLEEP, '23:15', '06:45'),   // the night
    ])!;
    expect(out.bed).toEqual(at('23:15'));
    expect(out.wake).toEqual(at('06:45'));
    expect(out.minutesAsleep).toBe(450);
  });

  it('ignores a morning nap when picking wake time', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '06:00'),   // the night
      s(ASLEEP, '10:00', '11:00'),   // post-wake nap
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('06:00'));
    expect(out.minutesAsleep).toBe(420);
  });

  it('keeps a normally interrupted night as one session', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '03:00'),
      s(AWAKE, '03:00', '03:20'),
      s(ASLEEP, '03:20', '05:00'),
      s(AWAKE, '05:00', '05:10'),
      s(ASLEEP, '05:10', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('07:00'));
    expect(out.minutesAsleep).toBe(450);   // 480 minus 30 awake
    expect(out.interrupted).toBe(true);    // 30 min awake > 10-min threshold
  });

  it('does not flag brief awakenings totaling 10 minutes or less', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '02:00'),
      s(AWAKE, '02:00', '02:04'),
      s(ASLEEP, '02:04', '05:00'),
      s(AWAKE, '05:00', '05:06'),
      s(ASLEEP, '05:06', '07:00'),
    ])!;
    expect(out.interrupted).toBe(false);   // 10 min awake is not > 10
  });

  it('does not double-count one awakening reported by two sources', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '03:00'),
      s(AWAKE, '03:00', '03:08'),    // watch
      s(AWAKE, '03:02', '03:09'),    // phone, same waking
      s(ASLEEP, '03:09', '07:00'),
    ])!;
    // Union is 9 awake minutes (a raw sum would be 15 and cross the threshold).
    expect(out.interrupted).toBe(false);
    expect(out.stages).toBeNull();
  });

  it('excludes a nap from stage minutes', () => {
    const out = summarizeSleep([
      s(CORE, '19:00', '19:30'),     // staged evening nap
      s(CORE, '23:00', '05:00'),
      s(REM, '05:00', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.stages).toEqual({ core: 360, deep: 0, rem: 120, awake: 0 });
    expect(out.minutesAsleep).toBe(480);
  });
});

describe('groupNights', () => {
  /** Sample on an explicit calendar day (the fixed-night helper can't span months). */
  const on = (day: number, hhmm: string): Date => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2026, 0, day, h, m, 0);
  };
  const sd = (value: number, [d1, t1]: [number, string], [d2, t2]: [number, string]): SleepSample =>
    ({ value, startDate: on(d1, t1), endDate: on(d2, t2) });

  it('files a night under the day it ends on', () => {
    const out = groupNights([
      sd(ASLEEP, [10, '23:00'], [11, '07:00']),
      sd(ASLEEP, [11, '22:30'], [12, '06:30']),
    ]);
    expect(out.map((n) => n.dayKey)).toEqual(['2026-01-11', '2026-01-12']);
    expect(out[0].rows).toHaveLength(1);
  });

  it('keeps an evening block with the night it leads into', () => {
    // A pre-midnight block ends on the 10th but belongs to the 11th's night.
    const out = groupNights([
      sd(ASLEEP, [10, '22:00'], [10, '23:30']),
      sd(ASLEEP, [10, '23:30'], [11, '06:00']),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].dayKey).toBe('2026-01-11');
    expect(summarizeSleep(out[0].rows)!.minutesAsleep).toBe(480);
  });

  it('drops an afternoon nap no night window would have caught', () => {
    expect(groupNights([sd(ASLEEP, [10, '14:30'], [10, '15:30'])])).toEqual([]);
  });

  it('returns nights oldest first across a month boundary', () => {
    const out = groupNights([
      sd(ASLEEP, [11, '23:00'], [12, '07:00']),
      sd(ASLEEP, [9, '23:00'], [10, '07:00']),
      sd(ASLEEP, [10, '23:00'], [11, '07:00']),
    ]);
    expect(out.map((n) => n.dayKey)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12']);
  });
});

describe('nightKeyOf', () => {
  it('maps by end time, evening forward and morning back', () => {
    expect(nightKeyOf(new Date(2026, 0, 10, 19, 0))).toBe('2026-01-11');
    expect(nightKeyOf(new Date(2026, 0, 11, 6, 0))).toBe('2026-01-11');
    expect(nightKeyOf(new Date(2026, 0, 11, 16, 0))).toBeNull();
  });

  it('rolls an evening end into the next month', () => {
    expect(nightKeyOf(new Date(2026, 0, 31, 23, 30))).toBe('2026-02-01');
  });
});
