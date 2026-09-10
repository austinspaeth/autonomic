import { addDays } from '../../dates';
import type { DayRecord, Entry } from '../../types';
import type { DaysMap } from '../../scoring/day';
import { DEFAULT_RISE, STILL_MIN_COVERAGE, stillUprightMinutes, uprightSignature } from '../upright';

const day = (over: Partial<DayRecord>): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const DK = '2026-03-15';

/** A journal with `n` days of resting-HR readings at `hr`, so there is a
 *  baseline for the signature to stand on. */
function withResting(hr: number, n = 20, extra: Partial<Record<string, Entry[]>> = {}): DaysMap {
  const days: DaysMap = {};
  for (let i = 1; i <= n; i++) {
    const k = addDays(DK, -i);
    days[k] = day({ readings: [{ id: `r${i}`, type: 'restingHr', hr: String(hr) } as Entry] });
  }
  days[DK] = day({ readings: (extra[DK] as Entry[]) || [] });
  return days;
}

/** One heart-rate sample a minute, `bpm` from `fromMin` to `toMin`. */
const ramp = (fromMin: number, toMin: number, bpm: number) => {
  const out: { t: number; bpm: number }[] = [];
  for (let m = fromMin; m <= toMin; m++) out.push({ t: m * 60, bpm });
  return out;
};

/** A full day of covered samples at a lying rate, so coverage always clears
 *  the bar and each test only varies the stretch it cares about. */
const restfulDay = (restBpm: number) => ramp(0, 800, restBpm);

describe('uprightSignature', () => {
  it('fits the band to the user own stand test', () => {
    const days = withResting(70);
    days[addDays(DK, -3)] = day({
      readings: [{ id: 's1', type: 'standTest', sustainedDelta: '40' } as Entry],
    });
    const sig = uprightSignature(days, DK, {}, addDays)!;
    expect(sig.source).toBe('standTest');
    expect(sig.riseBpm).toBe(40);
    // rest 70 + 0.6 * 40
    expect(sig.floorBpm).toBe(94);
  });

  it('falls back to a POTS episode, then to a conservative default', () => {
    const withEpisode = withResting(70);
    withEpisode[addDays(DK, -3)] = day({
      readings: [{ id: 'o1', type: 'orthostatic', beforeHr: '70', afterHr: '105' } as Entry],
    });
    expect(uprightSignature(withEpisode, DK, {}, addDays)!.source).toBe('orthostatic');

    const bare = uprightSignature(withResting(70), DK, {}, addDays)!;
    expect(bare.source).toBe('default');
    expect(bare.riseBpm).toBe(DEFAULT_RISE);
  });

  it('claims nothing without a resting baseline to stand on', () => {
    expect(uprightSignature({ [DK]: day({}) }, DK, {}, addDays)).toBeNull();
  });
});

describe('stillUprightMinutes', () => {
  const sig = { restBpm: 70, riseBpm: 40, source: 'standTest' as const, floorBpm: 94 };

  it('finds a standing stretch: in the band, no steps, not excluded', () => {
    // Lying all day at 70 with 25 minutes at 100, which is inside the band.
    const hr = [...ramp(0, 600, 70), ...ramp(601, 625, 100), ...ramp(626, 900, 70)];
    const r = stillUprightMinutes(hr, [], sig, [], 130)!;
    expect(r.stillMin).toBeGreaterThanOrEqual(24);
    expect(r.stillMin).toBeLessThanOrEqual(26);
    expect(r.spans).toHaveLength(1);
  });

  it('does not count minutes with steps in them: that is walking', () => {
    const hr = [...ramp(0, 600, 70), ...ramp(601, 625, 100), ...ramp(626, 900, 70)];
    const r = stillUprightMinutes(hr, [{ startMin: 601, endMin: 626 }], sig, [], 130)!;
    expect(r.stillMin).toBe(0);
  });

  it('does not count exercise: at or above the line it is already charged', () => {
    const hr = [...ramp(0, 600, 70), ...ramp(601, 640, 150), ...ramp(641, 900, 70)];
    const r = stillUprightMinutes(hr, [], sig, [], 130)!;
    expect(r.stillMin).toBe(0);
  });

  it('excludes a workout recovery tail, which sits squarely in the band', () => {
    const hr = [...ramp(0, 600, 70), ...ramp(601, 640, 100), ...ramp(641, 900, 70)];
    const excluded = stillUprightMinutes(hr, [], sig, [{ startMin: 590, endMin: 660 }], 130)!;
    expect(excluded.stillMin).toBe(0);
  });

  it('ignores a run shorter than the minimum: a trip to the kettle is not standing', () => {
    const hr = [...ramp(0, 600, 70), ...ramp(601, 602, 100), ...ramp(603, 900, 70)];
    const r = stillUprightMinutes(hr, [], sig, [], 130)!;
    expect(r.stillMin).toBe(0);
  });

  it('refuses a day the watch spent on the charger', () => {
    // Under the coverage bar: four hours cannot describe a day, so the whole
    // inference is dropped rather than reported small.
    const thin = ramp(0, STILL_MIN_COVERAGE - 60, 100);
    expect(stillUprightMinutes(thin, [], sig, [], 130)).toBeNull();
  });

  it('claims nothing without a signature', () => {
    expect(stillUprightMinutes(restfulDay(70), [], null, [], 130)).toBeNull();
  });

  it('counts a gap as uncovered rather than as standing', () => {
    // A hole in the middle of a standing stretch does not extend it.
    const hr = [...ramp(0, 600, 70), ...ramp(601, 610, 100), ...ramp(700, 900, 70)];
    const r = stillUprightMinutes(hr, [], sig, [], 130)!;
    expect(r.stillMin).toBeLessThanOrEqual(11);
  });
});
