/**
 * The engine, end to end, against journals whose answer we already know.
 *
 * The single most important test in this file is "finds nothing in a noise
 * journal". Every other test here checks that a real pattern is found, and any
 * broken implementation can pass those by simply reporting everything. Only the
 * noise test distinguishes a discovery engine from a random-claim generator, so it
 * runs over several independent seeds.
 */
import { addDays, todayKey } from '../../dates';
import type { AppState, DayRecord, Entry } from '../../types';
import { WELCOME_CHANGE, findBiggestChange } from '../change';
import { dataConfidence } from '../confidence';
import { CORRELATION_OUTCOMES, findCorrelations } from '../correlate';
import { buildFactors } from '../factors';
import { buildDayMatrix } from '../matrix';
import { PROBES_BY_ID, findObservations } from '../observations';
import { changeSinceStart, findWatchItems, overallDirection } from '../watch';
import { buildInsights } from '../index';
import { computeInsights, getCachedInsights, resetInsightsCache } from '../cache';
import { INSIGHT_OUTCOMES, OUTCOME_FAMILY, TREND_METRICS, keyRange } from '../../trends';

/* ---------- fixtures ---------- */

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

const hrv = (rmssd: number, over: Partial<Entry> = {}): Entry => ({
  id: nextId(), type: 'hrv', time: '08:00',
  rmssd: String(rmssd), sdnn: String(Math.round(rmssd * 1.4)), pnn50: String(Math.round(rmssd / 4)),
  ...over,
});

const med = (type: string): Entry => ({ id: nextId(), type, time: '08:00', amount: '400' });

/** Deterministic PRNG — the same mulberry32 the demo month uses. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A journal of `n` days ending at DK, each day built by `fn`. */
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

const findAbout = (list: { factorId: string; outcome: string }[], factorId: string) =>
  list.filter((c) => c.factorId === factorId);

/* ---------- the test that matters ---------- */

describe('a journal with no real signal', () => {
  /**
   * 120 days of random HRV and three supplements taken at random. There is
   * nothing to find, so anything found is a false claim. Several seeds, because a
   * single lucky one proves nothing.
   */
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('reports nothing (seed %i)', (seed) => {
    const r = rng(seed * 7919);
    const state = journal(120, () => {
      const d = blank();
      d.readings = [hrv(Math.round(20 + r() * 30))];
      ['magGlycinate', 'coq10', 'quercetin'].forEach((t) => { if (r() < 0.5) d.meds.push(med(t)); });
      if (r() < 0.4) d.symptoms.push({ id: nextId(), type: 'fatigue', time: '12:00' });
      d.food.water = Math.round((1 + r() * 2) * 10) / 10;
      const bedH = 22 + Math.floor(r() * 2);
      d.sleep = { bed: `${bedH}:00`, wake: '07:00' };
      return d;
    });
    const found = findCorrelations(matrixOf(state));
    expect(found).toEqual([]);
  });

  it('reports no biggest change either', () => {
    const r = rng(4242);
    const state = journal(120, () => {
      const d = blank();
      d.readings = [hrv(Math.round(20 + r() * 30))];
      if (r() < 0.5) d.meds.push(med('magGlycinate'));
      return d;
    });
    expect(findBiggestChange(matrixOf(state))).toBeNull();
  });
});

/* ---------- planted signal ---------- */

describe('a planted association', () => {
  /**
   * Magnesium on alternating days, and RMSSD reliably ~14 ms higher on those
   * days. Small deterministic jitter so the columns are not perfectly separable —
   * a real effect this clean would be suspicious.
   */
  const state = (() => {
    const r = rng(99);
    return journal(120, (i) => {
      const d = blank();
      const took = i % 2 === 0;
      d.readings = [hrv(Math.round((took ? 42 : 28) + r() * 8))];
      if (took) d.meds.push(med('magGlycinate'));
      // Something else logged every day, so the meds category's active window
      // covers the whole journal rather than starting at the first dose.
      d.meds.push(med('vitD3'));
      return d;
    });
  })();

  const found = findCorrelations(matrixOf(state));

  it('finds it and ranks it first', () => {
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].factorId).toBe('med:magGlycinate');
    expect(found[0].pips).toBeGreaterThanOrEqual(4);
  });

  it('gets the direction right and calls it good', () => {
    expect(found[0].r).toBeGreaterThan(0);
    expect(found[0].good).toBe(true);
    expect(found[0].high).toBeGreaterThan(found[0].low);
  });

  it('words it as an association, never as a cause', () => {
    found.forEach((c) => {
      expect(c.headline).not.toMatch(/\b(raise[ds]?|lower(ed|s)?|caus|improve[ds]?|because|due to)\b/i);
      expect(c.headline).toMatch(/\bshow\b|\bshows\b|linked/i);
    });
  });

  it('states the group sizes it compared, in the copy', () => {
    expect(found[0].note).toMatch(/\d+ days with it, \d+ without/);
    expect(found[0].detail).toMatch(/\d/);
  });

  /**
   * The row's readout has to be a quantity, not a coefficient. "+0.74" is a rank
   * correlation, which reads as a percentage to anyone who has not met one and is
   * not actionable even when read correctly, so what the row shows is the gap
   * between the two groups' medians in the metric's own units.
   */
  it('quantifies each finding in the metric own units, signed', () => {
    found.forEach((c) => {
      expect(c.deltaText).toMatch(/^[+\u2212]?\d/);
      // Signed the same way the medians are ordered, and never the bare coefficient.
      if (c.high > c.low) expect(c.deltaText.startsWith('+')).toBe(true);
      if (c.high < c.low) expect(c.deltaText.startsWith('\u2212')).toBe(true);
      expect(c.deltaText).not.toBe(c.rText);
      if (c.unit) expect(c.deltaText.endsWith(c.unit)).toBe(true);
    });
  });

  it('collapses the HRV family to one row instead of five', () => {
    // rmssd, sdnn and pnn50 all move together in the fixture, and all three are
    // family 'hrv'. Exactly one row may come out of that.
    const hrvRows = found.filter((c) => c.factorId === 'med:magGlycinate' && ['rmssd', 'sdnn', 'pnn50', 'totalPower', 'lfPeak'].includes(c.outcome));
    expect(hrvRows).toHaveLength(1);
  });

  it('caps one driver at two rows even when it moves everything', () => {
    // Here it legitimately moves both HRV and the daily score — two families, and
    // that is the ceiling.
    expect(findAbout(found, 'med:magGlycinate').length).toBeLessThanOrEqual(2);
  });

  it('does not also report the supplement taken every single day', () => {
    // vitD3 has no contrast at all, so it is not even a testable factor.
    expect(findAbout(found, 'med:vitD3')).toHaveLength(0);
  });
});

