import { buildWidgetPayload, currentPacingFrame, PACING_FRAME_MIN } from '../widgets';
import { buildBudget, buildBudgetAt } from '../budget';
import { demoDays } from '../demo';
import { defaultState } from '../migrate';
import { addDays, todayKey } from '../dates';
import { SCORE_CATS } from '../scoring/day';
import type { Entry } from '../types';

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

/**
 * Arrows come from the shared trend engine (src/lib/trends) rather than a local
 * today-vs-week-mean comparison. The behaviour change is the point: an arrow now
 * requires median movement past the metric's own threshold with enough coverage
 * in BOTH windows, so noise no longer flips it.
 */
describe('widget trend arrows', () => {
  const day = (rmssd: number) => ({
    sleep: { bed: '', wake: '' },
    readings: [{ id: `r${rmssd}${Math.random()}`, type: 'hrv', time: '08:00', rmssd: String(rmssd) }],
    activities: [], meds: [], symptoms: [],
    food: { water: 0, calories: 0, triggers: {}, meals: [] },
    digestion: { movements: [] },
  });
  /** 14 days ending today: the older 7 at `prior`, the newer 7 at `recent`. */
  const fortnight = (prior: number, recent: number) => {
    const days: Record<string, ReturnType<typeof day>> = {};
    for (let i = 13; i >= 0; i--) days[addDays(todayKey(), -i)] = day(i >= 7 ? prior : recent);
    return days;
  };

  it('shows no arrow for a 1% move', () => {
    const state = { ...defaultState(), days: fortnight(50, 50.5) };
    const rmssd = buildWidgetPayload(state).rows.find((r) => r.name === 'RMSSD')!;
    expect(rmssd.trend).toBeNull();
  });

  it('shows an up arrow once the move clears the metric threshold', () => {
    const state = { ...defaultState(), days: fortnight(40, 60) };
    const rmssd = buildWidgetPayload(state).rows.find((r) => r.name === 'RMSSD')!;
    expect(rmssd.trend).toBe('▲');
  });

  it('shows a down arrow when the metric really fell', () => {
    const state = { ...defaultState(), days: fortnight(60, 40) };
    const rmssd = buildWidgetPayload(state).rows.find((r) => r.name === 'RMSSD')!;
    expect(rmssd.trend).toBe('▼');
  });

  it('never puts an arrow on SDNN — it has no trend-registry entry', () => {
    const state = { ...defaultState(), days: fortnight(40, 60) };
    expect(buildWidgetPayload(state).rows.find((r) => r.name === 'SDNN')!.trend).toBeNull();
  });
});

describe('pacing widgets', () => {
  const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };
  const demo = () => ({ ...defaultState(), days: demoDays() });

  it('are awaiting on an empty journal, never a prior', () => {
    const { frames } = buildWidgetPayload(defaultState(), todayKey(), { now: at(10) }).pacing;
    expect(frames).toHaveLength(1);
    expect(frames[0].state).toBe('awaiting');
    expect(frames[0].pace).toBeNull();
    expect(frames[0].fill).toBe(0);
  });

  it('show a free install no number at all', () => {
    const { frames } = buildWidgetPayload(demo(), todayKey(), { now: at(10), locked: true }).pacing;
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.state).toBe('locked');
    expect(f.tiles).toEqual([]);
    expect(f.pace).toBeNull();
    [f.figure, f.sub, f.subWide].forEach((s) => expect(s).not.toMatch(/\d/));
  });

  it('walk the pace marker across the rest of the day', () => {
    const now = at(9, 7);
    const { frames } = buildWidgetPayload(demo(), todayKey(), { now, stepsGranted: true }).pacing;
    expect(frames.length).toBeGreaterThan(20);
    expect(new Date(frames[0].at).getTime()).toBe(now.getTime());
    const times = frames.map((f) => new Date(f.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    frames.slice(1).forEach((f) => expect(new Date(f.at).getMinutes() % PACING_FRAME_MIN).toBe(0));
    expect(Math.max(...times)).toBeLessThanOrEqual(at(22, 30).getTime());
    const paces = frames.map((f) => f.pace).filter((p): p is number => p != null);
    paces.slice(1).forEach((p, i) => expect(p).toBeGreaterThanOrEqual(paces[i]));
    frames.forEach((f) => {
      expect(f.fill).toBeGreaterThanOrEqual(0);
      expect(f.fill).toBeLessThanOrEqual(1);
      expect(f.tiles.length).toBeLessThanOrEqual(2);
      [f.figureColor, f.fillColor, f.badgeColor, ...f.tiles.map((t) => t.color)].forEach((c) => expect(c).toMatch(HEX));
      // A widget states the budget. The strip's "About 3h 30m" hedge has the
      // words beside it that explain what is still being learned; here it is a
      // bare qualifier on a number, and its half-hour rounding would put a
      // different figure on the home screen from the one in the app.
      [f.figure, f.sub, f.subWide, ...f.tiles.flatMap((t) => [t.value, t.label])]
        .forEach((t) => expect(t).not.toMatch(/about|approx/i));
    });
  });

  it('draw whichever frame has already started', () => {
    const { pacing } = buildWidgetPayload(demo(), todayKey(), { now: at(9, 7) });
    const noon = at(12, 5);
    const f = currentPacingFrame(pacing, noon);
    expect(new Date(f.at).getTime()).toBeLessThanOrEqual(noon.getTime());
    const next = pacing.frames[pacing.frames.indexOf(f) + 1];
    if (next) expect(new Date(next.at).getTime()).toBeGreaterThan(noon.getTime());
  });

  it('bake the ember and drop the marker once over budget', () => {
    const state = demo();
    const dk = todayKey();
    const day = state.days[dk];
    state.days[dk] = {
      ...day,
      activities: [...(day.activities || []), { id: 'over', type: 'strenuousWork', time: '08:30', duration: '900' } as Entry],
    };
    const f = currentPacingFrame(buildWidgetPayload(state, dk, { now: at(14), stepsGranted: true }).pacing, at(14));
    expect(f.state).toBe('over');
    expect(f.unit).toBe('over');
    expect(f.figure).toMatch(/^\d/);
    expect(f.pace).toBeNull();
    expect(f.ember!.length).toBeGreaterThan(2);
    f.ember!.forEach((s) => expect(s.c).toMatch(HEX));
    expect(f.tiles.map((t) => t.label)).toEqual(['Spent', 'Budget']);
  });
});

describe('buildBudgetAt', () => {
  it('answers exactly what buildBudget does at each moment', () => {
    const state = { ...defaultState(), days: demoDays() };
    const dk = todayKey();
    const opts = { addDays, downturn: false, strain: null, stepsGranted: true, brief: true };
    const nows = [8, 11, 15, 20].map((h) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return d;
    });
    const many = buildBudgetAt(state, dk, {}, { ...opts, now: nows[0] }, nows);
    nows.forEach((now, i) => {
      const one = buildBudget(state, dk, {}, { ...opts, now });
      expect(many[i].state).toBe(one.state);
      expect(many[i].figure).toBe(one.figure);
      expect(many[i].sub).toBe(one.sub);
      expect(many[i].pace).toEqual(one.pace);
    });
  });
});
