/**
 * Finding retention (../stability): strict to enter the report, looser to stay.
 *
 * The property under test is hysteresis. A finding that once passed the full
 * strict bar (BH at FDR_Q + the clinical filters) must not vanish because the
 * BH family re-formed around it, so a retained id is re-admitted while its raw
 * p stays at or under RETAIN_P — and NOTHING enters at the loose bar without
 * having been shown first, which is what keeps the noise suite's guarantee.
 *
 * The correlation fixtures ride the effect-size dial: the same journal at
 * different planted effects lands on known sides of the two thresholds
 * (measured once, then pinned — the PRNG is deterministic).
 */
import { addDays } from '../../dates';
import type { AppState, DayRecord, Entry } from '../../types';
import type { ScoreContext } from '../../scoring';
import { findBiggestChange } from '../change';
import { findCorrelations } from '../correlate';
import { buildFactors, type FactorDef } from '../factors';
import { buildDayMatrix, type DayMatrix } from '../matrix';
import { mannWhitney } from '../stats';
import { RETAIN_P, emptyFindingMemory, nextFindingMemory, normalizeFindingMemory, sameFindingMemory } from '../stability';
import { computeInsights, resetInsightsCache } from '../cache';
import { findingMemory, noteFindingsShown, resetFindingMemory } from '../findingMemory';
import { INSIGHT_OUTCOMES, keyRange } from '../../trends';

/* ---------- fixtures (the shape ./insights.test.ts uses) ---------- */

const DK = '2026-06-30';

const blank = (): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
});

let uid = 0;
const nextId = () => `e${++uid}`;

const hrv = (rmssd: number): Entry => ({
  id: nextId(), type: 'hrv', time: '08:00',
  rmssd: String(rmssd), sdnn: String(Math.round(rmssd * 1.4)), pnn50: String(Math.round(rmssd / 4)),
});

const med = (type: string): Entry => ({ id: nextId(), type, time: '08:00', amount: '400' });

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function journal(n: number, fn: (i: number, dk: string) => DayRecord | null): AppState {
  const keys = keyRange(DK, n, addDays);
  const days: Record<string, DayRecord> = {};
  keys.forEach((k, i) => { const d = fn(i, k); if (d) days[k] = d; });
  return {
    version: 1,
    settings: { theme: 'dark' },
    profile: { sex: '', birthday: '', weight: '', height: '' },
    meta: { lastUpdated: '2026-06-30T12:00:00.000Z', lastImport: null },
    days,
  } as AppState;
}

function matrixOf(state: AppState, n = 120) {
  const keys = keyRange(DK, n, addDays);
  const defs = buildFactors(state, keys);
  return buildDayMatrix(state, keys, INSIGHT_OUTCOMES, defs, {});
}

/** Magnesium on alternating days, RMSSD `eff` higher on those days under 20 of
 *  jitter. The dial the retention tests turn. */
const planted = (eff: number) => {
  const r = rng(99);
  return journal(120, (i) => {
    const d = blank();
    const took = i % 2 === 0;
    d.readings = [hrv(Math.round((took ? 30 + eff : 30) + r() * 20))];
    if (took) d.meds.push(med('magGlycinate'));
    d.meds.push(med('vitD3'));
    return d;
  });
};

const MAG_RMSSD = 'med:magGlycinate|rmssd|0';

/* ---------- correlation retention ---------- */

