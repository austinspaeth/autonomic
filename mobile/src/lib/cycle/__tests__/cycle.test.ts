/**
 * The cycle model's rules, each pinned because the alternative is telling a
 * woman something confident and false about her body: spotting is not day 1,
 * a skipped log is not two periods, a logging gap is not a 70-day cycle, an
 * irregular cycle is never forecast, contraception has no phases, and an
 * unknown day is null.
 */
import { alignByCycleDay, buildCycleModel, cycleDip, phaseColumns, usualDip, detectOvulation, findCycles, findPeriods, phaseProfile, shiftDay, dayDiff, cycleStats } from '..';
import type { CycleFlow, CycleMode } from '../../types';

/** A days map with a period of `len` days starting at each date. */
function journal(starts: string[], len = 5, flow: CycleFlow = 'medium') {
  const days: Record<string, { cycle?: { flow: CycleFlow } }> = {};
  for (const s of starts) for (let i = 0; i < len; i++) days[shiftDay(s, i)] = { cycle: { flow } };
  return days;
}
const every28 = (from: string, n: number) => Array.from({ length: n }, (_, i) => shiftDay(from, i * 28));
const model = (starts: string[], mode: CycleMode, today: string, temps?: Record<string, { bbt?: number; wrist?: number }>) =>
  buildCycleModel({ days: journal(starts), temps, mode, today });

