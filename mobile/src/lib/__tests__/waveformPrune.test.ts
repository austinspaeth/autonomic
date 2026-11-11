import { PRUNE_INTERVAL_MS, pruneDue } from '../waveformPrune';

const NOW = Date.parse('2026-11-11T22:00:00Z');

describe('pruneDue', () => {
  it('sweeps a device that has never swept', () => {
    // Most likely to be carrying strays from an older build.
    expect(pruneDue(null, NOW)).toBe(true);
  });

  it('holds for a week after a sweep', () => {
    expect(pruneDue(NOW - 1000, NOW)).toBe(false);
    expect(pruneDue(NOW - PRUNE_INTERVAL_MS + 1000, NOW)).toBe(false);
    expect(pruneDue(NOW - PRUNE_INTERVAL_MS, NOW)).toBe(true);
  });

  it('is not parked for a week by a clock that moved backwards', () => {
    expect(pruneDue(NOW + PRUNE_INTERVAL_MS * 52, NOW)).toBe(true);
  });

  it('treats an unreadable stamp as due rather than guessing', () => {
    expect(pruneDue(NaN, NOW)).toBe(true);
    expect(pruneDue(Infinity, NOW)).toBe(true);
  });

  it('is a week, not a day — bytes are never the urgent thing', () => {
    // The sweep can delete every curve on the device if the journal is wrong;
    // the orphans it reclaims are a rounding error beside that.
    expect(PRUNE_INTERVAL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
