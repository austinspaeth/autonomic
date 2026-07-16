/**
 * Demo journal — the sample month the Progress and Insights views fall back to
 * while the user has logged nothing of their own.
 *
 * Why it exists: both of those views are worthless on a fresh install (they are
 * derived views over a journal that is still empty), and "nothing to show yet"
 * teaches nobody what the app is for. So they render a generated month behind a
 * "showing demo data" banner instead, and swap to the real thing the moment the
 * user logs anything (`hasOwnData`). The Journal itself is never faked — it is
 * where the real data goes in, so a demo entry there would be a lie you could
 * tap.
 *
 * The arc is deliberate: a rough first stretch with crash days, a slow climb
 * through the middle with real setbacks along the way, and a last week that
 * settles into the green. Not a straight line, because recovery isn't one, and
 * a demo that promised one would be dishonest.
 *
 * Pure and deterministic: same day key in, same journal out (seeded PRNG, no
 * Math.random, no store access). Days are generated relative to today so the
 * data lands inside the Analysis buckets and the report ranges.
 */
import { keyOf, todayKey } from './dates';
import type { AppState, DayRecord, Entry, Movement } from './types';
import type { DaysMap } from './scoring/day';

/** Length of the sample month. */
export const DEMO_DAYS = 30;

/**
 * True when the journal holds any trace of the user's own input. Deliberately
 * broader than the Analysis/Insights "is there anything to chart" checks: a
 * single logged water glass or day note is still the user's data, and demo
 * data must never sit on top of it.
 */
export function hasOwnData(days: DaysMap): boolean {
  return Object.keys(days).some((k) => {
    const d = days[k];
    if (!d) return false;
    if ((d.readings || []).length || (d.activities || []).length) return true;
    if ((d.meds || []).length || (d.symptoms || []).length) return true;
    if ((d.digestion?.movements || []).length) return true;
    if ((d.food?.meals || []).length) return true;
    if (d.food && +d.food.water > 0) return true;
    if (d.food?.triggers && Object.values(d.food.triggers).some((n) => n > 0)) return true;
    if (d.sleep && (d.sleep.bed || d.sleep.wake)) return true;
    if (d.notes && d.notes.trim()) return true;
    return false;
  });
}

/* ---------- deterministic noise ---------- */

/** mulberry32 — small, fast, seeded. Keeps the sample month identical run to run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the recovery arc ---------- */

/**
 * Setback days, as the amount of wellness they knock off the underlying climb.
 * These are what keep the month honest: two of them (19 and 25) are heavy
 * enough to land back in the red well after the trend turned.
 */
const DIPS: Record<number, number> = { 4: 0.05, 8: 0.03, 12: 0.16, 16: 0.15, 19: 0.22, 25: 0.2, 28: 0.04 };

/**
 * Wellness for day `i` (0 = a month ago, 29 = today), roughly 0..1.
 * Three phases: a flat, bad first stretch, a steady climb, then a green plateau
 * that still wobbles.
 */
function wellness(i: number, jitter: number): number {
  const base =
    i < 9 ? 0.04 + i * 0.013              // 0.04 → 0.14   crash / bad
      : i < 21 ? 0.16 + (i - 9) * 0.042   // 0.16 → 0.66   the climb
        : 0.66 + (i - 21) * 0.03;         // 0.66 → 0.90   settling green
  const w = base - (DIPS[i] || 0) + (jitter - 0.5) * 0.06;
  return Math.min(0.98, Math.max(0.02, w));
}

/* ---------- helpers ---------- */

const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One demo day. Values are stored as strings, matching what the forms and a
 * real export produce, so the scoring engine sees exactly the shape it does in
 * production.
 */