describe('a planted next-day association', () => {
  /** A trigger on every third day, and RMSSD down the FOLLOWING morning only. */
  const state = journal(120, (i) => {
    const r = rng(1000 + i);
    const d = blank();
    const hit = i % 3 === 0;
    const dayAfter = (i - 1) % 3 === 0;
    d.readings = [hrv(Math.round((dayAfter ? 24 : 40) + r() * 6))];
    d.food.triggers = hit ? { alcohol: 1 } : {};
    // Keep the trigger category logged throughout.
    if (!hit && i % 7 === 0) d.food.triggers = { caffeine: 1 };
    return d;
  });

  const found = findCorrelations(matrixOf(state));

  it('finds it at lag 1 and labels it as next-day', () => {
    const c = found.find((x) => x.factorId === 'trigger:alcohol');
    expect(c).toBeTruthy();
    expect(c!.lag).toBe(1);
    expect(c!.note).toMatch(/^Next day · /);
    expect(c!.headline).toMatch(/next-day/);
  });

  it('marks a fall in HRV as not good', () => {
    const c = found.find((x) => x.factorId === 'trigger:alcohol')!;
    expect(c.r).toBeLessThan(0);
    expect(c.good).toBe(false);
  });
});

/* ---------- the guards ---------- */

describe('tautology blocks', () => {
  const state = journal(120, (i) => {
    const r = rng(31 + i);
    const d = blank();
    d.readings = [hrv(30)];
    d.food.water = Math.round((1 + r() * 2.5) * 10) / 10;
    d.symptoms = r() < 0.5 ? [{ id: nextId(), type: 'fatigue', time: '12:00' }] : [];
    d.digestion.movements = r() < 0.7 ? [{ id: nextId(), time: '09:00' }] : [];
    return d;
  });
  const found = findCorrelations(matrixOf(state));

  it('never pairs water against water intake', () => {
    expect(found.filter((c) => c.factorId.startsWith('water:') && c.outcome === 'waterIntake')).toEqual([]);
  });

  it('never pairs a symptom against the symptom count', () => {
    expect(found.filter((c) => c.factorId.startsWith('symptom:') && c.outcome === 'symptomLoad')).toEqual([]);
  });

  it('never pairs bowel movements against the bowel movement count', () => {
    expect(found.filter((c) => c.factorId.startsWith('bm:') && c.outcome === 'bmCount')).toEqual([]);
  });

  it('never reports clean days as an outcome at all', () => {
    expect(found.filter((c) => c.outcome === 'cleanDays')).toEqual([]);
  });

  it('never correlates against a dispersion metric', () => {
    // A single night's bedtime is a bedtime, not a consistency. Correlating
    // against a stdev metric silently compares per-day bedtimes and then labels
    // the answer "bedtime consistency" — which is exactly what it did until the
    // noise suite caught it.
    expect(CORRELATION_OUTCOMES).not.toContain('sleepConsistency');
    INSIGHT_OUTCOMES.forEach((id) => {
      if (TREND_METRICS[id].aggregate === 'stdev') expect(CORRELATION_OUTCOMES).not.toContain(id);
    });
  });

  it('has nothing to say about two values both inside a target band', () => {
    // 8h against 9h of sleep, or 118 against 122 systolic, is not a finding —
    // the same rule ../trends/compare applies to its own windows.
    const banded = journal(120, (i) => {
      const r = rng(88 + i);
      const d = blank();
      d.readings = [hrv(34)];
      const took = i % 2 === 0;
      d.meds.push(med('vitD3'));
      if (took) d.meds.push(med('magGlycinate'));
      // Perfectly healthy either way, just slightly different.
      d.sleep = { bed: took ? '22:00' : '23:00', wake: '07:00' };
      void r;
      return d;
    });
    const rows = findCorrelations(matrixOf(banded));
    expect(rows.filter((c) => c.outcome === 'sleepDuration')).toEqual([]);
  });

  it('collapses the three encodings of activity load into one row', () => {
    // "Any activity", "Activity minutes" and "Heavy exertion" are one thing read
    // three ways; three rows saying it would be three quarters of the visible list.
    const active = journal(120, (i) => {
      const r = rng(404 + i);
      const d = blank();
      const moved = i % 2 === 0;
      d.readings = [hrv(Math.round((moved ? 42 : 28) + r() * 6))];
      d.activities = moved ? [{ id: nextId(), type: 'walk', time: '17:00', duration: '45' }] : [];
      // Keep the category logged on the off days too.
      if (!moved && i % 5 === 0) d.activities = [{ id: nextId(), type: 'legsUp', time: '20:00', duration: '10' }];
      return d;
    });
    const rows = findCorrelations(matrixOf(active));
    const loadRows = rows.filter((c) => ['activity:any', 'activity:minutes', 'activity:hard'].includes(c.factorId) && c.outcome === 'rmssd');
    expect(loadRows.length).toBeLessThanOrEqual(1);
  });
});