describe('correlation retention', () => {
  it('re-admits a remembered finding that slipped below the strict bar but stays plausible', () => {
    // eff=1.6 measured: raw p ≈ 0.04 (≤ RETAIN_P), |r| ≈ 0.22 (≥ MIN_EFFECT),
    // but the BH family kills it — exactly the flapping case.
    const m = matrixOf(planted(1.6));
    expect(findCorrelations(m)).toEqual([]);
    const held = findCorrelations(m, { retain: [MAG_RMSSD] });
    expect(held.map((c) => c.id)).toEqual([MAG_RMSSD]);
    // Its confidence is computed from THIS build's q, so it honestly sags.
    expect(held[0].pips).toBeLessThanOrEqual(3);
  });

  it('does not re-admit below the clinical effect floor, however plausible the p', () => {
    // eff=1.4 measured: raw p ≈ 0.066 (still ≤ RETAIN_P) but |r| ≈ 0.19 —
    // retention loosens the STATISTICAL bar only, never the clinical ones.
    const m = matrixOf(planted(1.4));
    expect(findCorrelations(m, { retain: [MAG_RMSSD] })).toEqual([]);
  });

  it('drops a remembered finding once its raw p drifts past RETAIN_P', () => {
    // eff=1.2 measured: raw p ≈ 0.105 — the finding has dissolved and must go.
    const m = matrixOf(planted(1.2));
    expect(findCorrelations(m, { retain: [MAG_RMSSD] })).toEqual([]);
  });

  it('admits nothing that was never shown', () => {
    // The retain list names findings the user has already seen; an id that was
    // never in a report is not in the list, so a fresh sweep is exactly the
    // strict sweep. (Same matrix as the re-admit case, no memory.)
    expect(findCorrelations(matrixOf(planted(1.6)))).toEqual([]);
  });
});

/* ---------- biggest-change retention ---------- */

describe('biggest-change retention', () => {
  /**
   * A hand-crafted matrix, because the band between "fails BH at CHANGE_FDR_Q"
   * and "raw p ≤ RETAIN_P" only opens when the family is large enough to dilute
   * the correction, and steering a whole journal fixture onto that ledge is
   * fragile. Here the family is exact: one real onset among junk outcomes.
   */
  const craft = (): DayMatrix => {
    const total = 40;
    const keys = keyRange(DK, total, addDays);
    const factor = {
      id: 'med:test', label: 'Test med', driver: 'Test med', subject: 'Test med days',
      onsetNoun: 'test med', group: 'supplement', kind: 'binary', lags: [0], blocks: [],
      value: () => null,
    } as unknown as FactorDef;
    // Known-absent for 20 days, then present for 20 — a clean onset at i=20.
    const col = keys.map((_, i) => (i < 20 ? 0 : 1));

    // The real outcome: a modest step at the onset. Deterministic sawtooth
    // jitter so the two windows overlap without being separable.
    const saw = (i: number) => (i * 7) % 10;
    // Step of 2 against a 10-wide sawtooth, measured: raw p ≈ 0.05 and r ≈ 0.36
    // on the 20/20 split — inside the band the whole suite is about.
    const rmssd = keys.map((_, i) => 30 + saw(i) + (i >= 20 ? 2 : 0));
    // Junk outcomes whose windows do not differ, to dilute the BH family.
    const outcomes: DayMatrix['outcomes'] = { rmssd };
    (['sdnn', 'pnn50', 'totalPower', 'restingHr', 'sleepingHr', 'sys', 'dia', 'sleepDuration', 'symptomLoad'] as const)
      .forEach((id, k) => { outcomes[id] = keys.map((_, i) => 50 + ((i * 3 + k * 5) % 11)); });

    return {
      keys,
      logged: keys.map(() => true),
      outcomes,
      factors: { 'med:test': col },
      defs: [factor],
      ctx: {} as ScoreContext,
      days: {},
    } as DayMatrix;
  };

  it('the crafted onset sits in the hysteresis band (precondition)', () => {
    const m = craft();
    const before = (m.outcomes.rmssd as number[]).slice(0, 20);
    const after = (m.outcomes.rmssd as number[]).slice(20);
    const g = mannWhitney(after, before);
    expect(g.p).toBeLessThanOrEqual(RETAIN_P);
    expect(Math.abs(g.r)).toBeGreaterThanOrEqual(0.2);
    // And the strict pass rejects it — the family is 10 tests wide, so the BH
    // threshold for a single rejection is an order tighter than the raw p.
    expect(findBiggestChange(m)).toBeNull();
  });

  it('keeps saying the remembered change while it stays plausible', () => {
    const held = findBiggestChange(craft(), { retain: 'onset:med:test|rmssd' });
    expect(held).not.toBeNull();
    expect(held!.id).toBe('onset:med:test|rmssd');
    expect(held!.kind).toBe('onset');
  });

  it('a remembered id that is not among the candidates cannot conjure a card', () => {
    expect(findBiggestChange(craft(), { retain: 'onset:med:gone|score' })).toBeNull();
  });

  it('never overrides a strict winner', () => {
    // The strong planted onset from the change suite's regime: retention only
    // fills an EMPTY slot, because "Biggest change" must stay a superlative.
    const r = rng(77);
    const state = journal(120, (i) => {
      const d = blank();
      d.readings = [hrv(Math.round((i >= 60 ? 36 : 30) + r() * 20))];
      d.meds.push(med('vitD3'));
      if (i >= 60) d.meds.push(med('magGlycinate'));
      return d;
    });
    const m = matrixOf(state);
    const strict = findBiggestChange(m);
    expect(strict).not.toBeNull();
    const withRetain = findBiggestChange(m, { retain: 'onset:med:magGlycinate|sdnn' });
    expect(withRetain!.id).toBe(strict!.id);
  });
});

