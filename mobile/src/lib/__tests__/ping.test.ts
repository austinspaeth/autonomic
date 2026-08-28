import {
  cohortCode,
  easternDay,
  methodCode,
  pingUrl,
  platformCode,
  resolveCohort,
  shouldPingOpen,
  notifyCode,
  surfaceCode,
  tierCode,
  versionCode,
} from '../ping';

const at = (iso: string) => Date.parse(iso);

describe('cohort ping wire format', () => {
  it('encodes an ISO date as D{MMDDYY}{platform}', () => {
    expect(cohortCode('2026-08-21', 'I')).toBe('D082126I');
    expect(cohortCode('2026-01-05', 'A')).toBe('D010526A');
    expect(cohortCode('2025-12-31')).toBe('D123125U');
  });

  it('maps the two platforms the app ships on', () => {
    expect(platformCode('ios')).toBe('I');
    expect(platformCode('android')).toBe('A');
    expect(platformCode('web')).toBe('U');
    expect(platformCode(undefined)).toBe('U');
  });

  it('builds the three routes', () => {
    expect(pingUrl('open', '2026-08-21', 'I')).toBe('https://api.autonomic.care/ping/open/D082126I');
    expect(pingUrl('sub', '2026-08-21', 'A')).toBe('https://api.autonomic.care/ping/sub/D082126A');
    expect(pingUrl('act', '2026-08-21', 'I', 'B')).toBe('https://api.autonomic.care/ping/act/D082126IB');
    // The daily reading route carries the sensor too — see the header of
    // ../ping for why that costs the open/hrv symmetry nothing.
    expect(pingUrl('hrv', '2026-08-21', 'I', 'G')).toBe('https://api.autonomic.care/ping/hrv/D082126IG');
  });

  it('appends the capture method only when there is one', () => {
    expect(cohortCode('2026-08-21', 'I', 'W')).toBe('D082126IW');
    expect(cohortCode('2026-08-21', 'I')).toBe('D082126I');
    expect(pingUrl('act', '2026-08-21', 'A')).toBe('https://api.autonomic.care/ping/act/D082126A');
  });

  it('maps every capture source onto a method letter', () => {
    expect(methodCode('watch')).toBe('W');
    expect(methodCode('polar')).toBe('B');
    expect(methodCode('camera')).toBe('F');
    expect(methodCode('garmin')).toBe('G');
    expect(methodCode('something-else')).toBeUndefined();
    expect(methodCode(undefined)).toBeUndefined();
  });

  it('maps every locked surface onto a letter, in the sensor slot', () => {
    expect(surfaceCode('progress')).toBe('R');
    expect(surfaceCode('insights')).toBe('I');
    expect(surfaceCode('pots')).toBe('P');
    expect(surfaceCode('outlook-ai')).toBe('O');
    expect(surfaceCode('metric-ai')).toBe('M');
    expect(surfaceCode('insights-ai')).toBe('N');
    expect(surfaceCode('settings')).toBe('S');
    expect(surfaceCode('nowhere')).toBeUndefined();
    expect(pingUrl('pay', '2026-08-21', 'I', 'R'))
      .toBe('https://api.autonomic.care/ping/pay/D082126IR');
  });

  it('gives every route that carries a letter its own alphabet', () => {
    expect(notifyCode('reminder')).toBe('M');
    expect(notifyCode('crash')).toBe('C');
    expect(notifyCode('something-else')).toBeUndefined();
    // The capture pair: two routes, one alphabet, so a completion rate can be
    // read per sensor.
    expect(pingUrl('cap', '2026-08-21', 'I', 'B'))
      .toBe('https://api.autonomic.care/ping/cap/D082126IB');
    expect(pingUrl('hrv', '2026-08-21', 'I', 'B'))
      .toBe('https://api.autonomic.care/ping/hrv/D082126IB');
    // The offer funnel: three routes, one alphabet, read against each other.
    expect(pingUrl('osh', '2026-08-21', 'I', 'A'))
      .toBe('https://api.autonomic.care/ping/osh/D082126IA');
    expect(pingUrl('oac', '2026-08-21', 'I', 'F'))
      .toBe('https://api.autonomic.care/ping/oac/D082126IF');
    // And the one route with nothing to say beyond "this install had a failure".
    expect(pingUrl('err', '2026-08-21', 'A'))
      .toBe('https://api.autonomic.care/ping/err/D082126A');
  });

  it('maps a tier onto a letter, and anything unknown onto free', () => {
    expect(tierCode('free')).toBe('F');
    expect(tierCode('trial')).toBe('T');
    expect(tierCode('pro')).toBe('P');
    expect(tierCode(undefined)).toBe('F');
    expect(tierCode('something-else')).toBe('F');
  });

  it('sends only a version it can vouch for', () => {
    expect(versionCode('1.26.0')).toBe('1.26.0');
    expect(versionCode('1.26')).toBe('1.26');
    expect(versionCode('2')).toBe('2');
    // A key nobody can read is worse than a key that is absent.
    expect(versionCode('1.26.0-beta.3')).toBeUndefined();
    expect(versionCode('')).toBeUndefined();
    expect(versionCode(undefined)).toBeUndefined();
  });

  it('appends tier and version as tagged tokens, in a fixed order', () => {
    expect(cohortCode('2026-08-21', 'I', 'G', 'P', '1.26.0')).toBe('D082126IG-TP-V1.26.0');
    // Every field after the head is independently optional, which is the whole
    // point of tagging them: no token can be mistaken for a missing one.
    expect(cohortCode('2026-08-21', 'I', undefined, 'F', '1.26.0')).toBe('D082126I-TF-V1.26.0');
    expect(cohortCode('2026-08-21', 'I', 'G', 'P')).toBe('D082126IG-TP');
    expect(cohortCode('2026-08-21', 'I', 'G', undefined, '1.26.0')).toBe('D082126IG-V1.26.0');
    // An unusable version drops out rather than corrupting the code.
    expect(cohortCode('2026-08-21', 'I', undefined, 'T', 'nightly')).toBe('D082126I-TT');
    // And a build sending nothing new is byte-identical to the old format.
    expect(cohortCode('2026-08-21', 'I', 'G')).toBe('D082126IG');
  });
});

