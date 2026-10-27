/**
 * The overnight temperature shift that follows ovulation. Pure.
 *
 * Progesterone raises resting temperature by roughly 0.2-0.5 °C after
 * ovulation and holds it there until the next period. The classic way to see
 * it is the "three over six" rule: three readings in a row, each at least
 * `SHIFT_MIN_C` above the highest of the six before them. Ovulation is taken
 * as the day BEFORE the first raised reading.
 *
 * Two sources, never mixed: a basal thermometer (`bbt`) and the Apple Watch /
 * Health Connect overnight wrist or skin temperature (`wrist`). They sit at
 * different absolute levels — a wrist reads a degree or more under the mouth —
 * so a day holding one and a day holding the other are not comparable, and a
 * run stitched across both would invent shifts out of the source change. The
 * thermometer wins when both cover a cycle: it is the measurement the rule
 * was built for. Health Connect's `skin` is a delta from the wearable's own
 * baseline; the rule only ever compares readings with each other, so a delta
 * series works the same way, and it is the third choice.
 *
 * Unknown is never a shift. Missing nights are skipped rather than
 * interpolated, but the comparison window has a span limit
 * (`MAX_WINDOW_SPAN_DAYS`), so a run of readings scattered over three weeks
 * is not read as six consecutive nights.
 */
import type { BodyTempMap } from '../types';
import { dayDiff, shiftDay } from './periods';

export const SHIFT_MIN_C = 0.2;
export const BASELINE_READINGS = 6;
export const HIGH_READINGS = 3;
/** The baseline six and the high three must all fall inside this many days. */
export const MAX_WINDOW_SPAN_DAYS = 13;
/** Ovulation is never placed in the first week of a cycle, however the
 *  numbers fall: that is the period and the days after it, and a fever or a
 *  bad night there is not a luteal phase. */
export const EARLIEST_OVULATION_DAY = 8;

export type TempSource = 'bbt' | 'wrist' | 'skin';

/**
 * The ovulation day the temperature says, between `from` and `to` inclusive
 * (normally the cycle's start and the day before the next one, or today), or
 * null. `from` is day 1 of the cycle.
 */
export function detectOvulation(temps: BodyTempMap | undefined, from: string, to: string): { dk: string; source: TempSource } | null {
  if (!temps) return null;
  for (const source of ['bbt', 'wrist', 'skin'] as const) {
    const run: { dk: string; t: number }[] = [];
    for (let dk = from; dk <= to; dk = shiftDay(dk, 1)) {
      const t = temps[dk]?.[source];
      if (typeof t === 'number') run.push({ dk, t });
    }
    const hit = threeOverSix(run, from);
    if (hit) return { dk: hit, source };
  }
  return null;
}

function threeOverSix(run: { dk: string; t: number }[], cycleStart: string): string | null {
  for (let i = BASELINE_READINGS; i + HIGH_READINGS <= run.length; i++) {
    const base = run.slice(i - BASELINE_READINGS, i);
    const high = run.slice(i, i + HIGH_READINGS);
    if (dayDiff(base[0].dk, high[HIGH_READINGS - 1].dk) > MAX_WINDOW_SPAN_DAYS) continue;
    const ceiling = Math.max(...base.map((b) => b.t));
    if (!high.every((h) => h.t >= ceiling + SHIFT_MIN_C)) continue;
    const ovulation = shiftDay(high[0].dk, -1);
    if (dayDiff(cycleStart, ovulation) + 1 < EARLIEST_OVULATION_DAY) continue;
    return ovulation;
  }
  return null;
}
