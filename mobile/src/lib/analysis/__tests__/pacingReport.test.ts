/** The PACING BUDGET section of the exported prompts — the data export, the
 *  overall health report and the doctor summary all carry it. */
import { buildDataExport, buildDoctorPrompt, buildPrompt, REPORT_CARDS } from '../reports';
import { demoDays } from '../../demo';
import type { AppState, DayRecord } from '../../types';
import type { DaysMap } from '../../scoring/day';

const stateOf = (days: DaysMap): AppState => ({
  version: 1, settings: {}, profile: {}, customTypes: {}, hiddenTypes: {},
  meta: { lastUpdated: '' }, days,
} as unknown as AppState);

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const load = (over: Record<string, unknown> = {}) => ({
  steps: 4210, walkingMin: 62, standMin: null, stillUprightMin: 45, uprightSpans: null, uprightByHour: null,
  hrAboveMin: 38, hrBands: [20, 12, 6], hrBelowMin: 90, hrBelowByHour: null, hrCoverageMin: 900,
  hrStretches: 3, longestStretch: null, peakBpm: 128, lineBpm: 95,
  readAt: '2026-09-02T22:00:00.000Z', ...over,
} as DayRecord['load']);

describe('the pacing budget reaches the exports', () => {
  const days = demoDays();
  const keys = Object.keys(days).sort();
  const dk = keys[keys.length - 1];
  // A day the app genuinely observed, and one it never saw at all.
  const observed = keys[keys.length - 3];
  days[observed] = { ...day(days[observed]), load: load() } as DayRecord;
  const unseen = keys[keys.length - 2];
  days[unseen] = { ...day(), activities: [] } as DayRecord;
  const st = stateOf(days);

  it('is in the raw data export, in effort minutes, framed as a ceiling', () => {
    const out = buildDataExport(st, {}, 'month', dk);
    expect(out).toContain('PACING BUDGET (effort minutes)');
    expect(out).toContain('a CEILING fitted from this person\'s own history, not a target');
    expect(out).toMatch(new RegExp(`\\[${observed}\\] Budget: \\d+m \\| Cost: \\d+m`));
    // The passive measurements ride along with the day they describe, in
    // their own units, beside the charges they produced — the arithmetic has
    // to be checkable by the reader or an effort minute is unfalsifiable.
    expect(out).toContain('4210 steps');
    expect(out).toContain('38m above 95 bpm');
    expect(out).toContain('45m standing still (inferred from heart rate, estimate)');
    expect(out).toMatch(/Charged: .*Upright time \+\d+m/);
    expect(out).toContain('Coverage: full day of heart rate');
  });

  it('omits a day it had no way to observe rather than calling it free', () => {
    const out = buildDataExport(st, {}, 'month', dk);
    // Nothing logged and no health read: the day appears in other sections but
    // must never appear here, where a zero cost would read as a whole budget
    // left unspent.
    expect(out).not.toContain(`[${unseen}] Budget:`);
  });

  it('summarises how often the budget actually held', () => {
    const out = buildDataExport(st, {}, 'month', dk);
    expect(out).toMatch(/SUMMARY: \d+ days? with a budget \| over budget on \d+/);
    expect(out).toContain('stayed steady over the following two days on');
  });

  it('is in the overall health report and the doctor summary', () => {
    const overall = REPORT_CARDS.find((c) => c.id === 'overall')!;
    expect(buildPrompt(st, {}, [overall], 'month', dk)).toContain('PACING BUDGET (effort minutes)');
    const doctor = buildDoctorPrompt(st, {}, 'month', dk);
    expect(doctor).toContain('PACING BUDGET (effort minutes)');
    // ...and the document is told what to do with it, in the one framing a
    // clinician must not be handed wrong.
    expect(doctor).toContain('ACTIVITY & PACING');
    expect(doctor).toContain('not a clinical target or a prescribed activity limit');
  });
});
