import {
  MAX_SILENCE_DAYS, bristolOf, dayBristol, gutDay, gutSummaryLine, isOffDay, isTrackedDay,
  movementCount, stoolForm, strainLevel, summarizeGut, tracksDigestion,
} from '../digestion';
import { addDays } from '../dates';
import type { DayRecord, Movement } from '../types';

const D0 = '2026-06-01';
let uid = 0;

const blank = (): DayRecord => ({
  sleep: { bed: '', wake: '' }, readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
});
const mv = (kind?: string, straining?: Movement['straining']): Movement => ({ id: `m${++uid}`, time: '09:00', kind, straining });
/** A day the user kept the journal on, with these movements. */
const kept = (...ms: Movement[]): DayRecord => {
  const d = blank();
  d.meds = [{ id: `e${++uid}`, type: 'vitD3', time: '08:00' }];
  d.digestion.movements = ms;
  return d;
};
/** Days from D0, by offset. */
function days(spec: Record<number, DayRecord>): Record<string, DayRecord> {
  const out: Record<string, DayRecord> = {};
  Object.entries(spec).forEach(([i, d]) => { out[addDays(D0, +i)] = d; });
  return out;
}
const dk = (i: number) => addDays(D0, i);

describe('reading one movement', () => {
  it('maps the four logged forms and the older "Type N" spelling', () => {
    expect(stoolForm(mv('Formed'))).toBe('formed');
    expect(stoolForm(mv('Hard'))).toBe('hard');
    expect(stoolForm(mv('Loose'))).toBe('loose');
    expect(stoolForm(mv('Diarrhea'))).toBe('diarrhea');
    expect(stoolForm(mv('Type 2'))).toBe('hard');
    expect(stoolForm(mv('Type 4'))).toBe('formed');
    expect(stoolForm(mv('Type 6'))).toBe('loose');
    expect(stoolForm(mv('Bristol 7'))).toBe('diarrhea');
  });

  it('reports no form rather than guessing one', () => {
    expect(stoolForm(mv())).toBeNull();
    expect(stoolForm(mv('Something else'))).toBeNull();
    expect(bristolOf(mv())).toBeNull();
  });

  it('keeps an exact Bristol type and uses the range midpoint otherwise', () => {
    expect(bristolOf(mv('Type 6'))).toBe(6);
    expect(bristolOf(mv('Formed'))).toBe(3.5);
    expect(dayBristol(kept(mv('Hard'), mv('Loose')))).toBe(3.5);
  });

  it('reads a legacy boolean as mild straining', () => {
    expect(strainLevel(mv('Formed', true))).toBe(1);
    expect(strainLevel(mv('Formed', 'mild'))).toBe(1);
    expect(strainLevel(mv('Formed', 'severe'))).toBe(2);
    expect(strainLevel(mv('Formed', false))).toBe(0);
  });
});