describe('the factor active window', () => {
  /**
   * The trap this rule exists for. Days 1–60: no supplements logged at all, and
   * HRV in the twenties because that was a bad stretch. Days 61–120: magnesium on
   * roughly half the days, HRV in the forties throughout with no dose-related
   * difference.
   *
   * Naively, "magnesium" would look like the difference between a crash and a
   * recovery. Correctly, the pre-logging era is unknown and inside the window
   * there is nothing to find.
   */
  const state = journal(120, (i) => {
    const r = rng(555 + i);
    const d = blank();
    const late = i >= 60;
    d.readings = [hrv(Math.round((late ? 42 : 24) + r() * 6))];
    if (late && i % 2 === 0) d.meds.push(med('magGlycinate'));
    return d;
  });

  it('nulls the factor before its category was ever logged', () => {
    const m = matrixOf(state);
    const col = m.factors['med:magGlycinate'];
    expect(col).toBeTruthy();
    // Day 59 is before the first dose and before ANY med was logged: unknown.
    expect(col[59]).toBeNull();
    expect(col[0]).toBeNull();
    // Inside the window, a day without a dose is a real zero.
    expect(col[61]).toBe(0);
    expect(col[60]).toBe(1);
  });

  it('therefore does not manufacture a finding out of the pre-logging era', () => {
    const found = findCorrelations(matrixOf(state));
    expect(findAbout(found, 'med:magGlycinate')).toHaveLength(0);
  });

  it('and does not report it as the biggest change either', () => {
    const change = findBiggestChange(matrixOf(state));
    // Whatever it reports must not be the onset of that supplement.
    if (change) expect(change.id).not.toContain('med:magGlycinate');
  });

  it('treats note keywords per-day, since a day without a note says nothing', () => {
    const noted = journal(60, (i) => {
      const d = blank();
      d.readings = [hrv(30)];
      if (i % 2 === 0) d.notes = i % 4 === 0 ? 'rough flare again' : 'steady enough';
      return d;
    });
    const m = matrixOf(noted, 60);
    const col = m.factors['note:flare'];
    expect(col).toBeTruthy();
    expect(col[0]).toBe(1);   // has a note, contains the word
    expect(col[2]).toBe(0);   // has a note, does not
    expect(col[1]).toBeNull(); // no note at all
  });
});

/* ---------- biggest change ---------- */

describe('the biggest change', () => {
  /** Magnesium from day 60 onward, taken daily, with RMSSD stepping up with it.
   *  Other supplements logged throughout so the active window is the whole span. */
  const state = journal(120, (i) => {
    const r = rng(777 + i);
    const d = blank();
    const after = i >= 60;
    d.readings = [hrv(Math.round((after ? 44 : 30) + r() * 6))];
    d.meds.push(med('vitD3'));
    if (after) d.meds.push(med('magGlycinate'));
    return d;
  });

  const change = findBiggestChange(matrixOf(state))!;

  it('reads the onset rather than a bare shift', () => {
    expect(change).toBeTruthy();
    expect(change.kind).toBe('onset');
    expect(change.id).toContain('med:magGlycinate');
  });

  it('states the order of events without claiming a cause', () => {
    expect(change.headline).toMatch(/since you started/i);
    expect(change.headline).not.toMatch(/\b(raised|caused|improved|because)\b/i);
    expect(change.body).toMatch(/not proof of a cause/i);
  });

  it('reports before and after with the right direction', () => {
    expect(change.after).toBeGreaterThan(change.before);
    expect(change.good).toBe(true);
    expect(change.beforeText).toMatch(/\d/);
    expect(change.afterText).toMatch(/\d/);
  });

  it('compares equal-length windows either side of the onset', () => {
    // 60 days each side here; the body states the span it used.
    expect(change.body).toMatch(/In the 60 days since/);
  });

  it('ignores an onset with too little room on one side', () => {
    // Started three days ago: nothing to compare against.
    const late = journal(120, (i) => {
      const d = blank();
      d.readings = [hrv(i >= 117 ? 50 : 28)];
      d.meds.push(med('vitD3'));
      if (i >= 117) d.meds.push(med('magGlycinate'));
      return d;
    });
    const c = findBiggestChange(matrixOf(late));
    if (c) expect(c.id).not.toContain('med:magGlycinate');
  });
});

/* ---------- trend watch ---------- */

