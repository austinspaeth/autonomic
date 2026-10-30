import { correctedDistance, largestSourceMeters, recordsForSession, sessionOwnMeters } from '../workoutDistance';

/**
 * The bug this file exists for: a 10.75 km run recorded by a Garmin was filed
 * at 18.76 km, because Garmin Connect's GPS distance and Samsung Health's
 * step-based distance for the same hour were summed.
 */
const GARMIN = 'com.garmin.android.apps.connectmobile';
const SAMSUNG = 'com.sec.android.app.shealth';
const rec = (dataOrigin: string | undefined, inMeters: number) => ({
  distance: { inMeters }, ...(dataOrigin ? { metadata: { dataOrigin } } : {}),
});

describe('sessionOwnMeters', () => {
  it("takes the session's own app and never adds another app's distance", () => {
    const records = [rec(GARMIN, 5000), rec(GARMIN, 5750), rec(SAMSUNG, 8010)];
    // The sum, which is what shipped, was 18,760 m.
    expect(sessionOwnMeters(records, GARMIN)).toBe(10750);
  });

  it("is null when the session's app wrote no distance, so the caller falls back", () => {
    expect(sessionOwnMeters([rec(SAMSUNG, 8010)], GARMIN)).toBeNull();
    expect(sessionOwnMeters([rec(GARMIN, 0)], GARMIN)).toBeNull();
    expect(sessionOwnMeters([rec(GARMIN, 100)], undefined)).toBeNull();
  });
});

describe('largestSourceMeters', () => {
  it('is the largest single source, never the sum', () => {
    expect(largestSourceMeters([rec(GARMIN, 10750), rec(SAMSUNG, 8010)])).toBe(10750);
    expect(largestSourceMeters([rec(SAMSUNG, 4000), rec(SAMSUNG, 4010), rec(GARMIN, 7000)])).toBe(8010);
  });

  it('answers 0 for nothing and ignores junk', () => {
    expect(largestSourceMeters([])).toBe(0);
    expect(largestSourceMeters([rec(GARMIN, Number.NaN), rec(SAMSUNG, -5)])).toBe(0);
  });
});

describe('recordsForSession', () => {
  it("keeps only the session's app when it wrote any", () => {
    const records = [rec(GARMIN, 1), rec(SAMSUNG, 2)];
    expect(recordsForSession(records, GARMIN)).toEqual([records[0]]);
  });

  it('falls back to every record when the app wrote none or provenance is missing', () => {
    const records = [rec(SAMSUNG, 2)];
    expect(recordsForSession(records, GARMIN)).toBe(records);
    expect(recordsForSession(records, undefined)).toBe(records);
  });
});

describe('correctedDistance', () => {
  it('lowers an inflated stored distance to the corrected read', () => {
    expect(correctedDistance('11.66', 6.68)).toBe('6.68');
  });

  it('never raises, and leaves an equal (hand-corrected) distance alone', () => {
    expect(correctedDistance('6.68', 6.68)).toBeNull();
    expect(correctedDistance('6.68', 6.685)).toBeNull();
    expect(correctedDistance('5', 6.68)).toBeNull();
  });

  it('does nothing without a stored distance or a fresh one', () => {
    expect(correctedDistance(undefined, 6.68)).toBeNull();
    expect(correctedDistance('', 6.68)).toBeNull();
    expect(correctedDistance('11.66', null)).toBeNull();
    expect(correctedDistance('11.66', 0)).toBeNull();
  });
});
