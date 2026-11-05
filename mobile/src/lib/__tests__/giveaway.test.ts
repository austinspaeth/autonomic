import {
  GIVEAWAY_END, GIVEAWAY_MAX_ENTRIES, giveawayBody, giveawayEntries, giveawayEntryList, giveawayOpen, isPlausibleEmail,
} from '../giveaway';
import { blankDay } from '../migrate';
import type { AppState, DayRecord, Entry } from '../types';

const hrv = (over: Partial<Entry> = {}): Entry => ({
  id: 'r1', type: 'hrv', time: '07:10', rmssd: '55', sdnn: '60', avgHr: '58', ...over,
} as Entry);
const dayWith = (readings: Entry[]): DayRecord => ({ ...blankDay(), readings } as DayRecord);
const oct = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

describe('giveaway entries', () => {
  it('counts baseline and training readings alike, naming the first reading\'s sensor', () => {
    const days: AppState['days'] = {
      [oct(2)]: dayWith([hrv({ id: 'b', time: '19:00', source: 'camera' }), hrv({ id: 'a', type: 'breathHrv', time: '07:00', source: 'polar' })]),
      [oct(5)]: dayWith([hrv({ type: 'breathHrv', source: 'watch' })]),
      [oct(6)]: dayWith([hrv({ source: 'manual' })]),
    };
    expect(giveawayEntryList(days, oct(31))).toEqual([
      { d: oct(2), m: 'B' }, { d: oct(5), m: 'W' }, { d: oct(6), m: null },
    ]);
  });

  it('builds the body with a normalised address', () => {
    expect(giveawayBody(' A@B.co ', [], false)).toEqual({ email: 'a@b.co', entries: [], dev: false });
  });

  it('counts one entry per day with a reading, inside the window only', () => {
    const days: AppState['days'] = {
      '2026-09-30': dayWith([hrv()]),
      [oct(1)]: dayWith([hrv(), hrv({ id: 'r2' })]),
      [oct(3)]: dayWith([hrv()]),
      [oct(4)]: dayWith([]),
      '2026-11-01': dayWith([hrv()]),
    };
    expect(giveawayEntries(days, oct(31))).toBe(2);
    expect(giveawayEntries(days, oct(2))).toBe(1);
  });

  it('ignores a short imported sample and caps at the maximum', () => {
    const days: AppState['days'] = { [oct(1)]: dayWith([hrv({ imported: true, durationSec: 60 })]) };
    for (let d = 2; d <= 20; d++) days[oct(d)] = dayWith([hrv()]);
    expect(giveawayEntries(days, oct(31))).toBe(GIVEAWAY_MAX_ENTRIES);
    expect(giveawayEntries({ [oct(1)]: days[oct(1)] }, oct(31))).toBe(0);
  });

  it('shows the card until the window closes', () => {
    expect(giveawayOpen('2026-09-27')).toBe(true);
    expect(giveawayOpen(GIVEAWAY_END)).toBe(true);
    expect(giveawayOpen('2026-11-01')).toBe(false);
  });

  it('accepts ordinary addresses and refuses obvious non-addresses', () => {
    expect(isPlausibleEmail(' someone@example.co ')).toBe(true);
    expect(isPlausibleEmail('someone@example')).toBe(false);
    expect(isPlausibleEmail('no at sign.com')).toBe(false);
  });
});
