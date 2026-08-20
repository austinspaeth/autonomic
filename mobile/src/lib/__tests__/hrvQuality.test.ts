import {
  IMPORTED_HRV_MIN_SEC, hasHrvReading, isTrustedReading, rrCoverageSec,
  stampImportedHrvCoverage, trustedReadings,
} from '../hrvQuality';
import { defaultState, blankDay } from '../migrate';
import { scoreSet, metricHistory } from '../scoring/day';
import { acReadVals } from '../analysis/buckets';
import type { AppState, DayRecord, Entry } from '../types';

const hrv = (over: Partial<Entry> = {}): Entry => ({
  id: 'r1', type: 'hrv', time: '07:10', rmssd: '55', sdnn: '60', avgHr: '58', ...over,
} as Entry);

const dayWith = (readings: Entry[]): DayRecord => ({ ...blankDay(), readings } as DayRecord);

describe('imported HRV trust gate', () => {
  it('trusts an imported reading with at least the minimum RR coverage', () => {
    expect(isTrustedReading(hrv({ imported: true, durationSec: IMPORTED_HRV_MIN_SEC }))).toBe(true);
    expect(isTrustedReading(hrv({ imported: true, durationSec: 600 }))).toBe(true);
  });

  it('rejects a short imported reading (Apple’s 1-minute background sample)', () => {
    expect(isTrustedReading(hrv({ imported: true, durationSec: 60 }))).toBe(false);
    expect(isTrustedReading(hrv({ imported: true, durationSec: IMPORTED_HRV_MIN_SEC - 1 }))).toBe(false);
  });

  it('rejects an imported reading with no RR behind it at all', () => {
    // SDNN-only quantity sample / Health Connect RMSSD record: no coverage stamp.
    expect(isTrustedReading(hrv({ imported: true }))).toBe(false);
    expect(isTrustedReading(hrv({ imported: true, durationSec: 0 }))).toBe(false);
    expect(isTrustedReading(hrv({ type: 'breathHrv', imported: true }))).toBe(false);
  });

  it('never touches in-app captures or non-HRV readings', () => {
    expect(isTrustedReading(hrv({ durationSec: 60 }))).toBe(true);        // user's own short session
    expect(isTrustedReading(hrv({ source: 'polar' }))).toBe(true);
    expect(isTrustedReading({ id: 'b', type: 'bp', sys: '118', dia: '76' })).toBe(true);
    expect(isTrustedReading({ id: 'h', type: 'restingHr', hr: '58' })).toBe(true);
  });

  it('keeps array identity when nothing is filtered', () => {
    const list = [hrv(), hrv({ id: 'r2', type: 'bp' })];
    expect(trustedReadings(list)).toBe(list);
    expect(trustedReadings(undefined)).toEqual([]);
  });
});

describe('short imports stay out of every derived number', () => {
  const good = hrv({ id: 'good', imported: true, durationSec: 300, rmssd: '55' });
  const short = hrv({ id: 'short', time: '09:00', imported: true, durationSec: 62, rmssd: '9' });

  it('is excluded from Analysis / Progress / widget aggregates', () => {
    const d = dayWith([good, short]);
    expect(acReadVals(d, 'hrv', 'rmssd')).toEqual([55]);
    expect(acReadVals(dayWith([short]), 'hrv', 'rmssd')).toEqual([]);
  });

  it('is excluded from the day score', () => {
    const days = { '2026-07-01': dayWith([short]) };
    const only = scoreSet([short], days['2026-07-01'], '2026-07-01', days, {});
    expect(only.hasUnstruct).toBe(false);

    // A crash-level short sample must not drag a good reading's score down.
    const both = dayWith([good, short]);
    const withShort = scoreSet(both.readings as Entry[], both, '2026-07-01', { '2026-07-01': both }, {});
    const alone = dayWith([good]);
    const withoutShort = scoreSet(alone.readings as Entry[], alone, '2026-07-01', { '2026-07-01': alone }, {});
    expect(withShort.score).toBe(withoutShort.score);
  });

  it('is excluded from a metric sparkline history', () => {
    const days = { '2026-07-01': dayWith([good, short]) };
    const hist = metricHistory(days, 'hrv', (r) => Number(r.rmssd));
    expect(hist.map((h) => h.v)).toEqual([55]);
  });
});

