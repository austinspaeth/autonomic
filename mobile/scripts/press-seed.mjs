/**
 * Press-kit seed journal — three months of realistic data, ending today.
 *
 * Why a script and not `src/lib/demo.ts`: the demo month is product surface
 * (30 days, shipped in the bundle, shown behind a banner on an empty journal).
 * This is a screenshot fixture — 90 days, generated on demand, imported like any
 * other export.json, and never compiled into the app.
 *
 * The arc is the story the press kit tells:
 *   Month 1 (days 0-29)   Abysmal and FLAT. No trend, because there wasn't one.
 *                         A handful of days claw up near the yellow band and
 *                         fall straight back. This is the "before".
 *   Month 2 (days 30-59)  Quercetin + H1/H2 blockers start on day 30. The line
 *                         finally turns up, slowly, with four real setbacks
 *                         where a trigger got past the protocol.
 *   Month 3 (days 60-89)  Protocol tightens. Steady climb into the green, a few
 *                         small wobbles, then a strong finish — the last 11 days
 *                         are a clean streak (no triggers, 3 L water, 8 h sleep,
 *                         all four protocol meds), which is what puts the streak
 *                         card in a screenshot-worthy state.
 *
 * Everything is derived from one `wellness` value per day, so sleep, HRV, BP,
 * orthostatic response, symptom load and trigger count all move together — a
 * day never brags a 90 score while logging five symptoms.
 *
 * Metrics use the same interpolation ranges as src/lib/demo.ts (which is
 * unit-tested against the real scoring engine), so the wellness -> score-band
 * mapping is known-good rather than guessed. Baevsky/Kubios composites are
 * derived with the same formulas the live HRV pipeline uses.
 *
 * Entry `scores` are deliberately omitted: nothing reads them off a stored
 * entry, the app recomputes with computeScores() on render.
 *
 *   node scripts/press-seed.mjs [--out path] [--days 90]
 */
import { writeFileSync } from 'node:fs';

/* ---------- deterministic noise (mulberry32, same as demo.ts) ---------- */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 90;
const M2 = 30; // quercetin / MCAS stack starts here
const M3 = 60;
const STREAK_FROM = DAYS - 11; // last 11 days are protocol-clean

/** Setbacks, as wellness knocked off the underlying curve. */
const DIPS = {
  // month 1 is flat and grim; these are just the worse-than-usual days
  3: 0.04, 9: 0.05, 17: 0.03, 24: 0.05,
  // month 2 — real setbacks after the trend turns
  36: 0.13, 41: 0.17, 47: 0.10, 54: 0.19, 57: 0.07,
  // month 3 — smaller, and recovered from faster
  64: 0.11, 71: 0.14, 76: 0.06,
};
/** Softer days inside the closing streak — clean, but not peak. */
const LATE_WOBBLE = { 81: 0.15, 86: 0.08 };

/** Days that claw up toward yellow in month 1 and fall straight back. */
const M1_BETTER = { 6: 0.15, 13: 0.18, 21: 0.14, 27: 0.17 };

/** Wellness for day i, roughly 0..1. */
function wellness(i, jitter) {
  let base;
  if (i < M2) base = 0.085 + (M1_BETTER[i] || 0);            // flat, no trend
  else if (i < M3) base = 0.15 + (i - M2) * 0.0115;          // 0.15 -> 0.48
  else base = 0.51 + (i - M3) * 0.0125;                      // 0.51 -> 0.87
  let w = base - (DIPS[i] || 0) + (jitter - 0.5) * 0.075;
  if (i >= STREAK_FROM) w = Math.max(w, 0.72);               // the strong finish
  // ...but a clean day is not automatically a great one. Two of the streak days
  // wobble, so the last week reads like a person and not a flat ceiling.
  w -= LATE_WOBBLE[i] || 0;
  return Math.min(0.97, Math.max(0.02, w));
}

