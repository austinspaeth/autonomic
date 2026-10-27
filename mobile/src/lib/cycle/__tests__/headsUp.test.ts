import { buildCycleModel, shiftDay } from '..';
import { HEADS_UP_COPY, headsUpAt } from '../headsUp';

const starts = Array.from({ length: 4 }, (_, i) => shiftDay('2026-01-05', i * 28));
const days: Record<string, { cycle: { flow: 'medium' } }> = {};
starts.forEach((s) => { for (let i = 0; i < 5; i++) days[shiftDay(s, i)] = { cycle: { flow: 'medium' } }; });

it('never names a period or a cycle on the lock screen', () => {
  const text = `${HEADS_UP_COPY.title} ${HEADS_UP_COPY.body}`.toLowerCase();
  for (const w of ['period', 'cycle', 'menstru', 'pms', 'ovulat', 'bleed']) expect(text).not.toContain(w);
});

it('fires two mornings before the early edge, never late, regular mode only', () => {
  const m = buildCycleModel({ days, mode: 'regular', today: '2026-04-10' });
  const at = headsUpAt(m, new Date(2026, 3, 10, 12));
  expect(at && `${at.getMonth() + 1}/${at.getDate()} ${at.getHours()}`).toBe(`4/${Number(m.prediction!.early.slice(8)) - 2} 9`);
  expect(headsUpAt(m, new Date(2026, 4, 30))).toBeNull();
  expect(headsUpAt(buildCycleModel({ days, mode: 'irregular', today: '2026-04-10' }), new Date(2026, 3, 10))).toBeNull();
});
