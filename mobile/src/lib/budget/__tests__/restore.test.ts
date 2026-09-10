import { addDays } from '../../dates';
import { RESTORE_DAYS, erasedLoadDays, readHasEvidence, readLosesEvidence } from '../restore';
import type { DayLoadRead } from '../../health';
import type { DayLoad, DayRecord } from '../../types';

const load = (over: Partial<DayLoad>): DayLoad => ({
  steps: null, walkingMin: null, standMin: null, stillUprightMin: null,
  uprightSpans: null, hrAboveMin: null, hrBands: null, hrBelowMin: null, hrCoverageMin: null, hrStretches: null,
  longestStretch: null, peakBpm: null, lineBpm: null, readAt: null,
  ...over,
});

const read = (over: Partial<DayLoadRead>): DayLoadRead => ({
  steps: null, stepSpans: null, standMin: null, hr: null, ...over,
});

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const DK = '2026-09-10';

describe('readLosesEvidence', () => {
  const full = load({ steps: 9000, standMin: 300, hrCoverageMin: 900, hrAboveMin: 80, readAt: '2026-09-09T21:00:00Z' });

  it('refuses the empty read a locked phone returns over a full record', () => {
    expect(readLosesEvidence(read({}), full)).toBe(true);
  });

  it('refuses a read that lost heart rate while steps still landed', () => {
    expect(readLosesEvidence(read({ steps: 9500, standMin: 310 }), full)).toBe(true);
  });

  it('accepts a read that holds every source the record had', () => {
    expect(readLosesEvidence(read({ steps: 9500, standMin: 310, hr: [{ t: 0, bpm: 70 }] }), full)).toBe(false);
  });

  it('accepts anything when there is no record, or the record had nothing', () => {
    expect(readLosesEvidence(read({}), undefined)).toBe(false);
    expect(readLosesEvidence(read({}), load({ readAt: '2026-09-09T08:00:00Z' }))).toBe(false);
  });
});

describe('readHasEvidence', () => {
  it('is false only when no source answered', () => {
    expect(readHasEvidence(read({}))).toBe(false);
    expect(readHasEvidence(read({ hr: [] }))).toBe(false);
    expect(readHasEvidence(read({ steps: 0 }))).toBe(true);
    expect(readHasEvidence(read({ hr: [{ t: 0, bpm: 60 }] }))).toBe(true);
  });
});

describe('erasedLoadDays', () => {
  it('reads back every past day, newest first, when steps were seen and no past record survives', () => {
    // Today already re-read; yesterday kept only a legs-up, as on the phone that found this.
    const days = {
      [DK]: day({ load: load({ steps: 3000, readAt: '2026-09-10T16:00:00Z' }) }),
      '2026-09-09': day({ activities: [{ id: 'x', type: 'legsUp', time: '15:47', duration: '10' } as never] }),
    };
    const out = erasedLoadDays(days, DK, addDays, true);
    expect(out).toHaveLength(RESTORE_DAYS);
    expect(out[0]).toBe('2026-09-09');
    expect(out[out.length - 1]).toBe(addDays(DK, -RESTORE_DAYS));
    expect(out).not.toContain(DK);
  });

  it('never fires on a working install: one past record on file retires it', () => {
    const days = { '2026-08-20': day({ load: load({ steps: 1, readAt: '2026-08-20T22:00:00Z' }) }) };
    expect(erasedLoadDays(days, DK, addDays, true)).toEqual([]);
  });

  it('leaves a fresh install alone: days before steps ever landed stay unknown', () => {
    expect(erasedLoadDays({}, DK, addDays, false)).toEqual([]);
  });
});
