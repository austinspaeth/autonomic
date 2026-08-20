import appJson from '../../../app.json';
import { RELEASES, fmtReleaseDate, minorOf, releaseFor, shouldOfferWhatsNew, type Release } from '../whatsNew';

const FIXTURE: Release[] = [
  { version: '1.22', date: '2026-08-05', notes: ['a'] },
  { version: '1.21', date: '2026-07-30', notes: ['b'] },
];

describe('minorOf', () => {
  it('drops the patch component', () => {
    expect(minorOf('1.22.3')).toBe('1.22');
    expect(minorOf('1.22.0')).toBe('1.22');
    expect(minorOf('2.0.0')).toBe('2.0');
  });
  it('leaves anything unparseable alone', () => {
    expect(minorOf('nightly')).toBe('nightly');
  });
});

describe('releaseFor', () => {
  it('matches a build to its minor release', () => {
    expect(releaseFor('1.22.4', FIXTURE)?.version).toBe('1.22');
  });
  it('is null for a version with no notes', () => {
    expect(releaseFor('1.5.0', FIXTURE)).toBeNull();
  });
});

describe('shouldOfferWhatsNew', () => {
  it('offers a new minor to an existing user', () => {
    expect(shouldOfferWhatsNew('1.22.0', '1.21', true, FIXTURE)).toBe(true);
  });
  it('offers when nothing has been recorded yet', () => {
    expect(shouldOfferWhatsNew('1.22.0', null, true, FIXTURE)).toBe(true);
  });
  it('stays quiet across a patch release', () => {
    expect(shouldOfferWhatsNew('1.22.1', '1.22', true, FIXTURE)).toBe(false);
    expect(shouldOfferWhatsNew('1.22.9', '1.22', true, FIXTURE)).toBe(false);
  });
  it('stays quiet on a fresh install', () => {
    expect(shouldOfferWhatsNew('1.22.0', null, false, FIXTURE)).toBe(false);
  });
  it('stays quiet for a build with no notes', () => {
    expect(shouldOfferWhatsNew('1.23.0', '1.22', true, FIXTURE)).toBe(false);
  });
});

describe('the shipped release log', () => {
  it('is newest-first with no duplicate minors', () => {
    const nums = RELEASES.map((r) => r.version.split('.').map(Number));
    nums.forEach(([maj, min], i) => {
      expect(RELEASES[i].version).toBe(`${maj}.${min}`); // minor only, no patch
      expect(RELEASES[i].notes.length).toBeGreaterThan(0);
      expect(RELEASES[i].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (i === 0) return;
      const [pMaj, pMin] = nums[i - 1];
      expect(pMaj * 1000 + pMin).toBeGreaterThan(maj * 1000 + min);
    });
  });

  // The pill keys off the running build's minor version, so a release that
  // ships without an entry silently shows nothing.
  it('covers the version this build ships as', () => {
    expect(releaseFor(appJson.expo.version)).not.toBeNull();
  });
});

describe('fmtReleaseDate', () => {
  it('formats a bare ISO day without shifting it', () => {
    expect(fmtReleaseDate('2026-08-05')).toBe('Aug 5, 2026');
    expect(fmtReleaseDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(fmtReleaseDate('2026-12-31')).toBe('Dec 31, 2026');
  });
  it('is empty for junk rather than throwing', () => {
    expect(fmtReleaseDate('')).toBe('');
    expect(fmtReleaseDate('2026-13-01')).toBe('');
  });
});