describe('trend watch', () => {
  /** RMSSD falling hard across the second month. */
  const declining = journal(60, (i) => {
    const d = blank();
    d.readings = [hrv(i < 30 ? 45 : 26)];
    return d;
  });

  it('reports declines, unlike findTrend', () => {
    const items = findWatchItems(matrixOf(declining, 60), false);
    const hrvItem = items.find((x) => x.metric === 'rmssd');
    expect(hrvItem).toBeTruthy();
    expect(hrvItem!.good).toBe(false);
    expect(hrvItem!.sub).toMatch(/down/i);
  });

  it('is silent entirely while a downturn is active', () => {
    expect(findWatchItems(matrixOf(declining, 60), true)).toEqual([]);
  });

  it('reports improvements as good, with the window number', () => {
    const rising = journal(60, (i) => {
      const d = blank();
      d.readings = [hrv(i < 30 ? 26 : 45)];
      return d;
    });
    const item = findWatchItems(matrixOf(rising, 60), false).find((x) => x.metric === 'rmssd')!;
    expect(item.good).toBe(true);
    expect(item.value).toMatch(/ms$/);
    expect(item.series.length).toBeGreaterThan(0);
  });

  it('never exceeds five rows', () => {
    // Move everything at once and check the cap holds.
    const busy = journal(60, (i) => {
      const d = blank();
      const good = i >= 30;
      d.readings = [hrv(good ? 46 : 24), { id: nextId(), type: 'restingHr', time: '08:00', hr: String(good ? 58 : 78), position: 'Laying' }];
      d.sleep = { bed: good ? '22:30' : '01:00', wake: good ? '07:00' : '05:30', hrLow: String(good ? 52 : 70) };
      d.symptoms = good ? [] : [{ id: nextId(), type: 'fatigue', time: '12:00' }, { id: nextId(), type: 'brainFog', time: '13:00' }];
      d.food.water = good ? 2.8 : 1.1;
      return d;
    });
    expect(findWatchItems(matrixOf(busy, 60), false).length).toBeLessThanOrEqual(5);
  });

  it('keeps the noisy Baevsky metrics off the screen entirely', () => {
    const items = findWatchItems(matrixOf(declining, 60), false);
    items.forEach((i) => expect(['pnn50', 'totalPower', 'lfPeak', 'orthoDelta']).not.toContain(i.metric));
  });
});

/* ---------- observations ---------- */

describe('observations', () => {
  it('spots a morning-versus-later difference within the same days', () => {
    const state = journal(60, () => {
      const d = blank();
      d.readings = [hrv(44, { time: '07:00', period: 'Morning' }), hrv(30, { time: '19:00', period: 'Evening' })];
      return d;
    });
    const o = PROBES_BY_ID.timeOfDay({ matrix: matrixOf(state, 60), state, dk: DK });
    expect(o).toBeTruthy();
    expect(o!.title).toMatch(/morning readings run higher/i);
    expect(o!.body).toMatch(/ms above/);
  });

  it('says nothing about time of day when there is nothing to say', () => {
    const state = journal(60, (i) => {
      const r = rng(i + 3);
      const d = blank();
      d.readings = [hrv(Math.round(34 + r() * 4), { time: '07:00', period: 'Morning' }), hrv(Math.round(34 + r() * 4), { time: '19:00', period: 'Evening' })];
      return d;
    });
    expect(PROBES_BY_ID.timeOfDay({ matrix: matrixOf(state, 60), state, dk: DK })).toBeNull();
  });

  it('flags a reading type the user used to log and has not lately', () => {
    const state = journal(120, (i) => {
      const d = blank();
      d.readings = [hrv(34)];
      // POTS tests up to 40 days ago, then nothing.
      if (i < 80 && i % 10 === 0) d.readings.push({ id: nextId(), type: 'standTest', time: '09:00', baselineHr: '70', peakHr: '105' });
      return d;
    });
    const o = PROBES_BY_ID.stale({ matrix: matrixOf(state), state, dk: DK });
    expect(o).toBeTruthy();
    expect(o!.title).toMatch(/no pots test in \d+ days/i);
  });

  it('returns at most three, best first', () => {
    const state = journal(120, (i) => {
      const r = rng(i * 13 + 1);
      const d = blank();
      d.readings = [hrv(44, { time: '07:00', period: 'Morning' }), hrv(28, { time: '19:00', period: 'Evening' })];
      d.sleep = { bed: '01:00', wake: '05:00' };
      if (r() < 0.5) d.meds.push(med('magGlycinate'));
      d.meds.push(med('vitD3'));
      return d;
    });
    const found = findObservations({ matrix: matrixOf(state), state, dk: DK });
    expect(found.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < found.length; i++) expect(found[i - 1].importance).toBeGreaterThanOrEqual(found[i].importance);
  });

  it('survives a probe throwing without losing the rest', () => {
    const state = journal(10, () => blank());
    expect(() => findObservations({ matrix: matrixOf(state, 10), state, dk: DK })).not.toThrow();
  });
});

/* ---------- data confidence ---------- */

