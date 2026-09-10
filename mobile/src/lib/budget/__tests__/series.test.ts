import { addDays, todayKey } from '../../dates';
import { demoDays } from '../../demo';
import { buildCategories } from '../../analysis/categories';
import { budgetSeries } from '../series';
import type { AppState, DayRecord } from '../../types';
import type { DaysMap } from '../../scoring/day';

const stateOf = (days: DaysMap): AppState => ({
  version: 1, settings: {}, profile: {}, customTypes: {}, hiddenTypes: {},
  meta: { lastUpdated: '' }, days,
} as unknown as AppState);

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

describe('budgetSeries', () => {
  const st = stateOf(demoDays());
  const keys = Object.keys(st.days).sort();

  it('returns one row per journal day and none for days that do not exist', () => {
    const rows = budgetSeries(st, [...keys, '1999-01-01'], {}, addDays);
    expect(rows).toHaveLength(keys.length);
  });

  it('leaves a suppressed day with no margin rather than a huge fake overspend', () => {
    const rows = budgetSeries(st, keys, {}, addDays);
    rows.forEach((r) => {
      if (r.envelopeMin == null || !r.known) expect(r.marginMin).toBeNull();
      else expect(r.marginMin).toBeCloseTo(r.envelopeMin - r.spendMin, 5);
    });
    // The demo arc has crash days in it, so this is a real assertion.
    expect(rows.some((r) => r.envelopeMin == null)).toBe(true);
    // ...and a day with no margin is a GAP for the chart to skip, never a zero
    // column sitting on the ceiling, which would read as landing exactly on
    // budget.
    expect(rows.some((r) => r.marginMin == null)).toBe(true);
  });

  it('agrees with the full builder, which is the whole point of the cache', () => {
    // The shared caches must not change any answer, only stop it being
    // recomputed. Checked against buildBudget on a handful of days.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildBudget } = require('../index') as typeof import('../index');
    const rows = budgetSeries(st, keys, {}, addDays);
    [10, 25, 40].forEach((i) => {
      const dk = keys[i];
      const row = rows.find((r) => r.dk === dk)!;
      const full = buildBudget(st, dk, {}, {
        now: new Date(`${dk}T23:59:00`), addDays, downturn: false, strain: null, brief: true,
      });
      expect(row.spendMin).toBeCloseTo(full.burn.effortMin, 5);
      if (full.state === 'suppressed') expect(row.envelopeMin).toBeNull();
    });
  });
});

describe('the Progress section', () => {
  it('builds a Pacing card on the demo journal', () => {
    const days = demoDays();
    const cats = buildCategories(days, 'day', {});
    const pacing = cats.find((c) => c.id === 'pacing')!;
    expect(pacing).toBeDefined();
    // Placed AFTER Activity, not near the top.
    const ids = cats.map((c) => c.id);
    expect(ids.indexOf('pacing')).toBe(ids.indexOf('activity') + 1);

    const cards = pacing.build();
    expect(cards.length).toBe(1);
    const card = cards[0];
    expect(card.title).toBe('Budget margin');
    expect(card.stats!.map((s) => s.label)).toEqual(['Over budget', 'Under', 'Average margin']);
    // Columns off a ceiling at zero, not a line: over and under are opposite
    // directions from the budget, not two colours of one shape.
    expect(card.margin).toBeDefined();
    expect(card.charts).toBeUndefined();
    // In MINUTES, the unit the rest of the feature speaks.
    expect(card.margin!.label).toContain('Minutes');
    expect(card.margin!.values.length).toBe(card.margin!.labels.length);
  });

  it('stays hidden on a journal with nothing in it', () => {
    // A day the app never saw has an unknown margin, not a full one.
    const cats = buildCategories({ [todayKey()]: day({}) }, 'day', {});
    expect(cats.find((c) => c.id === 'pacing')!.build()).toEqual([]);
  });

  it('reports over and under as day counts, never as a rate', () => {
    const cards = buildCategories(demoDays(), 'day', {}).find((c) => c.id === 'pacing')!.build();
    const stats = cards[0].stats!;
    stats.slice(0, 2).forEach((s) => {
      expect(s.sub === 'day' || s.sub === 'days').toBe(true);
    });
    // The average margin carries a sign and a unit the reader can picture.
    const avg = stats[2];
    if (avg.value != null) {
      expect(avg.sub).toBe('mins');
      expect(['+', '-']).toContain(avg.prefix);
    }
  });
});
