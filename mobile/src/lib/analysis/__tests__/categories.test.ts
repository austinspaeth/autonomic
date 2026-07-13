/**
 * POTS category builders: the stand-test card (per-test trend + curve-overlay
 * refs, latest-test grading) and the orthostatic-events card (transition
 * filter variants). Days are keyed relative to today because acBuckets always
 * windows back from the current date.
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

  it('builds from standTest readings with per-test stats and refs', () => {
    const cards = potsCards(days);
    const card = cards.find((c) => c.title === 'POTS Test')!;
    expect(card).toBeTruthy();
    // Grade dot follows the latest test (18 bpm sustained → good), not the avg.
    expect(card.cat).toBe('good');
    expect(card.stats![0].value).toBe(18);            // last sustained rise
    expect(card.stats![1].value).toBe(62);            // avg baseline
    expect(card.stats![2].value).toBe('1 of 3');      // met threshold
    // Curve overlay refs: only tests carrying standAt + baseline, oldest first.
    expect(card.standCurves!.map((c) => c.id)).toEqual(['st1', 'st2']);
    expect(card.standCurves![0]).toMatchObject({ standAt: 300, baseline: 62, date: dayKey(10) });
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
      ortho({ beforeHr: 60, afterHr: 95, hr1min: 80 }),                                     // lay: +35 rise, 15 drop
      ortho({ transition: 'Climbing stairs', beforeHr: 70, afterHr: 120, hr1min: 95 }),     // stairs: +50 rise
    ]),
    [dayKey(2)]: day([ortho({ transition: 'Sitting to standing', beforeHr: 65, afterHr: 85, hr1min: 78 })]), // sit: +20 rise
  };

  it('builds one variant per transition with scoped stats and insights', () => {
    const card = potsCards(days).find((c) => c.title === 'POTS Episodes')!;
    expect(card).toBeTruthy();
    const f = card.orthoFilter!;
    expect(f.all.stats[2].value).toBe(3);
    expect(f.lay.stats[2].value).toBe(1);
    expect(f.lay.stats[0].value).toBe(35);   // avg rise
    expect(f.lay.stats[1].value).toBe(15);   // avg 1-min drop
    expect(f.sit.stats[2].value).toBe(1);
    expect(f.stairs.stats[2].value).toBe(1);
    // ≥30 bpm insight counts only the graded (non-stairs) views.
    expect(f.all.insights[0].text).toContain('2 of 3 events');
    expect(f.lay.insights[0].text).toContain('1 of 1 event');
    expect(f.stairs.insights).toHaveLength(0);
    // The card's default face is the All variant.
    expect(card.stats).toBe(f.all.stats);
  });

  it('drops POTS zones and rise grading on the stairs view', () => {
    const card = potsCards(days).find((c) => c.title === 'POTS Episodes')!;
    const f = card.orthoFilter!;
    expect(f.lay.charts[0].zones).toBeTruthy();
    expect(f.stairs.charts[0].zones).toBeNull();
    expect(f.stairs.charts[0].series[0].pointBands).toBeNull();
    // Stairs still grades on the 1-minute recovery (25 bpm drop → great).
    expect(f.stairs.cat).toBe('great');
  });
});
