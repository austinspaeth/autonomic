/**
 * DEV-ONLY mock data. With SEED_MOCK_DATA true, the last 14 days are populated
 * on launch with realistic HRV / vitals / sleep / activity entries so the
 * Progress and Insight views have something to chew on. Every injected entry id
 * starts with "mock-" and every touched blank day is tracked in
 * `meta.mockSeeded`, so flipping the flag to false cleans it all back out on the
 * next launch (days that end up empty are deleted entirely).
 *
 * Only ever runs behind `__DEV__` (see app/_layout.tsx). Delete this file (and
 * its call) when it's no longer needed.
 */
import type { AppState, DayRecord, Entry } from './types';
import { blankDay, getState, save } from '../store/store';
import { addDays, pad, todayKey } from './dates';

export const SEED_MOCK_DATA = true;

const MOCK = 'mock-';
const DAYS = 14;

const s = (n: number) => String(Math.round(n * 100) / 100);

interface DayVitals {
  rmssdB: number; rmssdU: number; sdnn: number; hr: number;
  water: number; bed: string; wake: string; sys: number; dia: number; dip: boolean;
}

/** Deterministic per-day script, index 0 = today … 13 = thirteen days ago. A
 *  gentle recovery trend toward today plus mild oscillation, with two setback
 *  days so the charts and insights show real movement. */
function dayVitals(i: number): DayVitals {
  const t = (DAYS - 1 - i) / (DAYS - 1); // 0 (oldest) → 1 (today)
  const wave = Math.sin(i * 0.9);        // -1..1 gentle week-over-week ripple
  const dip = i === 3 || i === 9;        // two "bad" days
  const d = dip ? 1 : 0;

  const rmssdB = Math.round(40 + t * 18 + wave * 2.5 - d * 9);
  const hr = Math.round(62 - t * 5 - wave * 1.5 + d * 4);
  const bedMin = 22 * 60 + 40 + Math.round((1 - t) * 40 + d * 25 + wave * 8);
  const wakeMin = 6 * 60 + 45 + Math.round((1 - t) * 25 + d * 15);
  const fmt = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

  return {
    rmssdB,
    rmssdU: Math.round(rmssdB * 0.76),
    sdnn: Math.round(rmssdB * 1.12),
    hr,
    water: Math.round((2.2 + t * 0.9 - d * 0.6) * 10) / 10,
    bed: fmt(bedMin),
    wake: fmt(wakeMin),
    sys: Math.round(112 + (1 - t) * 8 + d * 4),
    dia: Math.round(72 + (1 - t) * 5 + d * 3),
    dip,
  };
}

/** A full HRV panel derived from the day's RMSSD anchor, as string fields. */
function hrvFields(rmssd: number, hr: number, evening: boolean): Record<string, string> {
  const k = evening ? 0.92 : 1; // evenings read slightly lower
  const r = rmssd * k;
  const meanRr = 60000 / (hr + (evening ? 3 : 0));
  return {
    stressIndex: s(160 - r * 1.6),
    sdnn: s(r * 1.12),
    meanRr: s(meanRr),
    rmssd: s(r),
    pnn50: s(Math.max(2, r * 0.55 - 6)),
    mxdmn: s(0.004 * r + 0.08),
    mode: s(meanRr - 15),
    amo50: s(58 - r * 0.4),
    cv: s(3.2 + r * 0.05),
    vlowPower: s(420 + r * 9),
    lowPower: s(700 + r * 16),
    highPower: s(380 + r * 22),
    lfPeak: s(evening ? 0.093 : 0.098),
    hfPeak: s(0.22 + (evening ? 0.02 : 0)),
  };
}

