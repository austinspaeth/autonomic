/**
 * Which watch readings were filed twice — and, just as load-bearing, which
 * pairs this repair must leave alone.
 */
import { DUPE_NEAR_MIN, duplicatesInDay, findDuplicateWristReadings } from '../dupeRepair';
import type { DayRecord, Entry } from '../../types';

const entry = (over: Partial<Entry>): Entry =>
  ({ id: 'x', type: 'hrv', time: '07:00', note: '', source: 'watch', ...over } as Entry);

const day = (readings: Entry[]): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings, activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
} as DayRecord);

/** The bug's own signature: the check's undecided copy beside the card's. */
const COPY = entry({ id: 'copy', time: '06:52', imported: true, kindOpen: true, healthKey: 'hrv-1000' });
const OWN = entry({ id: 'own', time: '06:52' });

describe('duplicate wrist readings', () => {
  it('folds the check’s copy into the card’s reading', () => {
    const pairs = duplicatesInDay('2026-11-09', day([COPY, OWN]));
    expect(pairs).toEqual([{ dk: '2026-11-09', keepId: 'own', dropId: 'copy', healthKey: 'hrv-1000' }]);
  });

  it('keeps the card’s reading whichever kind either copy was filed under', () => {
    // The card knew it was training; the check had to leave the kind open.
    const pairs = duplicatesInDay('D', day([COPY, entry({ id: 'own', type: 'breathHrv', time: '06:55' })]));
    expect(pairs.map((p) => p.keepId)).toEqual(['own']);
  });

  it('matches on the sample’s key when both copies carry one, whatever the clock says', () => {
    const own = entry({ id: 'own', time: '23:30', healthKey: 'hrv-1000' });
    expect(duplicatesInDay('D', day([COPY, own])).map((p) => p.dropId)).toEqual(['copy']);
  });

  it('holds to the import check’s own tolerance', () => {
    // Without a key on both sides the clock decides, to the bar that was meant
    // to stop the second write from being made at all.
    expect(DUPE_NEAR_MIN).toBe(10);
    const keyless = entry({ ...COPY, healthKey: undefined });   // 06:52
    const inside = (t: string) => duplicatesInDay('D', day([keyless, entry({ id: 'own', time: t })]));
    expect(inside('07:02')).toHaveLength(1);                    // +10
    expect(inside('07:03')).toHaveLength(0);                    // +11
  });

  it('leaves two readings the user genuinely took alone', () => {
    // Neither is the check's: a morning baseline and an afternoon one.
    expect(duplicatesInDay('D', day([OWN, entry({ id: 'b', time: '16:00' })]))).toHaveLength(0);
    // And two imports with no card reading behind them are not a pair either.
    expect(duplicatesInDay('D', day([COPY, entry({ ...COPY, id: 'c2', time: '16:00' })]))).toHaveLength(0);
  });

  it('says nothing about an ambiguous day', () => {
    // Two card readings inside one copy's window: which one it duplicates is
    // not knowable, and deleting a measurement on a guess is not a tidying job.
    const pairs = duplicatesInDay('D', day([
      entry({ ...COPY, healthKey: undefined }),
      entry({ id: 'a', time: '06:50' }),
      entry({ id: 'b', time: '06:58' }),
    ]));
    expect(pairs).toHaveLength(0);
  });

  it('ignores readings that never came from a wrist', () => {
    const camera = entry({ id: 'cam', time: '06:52', source: 'camera' });
    expect(duplicatesInDay('D', day([COPY, camera]))).toHaveLength(0);
    const hand = entry({ id: 'hand', time: '06:52', source: undefined });
    expect(duplicatesInDay('D', day([COPY, hand]))).toHaveLength(0);
    // A resting HR import beside an HRV reading is not one series twice.
    expect(duplicatesInDay('D', day([
      entry({ id: 'rhr', type: 'restingHr', time: '06:52', imported: true }), OWN,
    ]))).toHaveLength(0);
  });

  it('sweeps the whole journal, oldest day first', () => {
    const pairs = findDuplicateWristReadings({
      '2026-11-09': day([COPY, OWN]),
      '2026-03-01': day([COPY, OWN]),
      '2026-07-04': day([OWN]),
    } as Record<string, DayRecord>);
    expect(pairs.map((p) => p.dk)).toEqual(['2026-03-01', '2026-11-09']);
  });
});
