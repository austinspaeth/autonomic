import { addDays } from '../../dates';
import type { DayLoad, DayRecord } from '../../types';
import type { DaysMap } from '../../scoring/day';
import { RESOLUTION_OUTLIER_RATIO, capacityBaseline, typicalResolution } from '../baseline';

const DK = '2026-03-15';

const day = (load: Partial<DayLoad> | null): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...(load ? { load: load as DayLoad } : {}),
} as unknown as DayRecord);

/**
 * A journal of `n` days behind DK, each carrying a sampling cadence and a
 * spend. `strapEvery` days are sampled at strap resolution and cost far more,
 * which is the mixed-instrument journal the ratchet fed on.
 */
function mixedJournal(opts: { n: number; strapEvery: number | null }) {
  const { n, strapEvery } = opts;
  const days: DaysMap = {};
  const spend: Record<string, number> = {};
  for (let i = 0; i <= n; i++) {
    const k = addDays(DK, -i);
    const strap = strapEvery != null && i > 0 && i % strapEvery === 0;
    days[k] = day({ hrSampleGapMin: strap ? 0.02 : 6, hrCoverageMin: 950 });
    // A strap day SEES more of the same life, so it costs more to the model.
    spend[k] = strap ? 240 : 80;
  }
  return {
    days,
    // Every day held: a constant score never declines.
    scoreAt: () => 70,
    spendAt: (k: string) => spend[k] ?? 0,
  };
}

describe('typicalResolution', () => {
  it('reads the cadence this journal is usually watched at', () => {
    const { days } = mixedJournal({ n: 30, strapEvery: 10 });
    // Mostly background, so the median is the background cadence and the
    // strap days are the exception rather than the rule.
    expect(typicalResolution(days, DK, addDays)).toBe(6);
  });

  it('is null for a journal with no heart-rate series at all', () => {
    const days: DaysMap = {};
    for (let i = 1; i <= 20; i++) days[addDays(DK, -i)] = day({ steps: 4000 });
    expect(typicalResolution(days, DK, addDays)).toBeNull();
  });
});

describe('the ceiling does not ratchet toward the best-instrumented days', () => {
  const ceilingOf = (o: { n: number; strapEvery: number | null }) => {
    const { days, scoreAt, spendAt } = mixedJournal(o);
    return capacityBaseline(days, DK, {}, addDays, {}, null, scoreAt, spendAt).effortMin;
  };

  it('ignores the occasional strap day when fitting capacity', () => {
    // The same life, logged the same way, with a chest strap worn one day in
    // ten. Those days read 240 against an ordinary day's 80 purely because the
    // app saw more of them, and `personal` only ever applies when it EXCEEDS
    // the prior, so they could raise the ceiling and nothing could lower it.
    const mixed = ceilingOf({ n: 40, strapEvery: 10 });
    const plain = ceilingOf({ n: 40, strapEvery: null });
    expect(mixed).toBe(plain);
  });

  it('still reads a journal that is ALWAYS watched that closely', () => {
    // Nothing is excluded when the fine cadence IS the usual one: the bar is
    // relative to this journal, never an absolute idea of a good sensor.
    const { days, scoreAt, spendAt } = mixedJournal({ n: 40, strapEvery: 1 });
    expect(typicalResolution(days, DK, addDays)).toBe(0.02);
    const c = capacityBaseline(days, DK, {}, addDays, {}, null, scoreAt, spendAt);
    expect(c.effortMin).toBeGreaterThan(200);
    expect(c.heldDays).toBeGreaterThan(30);
  });

  it('treats a day stored before the cadence was kept as unknown, not as fine', () => {
    // Older journals carry no `hrSampleGapMin`. Reading that as a strap day
    // would silently drop most of an existing journal's evidence.
    const { days, scoreAt, spendAt } = mixedJournal({ n: 40, strapEvery: null });
    Object.keys(days).forEach((k) => {
      const l = days[k]?.load;
      if (l) l.hrSampleGapMin = null;
    });
    const c = capacityBaseline(days, DK, {}, addDays, {}, null, scoreAt, spendAt);
    expect(c.heldDays).toBeGreaterThan(30);
  });

  it('keeps a day sampled within the ratio of the usual cadence', () => {
    // The rule excludes a different INSTRUMENT, not ordinary variation: a day
    // the wrist happened to sample a little more often is still an ordinary
    // day, and throwing it away would spend evidence the journal needs.
    const heldWith = (gap: number) => {
      const { days, scoreAt, spendAt } = mixedJournal({ n: 40, strapEvery: 10 });
      Object.keys(days).forEach((k) => {
        const l = days[k]?.load;
        if (l && l.hrSampleGapMin === 0.02) l.hrSampleGapMin = gap;
      });
      return capacityBaseline(days, DK, {}, addDays, {}, null, scoreAt, spendAt).heldDays;
    };
    const uniform = heldWith(6);
    // Exactly on the bar is kept; a genuinely finer instrument is not.
    expect(heldWith(6 / RESOLUTION_OUTLIER_RATIO)).toBe(uniform);
    expect(heldWith(0.02)).toBeLessThan(uniform);
  });
});
