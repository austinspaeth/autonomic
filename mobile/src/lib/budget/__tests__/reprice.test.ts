import type { DayLoad } from '../../types';
import { CURVE_MAX, PRICE_VERSION, repriceAction } from '../reprice';

const load = (over: Partial<DayLoad> = {}): DayLoad => ({
  steps: 3000, walkingMin: 30, standMin: null, stillUprightMin: null, stillFloorBpm: null,
  uprightSpans: null, uprightByHour: null, hrAboveMin: 12, hrBands: null, hrBelowMin: null,
  hrBelowByHour: null, hrCoverageMin: 140, hrSampleGapMin: null, hrStretches: 1,
  longestStretch: null, peakBpm: 104, lineBpm: 96, readAt: '2026-03-14T20:00:00.000Z',
  pricedVersion: null,
  ...over,
});

describe('repriceAction', () => {
  it('re-charges a day whose curve is exactly what was read', () => {
    // The sparse days are the ones the fixed five-minute tolerance broke, and
    // they are under the cap precisely BECAUSE they were sparse, so the repair
    // lands where it is needed.
    expect(repriceAction(load(), 120)).toBe('full');
    expect(repriceAction(load(), CURVE_MAX - 1)).toBe('full');
  });

  it('keeps the stored minutes when the curve is a lossy copy', () => {
    // A day pinned AT the cap wrote more points than that and what survives is
    // a decimation. Its stored figures came from the raw series at read time
    // and are the best numbers that exist for it.
    expect(repriceAction(load(), CURVE_MAX)).toBe('stamp');
    expect(repriceAction(load(), CURVE_MAX * 2)).toBe('stamp');
  });

  it('stamps a day with no curve rather than rescanning it for ever', () => {
    // Same rule `backfillHrBands` follows: absent reads as "never looked".
    expect(repriceAction(load(), null)).toBe('stamp');
    expect(repriceAction(load(), 1)).toBe('stamp');
  });

  it('runs once', () => {
    expect(repriceAction(load({ pricedVersion: PRICE_VERSION }), 120)).toBe('done');
    expect(repriceAction(load({ pricedVersion: PRICE_VERSION + 1 }), 120)).toBe('done');
  });

  it('treats an absent version as the rules before this existed', () => {
    // Every day already in a journal carries no `pricedVersion`, and reading
    // that as current would make the repair a no-op on the phones that need it.
    expect(repriceAction(load({ pricedVersion: null }), 120)).toBe('full');
    expect(PRICE_VERSION).toBeGreaterThan(1);
  });

  it('has nothing to do for a day with no load record', () => {
    expect(repriceAction(null, 120)).toBe('done');
    expect(repriceAction(undefined, 120)).toBe('done');
  });
});
