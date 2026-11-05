/**
 * reviewCardDue: the request card is a favour, so it is asked once, only of
 * somebody who has used the app for a week with nothing failing, and never on
 * a bad day.
 *
 * Fixtures match the scoring tests: a 'breathHrv' reading with only rmssd set
 * makes the day score exactly its grade points (40→100, 30→80, 25→60, 20→35,
 * 15→10), and training keeps the grade absolute.
 */
import type { DayRecord, Entry } from '../../types';
import {
  EMPTY_CARD_MEMORY, MIN_ENGAGED_DAYS, WATCH_DAYS, parseCardMemory, reviewCardDue,
  reviewCardLive, reviewUrlFor, type ReviewCardMemory,
} from '../card';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});
const hrvR = (rmssd: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `r${rmssd}`, type: 'breathHrv', time: '08:00', rmssd: String(rmssd), ...over });
const hrvDay = (rmssd: number) => day({ readings: [hrvR(rmssd)] });

const DK = '2026-01-10';
const K = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;
const NOW = Date.UTC(2026, 0, 10, 18, 0, 0);
const DAY_MS = 86_400_000;

/** Ten steady, well-logged days. Steady on purpose: a climb would trip the
 *  upturn-shaped detectors and a slide would trip the downturn. */
const steady = (): Record<string, DayRecord> => {
  const out: Record<string, DayRecord> = {};
  for (let n = 1; n <= 10; n++) out[K(n)] = hrvDay(30);
  return out;
};

const clean: ReviewCardMemory = {
  answered: false,
  standing: false,
  failures: 0,
  watchingSince: NOW - (WATCH_DAYS + 1) * DAY_MS,
};

const due = (over: Partial<Parameters<typeof reviewCardDue>[0]> = {}) =>
  reviewCardDue({
    days: steady(),
    dk: DK,
    today: DK,
    memory: clean,
    nowMs: NOW,
    platform: 'android',
    ...over,
  });