/* ---------- helpers ---------- */
const hhmm = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Baevsky histogram + Kubios PNS/SNS, derived exactly as src/lib/hrv does. */
function hrvExtra(sdnn, meanRr, rmssd, hr, amo50, mxdmn) {
  const mode = Math.round(meanRr / 50) * 50;
  const cv = (sdnn / meanRr) * 100;
  const moSec = mode / 1000;
  const stressIndex = moSec > 0 && mxdmn > 0 ? amo50 / (2 * moSec * mxdmn) : 0;
  const sd1 = rmssd / Math.SQRT2;
  const z = (x, m, s) => (x - m) / s;
  const pns = (z(meanRr, 900, 110) + z(rmssd, 42, 20) + z(sd1, 30, 14)) / 3;
  const sns = (z(hr, 67, 10) + z(stressIndex, 90, 45) - z(rmssd, 42, 20)) / 3;
  return {
    mode: String(mode),
    cv: String(Number(cv.toFixed(1))),
    amo50: String(Math.round(amo50)),
    mxdmn: String(Number(mxdmn.toFixed(3))),
    stressIndex: String(Math.round(stressIndex)),
    pns: String(Number(pns.toFixed(1))),
    sns: String(Number(sns.toFixed(1))),
  };
}

/* ---------- one day ---------- */
function makeDay(i, rand) {
  const w = wellness(i, rand());
  const at = (lo, hi) => lo + (hi - lo) * w;
  const jit = (v, spread) => v + (rand() - 0.5) * spread;
  const onStack = i >= M2;            // quercetin + H1/H2 blockers
  const clean = i >= STREAK_FROM;     // must satisfy every protocol criterion

  /* --- sleep: later, broken nights -> earlier, longer, staged --- */
  let dur = jit(at(5.0, 8.4), 0.5);
  if (clean) dur = Math.max(dur, 8.15);        // protocol needs 8 h or more
  const bedMin = 1080 + Math.round(jit(at(468, 282), 40)); // minutes past 18:00
  const wakeMin = bedMin + Math.round(dur * 60);
  const hrLow = Math.round(jit(at(79, 53), 3));
  const hrHigh = Math.round(jit(at(112, 83), 5));
  const sleep = {
    bed: hhmm(bedMin),
    wake: hhmm(wakeMin),
    quality: w < 0.4 ? 'interrupted' : 'good',
    hrLow: String(hrLow),
    hrHigh: String(hrHigh),
  };
  // Most nights come off the watch, so they carry stages.
  if (rand() < 0.8) {
    const total = Math.round(dur * 60);
    const awake = Math.round(jit(at(46, 15), 8));
    const asleep = Math.max(60, total - awake);
    const deep = Math.round(asleep * jit(at(0.07, 0.17), 0.02));
    const rem = Math.round(asleep * jit(at(0.13, 0.23), 0.03));
    sleep.stages = { deep, rem, core: Math.max(0, asleep - deep - rem), awake: Math.max(0, awake) };
  }

  const wake = wakeMin % 1440;
  const readings = [];
  const id = (kind, n = 0) => `seed-${i}-${kind}${n ? `-${n}` : ''}`;

  /* --- HRV: a paced-breathing reading plus a baseline one --- */
  const hrvPair = (slot, mins, n) => {
    const total = jit(at(560, 4300), 260);
    const vlf = Math.round(total * at(0.6, 0.06));
    const lf = Math.round(total * at(0.25, 0.6));
    const hf = Math.max(60, Math.round(total) - vlf - lf);
    const bias = slot === 'Evening' ? -0.9 : 0;

    const sSdnn = Math.round(jit(at(26, 68), 4));
    const sHr = Math.round(jit(at(80, 58), 3) - bias);
    const sMeanRr = Math.round(jit(at(760, 1010), 25));
    const sRmssd = r2(jit(at(13.5, 39) + bias, 2.5));
    const sAmo50 = jit(at(60, 26), 5);
    const sMxdmn = Math.max(0.05, jit(at(0.11, 0.46), 0.03));
    readings.push({
      id: id(`breath-${n}`), type: 'breathHrv', time: hhmm(mins), note: '',
      style: '4/6', period: slot, source: 'polar', durationSec: 300,
      sdnn: String(sSdnn), hr: String(sHr), meanRr: String(sMeanRr), rmssd: String(sRmssd),
      pnn50: String(Math.round(Math.max(0, jit(at(0.8, 17), 3)))),
      ...hrvExtra(sSdnn, sMeanRr, sRmssd, sHr, sAmo50, sMxdmn),
      vlowPower: String(vlf), lowPower: String(lf), highPower: String(hf),
      lfPeak: String(r2(jit(at(0.04, 0.096), 0.008))),
      hfPeak: String(r2(jit(at(0.21, 0.165), 0.02))),
    });

    const uSdnn = Math.round(jit(at(22, 56), 4));
    const uHr = Math.round(jit(at(82, 60), 3) - bias);
    const uMeanRr = Math.round(jit(at(745, 990), 25));
    const uRmssd = r2(jit(at(11.5, 35.5) + bias, 2.5));
    const uAmo50 = jit(at(62, 28), 5);
    const uMxdmn = Math.max(0.05, jit(at(0.1, 0.42), 0.03));
    readings.push({
      id: id(`hrv-${n}`), type: 'hrv', time: hhmm(mins + 6), note: '',
      period: slot, source: 'polar', durationSec: 300,
      sdnn: String(uSdnn), avgHr: String(uHr), meanRr: String(uMeanRr), rmssd: String(uRmssd),
      pnn50: String(Math.round(Math.max(0, jit(at(0.5, 14), 3)))),
      ...hrvExtra(uSdnn, uMeanRr, uRmssd, uHr, uAmo50, uMxdmn),
      vlowPower: String(Math.round(vlf * 0.9)), lowPower: String(Math.round(lf * 0.28)),
      highPower: String(Math.round(hf * 1.1)),
      lfPeak: String(r2(jit(at(0.05, 0.12), 0.02))),
      hfPeak: String(r2(jit(at(0.22, 0.19), 0.03))),
    });
  };
  hrvPair('Morning', wake + 25 + Math.round(rand() * 20), 1);
  if (rand() < 0.6) hrvPair('Evening', 1230 + Math.round(rand() * 50), 2);

  /* --- blood pressure: low and narrow early, filling out later --- */
  const bp = (slot, mins, n) => {
    readings.push({
      id: id(`bp-${n}`), type: 'bp', time: hhmm(mins), note: '', period: slot,
      sys: String(Math.round(jit(at(97, 116), 5))),
      dia: String(Math.round(jit(at(58, 75), 4))),
      pulse: String(Math.round(jit(at(88, 61), 4))),
    });
  };
  bp('Morning', wake + 15, 1);
  if (rand() < 0.6) bp('Evening', 1260 + Math.round(rand() * 40), 2);

  if (rand() < 0.75) {
    readings.push({
      id: id('rhr'), type: 'restingHr', time: hhmm(wake + 8), note: '',
      hr: String(Math.round(jit(at(90, 58), 3))), position: 'Laying',
    });
  }

  /* --- the guided stand test, every few days --- */
  if (i % 5 === 2) {
    const baseline = Math.round(jit(at(82, 57), 3));
    const sustained = Math.round(jit(at(45, 11), 4));
    const peakDelta = sustained + Math.round(jit(at(14, 7), 3));
    readings.push({
      id: id('stand'), type: 'standTest', time: hhmm(wake + 50), note: '',
      baselineHr: String(baseline), peakHr: String(baseline + peakDelta),
      peakDelta: String(peakDelta), sustainedDelta: String(sustained),
      metThreshold: sustained >= 30, maxHrReached: String(baseline + peakDelta),
    });
  }

  /* --- everyday orthostatic events --- */
  const TRANSITIONS = ['Laying to standing', 'Sitting to standing', 'Climbing stairs'];
  const nEvents = w < 0.25 ? 3 : w < 0.5 ? 2 : w < 0.75 ? 1 : rand() < 0.4 ? 1 : 0;
  for (let e = 0; e < nEvents; e++) {
    const transition = TRANSITIONS[Math.floor(rand() * TRANSITIONS.length)];
    const before = Math.round(jit(at(84, 61), 4));
    const rise = Math.round(jit(at(41, 12), 6)) + (transition === 'Climbing stairs' ? 12 : 0);
    const drop = Math.round(jit(at(4, 19), 4));
    readings.push({
      id: id('ortho', e + 1), type: 'orthostatic', time: hhmm(600 + Math.round(rand() * 700)), note: '',
      transition, beforeHr: String(before), afterHr: String(before + rise),
      hr1min: String(before + rise - drop),
    });
  }

  /* --- activities: pacing first, then movement the body can carry --- */
  const activities = [];
  const act = (type, mins, duration, n) =>
    activities.push({ id: id('act', n), type, time: hhmm(mins), note: '', duration: String(duration) });
  if (w < 0.3) {
    if (rand() < 0.75) act('legsUp', 900, Math.round(jit(14, 6)), 1);
    if (rand() < 0.5) act('breathwork', 1200, Math.round(jit(10, 4)), 2);
  } else if (w < 0.6) {
    if (rand() < 0.85) act('breathwork', 540, Math.round(jit(12, 4)), 1);
    if (rand() < 0.65) act('walk', 990, Math.round(jit(19, 8)), 2);
    if (rand() < 0.25) act('legsUp', 900, Math.round(jit(12, 5)), 3);
  } else {
    if (rand() < 0.9) act('breathwork', 540, Math.round(jit(12, 4)), 1);
    if (rand() < 0.8) act('walk', 960, Math.round(jit(34, 12)), 2);
    if (rand() < 0.4) act(rand() < 0.5 ? 'yoga' : 'indoorBike', 1020, Math.round(jit(25, 8)), 3);
    if (w > 0.85 && rand() < 0.3) act('strength', 1050, Math.round(jit(22, 6)), 4);
  }

  /* --- meds & supplements: the protocol the story turns on --- */
  const meds = [];
  const med = (type, mins, amount, n) =>
    meds.push({ id: id('med', n), type, time: hhmm(mins), note: '', amount });
  // Adherence climbs as the protocol starts working; perfect on streak days.
  const p = (base) => (clean ? 1 : onStack ? base : base * 0.75);
  if (rand() < p(0.95)) med('magGlycinate', 1290, '400mg', 1);
  if (rand() < 0.85) med('vitD3', wake + 32, '5000 IU', 2);
  if (onStack) {
    if (rand() < p(i < M3 ? 0.8 : 0.97)) med('quercetin', wake + 30, '500mg', 3);
    if (rand() < p(i < M3 ? 0.78 : 0.96)) med('allegra', wake + 30, '180mg', 4);
    if (rand() < p(i < M3 ? 0.75 : 0.95)) med('pepsidAc', wake + 31, '20mg', 5);
  }
  if (rand() < (w < 0.5 ? 0.8 : 0.45)) med('lmnt', 660, '1 stick', 6);
  if (w < 0.45 && rand() < 0.5) med('melatonin', 1320, '1mg', 7);

  /* --- symptoms: the load that lifts --- */
  const symptoms = [];
  const POOL = [
    ['fatigue', 0.95], ['brainFog', 0.88], ['lightHeaded', 0.72], ['palpitations', 0.62],
    ['pem', 0.52], ['coatHanger', 0.42], ['headache', 0.36], ['insomnia', 0.32],
    ['flushing', 0.3], ['nausea', 0.25],
  ];
  POOL.forEach(([type, prevalence], n) => {
    if (rand() < prevalence * Math.pow(1 - w, 1.6) * 1.5) {
      symptoms.push({
        id: id('sym', n + 1), type, time: hhmm(660 + Math.round(rand() * 600)), note: '',
        severity: String(Math.min(5, Math.max(1, Math.round(jit(at(4.4, 1.6), 1))))),
      });
    }
  });

  /* --- triggers & hydration --- */
  const TRIGGERS = ['histamine', 'caffeine', 'largeMeal', 'stress', 'heat', 'overexertion', 'alcohol', 'prolongedStanding', 'agedCheese', 'sugar'];
  const triggers = {};
  // A setback day is a day something got past the protocol. Streak days: none.
  const nTrig = clean ? 0 : w < 0.3 ? 2 : w < 0.55 || DIPS[i] ? 1 : rand() < 0.25 ? 1 : 0;
  for (let t = 0; t < nTrig; t++) {
    const k = TRIGGERS[Math.floor(rand() * TRIGGERS.length)];
    triggers[k] = (triggers[k] || 0) + 1;
  }
  let water = r1(Math.max(0.5, jit(at(1.2, 3.4), 0.4)));
  if (clean) water = Math.max(water, r1(3 + rand() * 0.6)); // protocol needs 3 L

  /* --- digestion --- */
  const movements = [];
  if (rand() < 0.75) {
    movements.push({
      id: id('bm'), time: hhmm(wake + 40 + Math.round(rand() * 120)),
      kind: w < 0.4 ? (rand() < 0.5 ? 'Type 6' : 'Type 2') : 'Type 4',
      straining: w < 0.4 && rand() < 0.4 ? 'mild' : false,
    });
  }

  return {
    sleep, readings, activities, meds, symptoms,
    food: { water, calories: 0, triggers, meals: [] },
    digestion: { movements },
    notes: NOTES[i] || '',
  };
}

