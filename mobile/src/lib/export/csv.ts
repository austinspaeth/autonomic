/**
 * Spreadsheet export — the journal as a grid somebody can hand to a doctor.
 *
 * The JSON export is built for IMPORT: days hold variable-length entry lists,
 * an entry's `type` is a key into the registry (or into `state.customTypes`),
 * and the numbers people actually read on screen — the day score, the grades,
 * the hours slept — are computed and stored nowhere. So a generic JSON→CSV
 * converter produces a grid of keys and nulls. This module builds the grid the
 * app itself would draw, which means it has to go through the app's own logic
 * rather than a second copy of it:
 *
 *   - types resolve through `typesFor`, so a user's own spelling is the header;
 *   - the day score is `dayScore`, the same call the Journal and Progress make;
 *   - HRV rides `isTrustedReading`, so a watch's one-minute background sample
 *     is absent here exactly as it is absent from the Journal list;
 *   - sleep duration and its grade are `sleepGradeParts`, and the stage minutes
 *     are `stagesForWindow`, so a hand-corrected night shows no stage split
 *     rather than one describing a window that no longer exists;
 *   - units are `lib/units` in the user's CURRENT setting, named in the header.
 *
 * Two shapes, because a spreadsheet answers two different questions. The DAILY
 * summary is one row per day and is what somebody prints. EVERY ENTRY is long
 * format — one row per field of every entry — and is what a PivotTable can
 * rebuild any view from.
 *
 * Numbers are numbers: a column a spreadsheet has to sum may never hold
 * "1h 29m". Durations are decimal hours or whole minutes, and the unit is in
 * the header.
 *
 * Pure: no React, no native, no store, and it never reads the waveform sidecar
 * or the flags MMKV.
 */
import { addDays } from '../dates';
import { bristolOf, FORM_CAT, FORM_LABEL, movementCount, stoolForm, strainLevel, type StoolForm } from '../digestion';
import { isTrustedReading } from '../hrvQuality';
import { entryFields, isDivider, isNumberField, READING_TYPES, readingLabel } from '../registry';
import { GRADE_LABEL, SCORE_RANK, type ScoreContext } from '../scoring';
import { scoreCat, sleepGradeParts, stagesForWindow, type DaysMap } from '../scoring/day';
import { budgetSeries } from '../budget/series';
import { dayScore } from '../trends/metrics';
import { sortedTriggerLogs } from '../triggerLogs';
import { typesFor, type TypeKind } from '../typeResolve';
import { distNum, fieldUnit, getUnits, waterNum, waterUnit, type UnitSystem } from '../units';
import type { AppState, DayRecord, Entry, Movement, TypeDef } from '../types';

/* ───────────────────────────── CSV hygiene ───────────────────────────── */

/** A cell is a NUMBER or TEXT, and the difference reaches the file: a number
 *  goes in bare so the spreadsheet can sum it, and only text is quoted or
 *  defused. Null and '' are both "nothing here". */
export type Cell = string | number | null | undefined;

/** Excel, Numbers and Sheets all evaluate a cell that opens with one of these,
 *  so a note someone typed starting "=" or "-" is a formula in their doctor's
 *  spreadsheet. A leading apostrophe is the standard defusal. Tab and CR are
 *  in here because a leading one can smuggle the rest past the check. */
const RISKY_LEAD = /^[=+\-@\t\r]/;

/** One field, RFC 4180: quoted whenever it holds a comma, a quote or a line
 *  break, with inner quotes doubled. */
export function csvCell(v: Cell): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = RISKY_LEAD.test(v) ? `'${v}` : v;
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 byte-order mark. Excel on Windows reads a BOM-less UTF-8 file as the
 *  system codepage, which turns every accent in a custom type's name to
 *  mojibake. */
export const CSV_BOM = '﻿';

/** CRLF, which is what RFC 4180 says and what Excel is happiest with. */
export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  const lines = [header as readonly Cell[], ...rows].map((r) => r.map(csvCell).join(','));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/* ───────────────────────────── small helpers ───────────────────────────── */

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const round = (n: number, dp: number) => { const f = 10 ** dp; return Math.round(n * f) / f; };
const r2 = (n: number | null): number | null => (n == null ? null : round(n, 2));

