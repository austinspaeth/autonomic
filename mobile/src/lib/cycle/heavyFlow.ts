/**
 * The heavy-flow note. Pure.
 *
 * Heavy periods are a common, under-asked cause of low iron, and low iron is a
 * well-known aggravator of POTS symptoms (fatigue, dizziness, a higher heart
 * rate on standing). The note says that, once, and suggests one thing: asking a
 * doctor about checking iron. It never names a condition, never grades a
 * period, and wears no grade colour.
 *
 * It needs a PATTERN, not a bad month: heavy flow on at least `HEAVY_DAYS` days
 * in `HEAVY_CYCLES` of the last `WINDOW` finished cycles.
 */
import type { CycleModel } from './model';

export const HEAVY_DAYS = 2;
export const HEAVY_CYCLES = 3;
export const WINDOW = 4;

export function heavyFlowPattern(model: CycleModel | null): { heavy: number; of: number } | null {
  if (!model) return null;
  const done = model.cycles.filter((c) => c.next && c.plausible).slice(-WINDOW);
  if (done.length < HEAVY_CYCLES) return null;
  const heavy = done.filter((c) => c.period.heavyDays >= HEAVY_DAYS).length;
  return heavy >= HEAVY_CYCLES ? { heavy, of: done.length } : null;
}

export const heavyFlowCopy = (p: { heavy: number; of: number }) =>
  `You logged heavy flow in ${p.heavy} of your last ${p.of} cycles. Heavy periods can lower iron, which can add to fatigue and dizziness. It may be worth asking your doctor about checking your iron.`;
