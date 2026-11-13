/**
 * Marketing screenshot fixtures — DEV ONLY.
 *
 * Every shot in `marketing/screenshots/` is taken of the REAL app rendering a
 * REAL journal. Nothing here fakes a view: these functions only put a plausible
 * journal on disk, and the app then grades it, charts it and correlates it with
 * exactly the code a user's own data goes through. That is the whole point — a
 * composited screenshot drifts from the product the moment the product moves,
 * and a graded number that was typed in rather than computed is a claim we
 * cannot stand behind.
 *
 * The history itself comes from `lib/demo.ts`, which is already a deterministic
 * 60-day recovery arc (crash days, a climb, a green plateau, a supplement onset
 * in the middle) asserted by tests through the real scoring and insights
 * engines. We write it in as the user's OWN data rather than letting Progress
 * fall back to it, because the demo fallback wears a banner.
 *
 * Nothing in this file is reachable from a release build (see ShotDriver).
 */
import { demoDays, DEMO_DAYS } from '../lib/demo';
import { addDays, keyOf, todayKey } from '../lib/dates';
import type { AppState, DayLoad, DayRecord } from '../lib/types';
import type { DaysMap } from '../lib/scoring/day';
import { getState, replaceState } from '../store/store';

export type FixtureName =
  | 'arc'        // 60 days ending on a settled green day
  | 'arcAhead'   // same, but today is running ahead of pace (gold)
  | 'arcOver'    // same, but today's measured load has run past the ceiling (red)
  | 'arcCrash'   // same history, with the last few days sliding into a crash
  | 'early'      // ten days in: enough to see, not enough to conclude
  | 'fresh';     // onboarded, nothing logged

/** Seeded PRNG, so a fixture is byte-identical between runs and two shots of
 *  the same fixture can never disagree about a number. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A day's measured pacing load.
 *
 * `lib/demo.ts` predates the pacing budget and writes no `load`, so a demo
 * journal reads as "logged activities only" and the budget strip — four of the
 * core shots and the thing nothing else on the store does — has nothing to
 * draw. This synthesises what a watch would have recorded: steps, walking and
 * standing minutes, and the heart-rate minutes split by how far above the
 * user's own exertion line they sat.
 *
 * It is derived from the day's own wellness so the two agree: a crash day is
 * not also a 12,000-step day. `heavy` is what pushes a day past its ceiling.
 */
