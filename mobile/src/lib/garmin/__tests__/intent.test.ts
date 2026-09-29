import {
  applyIntent, armGarminIntent, claimGarminIntent, intentMatches, INTENT_WINDOW_MS,
  resetGarminIntent, type GarminIntent,
} from '../intent';
import { mapHrvPayload } from '../../watch/payload';
import type { Entry } from '../../types';

const ARMED = Date.parse('2026-09-29T08:00:00');
const training: GarminIntent = { kind: 'breath', style: '4/6', period: 'Morning', armedAtMs: ARMED };

const reading = (startedAtMs: number): Entry => ({
  id: 'g1', type: 'hrv', time: '08:00', note: '', source: 'garmin', period: 'Other',
  startedAt: new Date(startedAtMs).toISOString(), rmssd: '42', hr: '61', avgHr: '61',
});

beforeEach(resetGarminIntent);

describe('Garmin reading intent', () => {
  it('files a training session as breathHrv with its pattern and period', () => {
    const out = applyIntent(reading(ARMED - 30_000), training);
    expect(out.type).toBe('breathHrv');
    expect(out.style).toBe('4/6');
    expect(out.period).toBe('Morning');
    // Only the label moves: the metrics are untouched.
    expect(out.rmssd).toBe('42');
    expect(out.hr).toBe('61');
  });

  it('leaves a baseline session as hrv', () => {
    const out = applyIntent(reading(ARMED), { kind: 'unstructured', armedAtMs: ARMED });
    expect(out.type).toBe('hrv');
    expect(out.style).toBeUndefined();
  });

  it('matches the watch leading the phone, and nothing outside the window', () => {
    expect(intentMatches(reading(ARMED - 90_000), training)).toBe(true);
    expect(intentMatches(reading(ARMED + INTENT_WINDOW_MS), training)).toBe(true);
    expect(intentMatches(reading(ARMED - INTENT_WINDOW_MS - 1), training)).toBe(false);
    expect(intentMatches(reading(ARMED + 3 * 60 * 60_000), training)).toBe(false);
  });

  it('claims one reading only', () => {
    armGarminIntent(training);
    expect(claimGarminIntent(reading(ARMED))).toEqual(training);
    expect(claimGarminIntent(reading(ARMED))).toBeNull();
  });

  it('does not spend the intent on an unrelated reading', () => {
    armGarminIntent(training);
    expect(claimGarminIntent(reading(ARMED - 60 * 60_000))).toBeNull();
    expect(claimGarminIntent(reading(ARMED))).toEqual(training);
  });

  it('matches a real mapped watch payload (local time, no zone)', () => {
    const mapped = mapHrvPayload({
      type: 'hrv', id: 'w1', schemaVersion: 1, time: '2026-09-29T07:59:20',
      elapsedSec: 300, rrMs: Array.from({ length: 300 }, (_, i) => 1000 + (i % 2 ? 20 : -20)),
    });
    expect(mapped).not.toBeNull();
    expect(intentMatches(mapped!.entry, training)).toBe(true);
  });
});
