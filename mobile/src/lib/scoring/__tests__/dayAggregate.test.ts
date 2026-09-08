/**
 * The day score aggregates the day; it does not sample it.
 *
 * These pin the requirement the aggregation exists for, which is two separate
 * axes that the old `last(structured)` conflated:
 *   · CAPTURE COMPLETENESS decides whether a reading can CONTRIBUTE a metric. A
 *     short reading resolves no frequency domain, so it has nothing to say about
 *     VLF — and must not delete VLF an earlier reading did resolve.
 *   · PHYSIOLOGICAL VALUE must never influence selection. A worse-but-complete
 *     evening reading is real data about a worse evening.
 */
import type { DayRecord, Entry } from '../../types';
import { SCORE_TOTAL_WEIGHT, recencyBlend, scoreSet } from '../day';

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

const DK = '2026-08-22';
const score = (readings: Entry[], over: Partial<DayRecord> = {}) => {
  const d = day({ readings, ...over });
  return scoreSet(readings, d, DK, { [DK]: d });
};

/** A training reading that resolved everything (a real 5-minute session). */
const complete = (id: string, time: string, good: boolean): Entry => ({
  id, type: 'breathHrv', time,
  rmssd: good ? '35' : '18',        // great / bad
  pnn50: good ? '12' : '3',         // great / bad
  vlowPower: good ? '150' : '900',  // great / bad
  lowPower: good ? '1200' : '300',
  highPower: good ? '2500' : '150', // total power great / bad
  lfPeak: good ? '0.095' : '0.05',  // great / bad
  hr: good ? '58' : '78',
});

/** A training reading under the 2-minute floor: time domain only. Every
 *  frequency field is genuinely ABSENT, exactly as computeHrv leaves them. */
const tooShort = (id: string, time: string): Entry => ({
  id, type: 'breathHrv', time, rmssd: '30', pnn50: '8', hr: '60',
  durationSec: 98, coverageSec: 98,
});

const labels = (r: ReturnType<typeof scoreSet>) => r.comps.map((c) => c.label);

describe('recencyBlend', () => {
  it('is a normalized linear ramp, so the last reading leads but never rules', () => {
    expect(recencyBlend([])).toBeNull();
    expect(recencyBlend([80])).toBe(80);
    expect(recencyBlend([0, 90])).toBeCloseTo(60);          // 1/3, 2/3
    expect(recencyBlend([60, 60, 90])).toBeCloseTo(75);     // 1/6, 2/6, 3/6
  });
});

describe('a short later reading cannot delete what an earlier one measured', () => {
  const morning = complete('am', '07:30', true);

  it('keeps every component the morning resolved, at the same confidence', () => {
    const alone = score([morning]);
    const withShort = score([morning, tooShort('pm', '19:00')]);
    expect(labels(alone)).toEqual(['HRV (RMSSD)', 'Total power', 'pNN50', 'VLF power', 'LF peak', 'Resting HR']);
    expect(labels(withShort)).toEqual(labels(alone));
    // THE REPORTED BUG. Six components, 77 of the 95-point input set.
    expect(alone.weightSum).toBe(77);
    expect(withShort.weightSum).toBe(77);
    expect(withShort.confidence).toBe(81);
    expect(withShort.confidence).toBe(alone.confidence);
  });

  it('counts a component as available when ANY trusted reading resolved it', () => {
    // Order is not the point: the short one first must not pre-empt either.
    const shortFirst = score([tooShort('pm', '07:00'), complete('am', '19:00', true)]);
    expect(labels(shortFirst)).toContain('VLF power');
    expect(labels(shortFirst)).toContain('Total power');
  });

  it('still lets the short reading contribute what it DID resolve', () => {
    const rmssdOf = (r: ReturnType<typeof scoreSet>) => r.comps.find((c) => c.label === 'HRV (RMSSD)')!;
    const alone = rmssdOf(score([morning]));
    const withShort = rmssdOf(score([morning, tooShort('pm', '19:00')]));
    expect(withShort.readings).toBe(2);
    // 30 ms grades 'good' (80) against the morning's 'great' (100): 1/3 + 2/3.
    expect(withShort.p).toBeCloseTo((1 * 100 + 2 * 80) / 3);
    expect(withShort.p).toBeLessThan(alone.p);
  });
});

describe('a bad complete reading must count', () => {
  it('drags the day below the morning it followed', () => {
    const morningOnly = score([complete('am', '07:30', true)]);
    const both = score([complete('am', '07:30', true), complete('pm', '19:00', false)]);
    expect(both.score!).toBeLessThan(morningOnly.score!);
  });

  it('lands between the two readings, nearer the later one', () => {
    const good = score([complete('am', '07:30', true)]).score!;
    const bad = score([complete('pm', '19:00', false)]).score!;
    const both = score([complete('am', '07:30', true), complete('pm', '19:00', false)]).score!;
    expect(both).toBeLessThan(good);
    expect(both).toBeGreaterThan(bad);
    expect(Math.abs(both - bad)).toBeLessThan(Math.abs(both - good));
  });
});

describe('selection is blind to the numbers', () => {
  it('contributes the same readings whichever one has the better values', () => {
    const goodAm = score([complete('am', '07:30', true), complete('pm', '19:00', false)]);
    const goodPm = score([complete('am', '07:30', false), complete('pm', '19:00', true)]);
    const shape = (r: ReturnType<typeof scoreSet>) => r.comps.map((c) => [c.label, c.readings]);
    expect(shape(goodPm)).toEqual(shape(goodAm));
    // Only the values differ — and they must, or nothing about the day is real.
    expect(goodPm.score).not.toBe(goodAm.score);
  });
});

describe('confidence is a percentage of the full input set', () => {
  it('reaches 100 on a fully logged day', () => {
    const readings: Entry[] = [
      complete('am', '07:30', true),
      { id: 'u', type: 'hrv', time: '08:00', rmssd: '30', avgHr: '60' },
      { id: 'bp', type: 'bp', time: '09:00', sys: '115', dia: '75' },
      { id: 'rhr', type: 'restingHr', time: '09:05', hr: '58', position: 'Laying' },
    ];
    const res = score(readings, {
      sleep: { bed: '22:30', wake: '06:30' },
      activities: [{ id: 'a', type: 'walk', time: '12:00' }],
    });
    expect(res.weightSum).toBe(SCORE_TOTAL_WEIGHT);
    expect(res.confidence).toBe(100);
  });

  it('reports the day’s training readings so the copy can tell short from absent', () => {
    expect(score([]).structCount).toBe(0);
    const short = score([tooShort('pm', '19:00')]);
    expect(short.structCount).toBe(1);
    expect(short.lastStructCoverageSec).toBe(98);
    // A reading from before capture quality was stamped: UNKNOWN, not zero.
    expect(score([complete('am', '07:30', true)]).lastStructCoverageSec).toBeNull();
  });
});