function demoDay(i: number, rand: () => number): DayRecord {
  const w = wellness(i, rand());
  /** Linear interpolate a metric between its worst-day and best-day value. */
  const at = (lo: number, hi: number) => lo + (hi - lo) * w;
  /** ±`spread` of reading-to-reading noise on top of an interpolated value. */
  const jit = (v: number, spread: number) => v + (rand() - 0.5) * spread;

  /* --- sleep: the story here is an earlier, more consistent bedtime --- */
  const dur = jit(at(5.0, 8.3), 0.5);
  const bedMin = 1080 + Math.round(jit(at(470, 285), 40)); // minutes past 18:00
  const wakeMin = bedMin + Math.round(dur * 60);
  const hrLow = Math.round(jit(at(79, 54), 3));
  const hrHigh = Math.round(jit(at(112, 84), 5));
  const sleep = {
    bed: hhmm(bedMin),
    wake: hhmm(wakeMin),
    quality: (w < 0.4 ? 'interrupted' : 'good') as 'good' | 'interrupted',
    hrLow: String(hrLow),
    hrHigh: String(hrHigh),
  };

  const wake = wakeMin % 1440;
  const readings: Entry[] = [];
  const id = (kind: string, n = 0) => `demo-${i}-${kind}${n ? `-${n}` : ''}`;

  /* --- HRV: a structured (paced-breathing) reading plus a plain one --- */
  const hrvPair = (slot: 'Morning' | 'Evening', mins: number, n: number) => {
    const total = jit(at(560, 4300), 260);
    const vlf = Math.round(total * at(0.6, 0.06));
    const lf = Math.round(total * at(0.25, 0.6));
    const hf = Math.max(60, Math.round(total) - vlf - lf);
    // Evening readings run a little softer than the morning baseline.
    const bias = slot === 'Evening' ? -0.9 : 0;
    readings.push({
      id: id(`breath-${n}`),
      type: 'breathHrv',
      time: hhmm(mins),
      note: '',
      style: '4/6',
      sdnn: String(Math.round(jit(at(26, 68), 4))),
      hr: String(Math.round(jit(at(80, 58), 3) - bias)),
      meanRr: String(Math.round(jit(at(760, 1010), 25))),
      rmssd: String(r2(jit(at(13.5, 39) + bias, 2.5))),
      pnn50: String(Math.round(Math.max(0, jit(at(0.8, 17), 3)))),
      vlowPower: String(vlf),
      lowPower: String(lf),
      highPower: String(hf),
      // A crashed system has no baroreflex resonance to find; the peak only
      // walks into the 0.08-0.10 Hz target band as the training takes.
      lfPeak: String(r2(jit(at(0.04, 0.096), 0.008))),
      hfPeak: String(r2(jit(at(0.21, 0.165), 0.02))),
      period: slot,
    });
    readings.push({
      id: id(`hrv-${n}`),
      type: 'hrv',
      time: hhmm(mins + 6),
      note: '',
      sdnn: String(Math.round(jit(at(22, 56), 4))),
      avgHr: String(Math.round(jit(at(82, 60), 3) - bias)),
      meanRr: String(Math.round(jit(at(745, 990), 25))),
      rmssd: String(r2(jit(at(11.5, 35.5) + bias, 2.5))),
      pnn50: String(Math.round(Math.max(0, jit(at(0.5, 14), 3)))),
      vlowPower: String(Math.round(vlf * 0.9)),
      lowPower: String(Math.round(lf * 0.28)), // no paced breathing, so no LF resonance peak
      highPower: String(Math.round(hf * 1.1)),
      lfPeak: String(r2(jit(at(0.05, 0.12), 0.02))),
      hfPeak: String(r2(jit(at(0.22, 0.19), 0.03))),
      period: slot,
    });
  };
  hrvPair('Morning', wake + 25 + Math.round(rand() * 20), 1);
  const eveningHrv = rand() < 0.6;
  if (eveningHrv) hrvPair('Evening', 1230 + Math.round(rand() * 50), 2);

  /* --- blood pressure: low and narrow early, filling out later --- */
  const bp = (slot: 'Morning' | 'Evening', mins: number, n: number) => {
    readings.push({
      id: id(`bp-${n}`),
      type: 'bp',
      time: hhmm(mins),
      note: '',
      sys: String(Math.round(jit(at(97, 115), 5))),
      dia: String(Math.round(jit(at(58, 75), 4))),
      pulse: String(Math.round(jit(at(88, 62), 4))),
      period: slot,
    });
  };
  bp('Morning', wake + 15, 1);
  if (rand() < 0.6) bp('Evening', 1260 + Math.round(rand() * 40), 2);

  /* --- resting HR --- */
  if (rand() < 0.7) {
    readings.push({
      id: id('rhr'),
      type: 'restingHr',
      time: hhmm(wake + 8),
      note: '',
      hr: String(Math.round(jit(at(90, 59), 3))),
      position: 'Laying',
    });
  }

  /* --- the guided stand test, run every few days --- */
  if (i % 5 === 2) {
    const baseline = Math.round(jit(at(82, 58), 3));
    const sustained = Math.round(jit(at(44, 12), 4));
    const peakDelta = sustained + Math.round(jit(at(14, 7), 3));
    readings.push({
      id: id('stand'),
      type: 'standTest',
      time: hhmm(wake + 50),
      note: '',
      baselineHr: String(baseline),
      peakHr: String(baseline + peakDelta),
      peakDelta: String(peakDelta),
      sustainedDelta: String(sustained),
      metThreshold: sustained >= 30,
      maxHrReached: String(baseline + peakDelta),
    });
  }

  /* --- everyday orthostatic events: frequent and severe early, rare later --- */
  const TRANSITIONS = ['Laying to standing', 'Sitting to standing', 'Climbing stairs'];
  const nEvents = w < 0.25 ? 3 : w < 0.5 ? 2 : w < 0.75 ? 1 : rand() < 0.45 ? 1 : 0;
  for (let e = 0; e < nEvents; e++) {
    const transition = TRANSITIONS[Math.floor(rand() * TRANSITIONS.length)];
    const before = Math.round(jit(at(84, 62), 4));
    // Stairs always spike, whatever shape you're in.
    const rise = Math.round(jit(at(40, 13), 6)) + (transition === 'Climbing stairs' ? 12 : 0);
    const drop = Math.round(jit(at(4, 19), 4));
    readings.push({
      id: id('ortho', e + 1),
      type: 'orthostatic',
      time: hhmm(600 + Math.round(rand() * 700)),
      note: '',
      transition,
      beforeHr: String(before),
      afterHr: String(before + rise),
      hr1min: String(before + rise - drop),
    });
  }

  /* --- activities: pacing first, then movement the body can carry --- */
  const activities: Entry[] = [];
  const act = (type: string, mins: number, duration: number, n: number) => {
    activities.push({ id: id('act', n), type, time: hhmm(mins), note: '', duration: String(duration) });
  };
  if (w < 0.3) {
    if (rand() < 0.7) act('legsUp', 900, Math.round(jit(15, 6)), 1);
    if (rand() < 0.5) act('breathwork', 1200, Math.round(jit(10, 4)), 2);
  } else if (w < 0.6) {
    if (rand() < 0.8) act('breathwork', 540, Math.round(jit(12, 4)), 1);
    if (rand() < 0.6) act('walk', 990, Math.round(jit(18, 8)), 2);
  } else {
    if (rand() < 0.85) act('breathwork', 540, Math.round(jit(12, 4)), 1);
    if (rand() < 0.7) act('walk', 960, Math.round(jit(32, 12)), 2);
    if (rand() < 0.35) act(rand() < 0.5 ? 'yoga' : 'indoorBike', 1020, Math.round(jit(24, 8)), 3);
  }

  /* --- meds & supplements: the protocol, kept up most days --- */
  const meds: Entry[] = [];
  const med = (type: string, mins: number, amount: string, n: number) => {
    meds.push({ id: id('med', n), type, time: hhmm(mins), note: '', amount });
  };
  if (rand() < 0.95) med('magGlycinate', 1290, '400mg', 1);
  if (rand() < 0.9) med('quercetin', wake + 30, '500mg', 2);
  if (rand() < 0.85) med('vitD3', wake + 32, '5000 IU', 3);
  if (rand() < (w < 0.5 ? 0.8 : 0.45)) med('lmnt', 660, '1 stick', 4);
  if (w < 0.45 && rand() < 0.5) med('melatonin', 1320, '1mg', 5);

  /* --- symptoms: the load that lifts as the month goes on --- */
  const symptoms: Entry[] = [];
  const SYMPTOM_POOL: [string, number][] = [
    ['fatigue', 0.95], ['brainFog', 0.85], ['lightHeaded', 0.7], ['palpitations', 0.6],
    ['pem', 0.5], ['coatHanger', 0.4], ['headache', 0.35], ['insomnia', 0.3],
  ];
  SYMPTOM_POOL.forEach(([type, prevalence], n) => {
    // Common early, thinning out fast as wellness climbs — a strong day logging
    // a stack of symptoms would contradict its own score.
    if (rand() < prevalence * Math.pow(1 - w, 1.6) * 1.5) {
      symptoms.push({
        id: id('sym', n + 1),
        type,
        time: hhmm(660 + Math.round(rand() * 600)),
        note: '',
        severity: String(Math.min(5, Math.max(1, Math.round(jit(at(4.4, 1.6), 1))))),
      });
    }
  });

  /* --- triggers & hydration --- */
  const TRIGGER_POOL = ['histamine', 'caffeine', 'largeMeal', 'stress', 'heat', 'overexertion', 'alcohol', 'prolongedStanding'];
  const triggers: Record<string, number> = {};
  // A dip day is usually a day something got past the protocol; the clean last
  // week has none at all, which is what keeps the streak alive.
  const nTrig = w < 0.35 ? 2 : w < 0.6 || DIPS[i] ? 1 : 0;
  for (let t = 0; t < nTrig; t++) {
    const key = TRIGGER_POOL[Math.floor(rand() * TRIGGER_POOL.length)];
    triggers[key] = (triggers[key] || 0) + 1;
  }

  /* --- digestion --- */
  const movements: Movement[] = [];
  if (rand() < 0.75) {
    movements.push({
      id: id('bm'),
      time: hhmm(wake + 40 + Math.round(rand() * 120)),
      kind: w < 0.4 ? (rand() < 0.5 ? 'Type 6' : 'Type 2') : 'Type 4',
      straining: w < 0.4 && rand() < 0.4 ? 'mild' : false,
    });
  }

  return {
    sleep,
    readings,
    activities,
    meds,
    symptoms,
    food: { water: r1(Math.max(0.5, jit(at(1.2, 3.3), 0.4))), calories: 0, triggers, meals: [] },
    digestion: { movements },
    notes: DEMO_NOTES[i] || '',
  };
}

