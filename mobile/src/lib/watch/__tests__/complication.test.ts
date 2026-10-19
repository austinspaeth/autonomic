import {
  COMPLICATION_MIN_GAP_MS, COMPLICATION_RESERVE, complicationKey, shouldPushComplication, watchScore,
} from '../complication';
import type { WatchPacing } from '../pacing';
import type { WidgetPayload, WidgetPacingFrame } from '../../widgets';

const frame = (at: string, state: WidgetPacingFrame['state']): WidgetPacingFrame => ({
  at, state, figure: '3h', unit: '', soft: false, figureColor: '#fff', sub: '', subWide: '',
  fill: 0.4, fillColor: '#16a34a', pace: 0.5, ember: null, badge: '', badgeColor: '#fff', tiles: [],
} as unknown as WidgetPacingFrame);

const pacing = (frames: WidgetPacingFrame[]): WatchPacing => ({ schemaVersion: 1, date: '2026-10-18', frames });

describe('watchScore', () => {
  it('rounds the score and zeroes an unscored day', () => {
    const base = { date: '2026-10-18', label: 'Good', color: '#16a34a' } as WidgetPayload;
    expect(watchScore({ ...base, hasScore: true, score: 82.6 }).score).toBe(83);
    expect(watchScore({ ...base, hasScore: false, score: 0, label: 'Awaiting data' })).toMatchObject({
      hasScore: false, score: 0, date: '2026-10-18',
    });
  });
});

describe('complicationKey', () => {
  const now = new Date('2026-10-18T15:00:00.000Z');
  it('reads the pacing state in force now, not the first or last frame', () => {
    const p = pacing([
      frame('2026-10-18T13:00:00.000Z', 'healthy'),
      frame('2026-10-18T14:45:00.000Z', 'ahead'),
      frame('2026-10-18T15:15:00.000Z', 'over'),
    ]);
    expect(complicationKey(null, p, now)).toContain('"ahead"');
  });
  it('ignores spend inside one state', () => {
    const a = pacing([{ ...frame('2026-10-18T13:00:00.000Z', 'healthy'), fill: 0.2 }]);
    const b = pacing([{ ...frame('2026-10-18T13:00:00.000Z', 'healthy'), fill: 0.3 }]);
    expect(complicationKey(null, a, now)).toBe(complicationKey(null, b, now));
  });
});

describe('shouldPushComplication', () => {
  const t0 = 1_000_000;
  const sent = (remaining: number) => ({ at: t0, key: 'k', remaining });

  it('always sends the first one', () => {
    expect(shouldPushComplication(null, 'k', t0)).toBe(true);
  });
  it('sends a change at once and holds unchanged spend to the gap', () => {
    expect(shouldPushComplication(sent(40), 'k2', t0 + 1000)).toBe(true);
    expect(shouldPushComplication(sent(40), 'k', t0 + 1000)).toBe(false);
    expect(shouldPushComplication(sent(40), 'k', t0 + COMPLICATION_MIN_GAP_MS)).toBe(true);
  });
  it('keeps the last of the budget for changes the glance would say', () => {
    const low = sent(COMPLICATION_RESERVE - 1);
    expect(shouldPushComplication(low, 'k', t0 + 10 * COMPLICATION_MIN_GAP_MS)).toBe(false);
    expect(shouldPushComplication(low, 'k2', t0 + 1000)).toBe(true);
  });
});
