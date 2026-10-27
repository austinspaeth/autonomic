import { buildCycleModel, shiftDay } from '..';
import { capacityLine, phaseCapacity } from '../capacity';

const starts = Array.from({ length: 5 }, (_, i) => shiftDay('2026-01-05', i * 28));
const days: Record<string, { cycle: { flow: 'medium' } }> = {};
starts.forEach((s) => { for (let i = 0; i < 5; i++) days[shiftDay(s, i)] = { cycle: { flow: 'medium' } }; });
const today = shiftDay(starts[4], 20);
const m = buildCycleModel({ days, mode: 'regular', today });

it('compares held-day spend in this phase with all held days', () => {
  const rows = [];
  for (let dk = starts[0]; dk < starts[4]; dk = shiftDay(dk, 1)) {
    const ph = m.phaseOn(dk)?.phase;
    rows.push({ dk, spendMin: ph === 'luteal' || ph === 'premenstrual' ? 80 : 100, outcome: 'held' });
  }
  const c = phaseCapacity(m, rows, today)!;
  expect(c.group).toBe('luteal');
  expect(c.cycles).toBe(4);
  expect(c.pct).toBeLessThan(0);
  expect(capacityLine(c)).toMatch(/^Your last 4 luteal phases held about \d+% less than usual\.$/);
});

it('ignores days that dipped, and says nothing without enough held days', () => {
  expect(phaseCapacity(m, [{ dk: today, spendMin: 50, outcome: 'dipped' }], today)).toBeNull();
});

it('calls a small difference about the same', () => {
  expect(capacityLine({ group: 'luteal', pct: -3, cycles: 4 })).toBe('Your last 4 luteal phases held about as much as usual.');
});