/** "HH:MM" or nothing. A time that isn't one is dropped rather than passed on:
 *  the column is a time column and a spreadsheet will try to parse it. */
const clock = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null;
};

/** Day keys inside the window, oldest first. Only days the journal holds. */
export function dayKeysIn(days: DaysMap | undefined, startDk: string, endDk: string): string[] {
  const [from, to] = startDk <= endDk ? [startDk, endDk] : [endDk, startDk];
  return Object.keys(days || {}).filter((k) => k >= from && k <= to).sort();
}

/** Did the user put anything in this day? Imports included — unlike
 *  `isEngagedDay`, this asks whether the row would say anything at all, and an
 *  imported night is a row worth printing. */
export function hasAnyData(d: DayRecord | undefined): boolean {
  if (!d) return false;
  const s = d.sleep;
  if (s && (s.bed || s.wake || s.quality || s.hrLow != null || s.hrHigh != null || s.stages)) return true;
  if ((d.readings || []).length || (d.activities || []).length) return true;
  if ((d.meds || []).length || (d.symptoms || []).length) return true;
  if ((d.digestion?.movements || []).length) return true;
  if ((d.food?.meals || []).length) return true;
  if (num(d.food?.water)) return true;
  if (Object.values(d.food?.triggers || {}).some((n) => n > 0)) return true;
  if (d.cycle) return true;
  if (d.notes && d.notes.trim()) return true;
  return false;
}

/** Does the window hold cycle data? The one thing the share confirm warns
 *  about, asked of the exported range rather than of the whole journal. */
export function rangeHasCycle(state: AppState, startDk: string, endDk: string): boolean {
  return dayKeysIn(state.days, startDk, endDk).some((k) => !!state.days[k]?.cycle);
}

/** Readings the app is willing to show. An imported HRV sample carrying too
 *  little real RR is dropped here for the same reason it is dropped from the
 *  Journal, the score and every report: it is not a reading of the same thing.
 *  The JSON export is the lossless one. */
const shownReadings = (d: DayRecord | undefined): Entry[] =>
  (d?.readings || []).filter(isTrustedReading).slice().sort(byTime);

const byTime = (a: Entry, b: Entry) => ((a.time as string) || '').localeCompare((b.time as string) || '');

const labelOf = (types: Record<string, TypeDef>, key: string) => types[key]?.label ?? key;

/** The select field a symptom grades itself with, when it has one. */
const severityField = (def: TypeDef | undefined) =>
  (def?.fields || []).find((f) => f.key === 'severity' && f.type === 'select' && (f.options || []).length);

/* ─────────────────────── the daily summary ─────────────────────── */

interface Col { key: string; header: string }
type Row = Record<string, Cell>;

/** Worst form of the day, ranked by the grade each one wears rather than by a
 *  second ordering that could disagree with the colours the log form draws. */
function worstForm(ms: readonly Movement[]): StoolForm | null {
  let worst: StoolForm | null = null;
  ms.forEach((m) => {
    const f = stoolForm(m);
    if (!f) return;
    if (!worst || SCORE_RANK[FORM_CAT[f]] > SCORE_RANK[FORM_CAT[worst]]) worst = f;
  });
  return worst;
}

/**
 * One row per calendar day in range that holds anything, oldest first.
 *
 * A column that is empty on every row of the range is dropped: nobody tracks
 * all forty symptom types, and a grid of ninety blank columns is unreadable.
 */