describe('data confidence', () => {
  it('is near zero on an empty journal and names a fix', () => {
    const c = dataConfidence({}, DK);
    expect(c.pct).toBe(0);
    expect(c.topFix).toBeTruthy();
    expect(c.daysLogged).toBe(0);
  });

  it('is high on a dense, current journal', () => {
    const state = journal(90, () => {
      const d = blank();
      d.readings = [hrv(36)];
      d.sleep = { bed: '22:30', wake: '07:00' };
      return d;
    });
    const c = dataConfidence(state.days, DK);
    expect(c.pct).toBeGreaterThan(90);
    expect(c.topFix).toBeNull();
    expect(c.daysLogged).toBe(90);
  });

  it('names the biggest weighted gap, not the smallest ratio', () => {
    // Everything logged except HRV readings: the 0.30-weight component is the fix,
    // not the 0.10-weight history component.
    const state = journal(90, () => {
      const d = blank();
      d.sleep = { bed: '22:30', wake: '07:00' };
      d.food.water = 2;
      return d;
    });
    const c = dataConfidence(state.days, DK);
    expect(c.topFix).toMatch(/HRV reading/i);
    expect(c.parts.find((p) => p.key === 'hrv')!.ratio).toBe(0);
  });

  /**
   * The header's count is the user's own days, never the imported ones.
   * Connecting Health back-fills a year in one tap, and greeting somebody on
   * their second day with "384 days logged" is both untrue about them and
   * useless as a sense of what they have built up.
   */
  it('counts only days the user entered something themselves', () => {
    const imported = journal(90, () => {
      const d = blank();
      d.readings = [{ ...hrv(36), imported: true, durationSec: 300 }];
      d.sleep = { bed: '22:30', wake: '07:00' };
      return d;
    });
    expect(dataConfidence(imported.days, DK).daysLogged).toBe(0);
  });

  it('still counts imported data toward coverage, which it genuinely feeds', () => {
    // The two numbers measure different things: an imported HRV reading with real
    // RR coverage is usable evidence even though it says nothing about engagement.
    const imported = journal(90, () => {
      const d = blank();
      d.readings = [{ ...hrv(36), imported: true, durationSec: 300 }];
      d.sleep = { bed: '22:30', wake: '07:00' };
      return d;
    });
    const c = dataConfidence(imported.days, DK);
    expect(c.pct).toBeGreaterThan(80);
    expect(c.parts.find((x) => x.key === 'hrv')!.ratio).toBe(1);
    expect(c.parts.find((x) => x.key === 'logged')!.label).toBe('Days with data');
  });

  it('counts a day the user touched even when the rest of it was imported', () => {
    const mixed = journal(30, (i) => {
      const d = blank();
      d.readings = [{ ...hrv(36), imported: true, durationSec: 300 }];
      // One hand-logged glass of water on half the days.
      if (i % 2 === 0) d.food.water = 2;
      return d;
    });
    expect(dataConfidence(mixed.days, DK).daysLogged).toBe(15);
  });

  it('drops the recency component when the journal has gone quiet', () => {
    const state = journal(90, (i) => {
      if (i > 80) return null;
      const d = blank();
      d.readings = [hrv(36)];
      return d;
    });
    const recency = dataConfidence(state.days, DK).parts.find((p) => p.key === 'recency')!;
    expect(recency.detail).toMatch(/9 days ago/);
    expect(recency.ratio).toBe(0);
  });
});

/* ---------- the whole report ---------- */

