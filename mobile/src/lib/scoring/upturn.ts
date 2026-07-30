/**
 * Upturn detection — the mirror of ./downturn, and the only thing that decides
 * a day is going well enough to ask the user for an App Store review.
 *
 * Deliberately NOT "is today green". Plenty of people with a real autonomic
 * condition never reach an Excellent day, and gating the ask on a score they
 * can't hit would mean never asking the users who get the most out of the app.
 * What matters is direction: today sits clearly above their own recent
 * baseline. The one absolute is a floor — a day still scoring Bad or Crash is
 * never a good moment to ask for anything, however much it improved.
 *
 * Pure: days map in, verdict out.
 */
import { addDays, dateFromKey } from '../dates';
import type { ScoreContext } from './index';
import { scoreSet, type DaysMap } from './day';

export interface Upturn {
  /** Today's score. */
  score: number;
  /** Points gained from the recent baseline to today. */
  gain: number;
  /** Calendar days the climb covers. */
  spanDays: number;
  /** Consecutive improving days ending today (0 when the rise isn't stepped). */
  rising: number;
}

const WINDOW = 8;      // days examined, ending at dk
const MIN_SCORED = 4;  // scored days required before a trend means anything
/** Below this, today is a Bad or Crash day — never a moment to ask for a favour. */
export const MIN_TODAY = 40;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function detectUpturn(days: DaysMap, dk: string, ctx: ScoreContext = {}): Upturn | null {
  const scored: { k: string; s: number }[] = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const k = addDays(dk, -i);
    const d = days[k];
    if (!d) continue;
    const rs = (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    const { score } = scoreSet(rs, d, k, days, ctx);
    if (score != null) scored.push({ k, s: score });
  }
  const n = scored.length;
  if (n < MIN_SCORED || scored[n - 1].k !== dk) return null;

  const today = scored[n - 1].s;
  if (today < MIN_TODAY) return null;

  const baseline = mean(scored.slice(0, -2).map((x) => x.s));
  const recent = mean(scored.slice(-2).map((x) => x.s));

  // Consecutive improving steps ending today (a 1-pt wobble doesn't count).
  let rising = 0;
  while (rising < n - 1 && scored[n - 2 - rising].s + 1 < scored[n - 1 - rising].s) rising++;
  const risingGain = rising ? today - scored[n - 1 - rising].s : 0;

  // Three ways up, mirroring the three ways down: the last couple of days have
  // lifted the average and today holds it, a run of improving days, or today
  // simply landing well clear of the baseline.
  const sustained = recent - baseline >= 8 && today >= baseline + 5;
  const stepped = rising >= 2 && risingGain >= 10;
  const sharp = today >= baseline + 12;
  if (!sustained && !stepped && !sharp) return null;

  const startIdx = Math.max(0, n - 4);
  const spanDays = Math.max(2, Math.round((dateFromKey(dk).getTime() - dateFromKey(scored[startIdx].k).getTime()) / 86400000));

  return { score: today, gain: Math.round(today - baseline), spanDays, rising };
}