export function buildDailyCsv(
  state: AppState,
  ctx: ScoreContext,
  startDk: string,
  endDk: string,
  units: UnitSystem = getUnits(),
): string {
  const days = state.days as DaysMap;
  const keys = dayKeysIn(days, startDk, endDk).filter((k) => hasAnyData(days[k]));

  const symTypes = typesFor(state, 'symptoms');
  const medTypes = typesFor(state, 'meds');
  const trigTypes = typesFor(state, 'triggers');
  const cycleOn = !!state.settings?.cycle?.enabled;

  // Only the types this range actually used get a column of their own.
  const used = (kind: TypeKind): string[] => {
    const seen = new Set<string>();
    keys.forEach((k) => {
      const d = days[k];
      if (!d) return;
      if (kind === 'triggers') {
        const counts = d.food?.triggers || {};
        Object.keys(counts).forEach((t) => { if ((counts[t] || 0) > 0) seen.add(t); });
      } else {
        (kind === 'meds' ? d.meds : d.symptoms || []).forEach((e) => seen.add(e.type));
      }
    });
    const order = kind === 'symptoms' ? symTypes : kind === 'meds' ? medTypes : trigTypes;
    // typesFor is already alphabetical by label; a type the user has since
    // deleted keeps its key and sorts last rather than vanishing.
    return [...Object.keys(order).filter((k) => seen.has(k)), ...[...seen].filter((k) => !order[k]).sort()];
  };
  const symKeys = used('symptoms');
  const medKeys = used('meds');
  const trigKeys = used('triggers');

  const cols: Col[] = [
    { key: 'date', header: 'Date' },
    { key: 'score', header: 'Day score' },
    { key: 'grade', header: 'Grade' },
    { key: 'bed', header: 'Bedtime' },
    { key: 'wake', header: 'Wake' },
    { key: 'sleepH', header: 'Sleep (h)' },
    { key: 'sleepGrade', header: 'Sleep grade' },
    { key: 'sleepQuality', header: 'Sleep quality' },
    { key: 'hrLow', header: 'Overnight HR low (bpm)' },
    { key: 'hrHigh', header: 'Overnight HR high (bpm)' },
    { key: 'deep', header: 'Deep (min)' },
    { key: 'rem', header: 'REM (min)' },
    { key: 'core', header: 'Core (min)' },
    { key: 'awake', header: 'Awake (min)' },
    { key: 'baseRmssd', header: 'Baseline RMSSD (ms)' },
    { key: 'baseSdnn', header: 'Baseline SDNN (ms)' },
    { key: 'baseHr', header: 'Baseline HR (bpm)' },
    { key: 'trainRmssd', header: 'Training RMSSD (ms) (first)' },
    { key: 'restingHr', header: 'Resting HR (bpm) (first)' },
    { key: 'sys', header: 'BP systolic (first)' },
    { key: 'dia', header: 'BP diastolic (first)' },
    { key: 'standRise', header: 'Stand test HR rise (bpm) (first)' },
    ...symKeys.map((k): Col => ({
      key: `sym:${k}`,
      header: `Symptom: ${labelOf(symTypes, k)} (${severityField(symTypes[k]) ? 'severity' : 'count'})`,
    })),
    ...medKeys.map((k): Col => ({ key: `med:${k}`, header: `Med: ${labelOf(medTypes, k)}` })),
    { key: 'water', header: `Water (${waterUnit(units)})` },
    ...trigKeys.map((k): Col => ({ key: `trig:${k}`, header: `Trigger: ${labelOf(trigTypes, k)} (count)` })),
    { key: 'bm', header: 'Bowel movements (count)' },
    { key: 'form', header: 'Stool form (worst)' },
    { key: 'activity', header: 'Activity (min)' },
    { key: 'spent', header: 'Pacing spent (min)' },
    { key: 'budget', header: 'Pacing budget (min)' },
    ...(cycleOn ? [{ key: 'flow', header: 'Cycle flow' } as Col] : []),
    { key: 'note', header: 'Day note' },
  ];

  // The published budget, from the same walk Progress and the reports use, so
  // a margin here can't disagree with the card that day showed. A day the app
  // had no way to watch carries no spend, and a suppressed day no ceiling.
  const pacing = new Map<string, { spent: number | null; budget: number | null }>();
  budgetSeries(state, keys, ctx, addDays).forEach((b) => {
    pacing.set(b.dk, { spent: b.known ? Math.round(b.spendMin) : null, budget: b.envelopeMin == null ? null : Math.round(b.envelopeMin) });
  });

  const rows: Cell[][] = keys.map((dk) => {
    const d = days[dk];
    const row: Row = { date: dk };

    const score = dayScore(d, dk, days, ctx);
    row.score = score;
    row.grade = score == null ? null : scoreCat(score).short;

    /* sleep */
    const sleep = d.sleep;
    const parts = sleepGradeParts(days, dk, ctx);
    row.bed = clock(sleep?.bed);
    row.wake = clock(sleep?.wake);
    row.sleepH = parts ? r2(parts.hours) : null;
    row.sleepGrade = parts ? GRADE_LABEL[parts.cat] : null;
    row.sleepQuality = sleep?.quality === 'interrupted' ? 'Interrupted' : sleep?.quality === 'good' ? 'Good' : null;
    row.hrLow = num(sleep?.hrLow);
    row.hrHigh = num(sleep?.hrHigh);
    const stages = stagesForWindow(sleep);
    row.deep = stages ? stages.deep : null;
    row.rem = stages ? stages.rem : null;
    row.core = stages ? stages.core : null;
    row.awake = stages ? stages.awake : null;

    /* readings */
    const rs = shownReadings(d);
    // The day's FIRST baseline by clock is its morning snapshot, which is the
    // reading scoring and pacing both build on.
    const base = rs.find((r) => r.type === 'hrv');
    const train = rs.find((r) => r.type === 'breathHrv');
    const rhr = rs.find((r) => r.type === 'restingHr');
    const bp = rs.find((r) => r.type === 'bp');
    const stand = rs.find((r) => r.type === 'standTest');
    row.baseRmssd = base ? num(base.rmssd) : null;
    row.baseSdnn = base ? num(base.sdnn) : null;
    row.baseHr = base ? num(base.avgHr) : null;
    row.trainRmssd = train ? num(train.rmssd) : null;
    row.restingHr = rhr ? num(rhr.hr) : null;
    row.sys = bp ? num(bp.sys) : null;
    row.dia = bp ? num(bp.dia) : null;
    const rise = stand ? (num(stand.sustainedDelta) ?? num(stand.peakDelta)) : null;
    row.standRise = rise == null ? null : Math.abs(rise);

    /* symptoms: the worst severity it was graded at, or how many times */
    symKeys.forEach((key) => {
      const hits = (d.symptoms || []).filter((e) => e.type === key);
      if (!hits.length) { row[`sym:${key}`] = null; return; }
      const sev = severityField(symTypes[key]);
      if (!sev) { row[`sym:${key}`] = hits.length; return; }
      const opts = sev.options || [];
      let worst = -1;
      hits.forEach((e) => { worst = Math.max(worst, opts.indexOf(String(e[sev.key!] ?? ''))); });
      row[`sym:${key}`] = worst >= 0 ? opts[worst] : hits.length;
    });

    /* meds: the day's total dose, or a 1 for a type that records none */
    medKeys.forEach((key) => {
      const hits = (d.meds || []).filter((e) => e.type === key);
      if (!hits.length) { row[`med:${key}`] = null; return; }
      const amounts = hits.map((e) => num(e.amount)).filter((v): v is number => v != null);
      row[`med:${key}`] = amounts.length ? r2(amounts.reduce((s, v) => s + v, 0)) : 1;
    });

    /* food, gut, activity */
    const water = num(d.food?.water);
    row.water = water ? waterNum(water, units) : null;
    trigKeys.forEach((key) => { row[`trig:${key}`] = (d.food?.triggers?.[key] || 0) || null; });
    const bm = movementCount(days, dk);
    row.bm = bm;
    const form = worstForm(d.digestion?.movements || []);
    row.form = form ? FORM_LABEL[form] : null;
    const actMin = (d.activities || []).reduce((s, a) => s + (num(a.duration) || 0), 0);
    row.activity = actMin || null;

    const pace = pacing.get(dk);
    row.spent = pace?.spent ?? null;
    row.budget = pace?.budget ?? null;

    if (cycleOn) row.flow = d.cycle?.flow ?? null;
    row.note = d.notes?.trim() || null;

    return cols.map((c) => row[c.key]);
  });

  const keep = cols.map((_, i) => rows.some((r) => r[i] != null && r[i] !== ''));
  // Date always stays: a grid whose rows have no date is not a grid.
  keep[0] = true;
  return toCsv(cols.filter((_, i) => keep[i]).map((c) => c.header), rows.map((r) => r.filter((_, i) => keep[i])));
}