describe('buildInsights', () => {
  const state = journal(120, (i) => {
    const r = rng(2026 + i);
    const d = blank();
    const took = i % 2 === 0;
    d.readings = [hrv(Math.round((took ? 42 : 28) + r() * 8))];
    d.meds.push(med('vitD3'));
    if (took) d.meds.push(med('magGlycinate'));
    d.sleep = { bed: '22:30', wake: '07:00' };
    return d;
  });

  it('returns every section plus its own cost', () => {
    const rep = buildInsights(state, DK);
    expect(rep.dk).toBe(DK);
    expect(rep.demo).toBe(false);
    expect(rep.correlations.length).toBeGreaterThan(0);
    expect(rep.confidence.pct).toBeGreaterThan(0);
    // 119, not 120: the journal runs 120 days to DK inclusive, and the analysis
    // stops at the last COMPLETE day, so today is not counted.
    expect(rep.daysLogged).toBe(119);
    expect(typeof rep.ms).toBe('number');
    expect(rep.correlations[0].factorId).toBe('med:magGlycinate');
  });

  it('reports the real window, not the engine limit', () => {
    // 120 days of journal, so the header must not promise 180 days of analysis —
    // and 119 rather than 120, because the window ends at the last complete day.
    expect(buildInsights(state, DK).windowDays).toBe(119);
    expect(buildInsights(journal(1, () => null), DK).windowDays).toBe(0);
  });

  it('shows the welcome card, and only it, in demo mode', () => {
    const rep = buildInsights(state, DK, { demo: true });
    expect(rep.demo).toBe(true);
    expect(rep.change).toBe(WELCOME_CHANGE);
    expect(rep.change!.headline).toBe('You downloaded this app');
  });

  it('produces an empty but well-formed report from an empty journal', () => {
    const rep = buildInsights(journal(1, () => null), DK);
    expect(rep.correlations).toEqual([]);
    expect(rep.change).toBeNull();
    expect(rep.watch).toEqual([]);
    expect(rep.confidence.pct).toBe(0);
  });

  it('stays inside a sane time budget on a full 180-day journal', () => {
    // Not a benchmark — a tripwire. If this ever fails, the screen has started
    // blocking the interaction thread and the caller's deferral is no longer
    // enough on its own.
    const big = journal(180, (i) => {
      const r = rng(i + 900);
      const d = blank();
      d.readings = [hrv(Math.round(24 + r() * 24)), { id: nextId(), type: 'bp', time: '08:05', sys: '118', dia: '76', pulse: '64' }];
      ['magGlycinate', 'coq10', 'quercetin', 'vitD3', 'omega3'].forEach((t) => { if (r() < 0.6) d.meds.push(med(t)); });
      if (r() < 0.4) d.activities.push({ id: nextId(), type: 'walk', time: '17:00', duration: '30' });
      if (r() < 0.4) d.symptoms.push({ id: nextId(), type: 'fatigue', time: '12:00' });
      d.food.triggers = r() < 0.3 ? { alcohol: 1 } : {};
      d.food.water = 2;
      d.sleep = { bed: '22:45', wake: '06:45', hrLow: '55' };
      d.notes = 'slept badly, work was stressful and the heat did not help';
      return d;
    });
    const t0 = Date.now();
    buildInsights(big, DK);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('the cache', () => {
  beforeEach(resetInsightsCache);

  const state = journal(60, () => { const d = blank(); d.readings = [hrv(34)]; return d; });

  it('returns the identical object on a second call', () => {
    const a = computeInsights(state, DK);
    const b = computeInsights(state, DK);
    expect(b).toBe(a);
  });

  it('rebuilds when the journal revision changes', () => {
    const a = computeInsights(state, DK);
    const edited = { ...state, meta: { ...state.meta, lastUpdated: '2026-06-30T18:00:00.000Z' } };
    expect(computeInsights(edited, DK)).not.toBe(a);
  });

  it('rebuilds when the day rolls over', () => {
    const a = computeInsights(state, DK);
    expect(computeInsights(state, addDays(DK, 1))).not.toBe(a);
  });

  it('never serves an own-data report to demo mode or the reverse', () => {
    const own = computeInsights(state, DK, { demo: false });
    const demo = computeInsights(state, DK, { demo: true });
    expect(demo).not.toBe(own);
    expect(demo.demo).toBe(true);
  });

  it('reports a miss without computing anything', () => {
    // getCachedInsights is what the screen calls on render; it must never build.
    expect(getCachedInsights(state, DK)).toBeNull();
    computeInsights(state, DK);
    expect(getCachedInsights(state, DK)).toBeTruthy();
  });
});

describe('sanity of the module against real dates', () => {
  it('works for today, not just the fixed fixture day', () => {
    const tk = todayKey();
    const keys = keyRange(tk, 40, addDays);
    const days: Record<string, DayRecord> = {};
    keys.forEach((k) => { const d = blank(); d.readings = [hrv(34)]; days[k] = d; });
    const s = { ...journal(1, () => null), days } as AppState;
    expect(() => buildInsights(s, tk)).not.toThrow();
  });
});

describe('the header verdict', () => {
  const rising = journal(60, (i) => { const d = blank(); d.readings = [hrv(i < 30 ? 26 : 45)]; return d; });
  const falling = journal(60, (i) => { const d = blank(); d.readings = [hrv(i < 30 ? 45 : 26)]; return d; });

  it('reads the daily score first, since that is the app own headline number', () => {
    const o = overallDirection(matrixOf(rising, 60));
    expect(o.direction).toBe('up');
    expect(o.label).toBe('Trending up');
    expect(o.detail).toMatch(/daily score .*vs last month/);
  });

  it('reports a decline, because this is a view somebody opened to find out', () => {
    const o = overallDirection(matrixOf(falling, 60));
    expect(o.direction).toBe('down');
    expect(o.label).toBe('Trending down');
  });

  it('says nothing rather than guessing on a journal too thin to compare', () => {
    // Four days: no window pair exists, so there is no verdict to give and the
    // header falls back to the days-logged count.
    const thin = journal(4, () => { const d = blank(); d.readings = [hrv(34)]; return d; });
    const o = overallDirection(matrixOf(thin, 4));
    expect(o.direction).toBe('unknown');
    expect(o.label).toBeNull();
  });

  it('calls a genuinely level month steady, which is not the same as unknown', () => {
    const level = journal(60, () => { const d = blank(); d.readings = [hrv(34)]; return d; });
    const o = overallDirection(matrixOf(level, 60));
    expect(o.direction).toBe('flat');
    expect(o.label).toBe('Holding steady');
  });

  it('falls back to a vote when the day cannot be scored at all', () => {
    // Water and symptoms only. Neither feeds `scoreSet` (which wants HRV, BP,
    // resting HR, sleep or activity), so there is no score to read, yet the
    // direction is perfectly clear and refusing to say so would be needlessly mute.
    const noScore = journal(60, (i) => {
      const good = i >= 30;
      const d = blank();
      d.food.water = good ? 2.8 : 1.2;
      d.symptoms = good ? [] : [{ id: nextId(), type: 'fatigue', time: '12:00' }, { id: nextId(), type: 'brainFog', time: '13:00' }];
      return d;
    });
    const m = matrixOf(noScore, 60);
    expect(m.outcomes.score!.every((v) => v == null)).toBe(true);
    const o = overallDirection(m);
    expect(o.direction).toBe('up');
    expect(o.label).toBe('Trending up');
    expect(o.detail).toMatch(/\d improving, \d slipping/);
  });

  it('is carried on the report, and is not silenced by a downturn', () => {
    // Trend Watch hides its rows during a downturn; the one calm header line is
    // the honest headline for exactly that situation.
    const rep = buildInsights(falling, DK);
    expect(rep.overall.direction).toBe('down');
    if (rep.downturn) expect(rep.watch).toEqual([]);
  });
});

describe('the header claim, against day one', () => {
  /** 60 logged days: a bad first fortnight, a good last one. */
  const risen = journal(60, (i) => { const d = blank(); d.readings = [hrv(i < 30 ? 22 : 44)]; return d; });
  const fallen = journal(60, (i) => { const d = blank(); d.readings = [hrv(i < 30 ? 44 : 22)]; return d; });

  it('reports the gain as a percentage of day one, in two halves', () => {
    const s = changeSinceStart(risen.days, DK)!;
    expect(s).toBeTruthy();
    expect(s.better).toBe(true);
    expect(s.pct).toBeGreaterThan(0);
    expect(s.value).toMatch(/^\d+% better$/);
    expect(s.tail).toBe(' than day one');
    expect(s.detail).toMatch(/then, .* now/);
  });

  it('reports a decline just as plainly', () => {
    const s = changeSinceStart(fallen.days, DK)!;
    expect(s.better).toBe(false);
    expect(s.pct).toBeLessThan(0);
    expect(s.value).toMatch(/^\d+% worse$/);
  });

  it('says "about the same" rather than dressing a flat run as a gain', () => {
    const level = journal(60, () => { const d = blank(); d.readings = [hrv(34)]; return d; });
    const s = changeSinceStart(level.days, DK)!;
    expect(s.pct).toBe(0);
    expect(s.value).toBe('About the same');
    expect(s.tail).toBe(' as day one');
  });

  it('refuses to answer under a month of logged days', () => {
    const thin = journal(20, () => { const d = blank(); d.readings = [hrv(34)]; return d; });
    expect(changeSinceStart(thin.days, DK)).toBeNull();
  });

  it('refuses to answer when neither end can be scored', () => {
    // Water only: nothing `scoreSet` can grade, so there is no score to compare.
    const noScore = journal(60, () => { const d = blank(); d.food.water = 2; return d; });
    expect(changeSinceStart(noScore.days, DK)).toBeNull();
  });

  it('measures from the real day one, not from the analysis window', () => {
    // 300 logged days, so day one sits well outside the 180-day matrix. The claim
    // must still be against the earliest fortnight.
    const long = journal(300, (i) => { const d = blank(); d.readings = [hrv(i < 20 ? 20 : 44)]; return d; });
    const s = changeSinceStart(long.days, DK)!;
    expect(s.better).toBe(true);
    // Day one scored 20 rmssd (35 pts); a window starting at day 120 would already
    // be at 44 and report about the same.
    expect(s.pct).toBeGreaterThan(20);
  });

  it('states percentage POINTS on the 0-100 score, never a ratio', () => {
    // 22 rmssd grades 'ok' (60 pts) and 44 grades 'great' (100), so this is a
    // 40-point rise on a 100-point index: "40% better". A ratio would call the same
    // move "67% better" here and can run past 200% on a worse starting point, which
    // is arithmetically true, unbounded, and hype rather than information.
    const s = changeSinceStart(risen.days, DK)!;
    expect(s.pct).toBe(40);
    expect(s.pct).toBeLessThanOrEqual(100);
  });

  it('breaks the change down into components that add up', () => {
    // The score is a weighted blend, so the claim is the sum of its parts and the
    // sheet has to be able to show that. A reader who distrusts the headline should
    // be able to total the column.
    const s = changeSinceStart(risen.days, DK)!;
    expect(s.parts.length).toBeGreaterThan(0);
    // Tight, because "the parts add up" is the claim the breakdown sheet makes. The
    // slack is only for medians not summing exactly linearly.
    const total = s.parts.reduce((a, x) => a + x.delta, 0);
    expect(Math.abs(total - s.pct)).toBeLessThan(3);
    s.parts.forEach((x) => {
      expect(x.weight).toBeGreaterThan(0);
      expect(x.then).toBeGreaterThanOrEqual(0);
      expect(x.now).toBeGreaterThanOrEqual(0);
    });
    // Sorted by how much each one accounts for.
    for (let i = 1; i < s.parts.length; i++) {
      expect(Math.abs(s.parts[i - 1].delta)).toBeGreaterThanOrEqual(Math.abs(s.parts[i].delta));
    }
  });

  it('lists only components present at BOTH ends', () => {
    // Blood pressure starts halfway through. It has no "then" to be measured
    // against, and counting it from zero would credit its whole weight to a change
    // that is really just the user starting to log it.
    const late = journal(60, (i) => {
      const d = blank();
      d.readings = [hrv(30)];
      if (i >= 30) d.readings.push({ id: nextId(), type: 'bp', time: '08:05', sys: '118', dia: '76', pulse: '64' });
      return d;
    });
    const s = changeSinceStart(late.days, DK)!;
    expect(s.parts.some((x) => /pressure/i.test(x.label))).toBe(false);
  });

  it('names the days it compared, for the breakdown header', () => {
    const s = changeSinceStart(risen.days, DK)!;
    expect(s.fromKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.toKey).toBe(DK);
    expect(s.thenN).toBeGreaterThanOrEqual(5);
    expect(s.nowN).toBeGreaterThanOrEqual(5);
  });

  it('measures from a chosen day one when one is set', () => {
    // Three plateaus: 22 rmssd, then 30, then 44. Moving day one forward should shrink
    // the claim, because more of the recovery is already behind the new baseline.
    const stepped = journal(90, (i) => {
      const d = blank();
      d.readings = [hrv(i < 30 ? 22 : i < 60 ? 30 : 44)];
      return d;
    });
    const keys = keyRange(DK, 90, addDays);
    const dflt = changeSinceStart(stepped.days, DK)!;
    const mid = changeSinceStart(stepped.days, DK, {}, keys[30])!;
    const late = changeSinceStart(stepped.days, DK, {}, keys[60])!;
    expect(dflt.pct).toBeGreaterThan(mid.pct);
    expect(mid.pct).toBeGreaterThan(late.pct);
    expect(mid.fromKey).toBe(keys[30]);
    // Starting after the recovery finished, there is nothing left to claim.
    expect(late.value).toBe('About the same');
  });

  it('ignores an anchor with too little behind it rather than losing the claim', () => {
    // An anchor three days from the end leaves no window. Silently falling back to the
    // default is better than emptying the header because of a mis-tap on a calendar.
    const stepped = journal(90, (i) => { const d = blank(); d.readings = [hrv(i < 45 ? 22 : 44)]; return d; });
    const keys = keyRange(DK, 90, addDays);
    const s = changeSinceStart(stepped.days, DK, {}, keys[87]);
    expect(s).toBeTruthy();
    expect(s!.fromKey).toBe(keys[0]);
  });

  it('rides on the report', () => {
    expect(buildInsights(risen, DK).since!.better).toBe(true);
    expect(buildInsights(journal(5, () => null), DK).since).toBeNull();
  });
});

describe('the analysis window ends at the last complete day', () => {
  /**
   * Today is a day in progress. Before this rule, it entered every window as a
   * real "drank nothing, took nothing" day and then flipped as the user logged,
   * which moved the header's percentage, added and removed Trend Watch rows and
   * occasionally dropped a correlation — all within one morning. Measured across
   * 30 synthetic journals, 39 of 150 in-day updates changed the report.
   *
   * The report must now be identical no matter what today holds, because today is
   * not in it.
   */
  const seeded = (seed: number) => {
    const r = rng(seed);
    return journal(120, () => {
      const d = blank();
      d.readings = [hrv(Math.round(24 + r() * 26))];
      if (r() < 0.5) d.meds.push(med('magGlycinate'));
      if (r() < 0.4) d.symptoms.push({ id: nextId(), type: 'fatigue', time: '12:00' });
      d.food.water = Math.round((1 + r() * 2) * 10) / 10;
      d.sleep = { bed: '23:00', wake: '07:00' };
      return d;
    });
  };

  it('a full day of logging does not change the report', () => {
    const state = seeded(9091);
    // Wipe today back to empty, then fill it in the order a real morning does.
    const fill: ((d: DayRecord) => void)[] = [
      () => {},
      (d) => { d.readings = [hrv(44)]; },
      (d) => { d.sleep = { bed: '22:45', wake: '06:50' }; },
      (d) => { d.food.water = 2.4; d.meds.push(med('magGlycinate')); },
      (d) => { d.symptoms.push({ id: nextId(), type: 'fatigue', time: '14:00' }); },
      (d) => { d.activities.push({ id: nextId(), type: 'walk', time: '17:00', minutes: '35' }); },
    ];

    state.days[DK] = blank();
    const snapshots = fill.map((step) => {
      step(state.days[DK]);
      const r = buildInsights(state, DK);
      return JSON.stringify({
        since: r.since, overall: r.overall, change: r.change,
        correlations: r.correlations, observations: r.observations,
        watch: r.watch, confidence: r.confidence, windowDays: r.windowDays,
      });
    });

    snapshots.forEach((s) => expect(s).toBe(snapshots[0]));
  });

  it('still reads the day before, so yesterday counts', () => {
    const state = seeded(9091);
    const before = buildInsights(state, DK).confidence.daysLogged;
    delete state.days[addDays(DK, -1)];
    expect(buildInsights(state, DK).confidence.daysLogged).toBeLessThan(before);
  });

  it('keeps the downturn check on today, because that is a question about now', () => {
    // A journal that is fine through yesterday and collapses today must still
    // report the downturn: it is the crash-safety gate, not a history reading.
    const state = seeded(4242);
    const crash = (): DayRecord => {
      const d = blank();
      d.readings = [hrv(6)];
      ['fatigue', 'dizziness', 'nausea', 'headache'].forEach((t) =>
        d.symptoms.push({ id: nextId(), type: t, time: '09:00' }));
      d.sleep = { bed: '03:00', wake: '05:00' };
      return d;
    };
    [0, 1, 2].forEach((i) => { state.days[addDays(DK, -i)] = crash(); });
    expect(buildInsights(state, DK).downturn).toBe(true);
  });
});

describe('a finding keeps its metric', () => {
  /**
   * RMSSD, SDNN and pNN50 are one OUTCOME_FAMILY and near-collinear, so a real
   * finding arrives three times with almost identical effect sizes. The collapse
   * used to keep the strongest, which meant noise chose the label: measured on a
   * planted effect strong enough to be reported in 40 of 40 journals, the metric in
   * the headline still drifted in 10 of 160 perturbations. The user watched
   * "quercetin days show higher RMSSD" turn into "...higher pNN50" and reasonably
   * read it as the finding disappearing.
   *
   * The representative is now FAMILY_RANK, a registry fact, so it cannot move.
   */
  const planted = (seed: number, lift: number) => {
    const r = rng(seed);
    return journal(90, () => {
      const d = blank();
      const q = r() < 0.5;
      const g = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      d.readings = [hrv(Math.max(8, Math.round(36 + (q ? lift : 0) + g * 7)))];
      if (q) d.meds.push(med('quercetin'));
      if (r() < 0.5) d.meds.push(med('magGlycinate'));
      d.sleep = { bed: '23:00', wake: '07:00' };
      return d;
    });
  };

  it('reports the canonical metric of the family, not the strongest sibling', () => {
    const state = planted(2468, 9);
    const row = findCorrelations(matrixOf(state, 90))
      .find((c) => c.factorId === 'med:quercetin');
    expect(row).toBeDefined();
    // RMSSD outranks SDNN and pNN50 in FAMILY_RANK, so it is always the one shown.
    expect(row?.outcome).toBe('rmssd');
  });

  it('does not let one day of data change which metric is named', () => {
    const base = planted(2468, 9);
    const hrvRow = (st: AppState) => findCorrelations(matrixOf(st, 90))
      .find((c) => c.factorId === 'med:quercetin' && OUTCOME_FAMILY[c.outcome] === 'hrv');

    const first = hrvRow(base);
    expect(first).toBeDefined();
    [22, 30, 38, 46, 54].forEach((v) => {
      const alt: AppState = JSON.parse(JSON.stringify(base));
      alt.days[DK].readings = [hrv(v)];
      expect(hrvRow(alt)?.outcome).toBe(first?.outcome);
    });
  });
});
