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

  /** The same day sampled every `everySec` seconds instead of every minute. */
  const atRate = (fromMin: number, toMin: number, bpm: number, everySec: number) => {
    const out: { t: number; bpm: number }[] = [];
    for (let t = fromMin * 60; t <= toMin * 60; t += everySec) out.push({ t, bpm });
    return out;
  };

  it('answers the same day the same whatever the sampling rate', () => {
    // The bug a chest strap found: the old rule counted MINUTES HOLDING A
    // SAMPLE, so a continuous sensor offered every minute of the day as a
    // candidate and a watch offered a handful. Same afternoon, same body.
    const day = (every: number) => [
      ...atRate(0, 600, 70, every),
      ...atRate(600, 640, 100, every),
      ...atRate(640, 900, 70, every),
    ];
    const sparse = stillUprightMinutes(day(60), [], sig, [], 130)!;
    const dense = stillUprightMinutes(day(5), [], sig, [], 130)!;
    expect(Math.abs(dense.stillMin - sparse.stillMin)).toBeLessThanOrEqual(2);
    expect(dense.stillMin).toBeGreaterThan(30);
  });

  it('does not call a sedentary day standing just because it was watched all of it', () => {
    // A whole waking day sitting at 84, which clears the signature floor of 82
    // for somebody whose laying rate is 70 and whose rise is 20. Under the old
    // rule a strap streaming through it charged the five-hour cap to a person
    // who never got up.
    const deskSig = { restBpm: 70, riseBpm: 20, source: 'default' as const, floorBpm: 82 };
    const hr = [...atRate(0, 420, 58, 10), ...atRate(420, 1320, 84, 10)];
    const r = stillUprightMinutes(hr, [], deskSig, [{ startMin: 0, endMin: 420 }], 95)!;
    // The band now has to clear the day's own quiet level, which IS 84.
    expect(r.floorBpm).toBeGreaterThan(84);
    expect(r.stillMin).toBe(0);
  });

  it('still finds a real stand inside a day spent mostly sitting', () => {
    // The same desk day with forty minutes on their feet in the middle of it:
    // raising the floor to the day's own quiet level must not cost the claim
    // the feature exists to make.
    const deskSig = { restBpm: 70, riseBpm: 20, source: 'default' as const, floorBpm: 82 };
    const hr = [
      ...atRate(0, 420, 58, 10),
      ...atRate(420, 700, 84, 10),
      ...atRate(700, 740, 104, 10),
      ...atRate(740, 1320, 84, 10),
    ];
    const r = stillUprightMinutes(hr, [], deskSig, [{ startMin: 0, endMin: 420 }], 130)!;
    expect(r.floorBpm).toBeLessThan(104);
    expect(r.stillMin).toBeGreaterThanOrEqual(38);
    expect(r.stillMin).toBeLessThanOrEqual(42);
  });

  it('leaves the signature floor alone on a day spent at the resting rate', () => {
    // The quiet level may only RAISE the floor, never lower it, so a day whose
    // own quiet level IS the laying baseline is charged exactly as it was.
    const hr = [...ramp(0, 600, 70), ...ramp(601, 625, 100), ...ramp(626, 900, 70)];
    const r = stillUprightMinutes(hr, [], sig, [], 130)!;
    expect(r.floorBpm).toBe(sig.floorBpm);
  });
});
