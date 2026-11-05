/**
 * The spreadsheet export. The grid has to say what the app says, so most of
 * these assert agreement with the engine (`dayScore`, `isTrustedReading`,
 * `stagesForWindow`) rather than a hard-coded number — and the rest assert the
 * file is a CSV a spreadsheet can actually open.
 */
import { buildDailyCsv, buildEntriesCsv, csvCell, dayKeysIn, hasAnyData, rangeHasCycle, CSV_BOM } from '../csv';
import { blankDay, defaultState } from '../../migrate';
import { profileCtx } from '../../scoring';
import { scoreSet, stagesForWindow } from '../../scoring/day';
import type { AppState, DayRecord, Entry, TypeDef } from '../../types';
import type { UnitSystem } from '../../units';

/* ─────────────────── a tiny RFC 4180 reader, for the assertions ─────────────────── */

function parseCsv(text: string): string[][] {
  const body = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r' && body[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const grid = (csv: string) => {
  const rows = parseCsv(csv);
  const header = rows[0];
  return {
    header,
    rows: rows.slice(1),
    has: (col: string) => header.includes(col),
    col: (col: string) => {
      const i = header.indexOf(col);
      if (i < 0) throw new Error(`no column ${col}; have ${header.join(' | ')}`);
      return rows.slice(1).map((r) => r[i]);
    },
    at: (rowIdx: number, col: string) => {
      const i = header.indexOf(col);
      if (i < 0) throw new Error(`no column ${col}; have ${header.join(' | ')}`);
      return rows[rowIdx + 1][i];
    },
  };
};

/* ─────────────────────────────── the fixture ─────────────────────────────── */

const DK1 = '2026-07-01';
const DK2 = '2026-07-02';
const DK4 = '2026-07-04';

const MAGNESIUM: TypeDef = {
  label: 'Magnésium "Citrate", extra',  // an accent, a quote and a comma, all in a header
  icon: 'pill',
  userDefined: true,
  fields: [{ type: 'time', key: 'time', label: 'Time' }, { type: 'number', key: 'amount', label: 'Amount' }],
};

/** A note holding every CSV hazard at once. */
const NASTY_NOTE = '=SUM(A1:A2), she said "fine"\nsecond line';

const day1 = (): DayRecord => ({
  ...blankDay(),
  // 22:30 → 06:30 is exactly 8h, and the stages sum to 480 min, so they still
  // describe the window (stagesForWindow keeps them).
  sleep: { bed: '22:30', wake: '06:30', quality: 'good', hrLow: '54', hrHigh: '92', stages: { deep: 70, rem: 100, core: 280, awake: 30 } },
  readings: [
    { id: 'rhr1', type: 'restingHr', time: '07:00', hr: '58', position: 'Laying' },
    { id: 'bp1', type: 'bp', time: '07:05', sys: '118', dia: '76', pulse: '62' },
    { id: 'base1', type: 'hrv', time: '07:10', rmssd: '55', sdnn: '60', avgHr: '58' },
    { id: 'train1', type: 'breathHrv', time: '08:00', rmssd: '48', sdnn: '55', hr: '60' },
    // Apple's one-minute background sample: in the journal, counted nowhere.
    { id: 'short1', type: 'hrv', time: '09:00', imported: true, durationSec: 62, rmssd: '9', sdnn: '11' },
    { id: 'bp2', type: 'bp', time: '19:00', sys: '130', dia: '85' },
  ] as Entry[],
  activities: [{ id: 'a1', type: 'walk', time: '17:00', duration: '30', distance: '2', avgHr: '96' }] as Entry[],
  food: { water: 2, calories: 0, triggers: {}, meals: [] },
});