/* ─────────────────────── every entry, long format ─────────────────────── */

const ENTRY_COLS = ['Date', 'Time', 'Category', 'Type', 'Field', 'Value', 'Unit', 'Note'] as const;

/** Keys never emitted as a field row: bookkeeping, or a waveform that does not
 *  live in the journal at all (see lib/waveforms). */
const SKIP_KEYS = new Set([
  'id', 'type', 'time', 'note', 'scores', 'healthKey', 'kindOpen',
  'rrRaw', 'rrClean', 'rrSegments', 'sampledHr', 'sampledSdnn',
]);

type EntryRow = { time: string | null; cat: string; type: string; field: string; value: Cell; unit?: string | null; note?: string | null };

/** Every field of one entry, in the order its own form asks for them, then
 *  whatever else the entry carries. The second half is what keeps a bespoke
 *  type (the bike form) and an import's quality stamps from being dropped: a
 *  type with `fields: []` would otherwise export as a bare row. */
function entryRows(e: Entry, cat: string, typeLabel: string, def: TypeDef | undefined, units: UnitSystem): EntryRow[] {
  const out: EntryRow[] = [];
  const t = clock(e.time);
  const note = e.note?.trim() || null;
  const push = (field: string, value: Cell, unit?: string | null) => {
    if (value == null || value === '') return;
    out.push({ time: t, cat, type: typeLabel, field, value, unit: unit || null, note });
  };
  const done = new Set<string>(SKIP_KEYS);

  entryFields(def).forEach((f) => {
    if (isDivider(f) || !f.key || SKIP_KEYS.has(f.key)) return;
    done.add(f.key);
    const raw = e[f.key];
    if (raw == null || raw === '') return;
    const unit = fieldUnit(f.unit, units) || null;
    if (f.type === 'check') { if (raw) push(f.label || f.key, 1); return; }
    if (f.type === 'time') { push(f.label || f.key, clock(raw)); return; }
    if (isNumberField(f)) {
      const n = f.unit === 'mi' ? distNum(raw, units) : num(raw);
      push(f.label || f.key, n ?? String(raw), unit);
      return;
    }
    push(f.label || f.key, String(raw), unit);
  });

  Object.keys(e).forEach((k) => {
    if (done.has(k)) return;
    const v = e[k];
    if (v == null || v === '' || typeof v === 'object') return;
    push(k, typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : String(v));
  });
  return out;
}

