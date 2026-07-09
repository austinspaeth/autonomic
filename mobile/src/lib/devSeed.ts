/**
 * TEMPORARY dev-only mock data. With SEED_MOCK_DATA true, the last 5 days are
 * populated on launch with realistic HRV / vitals / sleep / activity entries so
 * the Progress and Insight views have something to chew on. Every injected
 * entry id starts with "mock-" and every touched day is tracked in
 * `meta.mockSeeded`, so flipping the flag to false cleans it all back out on
 * the next launch (days that end up empty are deleted entirely).
 *
 * Delete this file (and its call in app/_layout.tsx) when it's no longer needed.
 */
import type { AppState, DayRecord, Entry } from './types';
import { blankDay, getState, save } from '../store/store';
import { addDays, todayKey } from './dates';

export const SEED_MOCK_DATA = true;

const MOCK = 'mock-';

/** Per-day scripts, index 0 = today … 4 = four days ago. A gentle upward trend
 *  toward today so the charts show movement, plus a dip on day 3. */
const D = [
  { rmssdB: 58, rmssdU: 44, sdnn: 62, hr: 57, water: 3.1, bed: '22:40', wake: '06:45', sys: 112, dia: 72 },
  { rmssdB: 54, rmssdU: 41, sdnn: 58, hr: 58, water: 2.8, bed: '22:55', wake: '06:50', sys: 114, dia: 74 },
  { rmssdB: 49, rmssdU: 37, sdnn: 53, hr: 60, water: 2.5, bed: '23:10', wake: '07:05', sys: 118, dia: 76 },
  { rmssdB: 41, rmssdU: 31, sdnn: 46, hr: 63, water: 2.0, bed: '23:40', wake: '07:20', sys: 122, dia: 79 },
  { rmssdB: 46, rmssdU: 35, sdnn: 50, hr: 61, water: 2.6, bed: '23:00', wake: '07:00', sys: 117, dia: 75 },
];

const s = (n: number) => String(Math.round(n * 100) / 100);

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
  const d = D[i];
  const id = (n: string) => `${MOCK}${dk}-${n}`;
  const e = (type: string, n: string, fields: Record<string, unknown>): Entry =>
    ({ id: id(n), type, note: '', ...fields } as Entry);

  const readings: Entry[] = [
    e('breathHrv', 'bhrv-am', { time: '07:25', period: 'Morning', style: '4/6', hr: s(d.hr), ...hrvFields(d.rmssdB, d.hr, false) }),
    e('hrv', 'uhrv-am', { time: '07:40', period: 'Morning', avgHr: s(d.hr + 4), ...hrvFields(d.rmssdU, d.hr + 4, false) }),
    e('breathHrv', 'bhrv-pm', { time: '21:15', period: 'Evening', style: '4/6', hr: s(d.hr + 2), ...hrvFields(d.rmssdB, d.hr + 2, true) }),
    e('bp', 'bp-am', { time: '07:50', period: 'Morning', sys: s(d.sys), dia: s(d.dia), pulse: s(d.hr + 6) }),
    e('restingHr', 'rhr', { time: '07:15', position: 'Laying', hr: s(d.hr - 2) }),
  ];
  if (i === 1 || i === 3) readings.push(e('orthostatic', 'ortho', { time: '09:10', transition: 'Laying to standing', beforeHr: s(d.hr), afterHr: s(d.hr + (i === 3 ? 34 : 24)), hr1min: s(d.hr + 14) }));

  const activities: Entry[] = [
    e('walk', 'walk', { time: '11:30', duration: s(25 + i * 3), distance: '1.2', avgHr: s(d.hr + 35) }),
    e('legsUp', 'legs', { time: '18:00', duration: '15', lowHr: s(d.hr - 4) }),
  ];
  if (i === 0 || i === 4) activities.push(e('indoorBike', 'bike', { time: '16:00', duration: '20', avgHr: s(d.hr + 48) }));

  const meds: Entry[] = [
    e('magGlycinate', 'mag', { time: '21:30', amount: '200' }),
    e('coq10', 'coq', { time: '08:00', amount: '100' }),
    e('lmnt', 'lmnt', { time: '12:00', amount: '1' }),
  ];

  const symptoms: Entry[] = [];
  if (i === 3) symptoms.push(e('lightHeaded', 'dizzy', { time: '09:20' }), e('headache', 'ha', { time: '15:00' }));
  if (i === 2) symptoms.push(e('labileHr', 'hihr', { time: '13:40', hr: '104', position: 'Standing', hr5: '86' }));

  return {
    readings, activities, meds, symptoms,
    sleep: { bed: d.bed, wake: d.wake, quality: i === 3 ? 'interrupted' : 'good', hrLow: s(d.hr - 8), hrHigh: s(d.hr + 12) },
    food: { water: d.water, calories: 0, meals: [], triggers: i === 3 ? { caffeine: 1, sugar: 1 } : i === 1 ? { caffeine: 1 } : {} },
  };
}

const isMock = (x: Entry) => typeof x.id === 'string' && x.id.startsWith(MOCK);

function stripMock(state: AppState) {
  const seeded = new Set((state.meta.mockSeeded as string[] | undefined) || []);
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

/** Seed (flag on) or clean up (flag off). Idempotent per launch. */
export function applyMockSeed() {
  const state = getState();
  if (!SEED_MOCK_DATA) {
    if (state.meta.mockSeeded) { stripMock(state); save(); }
    return;
  }
  if (state.meta.mockSeeded) return; // already seeded

  const seededDays: string[] = [];
  for (let i = 0; i < D.length; i++) {
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
