/**
 * Barometric pressure: what counts as a low day, and the Insights card built on it.
 *
 * The engine half matters most. A card that appears on noise tells somebody the
 * weather is hurting them when it is not, and a card that appears only for GOOD
 * links would be a pressure card saying nothing a person can plan around.
 */
import { addDays } from '../dates';
import type { AppState, DayRecord, Entry } from '../types';
import {
  ALTITUDE_JUMP_HPA, BASELINE_MIN_DAYS, KEEP_DAYS, LOW_BELOW_HPA, addPressureSample, dayPressure, fmtInHg,
  lowPressureValue, pressureBaseline, readPressure, type PressureMap,
} from '../pressure';
import { keyRange } from '../trends';
import { PRESSURE_FACTOR_ID, buildInsights } from '../insights';
import { pressureHeadline, pressureWarning } from '../insights/pressureCopy';

const DK = '2026-06-30';

/** A flat month at `base`, then `dk` at `today`. */
function month(base: number, today?: number): PressureMap {
  const map: PressureMap = {};
  keyRange(addDays(DK, -1), 30, addDays).forEach((k) => { map[k] = { '09': base, '18': base + 0.4 }; });
  if (today != null) map[DK] = { '09': today };
  return map;
}

describe('what a low pressure day is', () => {
  it('reads a day as the median of its samples', () => {
    // An elevator ride is one reading among several and must not move the day.
    expect(dayPressure({ [DK]: { '08': 1012, '09': 1013, '10': 990 } }, DK)).toBe(1012);
  });

  it('needs a baseline before it will judge anything', () => {
    const map: PressureMap = {};
    keyRange(addDays(DK, -1), BASELINE_MIN_DAYS - 1, addDays).forEach((k) => { map[k] = { '09': 1013 }; });
    map[DK] = { '09': 990 };
    expect(pressureBaseline(map, DK)).toBeNull();
    expect(lowPressureValue(map, DK)).toBeNull();
  });

  it('is low against the user\'s OWN normal, wherever they live', () => {
    // Sea level and 5,000 feet: the same weather system, the same verdict.
    expect(lowPressureValue(month(1013, 1013 - LOW_BELOW_HPA - 1), DK)).toBe(1);
    expect(lowPressureValue(month(843, 843 - LOW_BELOW_HPA - 1), DK)).toBe(1);
    expect(lowPressureValue(month(1013, 1013 - LOW_BELOW_HPA + 2), DK)).toBe(0);
    expect(lowPressureValue(month(1013, 1025), DK)).toBe(0);
  });

  it('treats a jump only a change of altitude explains as unknown, not low', () => {
    expect(readPressure(month(1013, 1013 - ALTITUDE_JUMP_HPA - 5), DK)).toBeNull();
  });

  it('never grades a day against an average it is part of', () => {
    const map = month(1013, 980);
    expect(pressureBaseline(map, DK)).toBeCloseTo(1013.2, 1);
  });

  it('keeps one sample per hour, as a new object, trimmed to KEEP_DAYS', () => {
    const before: PressureMap = { [addDays(DK, -KEEP_DAYS - 3)]: { '09': 1010 } };
    const after = addPressureSample(before, DK, 9, 1011.26);
    expect(after).not.toBe(before);
    expect(after[DK]).toEqual({ '09': 1011.3 });
    expect(Object.keys(after)).toEqual([DK]);
    expect(addPressureSample(after, DK, 9, 1009)[DK]).toEqual({ '09': 1009 });
    // A sensor glitch is dropped rather than stored.
    expect(addPressureSample(after, DK, 10, 0)).toBe(after);
  });

  it('shows inches of mercury', () => {
    expect(fmtInHg(1013.25)).toBe('29.92');
  });
});

/* ---------- the engine ---------- */

const blank = (): DayRecord => ({
  sleep: { bed: '', wake: '' }, readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] }, digestion: { movements: [] },
});

