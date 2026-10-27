/**
 * What a Health read may write into the journal. Pure, so the rules are
 * tested rather than trusted:
 *
 *  - A day this app wrote out is not news coming back in (`ownApp`).
 *  - A day the user logged here, or corrected by hand, is never overwritten:
 *    the journal is where real data goes in, and the health store is a copy.
 *  - An imported day the user deleted stays deleted, by its sample key and by
 *    its day (`cycleTombstone`), the same permanent decline every other import
 *    path keeps — a second app writing the same period later must not bring it
 *    straight back.
 *  - An imported day may be UPDATED by a later read (somebody changed it in
 *    Clue), because nobody here has touched it.
 *
 * Temperatures are the health store's own measurements, so the latest read
 * simply wins for the days it covers.
 */
import type { BodyTempMap, CycleRecord, DayRecord } from '../types';
import type { CycleImport } from '../health';

/** The day-level decline key a deleted imported flow leaves behind. */
export const cycleTombstone = (dk: string) => `cycle:${dk}`;

export interface CyclePlan {
  /** Days to write, with the record they get. */
  writes: { dk: string; record: CycleRecord }[];
  temps: BodyTempMap;
}

export function planCycleImport(
  days: Record<string, Pick<DayRecord, 'cycle'> | undefined>,
  read: CycleImport,
  declined: ReadonlySet<string>,
): CyclePlan {
  const writes: CyclePlan['writes'] = [];
  for (const f of read.flows) {
    if (f.ownApp) continue;
    if (declined.has(f.key) || declined.has(cycleTombstone(f.dk))) continue;
    const cur = days[f.dk]?.cycle;
    if (cur && (!cur.imported || cur.edited)) continue;
    if (cur && cur.flow === f.flow) continue;
    writes.push({ dk: f.dk, record: { flow: f.flow, imported: true, healthKey: f.key } });
  }
  const temps: BodyTempMap = {};
  for (const t of read.temps) {
    const rec: BodyTempMap[string] = {};
    if (t.wrist != null) rec.wrist = t.wrist;
    if (t.bbt != null) rec.bbt = t.bbt;
    if (t.skin != null) rec.skin = t.skin;
    if (Object.keys(rec).length) temps[t.dk] = rec;
  }
  return { writes, temps };
}