const day2 = (): DayRecord => ({
  ...blankDay(),
  // No stages at all: the night is still a complete row.
  sleep: { bed: '23:45', wake: '05:15', quality: 'interrupted' },
  meds: [
    { id: 'm1', type: 'custom-magnesium', time: '09:00', amount: '200' },
    { id: 'm2', type: 'custom-magnesium', time: '21:00', amount: '400' },
  ] as Entry[],
  symptoms: [
    { id: 's1', type: 'fatigue', time: '10:00' },
    { id: 's2', type: 'fatigue', time: '15:00' },
    { id: 's3', type: 'twitching', time: '16:00', severity: 'Minor', area: 'Arms' },
    { id: 's4', type: 'twitching', time: '18:00', severity: 'Severe', area: 'Legs' },
  ] as Entry[],
  food: { water: 0, calories: 0, triggers: { caffeine: 2 }, meals: [] },
  digestion: { movements: [{ id: 'bm1', time: '08:00', kind: 'Loose', volume: 'Medium', straining: 'mild' }] },
  notes: NASTY_NOTE,
});

/** Outside every range the tests export — the clipping check. */
const day4 = (): DayRecord => ({
  ...blankDay(),
  readings: [{ id: 'base4', type: 'hrv', time: '07:00', rmssd: '70', sdnn: '80' }] as Entry[],
});

function fixture(units?: UnitSystem): AppState {
  return {
    ...defaultState(),
    settings: { theme: 'dark', ...(units ? { units } : {}) },
    profile: { sex: 'Female', birthday: '1990-01-01', weight: '150', height: '66' },
    // defaultState() hides every built-in med; the custom one is what this
    // journal takes, and its own spelling is what the header must carry.
    customTypes: { meds: { 'custom-magnesium': MAGNESIUM } },
    days: { [DK1]: day1(), [DK2]: day2(), [DK4]: day4() },
  };
}

const ctx = profileCtx({ sex: 'Female', height: '66' });
const daily = (units?: UnitSystem, from = DK1, to = DK2) =>
  grid(buildDailyCsv(fixture(units), ctx, from, to, units ?? 'imperial'));
const entries = (units?: UnitSystem, from = DK1, to = DK2) =>
  grid(buildEntriesCsv(fixture(units), ctx, from, to, units ?? 'imperial'));

/* ──────────────────────────── CSV hygiene ──────────────────────────── */

describe('CSV hygiene', () => {
  it('quotes commas, quotes and line breaks, and doubles inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('she said "fine"')).toBe('"she said ""fine"""');
    expect(csvCell('one\ntwo')).toBe('"one\ntwo"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('defuses a text cell a spreadsheet would evaluate', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@here')).toBe("'@here");
    expect(csvCell('\ttab')).toBe("'\ttab");
  });

  it('leaves numbers bare, negatives included — a number is not text', () => {
    expect(csvCell(42)).toBe('42');
    expect(csvCell(-8)).toBe('-8');
    // A real zero is data (a tracked day with no bowel movement); only null
    // and '' are "nothing here".
    expect(csvCell(0)).toBe('0');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
    expect(csvCell(NaN)).toBe('');
  });

  it('writes a BOM and CRLF line endings', () => {
    const csv = buildDailyCsv(fixture(), ctx, DK1, DK2, 'imperial');
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('\r\n');
    // Every record ends in CRLF. The only bare LF in the file is inside the
    // quoted note, which is what RFC 4180 says to do with one.
    expect(csv.trimEnd().split('\r\n')).toHaveLength(3);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('survives a note holding every hazard at once', () => {
    const g = daily();
    expect(g.at(1, 'Day note')).toBe(`'${NASTY_NOTE}`);
    // and it is really quoted in the file, not just parseable
    expect(buildDailyCsv(fixture(), ctx, DK1, DK2, 'imperial')).toContain('"\'=SUM(A1:A2), she said ""fine""');
  });

  it('quotes a header a custom type put a comma in', () => {
    expect(daily().header).toContain('Med: Magnésium "Citrate", extra');
    expect(buildDailyCsv(fixture(), ctx, DK1, DK2, 'imperial')).toContain('"Med: Magnésium ""Citrate"", extra"');
  });
});

/* ─────────────────────── the daily summary ─────────────────────── */

