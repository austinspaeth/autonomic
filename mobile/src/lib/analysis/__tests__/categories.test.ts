/**
 * POTS category builders: the stand-test card (per-test trend, latest-test
 * grading) and the orthostatic-events card (transition filter variants).
 * Days are keyed relative to today because acBuckets always windows back
 * from the current date.
 */
import { buildCategories } from '../categories';
import { resolveProtocol, type DaysMap } from '../../scoring/day';
import { keyOf } from '../../dates';
import { blankDay } from '../../migrate';
import type { Entry } from '../../types';

const dayKey = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return keyOf(d);
};

const day = (readings: Entry[]) => ({ ...blankDay(), readings });

const ctx = { protocol: resolveProtocol(null) };

function potsCards(days: DaysMap) {
  const cat = buildCategories(days, 'day', ctx).find((c) => c.id === 'pots')!;
  return cat.build();
}

const standTest = (over: Partial<Entry>): Entry => ({
  id: `st-${Math.random()}`, type: 'standTest', time: '09:00',
  baselineHr: 62, peakHr: 100, peakDelta: 38, sustainedDelta: 32,
  standAt: 300, metThreshold: true, ...over,
});

const ortho = (over: Partial<Entry>): Entry => ({
  id: `oe-${Math.random()}`, type: 'orthostatic', time: '10:00',
  transition: 'Laying to standing', beforeHr: 60, afterHr: 95, hr1min: 80, ...over,
});

describe('POTS stand-test card', () => {
  const days: DaysMap = {
    [dayKey(10)]: day([standTest({ id: 'st1', sustainedDelta: 34, metThreshold: true })]),
    [dayKey(5)]: day([standTest({ id: 'st2', sustainedDelta: 28, metThreshold: false })]),
    [dayKey(1)]: day([standTest({ id: 'st3', sustainedDelta: 18, metThreshold: false, standAt: undefined })]),
  };

  it('builds from standTest readings with per-test stats', () => {
    const cards = potsCards(days);
    const card = cards.find((c) => c.title === 'POTS Test')!;
    expect(card).toBeTruthy();
    // Grade dot follows the latest test (18 bpm sustained → good), not the avg.
    expect(card.cat).toBe('good');
    expect(card.stats![0].value).toBe(18);            // last sustained rise
    expect(card.stats![1].value).toBe(62);            // avg baseline
    expect(card.stats![2].value).toBe('1 of 3');      // met threshold
    // Improvement insight: 34 → 18 across 3 tests.
    expect(card.insights![0].text).toContain('improved 16 bpm across 3 tests');
    expect(card.insights![0].strength).toBe('strong');
  });

  it('is absent without stand tests, present without orthostatic events', () => {
    expect(potsCards({ [dayKey(2)]: day([ortho({})]) }).some((c) => c.title === 'POTS Test')).toBe(false);
    const cards = potsCards(days);
    expect(cards.some((c) => c.title === 'POTS Test')).toBe(true);
    expect(cards.some((c) => c.title === 'POTS Episodes')).toBe(false);
  });
});

describe('Orthostatic events card', () => {
  const days: DaysMap = {
    [dayKey(4)]: day([
      ortho({ beforeHr: 60, afterHr: 95, hr1min: 80 }),                                     // lay: +35 rise, -15 delta
      ortho({ transition: 'Climbing stairs', beforeHr: 70, afterHr: 120, hr1min: 95 }),     // stairs: +50 rise, -25 delta
    ]),
    [dayKey(2)]: day([ortho({ transition: 'Sitting to standing', beforeHr: 65, afterHr: 85, hr1min: 78 })]), // sit: +20 rise
  };

  it('builds one variant per transition with scoped stats and insights', () => {
    const card = potsCards(days).find((c) => c.title === 'POTS Episodes')!;
    expect(card).toBeTruthy();
    const f = card.orthoFilter!;
    // The balance-style readout (Rise / 1 min delta / Events) sits under the description.
    expect(f.all.metricsRow!.metrics[2].value).toBe(3);   // Events
    expect(f.lay.metricsRow!.metrics[2].value).toBe(1);
    expect(f.lay.metricsRow!.metrics[0].value).toBe(35);  // latest rise
    expect(f.lay.metricsRow!.metrics[1].value).toBe(-15); // latest 1-min delta (hr1min - afterHr)
    expect(f.sit.metricsRow!.metrics[2].value).toBe(1);
    expect(f.stairs.metricsRow!.metrics[2].value).toBe(1);
    // Rise + delta share one chart, coloured blue / purple.
    expect(f.all.charts).toHaveLength(1);
    expect(f.all.charts[0].series.map((s) => s.label)).toEqual(['Rise', '1 min delta']);
    expect(f.all.charts[0].series.map((s) => s.color)).toEqual(['#60a5fa', '#a855f7']);
    // Per-bucket event counts: 2 on the double day, 1 on the single.
    const sum = (vals: (number | null)[]) => vals.reduce((s: number, v) => s + (v || 0), 0);
    expect(sum(f.all.counts)).toBe(3);
    expect(sum(f.lay.counts)).toBe(1);
    // ≥30 bpm insight counts only the graded (non-stairs) views.
    expect(f.all.insights[0].text).toContain('2 of 3 events');
    expect(f.lay.insights[0].text).toContain('1 of 1 event');
    expect(f.stairs.insights).toHaveLength(0);
    // The card's default face is the All variant.
    expect(card.charts).toBe(f.all.charts);
  });

  it('drops POTS zones and rise grading on the stairs view', () => {
    const card = potsCards(days).find((c) => c.title === 'POTS Episodes')!;
    const f = card.orthoFilter!;
    expect(f.lay.charts[0].zones).toBeTruthy();
    expect(f.stairs.charts[0].zones).toBeNull();
    // The Show-zones link is offered only on graded transitions.
    expect(f.lay.metricsRow!.zones).toBe(true);
    expect(f.stairs.metricsRow!.zones).toBe(false);
    // Stairs still grades on the 1-minute delta (-25 bpm → great).
    expect(f.stairs.cat).toBe('great');
  });
});

describe('Triggers card bucket chart', () => {
  const trigDay = (triggers: Record<string, number>) => ({ ...blankDay(), food: { water: 0, calories: 0, meals: [], triggers } });
  const days: DaysMap = {
    [dayKey(3)]: trigDay({ caffeine: 2, alcohol: 1 }),
    [dayKey(1)]: trigDay({ caffeine: 1 }),
  };

  it('keys rows and carries per-bucket totals + per-trigger counts', () => {
    const cat = buildCategories(days, 'day', ctx).find((c) => c.id === 'triggers')!;
    const card = cat.build().find((c) => c.title === 'Triggers')!;
    // Rows carry their registry key (the row-tap → chart-filter handle),
    // sorted by count like before.
    expect(card.bars![0].rows.map((r) => r.key)).toEqual(['caffeine', 'alcohol']);
    const bb = card.barBuckets!;
    // Day mode = 14 daily buckets, newest last.
    expect(bb.totals).toHaveLength(14);
    expect(bb.totals[13 - 3]).toBe(3);
    expect(bb.totals[13 - 1]).toBe(1);
    expect(bb.totals[13]).toBe(0);
    expect(bb.byKey.caffeine[13 - 3]).toBe(2);
    expect(bb.byKey.caffeine[13 - 1]).toBe(1);
    expect(bb.byKey.alcohol[13 - 3]).toBe(1);
    expect(bb.byKey.alcohol[13 - 1]).toBe(0);
  });
});