/**
 * A few day notes scattered through the month. They only surface in the AI
 * report prompts, where a bare wall of numbers reads as less than a real
 * journal would.
 */
const DEMO_NOTES: Record<number, string> = {
  2: 'Rough one. Couldn\'t stand long enough to cook, heart rate went to 140 putting laundry away.',
  6: 'Third bad night in a row. Falling asleep is fine, staying asleep is not.',
  9: 'Started splitting water across the day instead of drinking it all at once. Small thing, felt steadier by evening.',
  12: 'Pushed too hard yesterday and paid for it today. Noting it so I stop pretending this is a coincidence.',
  16: 'Slept through the night for the first time in weeks. Woke up and actually wanted breakfast.',
  19: 'Big setback. Hot day, stood in a queue too long, was flat by 2pm.',
  22: 'Walked 30 minutes without needing to sit down. First time since this started.',
  25: 'Setback again after a stressful week at work. Less severe than the last one and I came out of it faster.',
  28: 'Best week yet. Still pacing, but the ceiling is clearly higher than it was a month ago.',
};

/* ---------- assembly ---------- */

let cache: { key: string; days: DaysMap } | null = null;

/**
 * The sample month, ending today. Cached per day key so a re-render doesn't
 * rebuild it and the charts keep referential stability.
 */
export function demoDays(): DaysMap {
  const key = todayKey();
  if (cache && cache.key === key) return cache.days;
  const rand = rng(0x5eed1a);
  const days: DaysMap = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < DEMO_DAYS; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - (DEMO_DAYS - 1 - i));
    days[keyOf(dt)] = demoDay(i, rand);
  }
  cache = { key, days };
  return days;
}

/**
 * The user's state with the sample month swapped in. Everything else (profile,
 * protocol, custom types) stays theirs, so the demo grades against the same
 * settings their real data will.
 */
export function demoState(s: AppState): AppState {
  return { ...s, days: demoDays() };
}
