/**
 * "Your last 4 luteal phases held about 15% less than usual" — the pacing
 * sheet's cycle row. Pure.
 *
 * Held-day spend is the budget's own evidence of capacity (src/lib/budget
 * `calibrate`: what a day cost when the days after it held up), so a phase's
 * capacity is the median spend on HELD days in that phase, against the median
 * on every held day. A description of this person's own record, never an input
 * to the envelope here, and silent without enough of it: a pattern needs
 * `PATTERN_MIN_CYCLES` and enough held days on both sides.
 */
import { groupOf, type PhaseGroup } from './ambient';
import type { CycleModel } from './model';

export const CAPACITY_MIN_DAYS = 5;

export interface PhaseCapacity { group: PhaseGroup; pct: number; cycles: number }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function phaseCapacity(
  model: CycleModel | null,
  rows: { dk: string; spendMin: number; outcome: string }[],
  dk: string,
): PhaseCapacity | null {
  if (!model?.patternReady) return null;
  const ph = model.phaseOn(dk)?.phase;
  if (!ph) return null;
  const group = groupOf(ph);
  const all: number[] = [];
  const inPhase: number[] = [];
  const cycles = new Set<string>();
  for (const r of rows) {
    if (r.outcome !== 'held' || !(r.spendMin > 0)) continue;
    all.push(r.spendMin);
    const p = model.phaseOn(r.dk);
    if (p?.phase && !p.predicted && groupOf(p.phase) === group) { inPhase.push(r.spendMin); cycles.add(p.cycleStart); }
  }
  if (inPhase.length < CAPACITY_MIN_DAYS || all.length < CAPACITY_MIN_DAYS * 2) return null;
  const usual = median(all);
  if (!(usual > 0)) return null;
  return { group, pct: Math.round((median(inPhase) / usual - 1) * 100), cycles: cycles.size };
}

const GROUP_NOUN: Record<PhaseGroup, string> = {
  menstrual: 'periods', follicular: 'follicular phases', luteal: 'luteal phases', premenstrual: 'pre-period stretches',
};

/** The sentence. Within 5% is "about the same", never a claim either way. */
export function capacityLine(c: PhaseCapacity): string {
  const head = `Your last ${c.cycles} ${GROUP_NOUN[c.group]} held`;
  if (Math.abs(c.pct) < 5) return `${head} about as much as usual.`;
  return `${head} about ${Math.abs(c.pct)}% ${c.pct < 0 ? 'less' : 'more'} than usual.`;
}