function entriesFor(dk: string, i: number): Partial<DayRecord> {
  const v = dayVitals(i);
  const id = (n: string) => `${MOCK}${dk}-${n}`;
  const e = (type: string, n: string, fields: Record<string, unknown>): Entry =>
    ({ id: id(n), type, note: '', ...fields } as Entry);

  const readings: Entry[] = [
    e('breathHrv', 'bhrv-am', { time: '07:25', period: 'Morning', style: '4/6', hr: s(v.hr), ...hrvFields(v.rmssdB, v.hr, false) }),
    e('hrv', 'uhrv-am', { time: '07:40', period: 'Morning', avgHr: s(v.hr + 4), ...hrvFields(v.rmssdU, v.hr + 4, false) }),
    e('breathHrv', 'bhrv-pm', { time: '21:15', period: 'Evening', style: '4/6', hr: s(v.hr + 2), ...hrvFields(v.rmssdB, v.hr + 2, true) }),
    e('bp', 'bp-am', { time: '07:50', period: 'Morning', sys: s(v.sys), dia: s(v.dia), pulse: s(v.hr + 6) }),
    e('restingHr', 'rhr', { time: '07:15', position: 'Laying', hr: s(v.hr - 2) }),
  ];
  // Orthostatic on setback days and roughly weekly, with a bigger drop on dips.
  if (v.dip || i % 5 === 2) readings.push(e('orthostatic', 'ortho', { time: '09:10', transition: 'Laying to standing', beforeHr: s(v.hr), afterHr: s(v.hr + (v.dip ? 34 : 24)), hr1min: s(v.hr + 14) }));

  const activities: Entry[] = [
    e('walk', 'walk', { time: '11:30', duration: s(22 + (i % 4) * 4), distance: s(1.0 + (i % 4) * 0.25), avgHr: s(v.hr + 35) }),
    e('legsUp', 'legs', { time: '18:00', duration: '15', lowHr: s(v.hr - 4) }),
  ];
  if (!v.dip && i % 3 === 0) activities.push(e('indoorBike', 'bike', { time: '16:00', duration: '20', avgHr: s(v.hr + 48) }));

  const meds: Entry[] = [
    e('magGlycinate', 'mag', { time: '21:30', amount: '200' }),
    e('coq10', 'coq', { time: '08:00', amount: '100' }),
    e('lmnt', 'lmnt', { time: '12:00', amount: '1' }),
  ];

  const symptoms: Entry[] = [];
  if (v.dip) symptoms.push(e('lightHeaded', 'dizzy', { time: '09:20' }), e('headache', 'ha', { time: '15:00' }));
  if (i % 6 === 2) symptoms.push(e('labileHr', 'hihr', { time: '13:40', hr: '104', position: 'Standing', hr5: '86' }));

  return {
    readings, activities, meds, symptoms,
    sleep: { bed: v.bed, wake: v.wake, quality: v.dip ? 'interrupted' : 'good', hrLow: s(v.hr - 8), hrHigh: s(v.hr + 12) },
    food: { water: v.water, calories: 0, meals: [], triggers: v.dip ? { caffeine: 1, sugar: 1 } : i % 2 === 1 ? { caffeine: 1 } : {} },
  };
}

const isMock = (x: Entry) => typeof x.id === 'string' && x.id.startsWith(MOCK);

function stripMock(state: AppState) {
  const seeded = new Set(state.meta.mockSeeded || []);
  Object.keys(state.days).forEach((dk) => {
    const day = state.days[dk];
    (['readings', 'activities', 'meds', 'symptoms'] as const).forEach((k) => {
      day[k] = (day[k] || []).filter((x) => !isMock(x));
    });
    if (seeded.has(dk)) {
      // We only wrote sleep/food onto days that were empty when seeded.
      day.sleep = { bed: '', wake: '' };
      day.food = { water: 0, calories: 0, triggers: {}, meals: [] };
      const empty = !day.readings.length && !day.activities.length && !day.meds.length
        && !day.symptoms.length && !day.sleep.bed && !day.sleep.wake
        && !day.food.water && !(day.digestion?.movements || []).length;
      if (empty) delete state.days[dk];
    }
  });
  delete state.meta.mockSeeded;
}

/** Seed (flag on) or clean up (flag off). Idempotent per launch; dev-only. */
export function applyMockSeed() {
  const state = getState();
  if (!SEED_MOCK_DATA) {
    if (state.meta.mockSeeded) { stripMock(state); save(); }
    return;
  }
  if (state.meta.mockSeeded) return; // already seeded

  const seededDays: string[] = [];
  for (let i = 0; i < DAYS; i++) {
    const dk = addDays(todayKey(), -i);
    const existing = state.days[dk];
    const hadContent = !!existing && (
      (existing.readings || []).length > 0 || (existing.activities || []).length > 0
      || (existing.meds || []).length > 0 || (existing.symptoms || []).length > 0
      || !!existing.sleep?.bed || !!existing.sleep?.wake || !!(existing.food && existing.food.water)
    );
    const day = state.days[dk] || (state.days[dk] = blankDay());
    const mock = entriesFor(dk, i);
    day.readings.push(...mock.readings!);
    day.activities.push(...mock.activities!);
    day.meds.push(...mock.meds!);
    day.symptoms.push(...mock.symptoms!);
    if (!hadContent) {
      // Sleep/water/triggers have no ids to strip later, so only claim blank days.
      day.sleep = mock.sleep!;
      day.food = mock.food!;
      seededDays.push(dk);
    }
  }
  state.meta.mockSeeded = seededDays;
  save();
}