function loadFor(w: number, rand: () => number, heavy: 0 | 1 | 2 = 0): DayLoad {
  const jit = (v: number, spread: number) => v + (rand() - 0.5) * spread;
  // A better day moves more, up to a point: this population's good days are
  // measured in hundreds of steps, not a marathon.
  const steps = Math.round(clamp(jit(1400 + w * 5200, 900), 420, 9800) * [1, 1.9, 2.8][heavy]);
  const walkingMin = Math.round(clamp(steps / 95, 8, 190));
  const standMin = Math.round(clamp(jit(40 + w * 120, 25), 12, 300));
  const stillUprightMin = Math.round(clamp(jit(35 + w * 90, 30), 10, 260));
  const lineBpm = Math.round(jit(96, 4));
  // Three bands: just over the line, well over, hard. A real day is mostly the
  // first, which is why the ceiling is reached by accumulation rather than by
  // one workout — the thing pacing exists to make visible.
  // `heavy` is the state being photographed, not a mood: 1 lands the day just
  // short of its ceiling (gold, "running out around 8:29pm") and 2 takes it
  // past (red, the ember). Both are reached by ACCUMULATION — a long errand, a
  // walk, a strength session — rather than by one implausible workout, because
  // accumulation is what the budget exists to make visible.
  const over = heavy === 2 ? jit(190, 18) : heavy === 1 ? jit(74, 14) : jit(6 + w * 26, 10);
  const hrBands = [
    Math.round(clamp(over * 0.62, 0, 400)),
    Math.round(clamp(over * 0.27, 0, 400)),
    Math.round(clamp(over * 0.11, 0, 400)),
  ];
  const hrAboveMin = hrBands[0] + hrBands[1] + hrBands[2];
  const hrBelowMin = Math.round(clamp(jit(210 + w * 120, 60), 40, 560));
  const stretches = hrAboveMin === 0 ? 0 : Math.max(1, Math.round(hrAboveMin / jit(13, 5)));
  const startMin = Math.round(jit(markerHour(w) * 60, 70));
  // Hourly bars for the two drill-ins. Weighted toward the middle of the day:
  // nobody in this population front-loads a morning.
  const shape = [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 8, 7, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const spread = (total: number) => {
    const sum = shape.reduce((a, b) => a + b, 0);
    return shape.map((n) => Math.round((total * n) / sum));
  };
  return {
    steps,
    stepsVersion: 2,
    walkingMin,
    standMin,
    stillUprightMin,
    stillFloorBpm: Math.round(jit(82, 3)),
    uprightSpans: null,
    uprightByHour: { walk: spread(walkingMin), still: spread(stillUprightMin), stand: spread(standMin) },
    hrBelowByHour: spread(hrBelowMin),
    hrAboveMin,
    hrBands,
    hrBelowMin,
    hrCoverageMin: Math.round(clamp(jit(760, 90), 420, 900)),
    hrSampleGapMin: 6,
    pricedVersion: 2,
    hrStretches: stretches,
    longestStretch: hrAboveMin === 0 ? null
      : { startMin, endMin: startMin + Math.max(6, Math.round(hrAboveMin / Math.max(1, stretches) * 1.6)) },
    peakBpm: Math.round(jit(heavy ? 138 : 104 + w * 18, 8)),
    lineBpm,
    readAt: null,
  };
}

const markerHour = (w: number) => 10 + w * 4;

/** The day keys of the generated history, oldest first. */
function keysOf(days: DaysMap): string[] {
  return Object.keys(days).sort();
}

/**
 * Attach a measured load to each day, and stamp `readAt` at the end of the day
 * so a finished day is SEALED (the strip then speaks in the past tense, which
 * is a different set of copy and worth its own shot).
 */
function withLoad(days: DaysMap, heavyToday: 0 | 1 | 2): DaysMap {
  const rand = rng(0x10ad5);
  const ks = keysOf(days);
  const out: DaysMap = {};
  const today = todayKey();
  ks.forEach((k, i) => {
    const d = days[k];
    // Wellness re-read off the day's own score inputs rather than recomputed:
    // position in the arc is the honest proxy and keeps the two in step.
    const w = clamp(i / Math.max(1, ks.length - 1), 0.05, 0.95);
    const load = loadFor(w, rand, k === today ? heavyToday : 0);
    out[k] = { ...d, load: { ...load, readAt: k === today ? null : `${k}T23:12:00.000Z` } };
  });
  return out;
}

/** Push the last `n` days of the arc back down to its crash-era values, so the
 *  journal ends in a slide the downturn detector genuinely fires on. */
function endInCrash(days: DaysMap, n = 4): DaysMap {
  const ks = keysOf(days);
  const out: DaysMap = { ...days };
  for (let j = 0; j < n; j++) {
    const target = ks[ks.length - 1 - j];
    // Day 2..6 of the generated arc are its worst; map the tail onto them in
    // order so the slide reads as a slide rather than as one bad morning.
    const source = ks[Math.max(0, 3 - j)];
    const src = days[source];
    if (!src || !target) continue;
    out[target] = reDate(src, target);
  }
  return out;
}

/** Copy a generated day onto another date, keeping entry ids unique. */
function reDate(d: DayRecord, dk: string): DayRecord {
  const fix = (arr: DayRecord['readings']) =>
    (arr || []).map((e) => ({ ...e, id: `${dk}-${e.id}` }));
  return {
    ...d,
    readings: fix(d.readings),
    activities: fix(d.activities),
    meds: fix(d.meds),
    symptoms: fix(d.symptoms),
  };
}

/**
 * Trim today back to the morning.
 *
 * The status bar in every shot reads 9:41, so a today holding an evening HRV
 * reading and an evening dose is a day that has not happened yet — and the
 * Outlook card notices: it retitles itself "Reflectance" once an evening
 * reading lands, which is correct behaviour and the wrong frame for a morning
 * screenshot. Dropping the later entries is the honest fix; everything
 * downstream (the score, the grade, the guidance) is then recomputed for the
 * day as it actually stands.
 */
function morningOnly(d: DayRecord): DayRecord {
  // READINGS only. The title flips on an evening READING, and stripping the
  // rest of the day's entries with it left the Medications and Symptoms
  // sections empty on the one shot that exists to show them full.
  return { ...d, readings: (d.readings || []).filter((e) => !e.time || e.time < '11:30') };
}

/**
 * The first `n` days of the arc, re-dated so the newest lands on today.
 *
 * Not the LAST n, which is what this did first: the tail of the arc is the
 * green plateau, so a journal meant to read as "ten days in" came out as a
 * recovered person with a short history. The beginning of the arc is what a
 * new user's first fortnight actually looks like.
 */
function firstDaysEndingToday(days: DaysMap, n: number): DaysMap {
  const ks = keysOf(days);
  const out: DaysMap = {};
  const src = ks.slice(0, n);
  src.forEach((k, i) => {
    const dk = addDays(todayKey(), -(src.length - 1 - i));
    out[dk] = reDate(days[k], dk);
  });
  return out;
}

/**
 * The person the shots are of.
 *
 * A profile is not decoration here: age and sex recenter the baseline RMSSD
 * ladder (`rmssdBaselineEdges`), so the grades in every screenshot are the
 * grades this person would actually see. 38F sits close enough to the 35-44
 * reference decade that the ladder is near its shipped values, which is the
 * honest default to market against.
 */
const PROFILE = { sex: 'Female', birthday: '1988-03-14', weight: '141', height: '66' };

export function buildFixture(name: FixtureName): AppState {
  const base = JSON.parse(JSON.stringify(getState())) as AppState;
  const now = new Date().toISOString();
  base.profile = { ...PROFILE };
  // Deliberately NOT `healthEnabled`. Turning it on makes the app's quiet
  // import check run on the next foreground, which raises the HealthKit
  // permission sheet — a system modal nothing in this harness can dismiss, and
  // it lands on top of every shot. The pacing load these fixtures need is
  // written into the journal directly instead.
  base.settings = { ...base.settings, theme: 'dark', units: 'imperial', healthEnabled: false };
  base.meta = { ...base.meta, onboarded: now, lastUpdated: now, lastImport: null };
  base.bodyTemp = base.bodyTemp || {};

  if (name === 'fresh') {
    base.days = {};
    return base;
  }
  let days = JSON.parse(JSON.stringify(demoDays())) as DaysMap;
  if (name === 'arcCrash') days = endInCrash(days);
  if (name === 'early') days = firstDaysEndingToday(days, 10);
  days = withLoad(days, name === 'arcOver' ? 2 : name === 'arcAhead' ? 1 : 0);
  const tk = todayKey();
  if (days[tk]) days[tk] = morningOnly(days[tk]);
  base.days = days;
  return base;
}

/** Write a fixture to disk through the app's own import path, so it is graded,
 *  migrated and persisted exactly as a user's imported journal would be. */
export function applyFixture(name: FixtureName) {
  replaceState(buildFixture(name));
}

export const FIXTURE_DAYS = DEMO_DAYS;
export { addDays, keyOf };
