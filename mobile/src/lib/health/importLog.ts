/**
 * What the health store put into one day, read back OUT OF THE JOURNAL.
 *
 * The import pill's card and Settings → Apple Health both list "imported
 * today", and both read it from here rather than from whatever one check
 * happened to write. The journal is the only record that is always right: a
 * check's own receipt forgot the check before it, and kept listing an entry the
 * user had since deleted from the Journal. Every imported entry already carries
 * `imported: true` (and, for anything removable, its `healthKey`), and an
 * imported night carries `imported` on the sleep record, so nothing new has to
 * be remembered anywhere.
 *
 * Rows are ordered by when the thing HAPPENED, newest first (the night by its
 * wake time), the Journal's own order read upwards. Pure: no store, no native.
 */
import type { DayRecord, Entry } from '../types';
import { fmtTime12 } from '../dates';
import { hm } from '../budget/format';
import { isPoorImport } from '../hrvQuality';
import { fmtDist } from '../units';

export type ImportKind = 'sleep' | 'reading' | 'workout' | 'med';

export interface ImportRow {
  /** The entry's `healthKey`, or 'sleep' for the night. Unique within a day. */
  key: string;
  kind: ImportKind;
  /** HH:MM the thing happened (the night: its wake time). Sorts the list. */
  time: string;
  title: string;
  sub: string;
  /** The words the pill uses for it: "Imported sleep", "Imported HRV". */
  noun: string;
  /** Can be undone from the list: an entry carrying a health key. The night is
   *  a field on the day, not an entry, so it is listed as a fact. */
  removable: boolean;
  /** A poor-quality HRV series that was kept anyway (it was accepted from the
   *  review lane): the row keeps its chip so the list never reads as clean. */
  poor: boolean;
}

/** A label for a type key, from the catalog the caller resolved
 *  (`typesFor(state, kind)`), so custom types keep their own names. */
export type LabelOf = (kind: 'readings' | 'activities' | 'meds', type: string) => string;

const time12 = (t: string | undefined) => (t ? fmtTime12(t) : '');
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

function readingRow(e: Entry, labelOf: LabelOf): Omit<ImportRow, 'key' | 'removable'> {
  const t = e.time || '';
  if (e.type === 'hrv' || e.type === 'breathHrv') {
    // The same figure the import offered: SDNN first, as `buildUpdateSet` does.
    const ms = e.sdnn ?? e.rmssd;
    const mins = typeof e.durationSec === 'number' && e.durationSec > 0 ? `${Math.round(e.durationSec / 60)} min` : null;
    return {
      kind: 'reading', time: t, noun: 'HRV',
      title: ms != null && ms !== '' ? `HRV ${ms} ms` : 'HRV reading',
      sub: join(time12(t), mins),
      // Stamped from the import's own grade (updates.ts); absent is unknown.
      poor: typeof e.artifactPct === 'number' && typeof e.confidence === 'string'
        ? isPoorImport({ artifactPct: e.artifactPct, confidence: e.confidence as 'high' | 'fair' | 'low', beatCount: Number(e.beatCount) || 0 })
        : false,
    };
  }
  if (e.type === 'restingHr') {
    return { kind: 'reading', time: t, noun: 'resting HR', title: `Resting HR ${e.hr} bpm`, sub: time12(t), poor: false };
  }
  if (e.type === 'bp') {
    return { kind: 'reading', time: t, noun: 'blood pressure', title: `${e.sys}/${e.dia}`, sub: join('Blood pressure', time12(t)), poor: false };
  }
  return { kind: 'reading', time: t, noun: 'a reading', title: labelOf('readings', e.type), sub: time12(t), poor: false };
}

function workoutRow(e: Entry, labelOf: LabelOf): Omit<ImportRow, 'key' | 'removable'> {
  const t = e.time || '';
  const dur = e.duration != null && e.duration !== '' ? `${e.duration} min` : null;
  const dist = e.distance != null && e.distance !== '' && Number.isFinite(Number(e.distance)) ? fmtDist(Number(e.distance)) : null;
  return {
    kind: 'workout', time: t, noun: 'activity',
    title: join(labelOf('activities', e.type), dur, dist),
    sub: join(time12(t), e.avgHr != null && e.avgHr !== '' ? `Avg HR ${e.avgHr}` : null),
    poor: false,
  };
}

function medRow(e: Entry, labelOf: LabelOf): Omit<ImportRow, 'key' | 'removable'> {
  const t = e.time || '';
  return { kind: 'med', time: t, noun: 'medication', title: labelOf('meds', e.type), sub: join(e.amount ? String(e.amount) : null, time12(t)), poor: false };
}

/** Minutes between two HH:MM clock times, across midnight when wake < bed. */
function spanMin(bed: string, wake: string): number | null {
  const m = (s: string) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  if (!/^\d{1,2}:\d{2}$/.test(bed) || !/^\d{1,2}:\d{2}$/.test(wake)) return null;
  const d = m(wake) - m(bed);
  return d > 0 ? d : d + 24 * 60;
}

/** Every health-store import filed under `day`, newest first. */
export function importedRows(day: DayRecord | undefined, labelOf: LabelOf): ImportRow[] {
  if (!day) return [];
  const rows: ImportRow[] = [];
  const add = (e: Entry, build: (e: Entry, l: LabelOf) => Omit<ImportRow, 'key' | 'removable'>) => {
    if (!e.imported) return;
    const removable = typeof e.healthKey === 'string' && e.healthKey !== '';
    rows.push({ ...build(e, labelOf), key: removable ? (e.healthKey as string) : `entry:${e.id}`, removable });
  };
  (day.readings || []).forEach((e) => add(e, readingRow));
  (day.activities || []).forEach((e) => add(e, workoutRow));
  (day.meds || []).forEach((e) => add(e, medRow));

  const s = day.sleep;
  if (s?.imported && s.bed && s.wake) {
    const st = s.stages;
    const asleep = st ? st.deep + st.rem + st.core : spanMin(s.bed, s.wake);
    rows.push({
      key: 'sleep', kind: 'sleep', time: s.wake, noun: 'sleep', removable: false, poor: false,
      title: asleep && asleep > 0 ? `${hm(asleep)} asleep` : 'Last night’s sleep',
      sub: join(`${fmtTime12(s.bed)} to ${fmtTime12(s.wake)}`, s.quality === 'interrupted' && 'interrupted'),
    });
  }

  return rows.sort((a, b) => b.time.localeCompare(a.time));
}

/**
 * What the pill says for one check: the newest thing it wrote, and how many
 * more. `keys` are the item keys that check imported ('sleep' for the night).
 * Null when none of them is in the journal any more.
 */
export function pillSummary(rows: readonly ImportRow[], keys: ReadonlySet<string>): { lead: ImportRow; more: number } | null {
  const mine = rows.filter((r) => keys.has(r.key));
  if (!mine.length) return null;
  return { lead: mine[0], more: mine.length - 1 };
}
