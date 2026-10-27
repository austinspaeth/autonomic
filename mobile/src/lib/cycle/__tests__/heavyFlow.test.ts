import { buildCycleModel, shiftDay } from '..';
import { heavyFlowPattern } from '../heavyFlow';

function model(heavyCycles: boolean[]) {
  const days: Record<string, { cycle: { flow: 'medium' | 'heavy' } }> = {};
  heavyCycles.concat([false]).forEach((h, i) => {
    const s = shiftDay('2026-01-05', i * 28);
    for (let d = 0; d < 5; d++) days[shiftDay(s, d)] = { cycle: { flow: h && d < 2 ? 'heavy' : 'medium' } };
  });
  return buildCycleModel({ days, mode: 'regular', today: shiftDay('2026-01-05', heavyCycles.length * 28 + 3) });
}

it('needs heavy flow in three of the last four finished cycles', () => {
  expect(heavyFlowPattern(model([true, true, true, false]))).toEqual({ heavy: 3, of: 4 });
  expect(heavyFlowPattern(model([true, false, true, false]))).toBeNull();
  expect(heavyFlowPattern(model([true, true]))).toBeNull();
});