describe('stampImportedHrvCoverage', () => {
  const stateWith = (readings: Entry[]): AppState =>
    ({ ...defaultState(), days: { '2026-07-01': dayWith(readings) } } as AppState);

  it('stamps coverage from the sidecar RR series and leaves the rest alone', () => {
    const state = stateWith([
      hrv({ id: 'withRr', imported: true }),
      hrv({ id: 'noRr', imported: true }),
      hrv({ id: 'mine' }),                                  // captured in-app
      hrv({ id: 'already', imported: true, durationSec: 12 }),
    ]);
    const rr = { withRr: Array(300).fill(1000) };            // 300 s of beats
    const stamped = stampImportedHrvCoverage(state, (id) => (rr as Record<string, number[]>)[id]);
    expect(stamped).toBe(2);

    const [withRr, noRr, mine, already] = state.days['2026-07-01'].readings as Entry[];
    expect(withRr.durationSec).toBe(300);
    expect(isTrustedReading(withRr)).toBe(true);
    expect(noRr.durationSec).toBe(0);
    expect(isTrustedReading(noRr)).toBe(false);
    expect(mine.durationSec).toBeUndefined();                // untouched
    expect(already.durationSec).toBe(12);                    // never re-stamped
  });

  it('is idempotent — a second pass has nothing to do', () => {
    const state = stateWith([hrv({ id: 'a', imported: true })]);
    expect(stampImportedHrvCoverage(state, () => undefined)).toBe(1);
    expect(stampImportedHrvCoverage(state, () => undefined)).toBe(0);
  });

  it('rrCoverageSec sums RR intervals into whole seconds', () => {
    expect(rrCoverageSec([1000, 900, 1100])).toBe(3);
    expect(rrCoverageSec(undefined)).toBe(0);
  });
});

describe('has this journal got a baseline yet', () => {
  const days = (map: Record<string, Entry[]>) => {
    const out: Record<string, DayRecord> = {};
    Object.keys(map).forEach((dk) => { out[dk] = dayWith(map[dk]); });
    return out as AppState['days'];
  };

  it('is false on an empty journal', () => {
    expect(hasHrvReading(undefined)).toBe(false);
    expect(hasHrvReading({} as AppState['days'])).toBe(false);
    expect(hasHrvReading(days({ '2026-07-01': [] }))).toBe(false);
  });

  it('is false for a journal holding only non-HRV readings', () => {
    expect(hasHrvReading(days({ '2026-07-01': [{ id: 'b', type: 'bp', time: '08:00' } as Entry] }))).toBe(false);
  });

  it('is true for an in-app capture of either kind, however short', () => {
    expect(hasHrvReading(days({ '2026-07-01': [hrv({ durationSec: 30 })] }))).toBe(true);
    expect(hasHrvReading(days({ '2026-07-01': [hrv({ type: 'breathHrv' })] }))).toBe(true);
  });

  it('does not let an untrusted import retire the card', () => {
    // A year of the watch's one-minute samples is exactly what this module
    // refuses everywhere else; the Journal's first-reading slot is no exception.
    expect(hasHrvReading(days({ '2026-07-01': [hrv({ imported: true, durationSec: 60 })] }))).toBe(false);
    expect(hasHrvReading(days({
      '2026-07-01': [hrv({ imported: true, durationSec: 60 })],
      '2026-07-02': [hrv({ id: 'r2', imported: true, durationSec: IMPORTED_HRV_MIN_SEC })],
    }))).toBe(true);
  });
});
