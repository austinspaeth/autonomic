import { cohortCode, pingUrl, resolveCohort, shouldPingOpen, utcDay } from '../ping';

const at = (iso: string) => Date.parse(iso);

describe('cohort ping wire format', () => {
  it('encodes an ISO date as D{MMDDYY}', () => {
    expect(cohortCode('2026-08-21')).toBe('D082126');
    expect(cohortCode('2026-01-05')).toBe('D010526');
    expect(cohortCode('2025-12-31')).toBe('D123125');
  });

  it('builds the two routes', () => {
    expect(pingUrl('open', '2026-08-21')).toBe('https://api.autonomic.care/ping/open/D082126');
    expect(pingUrl('sub', '2026-08-21')).toBe('https://api.autonomic.care/ping/sub/D082126');
  });
});

describe('once per UTC day', () => {
  it('buckets by UTC, not local midnight', () => {
    // 23:30 UTC on the 21st is already the 22nd in Sydney; the server counts
    // the 21st, so the client must dedupe against the 21st too.
    expect(utcDay(at('2026-08-21T23:30:00Z'))).toBe('2026-08-21');
    expect(utcDay(at('2026-08-22T00:30:00Z'))).toBe('2026-08-22');
  });

  it('pings once and then not again until the day turns over', () => {
    expect(shouldPingOpen(undefined, at('2026-08-21T09:00:00Z'))).toBe(true);
    expect(shouldPingOpen('2026-08-21', at('2026-08-21T09:00:00Z'))).toBe(false);
    expect(shouldPingOpen('2026-08-21', at('2026-08-21T23:59:59Z'))).toBe(false);
    expect(shouldPingOpen('2026-08-21', at('2026-08-22T00:00:01Z'))).toBe(true);
  });
});

describe('cohort resolution', () => {
  const now = at('2026-08-21T12:00:00Z');

  it('uses the install birthday, not today', () => {
    expect(resolveCohort(undefined, '2026-03-04T18:22:00.000Z', now)).toBe('2026-03-04');
  });

  it('never moves an install once its cohort is frozen', () => {
    expect(resolveCohort('2026-03-04', '2026-08-01T00:00:00.000Z', now)).toBe('2026-03-04');
  });

  it('falls back to today when the stamp is missing or in the future', () => {
    expect(resolveCohort(undefined, undefined, now)).toBe('2026-08-21');
    expect(resolveCohort(undefined, 'not-a-date', now)).toBe('2026-08-21');
    // Clock rolled back after stamping: a future birthday is not a cohort.
    expect(resolveCohort(undefined, '2027-01-01T00:00:00.000Z', now)).toBe('2026-08-21');
  });
});