describe('eastern days', () => {
  it('is UTC-4 while daylight time is in force', () => {
    // 03:30 UTC on the 22nd is still 23:30 on the 21st in New York.
    expect(easternDay(at('2026-08-22T03:30:00Z'))).toBe('2026-08-21');
    expect(easternDay(at('2026-08-22T04:30:00Z'))).toBe('2026-08-22');
  });

  it('is UTC-5 while standard time is in force', () => {
    expect(easternDay(at('2026-01-02T04:30:00Z'))).toBe('2026-01-01');
    expect(easternDay(at('2026-01-02T05:30:00Z'))).toBe('2026-01-02');
  });

  it('switches on the US transition days, not on the equinox', () => {
    // 2026: DST starts Mar 8, ends Nov 1.
    expect(easternDay(at('2026-03-08T06:59:00Z'))).toBe('2026-03-08');   // still EST
    expect(easternDay(at('2026-03-08T07:01:00Z'))).toBe('2026-03-08');   // now EDT
    expect(easternDay(at('2026-03-09T04:30:00Z'))).toBe('2026-03-09');   // EDT: 00:30 local
    expect(easternDay(at('2026-11-01T05:30:00Z'))).toBe('2026-11-01');   // EDT: 01:30 local
    expect(easternDay(at('2026-11-02T04:30:00Z'))).toBe('2026-11-01');   // EST: 23:30 local
  });

  it('agrees with the platform timezone database', () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    for (let i = 0; i < 800; i++) {
      const ms = at('2026-01-01T00:00:00Z') + i * 6 * 3600_000 + 37 * 60_000;
      expect(easternDay(ms)).toBe(fmt.format(new Date(ms)));
    }
  });
});

describe('once per Eastern day', () => {
  it('buckets by the server\'s day, not the phone\'s local midnight', () => {
    // 23:30 Eastern on the 21st is already the 22nd in Sydney and in UTC; the
    // server counts the 21st, so the client must dedupe against the 21st too.
    expect(shouldPingOpen('2026-08-21', at('2026-08-22T03:30:00Z'))).toBe(false);
    expect(shouldPingOpen('2026-08-21', at('2026-08-22T04:30:00Z'))).toBe(true);
  });

  it('pings once and then not again until the day turns over', () => {
    expect(shouldPingOpen(undefined, at('2026-08-21T13:00:00Z'))).toBe(true);
    expect(shouldPingOpen('2026-08-21', at('2026-08-21T13:00:00Z'))).toBe(false);
    expect(shouldPingOpen('2026-08-21', at('2026-08-22T03:59:00Z'))).toBe(false);
    expect(shouldPingOpen('2026-08-21', at('2026-08-22T04:00:01Z'))).toBe(true);
  });
});

describe('cohort resolution', () => {
  const now = at('2026-08-21T12:00:00Z');

  it('uses the install birthday, not today', () => {
    expect(resolveCohort(undefined, '2026-03-04T18:22:00.000Z', now)).toBe('2026-03-04');
  });

  it('reads the birthday as an Eastern day', () => {
    // Stamped at 22:00 in New York, which UTC already calls the next morning.
    expect(resolveCohort(undefined, '2026-03-05T02:00:00.000Z', now)).toBe('2026-03-04');
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
