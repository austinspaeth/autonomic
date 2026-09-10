import { watchPacing, watchPacingKey, WATCH_PACING_SCHEMA } from '../pacing';
import type { WidgetPacingFrame, WidgetPayload } from '../../widgets';

const frame = (at: string, fill: number): WidgetPacingFrame => ({
  at, state: 'healthy', figure: '3h 20m', unit: '', soft: false, figureColor: '#f2f2f5',
  sub: 'left of 5h 30m', subWide: 'left of 5h 30m today',
  fill, fillColor: '#3ec46d', pace: 0.46, ember: null,
  badge: 'ON TRACK', badgeColor: '#3ec46d',
  tiles: [{ value: '2h 10m', label: 'Spent', color: '#f2f2f5' }],
});

const payload = (frames: WidgetPacingFrame[], date = '2026-09-10') =>
  ({ date, pacing: { frames } } as unknown as WidgetPayload);

describe('watchPacing', () => {
  it('carries the day key and the widgets own frames, versioned', () => {
    const f = [frame('2026-09-10T10:00:00.000Z', 0.39)];
    const p = watchPacing(payload(f));
    expect(p).toEqual({ schemaVersion: WATCH_PACING_SCHEMA, date: '2026-09-10', frames: f });
  });

  it('keys identical content the same however the instants moved', () => {
    // The frames are absolute, so the same budget an hour later is not news:
    // the watch picks a later frame out of the list it already holds.
    const a = watchPacing(payload([frame('2026-09-10T10:00:00.000Z', 0.39)]));
    const b = watchPacing(payload([frame('2026-09-10T11:15:00.000Z', 0.39)]));
    expect(watchPacingKey(a)).toBe(watchPacingKey(b));
  });

  it('keys a moved budget differently', () => {
    const a = watchPacing(payload([frame('2026-09-10T10:00:00.000Z', 0.39)]));
    const b = watchPacing(payload([frame('2026-09-10T10:00:00.000Z', 0.55)]));
    expect(watchPacingKey(a)).not.toBe(watchPacingKey(b));
  });

  it('keys a new day differently even when the frames match', () => {
    const f = [frame('2026-09-10T10:00:00.000Z', 0.39)];
    expect(watchPacingKey(watchPacing(payload(f, '2026-09-10'))))
      .not.toBe(watchPacingKey(watchPacing(payload(f, '2026-09-11'))));
  });
});