describe('periods', () => {
  it('stitches across one skipped day, never across two', () => {
    const days = { ...journal(['2026-01-01'], 3), '2026-01-05': { cycle: { flow: 'light' as const } } };
    expect(findPeriods(days)).toHaveLength(1);
    expect(findPeriods(days)[0].days).toBe(5);
    const apart = { ...journal(['2026-01-01'], 3), '2026-01-06': { cycle: { flow: 'light' as const } } };
    expect(findPeriods(apart)).toHaveLength(2);
  });

  it('never starts a period on spotting', () => {
    const days = { '2025-12-30': { cycle: { flow: 'spotting' as const } }, ...journal(['2026-01-01'], 4) };
    expect(findPeriods(days)[0].start).toBe('2026-01-01');
  });

  it('marks a cycle outside 15-60 days implausible and keeps it out of the stats', () => {
    const cycles = findCycles(findPeriods(journal(['2026-01-01', '2026-01-29', '2026-04-15', '2026-05-13'])));
    expect(cycles.map((c) => c.plausible)).toEqual([true, false, true, true]);
    expect(cycleStats(cycles).n).toBe(2);
    expect(cycleStats(cycles).medianLength).toBe(28);
  });

  it('counts days across DST without losing one', () => {
    expect(dayDiff('2026-03-01', '2026-03-29')).toBe(28);
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('phases', () => {
  const starts = every28('2026-01-05', 4); // Jan 5, Feb 2, Mar 2, Mar 30
  const today = '2026-04-20'; // day 22 of the cycle that began Mar 30

  it('places a finished cycle by counting back 14 days from the next period', () => {
    const m = model(starts, 'regular', today);
    expect(m.phaseOn('2026-01-05')?.phase).toBe('menstrual');
    expect(m.phaseOn('2026-01-12')?.phase).toBe('follicular');
    // next start Feb 2 → ovulation Jan 19
    expect(m.phaseOn('2026-01-19')).toMatchObject({ phase: 'ovulatory', basis: 'retrospective', predicted: false });
    expect(m.phaseOn('2026-01-24')?.phase).toBe('luteal');
    expect(m.phaseOn('2026-01-30')?.phase).toBe('premenstrual');
  });

  it('forecasts the cycle in progress, and says it is a forecast', () => {
    const m = model(starts, 'regular', today);
    expect(m.prediction?.start).toBe('2026-04-27');
    expect(m.phaseOn(today)).toMatchObject({ phase: 'luteal', basis: 'calendar', predicted: true, day: 22 });
    expect(m.phaseOn('2026-04-23')).toBeNull(); // the future
  });

  it('answers null before the first period and for the future', () => {
    const m = model(starts, 'regular', today);
    expect(m.phaseOn('2025-12-20')).toBeNull();
    expect(m.phaseOn('2026-05-01')).toBeNull();
  });

  it('irregular mode never forecasts, but still reads finished cycles', () => {
    const m = model(starts, 'irregular', today);
    expect(m.prediction).toBeNull();
    expect(m.phaseOn(today)?.phase).toBeNull();
    expect(m.phaseOn('2026-01-24')?.phase).toBe('luteal');
  });

  it('contraception has bleeding days and nothing else; pregnancy has nothing', () => {
    const c = model(starts, 'contraception', today);
    expect(c.phaseOn('2026-01-05')?.phase).toBe('menstrual');
    expect(c.phaseOn('2026-01-24')?.phase).toBeNull();
    expect(c.patternReady).toBe(false);
    expect(model(starts, 'pregnant', today).phaseOn('2026-01-05')).toBeNull();
  });

  it('does not forecast from one cycle, nor from cycles that spread too wide', () => {
    expect(model(every28('2026-03-02', 2), 'regular', today).prediction).toBeNull();
    const wide = model(['2026-01-01', '2026-01-23', '2026-03-10', '2026-04-01'], 'regular', '2026-04-10');
    expect(wide.prediction).toBeNull();
  });

  it('a phase past the end of the forecast range is unknown, and late is counted', () => {
    const m = model(starts, 'regular', '2026-05-05');
    expect(m.phaseOn('2026-05-05')?.phase).toBeNull();
    expect(m.lateBy).toBeGreaterThan(0);
  });

  it('needs three finished cycles for a pattern', () => {
    expect(model(every28('2026-01-05', 3), 'regular', today).patternReady).toBe(false);
    expect(model(starts, 'regular', today).patternReady).toBe(true);
  });
});

describe('temperature', () => {
  const temps: Record<string, { bbt?: number; wrist?: number }> = {};
  for (let i = 0; i < 28; i++) temps[shiftDay('2026-01-05', i)] = { bbt: i < 16 ? 36.4 : 36.75 };

  it('finds three over six and dates ovulation the day before the rise', () => {
    expect(detectOvulation(temps, '2026-01-05', '2026-02-01')).toEqual({ dk: '2026-01-20', source: 'bbt' });
  });

  it('the temperature basis beats counting back', () => {
    const m = model(every28('2026-01-05', 4), 'regular', '2026-04-20', temps);
    expect(m.ovulation['2026-01-05']).toMatchObject({ dk: '2026-01-20', basis: 'temperature' });
  });

  it('never mixes the thermometer with the wrist', () => {
    const mixed: Record<string, { bbt?: number; wrist?: number }> = {};
    for (let i = 0; i < 28; i++) mixed[shiftDay('2026-01-05', i)] = i < 16 ? { bbt: 36.4 } : { wrist: 36.9 };
    expect(detectOvulation(mixed, '2026-01-05', '2026-02-01')).toBeNull();
  });

  it('a flat line is no shift', () => {
    const flat: Record<string, { bbt: number }> = {};
    for (let i = 0; i < 28; i++) flat[shiftDay('2026-01-05', i)] = { bbt: 36.5 };
    expect(detectOvulation(flat, '2026-01-05', '2026-02-01')).toBeNull();
  });
});

describe('patterns', () => {
  const starts = every28('2026-01-05', 5);
  const today = shiftDay(starts[4], 23); // premenstrual in the 5th cycle
  // A score that dips by 8 in each premenstrual stretch.
  const premen = (m: ReturnType<typeof model>, dk: string) => m.phaseOn(dk)?.phase === 'premenstrual';

  it('profiles a metric by phase over finished cycles only', () => {
    const m = model(starts, 'regular', today);
    const prof = phaseProfile(m, (dk) => (premen(m, dk) ? 60 : 70));
    expect(prof.premenstrual.median).toBe(60);
    expect(prof.follicular.median).toBe(70);
    expect(prof.luteal.cycles).toBe(4);
  });

  it('calls a dip typical when it is no deeper than past cycles, deeper when it is', () => {
    const m = model(starts, 'regular', today);
    const usual = cycleDip(m, today, (dk) => (premen(m, dk) ? 62 : 70));
    expect(usual).toMatchObject({ verdict: 'typical', cycles: 4 });
    const worse = cycleDip(m, today, (dk) => (premen(m, dk) ? (dk >= starts[4] ? 45 : 62) : 70));
    expect(worse?.verdict).toBe('deeper');
  });

  it('says nothing outside the dip window', () => {
    const m = model(starts, 'regular', shiftDay(starts[4], 9));
    expect(cycleDip(m, shiftDay(starts[4], 9), () => 60)).toBeNull();
  });
});

describe('aligned by cycle day', () => {
  it('lines every cycle up on day 1 and stops the current one at today', () => {
    const starts = Array.from({ length: 4 }, (_, i) => shiftDay('2026-01-05', i * 28));
    const m = model(starts, 'regular', shiftDay(starts[3], 9));
    const a = alignByCycleDay(m, (dk: string) => m.phaseOn(dk)?.day ?? null);
    expect(a.past).toHaveLength(3);
    expect(a.past[0][0]).toBe(1);
    expect(a.past[0][27]).toBe(28);
    expect(a.current?.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(a.current?.[10]).toBeNull();
    expect(a.todayDay).toBe(10);
    expect(a.median[5]).toBe(6);
  });
});

describe('typical length', () => {
  const one = journal(['2026-04-01']);
  it('forecasts from the length entered while fewer than two cycles are logged', () => {
    const m = buildCycleModel({ days: one, mode: 'regular', today: '2026-04-10', typicalLength: 30 });
    expect(m.prediction).toMatchObject({ start: '2026-05-01', early: '2026-04-28', late: '2026-05-04', basis: 'typical' });
    expect(m.phaseOn('2026-04-10')).toMatchObject({ predicted: true, basis: 'calendar' });
  });
  it('gives way to logged cycles, and never makes a pattern', () => {
    const m = buildCycleModel({ days: journal(every28('2026-01-05', 4)), mode: 'regular', today: '2026-04-20', typicalLength: 35 });
    expect(m.prediction?.basis).toBe('history');
    expect(m.prediction?.cycleLength).toBe(28);
    expect(buildCycleModel({ days: one, mode: 'regular', today: '2026-04-10', typicalLength: 30 }).patternReady).toBe(false);
  });
  it('is ignored outside regular mode', () => {
    expect(buildCycleModel({ days: one, mode: 'irregular', today: '2026-04-10', typicalLength: 30 }).prediction).toBeNull();
  });
});

describe('cycle impact charts', () => {
  const starts = every28('2026-01-05', 5);
  const today = shiftDay(starts[4], 24);
  const m = model(starts, 'regular', today);
  // 70 most of the cycle, 58 in its last nine days.
  const score = (dk: string) => {
    const ph = m.phaseOn(dk);
    if (!ph) return null;
    return ph.day > 19 ? 58 : 70;
  };
  it('finds the usual dip at the end of the cycle and this cycle\'s so far', () => {
    const d = usualDip(m, score)!;
    expect(d.fromDay).toBe(20);
    expect(d.toDay).toBe(28);
    expect(d.usualDrop).toBe(12);
    expect(d.cycles).toBe(3);
    expect(d.currentDrop).toBe(12);
  });
  it('lays a metric out as one dot per cycle per phase, luteal holding premenstrual', () => {
    const cols = phaseColumns(m, (dk: string) => (m.phaseOn(dk)?.phase === 'follicular' ? 47 : 38));
    expect(cols.map((c) => c.label)).toEqual(['Period', 'Follicular', 'Ovulation', 'Luteal']);
    expect(cols[1].perCycle).toHaveLength(4);
    expect(cols[1].median).toBe(47);
    expect(cols[3].median).toBe(38);
  });
});
