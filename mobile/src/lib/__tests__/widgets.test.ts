import { buildWidgetPayload } from '../widgets';
import { demoDays } from '../demo';
import { defaultState } from '../migrate';
import { todayKey } from '../dates';
import { SCORE_CATS } from '../scoring/day';

const HEX = /^#[0-9a-fA-F]{6}$/;
const TREND = /^[▲▼]$/;

describe('widget payload', () => {
  it('renders the awaiting state on an empty journal — never the demo month', () => {
    const p = buildWidgetPayload(defaultState());
    expect(p.hasScore).toBe(false);
    expect(p.score).toBe(0);
    expect(p.label).toBe('Awaiting data');
    p.rows.forEach((r) => { expect(r.value).toBe('–'); expect(r.trend).toBeNull(); });
    p.grid.forEach((g) => expect(g.value).toBe('–'));
    expect(p.spark).toBeNull();
  });

  it('scores a populated day and grades every metric', () => {
    const state = { ...defaultState(), days: demoDays() };
    const p = buildWidgetPayload(state);
    expect(p.date).toBe(todayKey());
    expect(p.hasScore).toBe(true);
    expect(p.score).toBeGreaterThan(0);
    expect(p.score).toBeLessThanOrEqual(100);
    // The label under the dial is the outlook pill's word, not a made-up one.
    expect(SCORE_CATS.map((c) => c.short)).toContain(p.label);
    expect(p.color).toMatch(HEX);

    expect(p.rows.map((r) => r.name)).toEqual(['SDNN', 'RMSSD', 'Sleep']);
    p.rows.forEach((r) => {
      expect(r.value).not.toBe('–');
      expect(r.color).toMatch(HEX);
      if (r.trend != null) expect(r.trend).toMatch(TREND);
    });

    expect(p.grid.map((g) => g.name)).toEqual(['SDNN', 'RMSSD', 'pNN50', 'Resting HR', 'Sleep', 'Water']);

    // Protocol checklist mirrors the clean-day criteria: labelled items with a
    // boolean done/broken state and a done-count that never exceeds the total.
    expect(p.protocol.length).toBeGreaterThan(0);
    p.protocol.forEach((it) => {
      expect(typeof it.label).toBe('string');
      expect(typeof it.done).toBe('boolean');
      expect(typeof it.broken).toBe('boolean');
    });
    expect(p.protocolDone).toBe(p.protocol.filter((it) => it.done).length);
    expect(p.protocolDone).toBeLessThanOrEqual(p.protocol.length);

    // The chart mirrors the app's Sparkline: 14 graded points + gradient stops.
    const s = p.spark!;
    expect(s).not.toBeNull();
    expect(s.values).toHaveLength(14);
    // The demo month has HRV readings every day, so the whole fortnight plots.
    s.values.forEach((v) => expect(typeof v).toBe('number'));
    s.colors.forEach((c) => expect(c).toMatch(HEX));
    expect(s.stops.length).toBeGreaterThanOrEqual(2);
    s.stops.forEach((st) => { expect(st.o).toBeGreaterThanOrEqual(0); expect(st.o).toBeLessThanOrEqual(1); expect(st.c).toMatch(HEX); });
    // Offsets arrive sorted top → bottom, ready for a gradient.
    expect([...s.stops.map((st) => st.o)].sort((a, b) => a - b)).toEqual(s.stops.map((st) => st.o));
    expect(s.ticks).toHaveLength(3);
    s.ticks.forEach((t) => expect(t).toBeTruthy());
    expect(s.start).toBeTruthy();
    expect(s.end).toBeTruthy();
  });

  it('produces integers for ms metrics and one decimal for sleep', () => {
    const state = { ...defaultState(), days: demoDays() };
    const p = buildWidgetPayload(state);
    expect(p.rows[0].value).toMatch(/^\d+$/);
    expect(p.rows[1].value).toMatch(/^\d+$/);
    expect(p.rows[2].value).toMatch(/^\d+(\.\d)?$/);
  });

  it('is stable for a specific past day key', () => {
    const days = demoDays();
    const dks = Object.keys(days).sort();
    const mid = dks[Math.floor(dks.length / 2)];
    const state = { ...defaultState(), days };
    const a = buildWidgetPayload(state, mid);
    const b = buildWidgetPayload(state, mid);
    expect(a.score).toBe(b.score);
    expect(a.rows).toEqual(b.rows);
    expect(a.date).toBe(mid);
  });
});
