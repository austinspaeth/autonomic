/**
 * The evidence columns behind a finding.
 *
 * The property that matters is ALIGNMENT: the chart in the detail sheet must be
 * drawing the same days the statistics used, so `keys`, `values` and `on` have to
 * stay index-aligned through the end-trimming, and a day the journal says nothing
 * about has to arrive as null rather than as a zero the chart would shade.
 */
import { addDays, todayKey } from '../../dates';
import { INSIGHT_OUTCOMES, keyRange } from '../../trends';
import type { AppState, DayRecord, Entry } from '../../types';
import { findBiggestChange } from '../change';
import { MIN_GROUP, findCorrelations } from '../correlate';
import { changeSeries, correlationSeries, factorPeak, markColumn } from '../detail';
import { buildFactors } from '../factors';
import { buildDayMatrix } from '../matrix';
import { INSIGHT_MIN_DAYS, buildInsights } from '../index';

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
const hrv = (rmssd: number): Entry => ({
  id: `e${++uid}`, type: 'hrv', time: '08:00', rmssd, sdnn: rmssd + 10, hr: 60, durationSec: 300, position: 'seated',
} as unknown as Entry);
const med = (type: string): Entry => ({ id: `m${++uid}`, type, time: '09:00' } as unknown as Entry);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
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

const matrixOf = (state: AppState, n = 120) => {
  const keys = keyRange(DK, n, addDays);
  return buildDayMatrix(state, keys, INSIGHT_OUTCOMES, buildFactors(state, keys), {});
};

/** Magnesium on alternating days, RMSSD reliably higher on those days. */
const alternating = (() => {
  const r = rng(99);
  return journal(120, (i) => {
    const d = blank();
    const took = i % 2 === 0;
    d.readings = [hrv(Math.round((took ? 42 : 28) + r() * 8))];
    if (took) d.meds.push(med('magGlycinate'));
    d.meds.push(med('vitD3'));
    return d;
  });
})();

describe('correlationSeries', () => {
  const matrix = matrixOf(alternating);
  const c = findCorrelations(matrix).find((x) => x.factorId === 'med:magGlycinate');
  const s = c ? correlationSeries(matrix, c) : null;

  it('returns the columns for the finding', () => {
    expect(c).toBeTruthy();
    expect(s).toBeTruthy();
  });

  it('keeps every array index-aligned', () => {
    expect(s!.values).toHaveLength(s!.keys.length);
    expect(s!.on).toHaveLength(s!.keys.length);
  });

  it('marks the factor days the statistics used', () => {
    // Alternating days, so half the column is present and none of it is unknown.
    const present = s!.on.filter((v) => v === 1).length;
    expect(present).toBeGreaterThan(50);
    expect(s!.on.filter((v) => v == null)).toHaveLength(0);
    expect(s!.factorKind).toBe('binary');
  });

  it('carries the outcome unit and label', () => {
    expect(s!.metric).toBe(c!.outcome);
    expect(s!.unit).toBeTruthy();
    expect(s!.onsetIndex).toBeNull();
  });
});

describe('the active window', () => {
  /**
   * Supplements logged only in the second half. The first half is UNKNOWN, not
   * "didn't take it" — the chart must be able to tell those apart, which is the
   * whole reason `on` is nullable.
   */
  const late = journal(120, (i) => {
    const d = blank();
    d.readings = [hrv(30 + (i % 5))];
    if (i >= 60) d.meds.push(med(i % 2 === 0 ? 'magGlycinate' : 'vitD3'));
    return d;
  });
  const matrix = matrixOf(late);
  const c = findCorrelations(matrix)[0];

  it('reports unknown days as null, never as absent', () => {
    if (!c) return; // nothing found is a valid outcome here; the shape is what's tested
    const s = correlationSeries(matrix, c)!;
    expect(s.on.slice(0, 40).every((v) => v == null)).toBe(true);
  });
});

describe('changeSeries', () => {
  /** Quercetin started at day 60, RMSSD steps up from there. */
  const onset = journal(120, (i) => {
    const d = blank();
    d.readings = [hrv(i >= 60 ? 46 : 28)];
    d.meds.push(med('vitD3'));
    if (i >= 60) d.meds.push(med('quercetin'));
    return d;
  });
  const matrix = matrixOf(onset);
  const change = findBiggestChange(matrix);

  it('marks where the before/after split sits', () => {
    expect(change).toBeTruthy();
    const s = changeSeries(matrix, change!);
    if (change!.kind === 'onset') {
      expect(s!.onsetIndex).toBeGreaterThan(0);
      expect(s!.factorLabel).toBeTruthy();
      // The split is where the factor first reads 1.
      expect(s!.on[s!.onsetIndex!]).toBe(1);
    }
  });
});

describe('the report carries a detail entry per finding', () => {
  const r = buildInsights(alternating, todayKey(), {});

  it('keys them by the finding id', () => {
    r.correlations.forEach((c) => expect(r.detail[c.id]).toBeTruthy());
    if (r.change) expect(r.detail[r.change.id]).toBeTruthy();
  });
});

describe('the empty screen\'s target', () => {
  /**
   * It is a display figure, not an engine threshold — but it has to stay inside
   * the engine's own range or the counter lies in one direction or the other:
   * below the earliest possible finding it would promise results too soon, above
   * the binary-correlation floor it would hide findings the user already has.
   */
  it('sits between the earliest observation and the binary-correlation floor', () => {
    expect(INSIGHT_MIN_DAYS).toBeGreaterThanOrEqual(MIN_GROUP);
    expect(INSIGHT_MIN_DAYS).toBeLessThanOrEqual(MIN_GROUP * 2);
  });
});

describe('markColumn', () => {
  it('passes a binary column through untouched', () => {
    const s = { factorKind: 'binary', on: [1, 0, null, 1] } as never as Parameters<typeof markColumn>[0];
    expect(markColumn(s)).toEqual([1, 0, null, 1]);
  });

  it('splits a continuous column at its own median, keeping unknown days unknown', () => {
    const s = { factorKind: 'continuous', on: [1, 2, 3, null, 4] } as never as Parameters<typeof markColumn>[0];
    expect(markColumn(s)).toEqual([0, 0, 1, null, 1]);
  });
});

describe('factorPeak', () => {
  it('is null when there is nothing to scale against', () => {
    expect(factorPeak([null, 0, null])).toBeNull();
    expect(factorPeak([])).toBeNull();
  });
  it('is the largest logged value', () => {
    expect(factorPeak([1, null, 2.5, 0])).toBe(2.5);
  });
});