describe('reviewCardDue', () => {
  it('opens for a well-logged week with nothing failing', () => {
    expect(due()).toEqual({ ok: true });
  });

  it('is asked exactly once', () => {
    expect(due({ memory: { ...clean, answered: true } }))
      .toEqual({ ok: false, reason: 'answered' });
  });

  // Once raised it STANDS: every rule below is about whether to start asking.
  describe('a raised card stands until it is answered', () => {
    const raised = { ...clean, standing: true };
    it('is live from its own memory', () => {
      expect(reviewCardLive(raised)).toBe(true);
      expect(reviewCardLive({ ...raised, answered: true })).toBe(false);
      expect(reviewCardLive(clean)).toBe(false);
    });
    // It must not be re-raised (and so re-pinged) while it is already up.
    it('is not raised again', () => {
      expect(due({ memory: raised })).toEqual({ ok: false, reason: 'standing' });
    });
    // The rules that would have STOPPED it being raised cannot take it down:
    // the component never asks `reviewCardDue` again once it is standing.
    it('survives a reading failing underneath it', () => {
      expect(reviewCardLive({ ...raised, failures: 4 })).toBe(true);
    });
  });

  it('never follows the OS prompt', () => {
    expect(due({ osPromptAsked: true })).toEqual({ ok: false, reason: 'os-prompt-spent' });
  });

  it('is today only', () => {
    expect(due({ dk: K(9) })).toEqual({ ok: false, reason: 'not-today' });
  });

  // One failure is enough, for good: a refused reading leaves nothing in the
  // journal, so this count is the only record there is of it.
  it('is retired by a single failed reading', () => {
    expect(due({ memory: { ...clean, failures: 1 } }))
      .toEqual({ ok: false, reason: 'had-failures' });
  });

  describe('a clean record only counts while we were watching', () => {
    it('waits out the watch window', () => {
      expect(due({ memory: { ...clean, watchingSince: NOW - 2 * DAY_MS } }))
        .toEqual({ ok: false, reason: 'watching' });
      expect(due({ memory: { ...clean, watchingSince: NOW - WATCH_DAYS * DAY_MS } }))
        .toEqual({ ok: true });
    });
    it('claims nothing before the clock was started', () => {
      expect(due({ memory: { ...clean, watchingSince: null } }))
        .toEqual({ ok: false, reason: 'not-watching' });
    });
  });

  describe('a week of the user\'s OWN days', () => {
    it('refuses a shorter journal', () => {
      const days = steady();
      for (let n = MIN_ENGAGED_DAYS; n <= 10; n++) delete days[K(n)];
      expect(due({ days })).toEqual({ ok: false, reason: 'too-few-days' });
    });
    // A year of back-filled Health history is not a week of use.
    it('does not count imported entries', () => {
      const days: Record<string, DayRecord> = {};
      for (let n = 1; n <= 10; n++) days[K(n)] = day({ readings: [hrvR(30, { imported: true })] });
      expect(due({ days })).toEqual({ ok: false, reason: 'too-few-days' });
    });
  });

  describe('the two weak sensors, on iOS', () => {
    it('is never shown to a camera or Garmin user there', () => {
      expect(due({ platform: 'ios', source: 'camera' }))
        .toEqual({ ok: false, reason: 'weak-sensor-ios' });
      expect(due({ platform: 'ios', source: 'garmin' }))
        .toEqual({ ok: false, reason: 'weak-sensor-ios' });
    });
    it('still opens for a strap or the watch on iOS', () => {
      expect(due({ platform: 'ios', source: 'polar' })).toEqual({ ok: true });
      expect(due({ platform: 'ios', source: 'watch' })).toEqual({ ok: true });
    });
    // The rule is Austin's, and it is iOS-only by design.
    it('leaves Android alone', () => {
      expect(due({ platform: 'android', source: 'camera' })).toEqual({ ok: true });
    });
    // Undefined means no in-app capture has ever picked a sensor, which is not
    // evidence that the camera is the one being used.
    it('reads an unset sensor as unknown, not as the camera', () => {
      expect(due({ platform: 'ios', source: undefined })).toEqual({ ok: true });
      expect(due({ platform: 'ios', source: null })).toEqual({ ok: true });
    });
  });

  describe('never on a bad day, and never beside an offer', () => {
    it('stands down on the day the crash warning fired', () => {
      expect(due({ crashAlertFiredToday: true }))
        .toEqual({ ok: false, reason: 'crash-alert-today' });
    });
    it('stands down in a session that met the paywall', () => {
      expect(due({ paywallSeenThisSession: true }))
        .toEqual({ ok: false, reason: 'paywall-this-session' });
    });
    it('stands down under a live offer card', () => {
      expect(due({ offerLive: true })).toEqual({ ok: false, reason: 'offer-live' });
    });
    it('stands down during a downturn', () => {
      // A clear slide into today out of a much better fortnight.
      const days = steady();
      days[K(8)] = hrvDay(20);
      days[K(9)] = hrvDay(15);
      days[K(10)] = hrvDay(15);
      const v = due({ days });
      expect(v.ok).toBe(false);
      expect((v as { reason: string }).reason).toBe('downturn');
    });
  });
});

describe('reviewUrlFor', () => {
  // Apple opens straight into the composer; Play has no such parameter.
  it('asks Apple for the review sheet', () => {
    expect(reviewUrlFor('ios')).toContain('action=write-review');
    expect(reviewUrlFor('ios')).toContain('apps.apple.com');
  });
  it('sends everything else to the Play listing', () => {
    expect(reviewUrlFor('android')).toContain('play.google.com');
    expect(reviewUrlFor('web')).toContain('play.google.com');
  });
});

describe('parseCardMemory', () => {
  it('reads a fresh install out of nothing', () => {
    expect(parseCardMemory(null)).toEqual(EMPTY_CARD_MEMORY);
    expect(parseCardMemory('not json')).toEqual(EMPTY_CARD_MEMORY);
  });
  it('round-trips a real memory', () => {
    const m: ReviewCardMemory = { answered: true, standing: true, failures: 3, watchingSince: NOW };
    expect(parseCardMemory(JSON.stringify(m))).toEqual(m);
  });
  // Junk must never read as "watched, with a clean record".
  it('reads junk fields as unknown rather than as clean', () => {
    expect(parseCardMemory('{"watchingSince":"yesterday","failures":-2,"answered":1,"standing":"yes"}'))
      .toEqual(EMPTY_CARD_MEMORY);
  });
});