/* ---------- the shell: cache + memory wiring ---------- */

describe('computeInsights carries the memory', () => {
  // MMKV is absent under jest, so ../findingMemory degrades to module state —
  // which is exactly enough to prove the wiring: read before build, write after.
  beforeEach(() => { resetInsightsCache(); resetFindingMemory(); });

  it('retains a remembered finding through a build that would drop it, then records what it showed', () => {
    noteFindingsShown({ correlations: [{ id: MAG_RMSSD }], change: null });
    const report = computeInsights(planted(1.6), DK);
    expect(report.correlations.map((c: { id: string }) => c.id)).toEqual([MAG_RMSSD]);
    // And the memory now reflects this report, not the past.
    expect(findingMemory().correlationIds).toEqual([MAG_RMSSD]);
  });

  it('a demo build neither reads nor writes the memory', () => {
    noteFindingsShown({ correlations: [{ id: MAG_RMSSD }], change: null });
    computeInsights(planted(1.6), DK, { demo: true });
    expect(findingMemory().correlationIds).toEqual([MAG_RMSSD]);
  });
});

/* ---------- the pure memory bookkeeping ---------- */

describe('finding memory (pure half)', () => {
  it('remembers exactly what a report showed, and never the welcome card', () => {
    const next = nextFindingMemory({
      correlations: [{ id: 'a|rmssd|0' }, { id: 'b|score|1' }],
      change: { id: 'welcome', kind: 'welcome' },
    });
    expect(next).toEqual({ correlationIds: ['a|rmssd|0', 'b|score|1'], changeId: null });
    expect(nextFindingMemory({ correlations: [], change: { id: 'onset:x|rmssd', kind: 'onset' } }).changeId)
      .toBe('onset:x|rmssd');
  });

  it('an empty report clears the memory — a dropped finding cannot pop back later', () => {
    expect(nextFindingMemory({ correlations: [], change: null })).toEqual(emptyFindingMemory());
  });

  it('normalizes whatever was persisted, dropping anything malformed', () => {
    expect(normalizeFindingMemory(null)).toEqual(emptyFindingMemory());
    expect(normalizeFindingMemory('junk')).toEqual(emptyFindingMemory());
    expect(normalizeFindingMemory({ correlationIds: ['ok', 7, null], changeId: 3 }))
      .toEqual({ correlationIds: ['ok'], changeId: null });
  });

  it('compares memories by content', () => {
    const a = { correlationIds: ['x'], changeId: null };
    expect(sameFindingMemory(a, { correlationIds: ['x'], changeId: null })).toBe(true);
    expect(sameFindingMemory(a, { correlationIds: ['x', 'y'], changeId: null })).toBe(false);
    expect(sameFindingMemory(a, { correlationIds: ['x'], changeId: 'c' })).toBe(false);
  });
});