/** Day notes. They carry the narrative into the AI report prompts. */
const NOTES = {
  1: 'Another flat day. Heart rate hit 138 carrying laundry up one flight. Had to sit on the stairs.',
  6: 'Better morning, thought I\'d turned a corner, then crashed by 3pm. Same as every other time.',
  12: 'Three months of this now. Nothing I change seems to move anything.',
  17: 'Couldn\'t stand long enough to cook. Ate crackers in bed.',
  24: 'Cardiology says the workup is clean. Clean isn\'t the same as fine.',
  29: 'A full month of logging. Looking back at it, there is no trend here at all. Starting quercetin + H1/H2 tomorrow.',
  30: 'Day 1 on quercetin 500mg, Allegra and Pepcid. Nothing to report yet, just marking the start.',
  36: 'Setback. Aged cheese at dinner, flushed and tachy within the hour. Noting it properly this time.',
  41: 'Bad one. Hot day, stood in a queue too long, flat by 2pm.',
  45: 'Two weeks in on the stack. Mornings are noticeably less awful. Still pacing everything.',
  47: 'Pushed too hard yesterday and paid for it. At least I can see the pattern now instead of guessing.',
  52: 'Slept through the night for the first time in months. Woke up and actually wanted breakfast.',
  54: 'Stressful week caught up with me. Worse day since starting the stack, but I came out of it in two days instead of ten.',
  59: 'End of month two. The line is finally pointing up. Tightening up water and sleep from here.',
  60: 'Cleaning up the protocol properly: 3 L water, in bed by 10:30, no exceptions on the stack.',
  64: 'Small dip after a late night. Recovered by the next morning, which would have taken a week in May.',
  68: 'Walked 30 minutes without needing to sit down. First time since this started.',
  71: 'Setback, but a shallow one. Back to baseline inside 48 hours.',
  78: 'First genuinely green week. Stand test barely registered.',
  83: 'Strength work back in the rotation, carefully. No PEM the next day.',
  86: 'Best stretch since I got sick. Still pacing, but the ceiling is a long way above where it was.',
  89: 'Three months of data. Month one is flat as a board, and everything after quercetin is a different chart.',
};