describe('which days are known', () => {
  it('treats somebody who never logs bowel movements as not tracking them', () => {
    const ds = days({ 0: kept(), 1: kept(), 2: kept() });
    expect(tracksDigestion(ds)).toBe(false);
    [0, 1, 2].forEach((i) => expect(isTrackedDay(ds, dk(i))).toBe(false));
    expect(summarizeGut(ds, [0, 1, 2].map(dk))).toBeNull();
  });

  it('knows nothing before the first movement ever logged', () => {
    const ds = days({ 0: kept(), 1: kept(), 2: kept(mv('Formed')), 3: kept() });
    expect(isTrackedDay(ds, dk(0))).toBe(false);
    expect(isTrackedDay(ds, dk(1))).toBe(false);
    expect(isTrackedDay(ds, dk(2))).toBe(true);
    expect(isTrackedDay(ds, dk(3))).toBe(true);
  });

  it('counts a zero only on a day the journal was kept', () => {
    const untouched = blank();
    const importedOnly = blank();
    importedOnly.readings = [{ id: 'x', type: 'hrv', time: '07:00', imported: true }];
    const ds = days({ 0: kept(mv('Formed')), 1: untouched, 2: importedOnly, 3: kept(), 4: kept(mv('Formed')) });
    expect(isTrackedDay(ds, dk(1))).toBe(false);
    expect(isTrackedDay(ds, dk(2))).toBe(false);
    expect(isTrackedDay(ds, dk(3))).toBe(true);
    expect(movementCount(ds, dk(3))).toBe(0);
    expect(movementCount(ds, dk(1))).toBeNull();
  });

  it('reads a long silence as having stopped logging, not as constipation', () => {
    const spec: Record<number, DayRecord> = { 0: kept(mv('Formed')) };
    for (let i = 1; i <= MAX_SILENCE_DAYS + 1; i++) spec[i] = kept();
    spec[MAX_SILENCE_DAYS + 2] = kept(mv('Formed'));
    const ds = days(spec);
    for (let i = 1; i <= MAX_SILENCE_DAYS + 1; i++) expect(isTrackedDay(ds, dk(i))).toBe(false);
  });

  it('keeps a silence at the limit', () => {
    const spec: Record<number, DayRecord> = { 0: kept(mv('Formed')) };
    for (let i = 1; i <= MAX_SILENCE_DAYS; i++) spec[i] = kept();
    spec[MAX_SILENCE_DAYS + 1] = kept(mv('Formed'));
    const ds = days(spec);
    expect(gutDay(ds, dk(MAX_SILENCE_DAYS))).toEqual({ grade: 'none', count: 0, gapDays: MAX_SILENCE_DAYS, strain: 0 });
  });

  it('counts a short trailing silence and withdraws it once it runs long', () => {
    const spec: Record<number, DayRecord> = { 0: kept(mv('Formed')), 1: kept(), 2: kept() };
    expect(isTrackedDay(days(spec), dk(2))).toBe(true);
    for (let i = 3; i <= MAX_SILENCE_DAYS + 1; i++) spec[i] = kept();
    expect(isTrackedDay(days(spec), dk(2))).toBe(false);
  });
});

describe('grading a day', () => {
  const ds = days({
    0: kept(mv('Formed')),
    1: kept(mv('Formed', 'severe')),
    2: kept(mv('Hard'), mv('Loose')),
    3: kept(mv('Formed', 'mild')),
    4: kept(),
    5: kept(),
    6: kept(),
    7: kept(mv('Hard')),
  });

  it('puts the loose end first, then hard or severe straining', () => {
    expect(gutDay(ds, dk(0))!.grade).toBe('normal');
    expect(gutDay(ds, dk(1))!.grade).toBe('hard');
    expect(gutDay(ds, dk(2))!.grade).toBe('loose');
    expect(gutDay(ds, dk(3))).toMatchObject({ grade: 'normal', strain: 1 });
    expect(gutDay(ds, dk(7))!.grade).toBe('hard');
  });

  it('counts the days since the last movement on a known zero', () => {
    expect(gutDay(ds, dk(4))!.gapDays).toBe(1);
    expect(gutDay(ds, dk(6))!.gapDays).toBe(3);
  });

  it('calls the third day without one an off day, and not the first two', () => {
    expect(isOffDay(gutDay(ds, dk(0))!)).toBe(false);
    expect(isOffDay(gutDay(ds, dk(3))!)).toBe(false);
    expect(isOffDay(gutDay(ds, dk(4))!)).toBe(false);
    expect(isOffDay(gutDay(ds, dk(5))!)).toBe(false);
    expect(isOffDay(gutDay(ds, dk(6))!)).toBe(true);
    expect(isOffDay(gutDay(ds, dk(2))!)).toBe(true);
  });

  it('summarises a range', () => {
    const s = summarizeGut(ds, [0, 1, 2, 3, 4, 5, 6, 7].map(dk))!;
    expect(s).toMatchObject({
      trackedDays: 8, daysWithMovement: 5, movements: 6,
      forms: { formed: 3, hard: 2, loose: 1, diarrhea: 0 },
      strainedMild: 1, strainedSevere: 1, longestGap: 3,
    });
    expect(gutSummaryLine(s)).toContain('a movement on 5 of 8 tracked days');
    expect(gutSummaryLine(s)).toContain('Formed 3, Loose 1, Hard 2');
  });
});