describe('daily summary', () => {
  it('is one row per logged day, oldest first, clipped to the range', () => {
    const g = daily();
    expect(g.col('Date')).toEqual([DK1, DK2]);
    // DK4 is in the journal and outside the window.
    expect(daily(undefined, DK1, DK4).col('Date')).toEqual([DK1, DK2, DK4]);
    expect(daily(undefined, DK2, DK2).col('Date')).toEqual([DK2]);
  });

  it('skips a day the journal holds but nothing was logged on', () => {
    const st = fixture();
    st.days['2026-07-03'] = blankDay();
    expect(grid(buildDailyCsv(st, ctx, DK1, DK4, 'imperial')).col('Date')).toEqual([DK1, DK2, DK4]);
  });

  it('reports the score the app reports, and its grade', () => {
    const st = fixture();
    const d = st.days[DK1];
    const expected = scoreSet(
      (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')),
      d, DK1, st.days, ctx,
    ).score;
    expect(expected).not.toBeNull();
    expect(daily().at(0, 'Day score')).toBe(String(expected));
    expect(daily().at(0, 'Grade')).toBeTruthy();
  });

  it('takes the baseline from the day FIRST trusted hrv reading, never the short import', () => {
    const g = daily();
    expect(g.at(0, 'Baseline RMSSD (ms)')).toBe('55');
    expect(g.at(0, 'Baseline SDNN (ms)')).toBe('60');
    expect(g.at(0, 'Baseline HR (bpm)')).toBe('58');
    // The 1-minute import's 9 ms must appear nowhere in the file.
    expect(buildDailyCsv(fixture(), ctx, DK1, DK2, 'imperial')).not.toContain(',9,');
  });

  it('says in the header which of several entries a column picked', () => {
    const g = daily();
    expect(g.at(0, 'BP systolic (first)')).toBe('118');   // not the 19:00 130
    expect(g.at(0, 'BP diastolic (first)')).toBe('76');
    expect(g.at(0, 'Training RMSSD (ms) (first)')).toBe('48');
    expect(g.at(0, 'Resting HR (bpm) (first)')).toBe('58');
  });

  it('grades the night from the engine and gives the stage split only where it still fits', () => {
    const g = daily();
    expect(g.at(0, 'Bedtime')).toBe('22:30');
    expect(g.at(0, 'Wake')).toBe('06:30');
    expect(g.at(0, 'Sleep (h)')).toBe('8');
    expect(g.at(0, 'Sleep quality')).toBe('Good');
    expect(g.at(0, 'Sleep grade')).toBeTruthy();
    expect(g.at(0, 'Overnight HR low (bpm)')).toBe('54');
    expect(stagesForWindow(day1().sleep)).not.toBeNull();
    expect([g.at(0, 'Deep (min)'), g.at(0, 'REM (min)'), g.at(0, 'Core (min)'), g.at(0, 'Awake (min)')])
      .toEqual(['70', '100', '280', '30']);
    // The unstaged night is a complete row with empty stage cells.
    expect(g.at(1, 'Sleep (h)')).toBe('5.5');
    expect(g.at(1, 'Sleep quality')).toBe('Interrupted');
    expect(g.at(1, 'Deep (min)')).toBe('');
  });

  it('drops the stage split once a hand-corrected window no longer matches it', () => {
    const st = fixture();
    st.days[DK1].sleep = { ...st.days[DK1].sleep, wake: '03:00' };  // 4.5h, stages still claim 8
    const g = grid(buildDailyCsv(st, ctx, DK1, DK1, 'imperial'));
    expect(g.has('Deep (min)')).toBe(false);
  });

  it('counts a symptom, and grades one that has a severity', () => {
    const g = daily();
    expect(g.at(1, 'Symptom: Fatigue (count)')).toBe('2');
    expect(g.at(1, 'Symptom: Twitching (severity)')).toBe('Severe');   // worst of the day
  });

  it('totals a med dose under the user own spelling', () => {
    expect(daily().at(1, 'Med: Magnésium "Citrate", extra')).toBe('600');
  });

  it('writes 1 for a med type that records no amount', () => {
    const st = fixture();
    st.days[DK2].meds = [{ id: 'm3', type: 'custom-magnesium', time: '09:00' }] as Entry[];
    expect(grid(buildDailyCsv(st, ctx, DK2, DK2, 'imperial')).at(0, 'Med: Magnésium "Citrate", extra')).toBe('1');
  });

  it('carries triggers, the gut and activity minutes', () => {
    const g = daily();
    expect(g.at(1, 'Trigger: Caffeine (count)')).toBe('2');
    expect(g.at(1, 'Bowel movements (count)')).toBe('1');
    expect(g.at(1, 'Stool form (worst)')).toBe('Loose');
    expect(g.at(0, 'Activity (min)')).toBe('30');
  });

  it('omits a column that is empty on every row of the range', () => {
    const g = daily();
    expect(g.has('Stand test HR rise (bpm) (first)')).toBe(false);   // no stand test anywhere
    expect(g.has('Cycle flow')).toBe(false);                          // tracking off

    expect(g.has('Date')).toBe(true);
    expect(g.has('Symptom: Nausea (count)')).toBe(false);             // a type never logged
  });

  it('publishes the pacing figures the budget published, and nothing it did not', () => {
    const g = daily();
    // A logged walk is a cost the app can see; the ceiling is fitted from the
    // day's own score from day one, so both days carry one.
    expect(+g.at(0, 'Pacing spent (min)')).toBeGreaterThan(0);
    expect(+g.at(0, 'Pacing budget (min)')).toBeGreaterThan(0);
    // Day two logged no activity and the health store read nothing, so what it
    // cost is UNKNOWN rather than nothing.
    expect(g.at(1, 'Pacing spent (min)')).toBe('');
  });

  it('adds the cycle column only while cycle tracking is on', () => {
    const st = fixture();
    st.settings.cycle = { enabled: true, mode: 'regular' };
    st.days[DK2].cycle = { flow: 'medium' };
    const g = grid(buildDailyCsv(st, ctx, DK1, DK2, 'imperial'));
    expect(g.at(1, 'Cycle flow')).toBe('medium');

    st.settings.cycle = { enabled: false, mode: 'regular' };
    expect(grid(buildDailyCsv(st, ctx, DK1, DK2, 'imperial')).has('Cycle flow')).toBe(false);
  });

  it('names the unit in the header, in the user current setting', () => {
    expect(daily('imperial').has('Water (oz)')).toBe(true);
    expect(daily('imperial').at(0, 'Water (oz)')).toBe('68');          // 2 L
    expect(daily('metric').has('Water (L)')).toBe(true);
    expect(daily('metric').at(0, 'Water (L)')).toBe('2');
    // Nothing in the journal changed unit: both read the same stored litres.
    expect(daily('metric').at(0, 'Baseline RMSSD (ms)')).toBe('55');
  });
});

/* ─────────────────────── every entry ─────────────────────── */

describe('every entry', () => {
  it('is long format with one fixed header', () => {
    expect(entries().header).toEqual(['Date', 'Time', 'Category', 'Type', 'Field', 'Value', 'Unit', 'Note']);
  });

  it('is one row per field, with the type display name', () => {
    const g = entries();
    const base = g.rows.filter((r) => r[0] === DK1 && r[3] === 'Baseline HRV');
    expect(base.length).toBeGreaterThan(2);
    expect(base.every((r) => r[1] === '07:10')).toBe(true);
    expect(base.map((r) => r[4])).toEqual(expect.arrayContaining(['RMSSD', 'SDNN', 'Avg HR']));
    expect(base.find((r) => r[4] === 'RMSSD')?.[5]).toBe('55');
    expect(base.find((r) => r[4] === 'Avg HR')?.[6]).toBe('bpm');
  });

  it('leaves the short import out, here too', () => {
    expect(entries().rows.some((r) => r[5] === '9')).toBe(false);
  });

  it('writes the night, the water, the trigger, the movement and the day note as rows', () => {
    const g = entries();
    const cats = new Set(g.rows.map((r) => r[2]));
    expect([...cats].sort()).toEqual(
      ['Activity', 'Bowel movement', 'Day note', 'Medication', 'Reading', 'Sleep', 'Symptom', 'Trigger', 'Water'],
    );
    const sleep = g.rows.filter((r) => r[0] === DK1 && r[2] === 'Sleep');
    expect(sleep.find((r) => r[4] === 'Bedtime')?.[5]).toBe('22:30');
    expect(sleep.find((r) => r[4] === 'Hours')?.[5]).toBe('8');
    expect(sleep.find((r) => r[4] === 'Deep')?.[6]).toBe('min');
    expect(g.rows.find((r) => r[2] === 'Trigger')?.slice(2, 6)).toEqual(['Trigger', 'Caffeine', 'Count', '2']);
    expect(g.rows.find((r) => r[2] === 'Bowel movement' && r[4] === 'Form')?.[5]).toBe('Loose');
    // Read back through the parser the note is intact, with the leading
    // apostrophe the spreadsheet needs in front of it.
    expect(g.rows.find((r) => r[2] === 'Day note')?.[5]).toBe(`'${NASTY_NOTE}`);
  });

  it('keeps a bespoke type field that no schema declares', () => {
    const st = fixture();
    st.days[DK1].activities = [{ id: 'b1', type: 'indoorBike', time: '10:00', resistance: '7', hr60: '88' }] as Entry[];
    const g = grid(buildEntriesCsv(st, ctx, DK1, DK1, 'imperial'));
    const bike = g.rows.filter((r) => r[3] === 'Indoor bike');
    expect(bike.map((r) => r[4])).toEqual(expect.arrayContaining(['resistance', 'hr60']));
  });

  it('converts a distance at the edge and names the unit it used', () => {
    const imp = entries('imperial').rows.find((r) => r[3] === 'Walk' && r[4] === 'Distance');
    expect(imp?.slice(5, 7)).toEqual(['2', 'mi']);
    const met = entries('metric').rows.find((r) => r[3] === 'Walk' && r[4] === 'Distance');
    expect(met?.slice(5, 7)).toEqual(['3.22', 'km']);
  });

  it('clips to the range', () => {
    expect(entries(undefined, DK1, DK2).rows.some((r) => r[0] === DK4)).toBe(false);
    expect(entries(undefined, DK1, DK4).rows.some((r) => r[0] === DK4)).toBe(true);
  });
});

/* ─────────────────────── the helpers the sheet calls ─────────────────────── */

describe('range helpers', () => {
  it('lists only the days the journal holds inside the window, oldest first', () => {
    const st = fixture();
    expect(dayKeysIn(st.days, DK1, DK4)).toEqual([DK1, DK2, DK4]);
    expect(dayKeysIn(st.days, DK4, DK1)).toEqual([DK1, DK2, DK4]);   // a backwards pair is a window
    expect(dayKeysIn(st.days, '2026-08-01', '2026-08-31')).toEqual([]);
    expect(dayKeysIn(undefined, DK1, DK4)).toEqual([]);
  });

  it('asks about cycle data in the EXPORTED range, not the whole journal', () => {
    const st = fixture();
    st.days[DK4].cycle = { flow: 'light' };
    expect(rangeHasCycle(st, DK1, DK2)).toBe(false);
    expect(rangeHasCycle(st, DK1, DK4)).toBe(true);
  });

  it('counts an imported night as data worth a row', () => {
    expect(hasAnyData(undefined)).toBe(false);
    expect(hasAnyData(blankDay())).toBe(false);
    expect(hasAnyData({ ...blankDay(), sleep: { bed: '23:00', wake: '07:00', imported: true } })).toBe(true);
  });
});