/* ---------- assembly ---------- */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const nDays = Number(arg('--days', DAYS));
const out = arg('--out', 'press-seed.json');

const rand = rng(0x9e3779b1);
const days = {};
const today = new Date();
today.setHours(0, 0, 0, 0);
for (let i = 0; i < nDays; i++) {
  const dt = new Date(today);
  dt.setDate(today.getDate() - (nDays - 1 - i));
  days[keyOf(dt)] = makeDay(i, rand);
}

const state = {
  version: 1,
  settings: {
    theme: 'dark',
    healthEnabled: true,
    lastBleDeviceId: 'B8CBE3B6-963B-7F80-190C-13A22ED37005',
    lastBleDeviceName: 'Polar H10 DDE3C823',
    lastHrvSource: 'polar',
    reminder: { enabled: true, time: '08:00' },
    protocol: {
      triggers: { enabled: true, types: [] },
      water: { enabled: true, liters: 3 },
      meds: { enabled: true, types: ['allegra', 'pepsidAc', 'magGlycinate', 'quercetin'] },
      activities: { enabled: false, types: [] },
      sleep: { enabled: true, hours: 8 },
    },
  },
  profile: { sex: 'Male', birthday: '1988-08-21', weight: '185.4', height: '70' },
  customTypes: {},
  hiddenTypes: {},
  meta: { lastUpdated: new Date().toISOString(), lastImport: null },
  days,
};

writeFileSync(out, JSON.stringify(state, null, 1));
const ks = Object.keys(days).sort();
console.log(`wrote ${out}: ${ks.length} days, ${ks[0]} -> ${ks[ks.length - 1]}`);
