/**
 * The all-time report range and its monthly rollup.
 *
 * The point of the rollup is a size ceiling: a multi-year journal has to produce
 * a prompt somebody can actually paste into an AI tool. So these assert the
 * ceiling holds AND that nothing is dropped silently — the document has to say
 * where the detail stops.
 */
import { addDays, keyOf, todayKey } from '../../dates';
import type { AppState, DayRecord, Entry } from '../../types';
import {
  ALL_TIME_DETAIL_DAYS, buildDataExport, buildDoctorPrompt, buildMonthlyRollup, buildPrompt,
  REPORT_CARDS, reportDateRange, splitAllTime,
} from '../reports';

let uid = 0;
const nextId = () => `e${++uid}`;

const hrvR = (rmssd: number): Entry => ({
  id: nextId(), type: 'hrv', time: '08:00', rmssd: String(rmssd), sdnn: String(Math.round(rmssd * 1.4)),
});

const day = (i: number): DayRecord => ({
  sleep: { bed: '22:45', wake: '07:00', hrLow: '56' },
  readings: [hrvR(28 + (i % 14)), { id: nextId(), type: 'bp', time: '08:05', sys: '116', dia: '75', pulse: '64' }],
  activities: [],
  meds: [{ id: nextId(), type: 'magGlycinate', time: '21:30', amount: '400mg' }],
  symptoms: i % 3 === 0 ? [{ id: nextId(), type: 'fatigue', time: '12:00' }] : [],
  food: { water: 2.4, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [{ id: nextId(), time: '09:00' }] },
  notes: i % 10 === 0 ? 'a note worth keeping' : '',
});

/** A journal of `n` days ending today. */
function journal(n: number): AppState {
  const days: Record<string, DayRecord> = {};
  const t = new Date(); t.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(t); d.setDate(t.getDate() - (n - 1 - i));
    days[keyOf(d)] = day(i);
  }
  return {
    version: 1, settings: { theme: 'dark' },
    profile: { sex: 'female', birthday: '1990-04-02', weight: '', height: '' },
    meta: { lastUpdated: null, lastImport: null }, days,
  } as AppState;
}

describe('reportDateRange(all)', () => {
  it('spans the first logged day to today', () => {
    const s = journal(400);
    const { keys, rangeText } = reportDateRange('all', todayKey(), s.days);
    expect(keys).toHaveLength(400);
    expect(keys[keys.length - 1]).toBe(todayKey());
    expect(rangeText).toMatch(/^All time \(/);
    expect(rangeText).toContain('400 days');
  });

  it('falls back to a year when no journal is supplied', () => {
    // The parameter is optional to keep the signature backwards compatible.
    expect(reportDateRange('all', todayKey()).keys).toHaveLength(365);
  });

  it('handles a single-day journal without producing a nonsense range', () => {
    const s = journal(1);
    const { keys } = reportDateRange('all', todayKey(), s.days);
    expect(keys).toEqual([todayKey()]);
  });

  it('ignores days after today rather than running past them', () => {
    const s = journal(10);
    s.days[addDays(todayKey(), 5)] = day(0);
    expect(reportDateRange('all', todayKey(), s.days).keys.pop()).toBe(todayKey());
  });
});

describe('splitAllTime', () => {
  it('keeps everything when the journal is inside the detail window', () => {
    const keys = reportDateRange('all', todayKey(), journal(200).days).keys;
    expect(splitAllTime(keys)).toEqual({ older: [], recent: keys });
  });

  it('rolls up exactly the excess', () => {
    const keys = reportDateRange('all', todayKey(), journal(500).days).keys;
    const { older, recent } = splitAllTime(keys);
    expect(recent).toHaveLength(ALL_TIME_DETAIL_DAYS);
    expect(older).toHaveLength(500 - ALL_TIME_DETAIL_DAYS);
    expect(older.concat(recent)).toEqual(keys);
  });
});

describe('buildMonthlyRollup', () => {
  const s = journal(500);
  const { older } = splitAllTime(reportDateRange('all', todayKey(), s.days).keys);
  const rollup = buildMonthlyRollup(s, {}, older);

  it('emits one line per calendar month with the days logged', () => {
    const lines = rollup.split('\n').filter((l) => l.startsWith('['));
    expect(lines.length).toBeGreaterThanOrEqual(4);
    lines.forEach((l) => expect(l).toMatch(/^\[\d{4}-\d{2}\] days logged: \d+/));
  });

  it('reports medians with their sample size, and counts as totals', () => {
    expect(rollup).toMatch(/HRV \(RMSSD\) [\d.]+ ms \(n=\d+\)/);
    expect(rollup).toMatch(/Symptoms logged \d+ total/);
  });

  it('names the span and says these are medians', () => {
    expect(rollup).toMatch(/^MONTHLY SUMMARY \(\d{4}-\d{2} to \d{4}-\d{2}/);
    expect(rollup).toContain('medians unless marked total');
  });

  it('is empty for an empty range rather than emitting a bare heading', () => {
    expect(buildMonthlyRollup(s, {}, [])).toBe('');
  });
});

describe('the size ceiling', () => {
  const short = journal(120);
  const long = journal(1100);

  it('keeps a three-year data export to roughly the size of a one-year one', () => {
    const oneYear = buildDataExport(journal(365), {}, 'all', todayKey()).length;
    const threeYears = buildDataExport(long, {}, 'all', todayKey()).length;
    // Without the rollup this would be ~3x. The extra is the monthly summary.
    expect(threeYears).toBeLessThan(oneYear * 1.2);
  });

  it('says where the day-by-day detail begins, so nothing is dropped silently', () => {
    const out = buildDataExport(long, {}, 'all', todayKey());
    expect(out).toContain('MONTHLY SUMMARY');
    expect(out).toMatch(/DAY-BY-DAY DETAIL \(from \d{4}-\d{2}-\d{2} onward\)/);
  });

  it('adds no rollup at all when the journal fits in the detail window', () => {
    const out = buildDataExport(short, {}, 'all', todayKey());
    expect(out).not.toContain('MONTHLY SUMMARY');
    expect(out).not.toContain('DAY-BY-DAY DETAIL');
  });

  it('leaves the shorter ranges completely untouched', () => {
    (['day', 'week', 'month', 'year'] as const).forEach((r) => {
      const out = buildDataExport(long, {}, r, todayKey());
      expect(out).not.toContain('MONTHLY SUMMARY');
    });
  });
});

describe('the all-time prompts', () => {
  const long = journal(1100);
  const overall = REPORT_CARDS.find((c) => c.id === 'overall')!;

  it('builds the full health report over all time with both halves', () => {
    const out = buildPrompt(long, {}, [overall], 'all', todayKey());
    expect(out).toContain('PERIOD ANALYZED: All time');
    expect(out).toContain('MONTHLY SUMMARY');
    expect(out).toContain('DAY-BY-DAY DETAIL');
  });

  it('builds the doctor summary over all time', () => {
    const out = buildDoctorPrompt(long, {}, 'all', todayKey());
    expect(out).toContain('All time');
    expect(out).toContain('MONTHLY SUMMARY');
    // Still the clinical document, not a data dump.
    expect(out).toContain('Patient Health Tracking Summary');
  });

  it('rolls up once per builder, not once per requested section', () => {
    const out = buildPrompt(long, {}, REPORT_CARDS.slice(0, 3), 'all', todayKey());
    expect(out.split('MONTHLY SUMMARY').length - 1).toBe(1);
  });
});