let uid = 0;
const hrv = (rmssd: number): Entry => ({
  id: `p${++uid}`, type: 'hrv', time: '08:00',
  rmssd: String(rmssd), sdnn: String(Math.round(rmssd * 1.4)), pnn50: String(Math.round(rmssd / 4)),
});

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 150 days of HRV with weather: pressure wanders around 1013 and roughly one day
 * in six is a proper low. `effect` is how much lower RMSSD runs on a low day.
 */
function weatherJournal(seed: number, effect: number): AppState {
  const r = rng(seed);
  const keys = keyRange(DK, 150, addDays);
  const days: Record<string, DayRecord> = {};
  const pressure: PressureMap = {};
  keys.forEach((k) => {
    const low = r() < 0.18;
    const hpa = low ? 1013 - LOW_BELOW_HPA - 3 - r() * 6 : 1013 + (r() - 0.5) * 6;
    pressure[k] = { '08': hpa, '20': hpa + 0.3 };
    const d = blank();
    d.readings.push(hrv(Math.round(42 + (r() - 0.5) * 10 - (low ? effect : 0))));
    days[k] = d;
  });
  return {
    version: 1, settings: { theme: 'dark' }, profile: { sex: '', birthday: '', weight: '', height: '' },
    meta: { lastUpdated: '2026-06-30T12:00:00.000Z', lastImport: null }, days, pressure,
  } as AppState;
}

describe('the pressure card', () => {
  it('appears when low pressure days really do run worse, and only there', () => {
    const report = buildInsights(weatherJournal(7, 12), addDays(DK, 1));
    expect(report.pressure).not.toBeNull();
    const lead = report.pressure!.findings[0].c;
    expect(lead.factorId).toBe(PRESSURE_FACTOR_ID);
    expect(lead.good).toBe(false);
    expect(report.pressure!.found.length).toBeGreaterThan(0);
    // It lives on its own card and nowhere else.
    expect(report.correlations.some((c) => c.factorId === PRESSURE_FACTOR_ID)).toBe(false);
    expect(report.early.some((c) => c.factorId === PRESSURE_FACTOR_ID)).toBe(false);
    expect(report.detail[lead.id]).toBeTruthy();
    expect(report.pressure!.knownDays).toBeGreaterThan(100);
  });

  it('says nothing about weather that does nothing', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const report = buildInsights(weatherJournal(seed, 0), addDays(DK, 1));
      expect(report.pressure).toBeNull();
    }
  });

  it('stays once found, even after the link is no longer there to find', () => {
    const found = buildInsights(weatherJournal(7, 12), addDays(DK, 1)).pressure!;
    const snapshots = Object.fromEntries(found.findings.map((f) => [f.c.id, f.c]));
    // Same memory, a journal where the weather has stopped mattering.
    const later = buildInsights(weatherJournal(3, 0), addDays(DK, 1), { pressure: { ids: found.found, snapshots } });
    expect(later.pressure).not.toBeNull();
    expect(later.pressure!.found).toEqual([]);
  });

  it('keeps its remembered numbers when the pair cannot be tested at all', () => {
    const found = buildInsights(weatherJournal(7, 12), addDays(DK, 1)).pressure!;
    const snapshots = Object.fromEntries(found.findings.map((f) => [f.c.id, f.c]));
    const s = weatherJournal(7, 12);
    delete s.pressure;
    const later = buildInsights(s, addDays(DK, 1), { pressure: { ids: found.found, snapshots } });
    expect(later.pressure!.findings[0].stale).toBe(true);
    expect(later.pressure!.knownDays).toBe(0);
  });

  it('never appears in the demo', () => {
    const report = buildInsights(weatherJournal(7, 12), addDays(DK, 1), { demo: true });
    expect(report.pressure).toBeNull();
  });

  it('speaks associationally and carries its own numbers', () => {
    const c = buildInsights(weatherJournal(7, 12), addDays(DK, 1)).pressure!.findings[0].c;
    expect(pressureHeadline(c)).toMatch(/^Your .+ runs lower (on low pressure days|the day after low pressure)$/);
    expect(pressureWarning(c)).toMatch(/^Barometric pressure is low today\. .+ \d+(\.\d+)? \S+ lower\.$/);
    expect(pressureWarning(c)).not.toMatch(/caus|because/i);
  });
});
