import { demoDays, demoState, hasOwnData, DEMO_DAYS } from '../demo';
import { scoreSet, streakInfo, resolveProtocol, sleepHours, type DaysMap } from '../scoring/day';
import { todayKey } from '../dates';
import { REPORT_CARDS, buildDataExport, buildPrompt, hasAnyData, reportDateRange } from '../analysis/reports';
import type { AppState } from '../types';
import { buildInsights } from '../insights';

const scores = (days: DaysMap) =>
  Object.keys(days).sort().map((k) => scoreSet(days[k].readings, days[k], k, days, {}).score!);

describe('demo journal', () => {
  it('is deterministic and DEMO_DAYS long, ending today', () => {
    const a = demoDays();
    expect(Object.keys(a)).toHaveLength(DEMO_DAYS);
    expect(Object.keys(a).sort().pop()).toBe(todayKey());
    expect(JSON.stringify(demoDays())).toBe(JSON.stringify(a));
  });

  it('scores every day', () => {
    const days = demoDays();
    scores(days).forEach((s) => expect(typeof s).toBe('number'));
  });

  it('opens in the red and closes in the green', () => {
    const s = scores(demoDays());
    const first = s.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const last = s.slice(-7).reduce((a, b) => a + b, 0) / 7;
    // First week reads Bad/Crash (<40), last week Good or better (>=70).
    expect(first).toBeLessThan(40);
    expect(last).toBeGreaterThanOrEqual(70);
  });

  it('opens with genuine crash days', () => {
    const s = scores(demoDays());
    // Crash < 25, Bad < 40 (SCORE_CATS). The first stretch is meant to be grim.
    expect(s.slice(0, 9).filter((v) => v < 25).length).toBeGreaterThanOrEqual(2);
    expect(s.slice(0, 9).every((v) => v < 40)).toBe(true);
  });

  it('trends up without being a straight line', () => {
    const s = scores(demoDays());
    // Setbacks are the point: the month must still contain real drops.
    const drops = s.slice(1).filter((v, i) => v < s[i] - 8).length;
    expect(drops).toBeGreaterThanOrEqual(3);
    // ...and at least one lands back out of the green after the trend turned.
    expect(Math.min(...s.slice(14))).toBeLessThan(55);
  });

  it('builds a live clean-day streak', () => {
    const days = demoDays();
    const streak = streakInfo(days, todayKey(), resolveProtocol(null));
    expect(streak.current).toBeGreaterThan(0);
    expect(streak.rate).toBeGreaterThan(0);
  });

  it('tells a sleep story: shorter and later, to longer and earlier', () => {
    const days = demoDays();
    const keys = Object.keys(days).sort();
    const dur = (k: string) => sleepHours(days, k)!;
    expect(dur(keys[0])).toBeLessThan(6.5);
    expect(dur(keys[keys.length - 1])).toBeGreaterThan(7);
  });

  it('fills every Insights report with real content', () => {
    // The Insights view runs its reports off demoState() while the journal is
    // empty; a report that came back "(none recorded)" would demo nothing.
    const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
    const st = demoState(blank);
    const { keys } = reportDateRange('week', todayKey());
    expect(hasAnyData(st.days, keys)).toBe(true);
    REPORT_CARDS.forEach((card) => {
      const prompt = buildPrompt(st, {}, [card], 'week', todayKey());
      expect(prompt).not.toContain('Limited data available');
      // Every section the card asked for resolved to something.
      expect(prompt.split('(none recorded)').length - 1).toBeLessThanOrEqual(1);
      expect(prompt.length).toBeGreaterThan(1200);
    });
    expect(buildDataExport(st, {}, 'month', todayKey())).toContain('Autonomic Score');
  });

  /**
   * The reason DEMO_DAYS is 60 rather than 30. Someone with an empty journal sees
   * this month behind a demo banner, and a demo of a discovery engine that
   * discovers nothing is worse than no demo at all. These assert the sample data
   * genuinely exercises the engine — through the real statistics, with the real
   * FDR correction, no fixtures.
   */
  it('fills the Insights view with findings the real engine agrees with', () => {
    const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
    const st = demoState(blank);
    const rep = buildInsights(st, todayKey());
    expect(rep.correlations.length).toBeGreaterThanOrEqual(3);
    expect(rep.observations.length).toBeGreaterThanOrEqual(1);
    expect(rep.watch.length).toBeGreaterThanOrEqual(2);
    expect(rep.confidence.pct).toBeGreaterThan(60);
  });

  it('makes the magnesium onset discoverable', () => {
    // DEMO_MAG_START sits mid-month precisely so ../insights/change has a month
    // either side to compare, and other supplements run the whole span so the meds
    // category's active window covers everything and this is a real contrast.
    //
    // It is not asserted to WIN the headline slot: the sample arc also has sleep
    // lengthening, and that onset legitimately scores higher. What matters is that
    // the supplement trial is found at all.
    const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
    const rep = buildInsights(demoState(blank), todayKey());
    expect(rep.correlations.some((c) => c.factorId === 'med:magGlycinate')).toBe(true);
  });

  it('leads with a good-news onset, since the sample arc is a recovery', () => {
    const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
    const change = buildInsights(demoState(blank), todayKey()).change;
    expect(change).toBeTruthy();
    expect(change!.kind).toBe('onset');
    expect(change!.good).toBe(true);
    expect(change!.headline).toMatch(/since you started/i);
  });

  it('still shows the welcome card in demo mode, whatever it found', () => {
    const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
    const rep = buildInsights(demoState(blank), todayKey(), { demo: true });
    expect(rep.change!.headline).toBe('You downloaded this app');
  });

  it('reads as the user own data to hasOwnData', () => {
    expect(hasOwnData(demoDays())).toBe(true);
    expect(hasOwnData({})).toBe(false);
  });

  it('hasOwnData notices any trace of real input', () => {
    const blank = (): DaysMap => ({
      '2026-01-01': { sleep: { bed: '', wake: '' }, readings: [], activities: [], meds: [], symptoms: [], food: { water: 0, calories: 0, triggers: {}, meals: [] }, digestion: { movements: [] } },
    });
    expect(hasOwnData(blank())).toBe(false);
    const water = blank(); water['2026-01-01'].food.water = 0.5;
    expect(hasOwnData(water)).toBe(true);
    const note = blank(); note['2026-01-01'].notes = 'hi';
    expect(hasOwnData(note)).toBe(true);
    const trig = blank(); trig['2026-01-01'].food.triggers = { caffeine: 1 };
    expect(hasOwnData(trig)).toBe(true);
    const slept = blank(); slept['2026-01-01'].sleep = { bed: '23:00', wake: '07:00' };
    expect(hasOwnData(slept)).toBe(true);
  });
});
