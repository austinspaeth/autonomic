/**
 * nextUpsell: the policy IS the product here, so every rule is pinned.
 *
 * Fixtures match the scoring tests: an 'hrv' reading with only rmssd set makes
 * the day score exactly its grade points (40→100, 30→80, 25→60, 20→35, 15→10).
 * Days are held flat at a middling score so nothing accidentally trips the
 * downturn detector; the suppression tests trip it deliberately.
 */
import type { DayRecord, Entry } from '../../types';
import {
  DISMISSALS_TO_RETIRE, HISTORY_HORIZON_DAYS, IGNORES_TO_RETIRE,
  MIN_DAYS_BETWEEN_PROMPTS, MONTH_MILESTONE_DAYS, RETIRE_DAYS,
  nextUpsell, type SurfaceMemory, type UpsellInput,
} from '../eligibility';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const hrvR = (rmssd: number, id: string): Entry =>
  ({ id, type: 'hrv', time: '08:00', rmssd: String(rmssd) });

const DK = '2026-02-10';
const NOW = Date.UTC(2026, 1, 10, 18, 0, 0);
const DAY_MS = 86400000;

const keyBack = (n: number): string =>
  new Date(Date.UTC(2026, 1, 10) - n * DAY_MS).toISOString().slice(0, 10);

/** `n` consecutive days ending at DK, each holding one flat 25-rmssd reading. */
const flatDays = (n: number): Record<string, DayRecord> => {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < n; i++) days[keyBack(i)] = day({ readings: [hrvR(25, `r${i}`)] });
  return days;
};

/** A week that falls hard into today — detectDownturn fires on this. */
const slide = (): Record<string, DayRecord> => {
  const days = flatDays(20);
  days[keyBack(2)] = day({ readings: [hrvR(20, 'a')] });
  days[keyBack(1)] = day({ readings: [hrvR(15, 'b')] });
  days[keyBack(0)] = day({ readings: [hrvR(15, 'c')] });
  return days;
};

const mem = (over: Partial<SurfaceMemory> = {}): SurfaceMemory =>
  ({ shown: 1, dismissed: 0, ignored: 0, lastShownAtMs: NOW - DAY_MS, ...over });

const ask = (over: Partial<UpsellInput> = {}) => nextUpsell({
  days: flatDays(20), dk: DK, tier: 'free', memory: { perSurface: {} }, nowMs: NOW, ...over,
});

describe('suppression', () => {
  it('never prompts a paying or trialling user', () => {
    expect(ask({ tier: 'pro' })).toEqual({ ok: false, reason: 'not-free' });
    expect(ask({ tier: 'trial' })).toEqual({ ok: false, reason: 'not-free' });
  });

  it('never talks over an open sheet', () => {
    expect(ask({ sheetOpen: true })).toEqual({ ok: false, reason: 'sheet-open' });
  });

  it('never sells on the day the crash warning fired', () => {
    expect(ask({ crashAlertFiredToday: true })).toEqual({ ok: false, reason: 'crash-alert-today' });
  });

  it('yields to the review ask — it has an OS quota, we do not', () => {
    expect(ask({ reviewAskedThisSession: true })).toEqual({ ok: false, reason: 'review-this-session' });
  });

  it('never sells mid-downturn', () => {
    expect(ask({ days: slide() })).toEqual({ ok: false, reason: 'downturn' });
  });

  it('says nothing when no surface has a trigger', () => {
    expect(ask({ days: flatDays(HISTORY_HORIZON_DAYS - 1) })).toEqual({ ok: false, reason: 'no-trigger' });
  });
});

describe('pacing', () => {
  it('refuses a second prompt inside the window', () => {
    const memory = { lastPromptAtMs: NOW - (MIN_DAYS_BETWEEN_PROMPTS - 1) * DAY_MS, perSurface: {} };
    expect(ask({ memory })).toEqual({ ok: false, reason: 'prompted-recently' });
  });

  it('allows one the day the window clears', () => {
    const memory = { lastPromptAtMs: NOW - (MIN_DAYS_BETWEEN_PROMPTS + 1) * DAY_MS, perSurface: {} };
    const v = ask({ memory });
    expect(v.ok).toBe(true);
  });
});

describe('surfaces', () => {
  it('offers history-horizon once the free 14-day view starts clipping', () => {
    const v = ask({ days: flatDays(HISTORY_HORIZON_DAYS) });
    expect(v).toEqual({ ok: true, surface: 'history-horizon', trigger: '15 days logged' });
  });

  it('returns exactly one surface, the highest-priority one', () => {
    const v = ask({ days: flatDays(MONTH_MILESTONE_DAYS + 1) });
    // month-milestone also triggers at 31 days; priority order decides.
    expect(v).toEqual({ ok: true, surface: 'history-horizon', trigger: '31 days logged' });
  });

  it("carries a trigger phrase built from the user's own data", () => {
    const v = ask({ days: flatDays(18) });
    if (!v.ok) throw new Error(v.reason);
    expect(v.trigger).toBe('18 days logged');
  });
});

describe('retirement', () => {
  const days = flatDays(MONTH_MILESTONE_DAYS + 1);

  it('retires a surface after two dismissals', () => {
    const perSurface = { 'history-horizon': mem({ dismissed: DISMISSALS_TO_RETIRE }) };
    const v = ask({ days, memory: { perSurface } });
    if (!v.ok) throw new Error(v.reason);
    expect(v.surface).not.toBe('history-horizon');
  });

  it('retires a surface after three ignores — most people never press the ✕', () => {
    const perSurface = { 'history-horizon': mem({ ignored: IGNORES_TO_RETIRE }) };
    const v = ask({ days, memory: { perSurface } });
    if (!v.ok) throw new Error(v.reason);
    expect(v.surface).not.toBe('history-horizon');
  });

  it('retires for exactly 30 days, then offers again', () => {
    const shownAt = NOW - RETIRE_DAYS * DAY_MS;
    const retired = { 'history-horizon': mem({ dismissed: 2, lastShownAtMs: shownAt + DAY_MS }) };
    expect(ask({ days, memory: { perSurface: retired } })).not.toMatchObject({ surface: 'history-horizon' });

    const expired = { 'history-horizon': mem({ dismissed: 2, lastShownAtMs: shownAt - 1000 }) };
    expect(ask({ days, memory: { perSurface: expired } }))
      .toMatchObject({ ok: true, surface: 'history-horizon' });
  });

  it('falls through to the next surface rather than blocking all output', () => {
    const perSurface = { 'history-horizon': mem({ dismissed: DISMISSALS_TO_RETIRE }) };
    expect(ask({ days, memory: { perSurface } }))
      .toEqual({ ok: true, surface: 'month-milestone', trigger: '31 days logged' });
  });

  it('goes quiet once every triggering surface is retired', () => {
    const perSurface = {
      'history-horizon': mem({ dismissed: DISMISSALS_TO_RETIRE }),
      'month-milestone': mem({ ignored: IGNORES_TO_RETIRE }),
    };
    expect(ask({ days, memory: { perSurface } })).toEqual({ ok: false, reason: 'no-trigger' });
  });
});