/**
 * One row per field of every entry, oldest day first — the shape a PivotTable
 * can rebuild any view from. Sleep, water, triggers, bowel movements, meals and
 * the day's cycle flow are entries here too, since in the journal they are day
 * records rather than list items and would otherwise be missing.
 */
export function buildEntriesCsv(
  state: AppState,
  ctx: ScoreContext,
  startDk: string,
  endDk: string,
  units: UnitSystem = getUnits(),
): string {
  const days = state.days as DaysMap;
  const keys = dayKeysIn(days, startDk, endDk).filter((k) => hasAnyData(days[k]));
  const types: Record<TypeKind, Record<string, TypeDef>> = {
    activities: typesFor(state, 'activities'),
    meds: typesFor(state, 'meds'),
    symptoms: typesFor(state, 'symptoms'),
    triggers: typesFor(state, 'triggers'),
  };

  const rows: Cell[][] = [];
  const emit = (dk: string, r: EntryRow) =>
    rows.push([dk, r.time, r.cat, r.type, r.field, r.value, r.unit ?? null, r.note ?? null]);

  keys.forEach((dk) => {
    const d = days[dk];

    /* the night, as the fields the sleep editor holds */
    const s = d.sleep;
    const parts = sleepGradeParts(days, dk, ctx);
    const sleepRow = (field: string, value: Cell, unit?: string) =>
      value == null || value === '' ? undefined : emit(dk, { time: null, cat: 'Sleep', type: 'Sleep', field, value, unit });
    sleepRow('Bedtime', clock(s?.bed));
    sleepRow('Wake', clock(s?.wake));
    sleepRow('Hours', parts ? r2(parts.hours) : null, 'h');
    sleepRow('Grade', parts ? GRADE_LABEL[parts.cat] : null);
    sleepRow('Quality', s?.quality === 'interrupted' ? 'Interrupted' : s?.quality === 'good' ? 'Good' : null);
    sleepRow('Overnight HR low', num(s?.hrLow), 'bpm');
    sleepRow('Overnight HR high', num(s?.hrHigh), 'bpm');
    const stages = stagesForWindow(s);
    if (stages) {
      sleepRow('Deep', stages.deep, 'min');
      sleepRow('REM', stages.rem, 'min');
      sleepRow('Core', stages.core, 'min');
      sleepRow('Awake', stages.awake, 'min');
    }
    if (s?.imported) sleepRow('Imported', 1);

    shownReadings(d).forEach((e) => {
      entryRows(e, 'Reading', readingLabel(e), READING_TYPES[e.type], units).forEach((r) => emit(dk, r));
    });
    (['activities', 'meds', 'symptoms'] as const).forEach((kind) => {
      const cat = kind === 'activities' ? 'Activity' : kind === 'meds' ? 'Medication' : 'Symptom';
      (d[kind] || []).slice().sort(byTime).forEach((e) => {
        const def = types[kind][e.type];
        entryRows(e, cat, labelOf(types[kind], e.type), def, units).forEach((r) => emit(dk, r));
      });
    });

    const water = num(d.food?.water);
    if (water) emit(dk, { time: null, cat: 'Water', type: 'Water', field: 'Amount', value: waterNum(water, units), unit: waterUnit(units) });

    // A trigger lives in the day's count map; a log over it carries the time
    // and note it was entered with (lib/triggerLogs).
    const logs = sortedTriggerLogs(d.food);
    const counts = d.food?.triggers || {};
    Object.keys(counts).forEach((key) => {
      const n = counts[key] || 0;
      if (n <= 0) return;
      const log = logs.find((l) => l.types.includes(key));
      emit(dk, {
        time: clock(log?.time), cat: 'Trigger', type: labelOf(types.triggers, key),
        field: 'Count', value: n, note: log?.note?.trim() || null,
      });
    });

    (d.digestion?.movements || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach((m) => {
      const t = clock(m.time);
      const note = m.note?.trim() || null;
      const row = (field: string, value: Cell) =>
        value == null || value === '' ? undefined : emit(dk, { time: t, cat: 'Bowel movement', type: 'Bowel movement', field, value, note });
      const form = stoolForm(m);
      row('Form', form ? FORM_LABEL[form] : null);
      row('Bristol', bristolOf(m));
      row('Volume', m.volume || null);
      row('Straining', strainLevel(m) || null);
      // A movement with nothing but a time is still a movement.
      if (!form && bristolOf(m) == null && !m.volume && !strainLevel(m)) row('Logged', 1);
    });

    (d.food?.meals || []).forEach((m) => {
      emit(dk, { time: clock(m.time), cat: 'Meal', type: m.type || 'Meal', field: 'Logged', value: 1, note: m.note?.trim() || null });
    });

    if (d.cycle) {
      emit(dk, { time: null, cat: 'Cycle', type: 'Cycle', field: 'Flow', value: d.cycle.flow, note: d.cycle.note?.trim() || null });
    }
    const dayNote = d.notes?.trim();
    if (dayNote) emit(dk, { time: null, cat: 'Day note', type: 'Day note', field: 'Note', value: dayNote });
  });

  return toCsv(ENTRY_COLS, rows);
}
