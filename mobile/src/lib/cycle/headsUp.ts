/**
 * The "heads-up before your period" notification. Pure: when to fire and what
 * it says.
 *
 * DISCREET BY RULE. A notification arrives on a lock screen anyone nearby can
 * read, so the words never name a period, a cycle or anything menstrual — a
 * test pins that. It says what is useful (plan lighter) and nothing about why;
 * the why is one tap away in an app behind the phone's own lock.
 *
 * Fires once, `HEADS_UP_DAYS` before the EARLY edge of the predicted range, in
 * the morning. Only a regular-mode forecast can arm it, and a moment already
 * past is never fired late: a heads-up after the fact is noise.
 */
import type { CycleModel } from './model';
import { shiftDay } from './periods';

export const HEADS_UP_DAYS = 2;
export const HEADS_UP_HOUR = 9;

export const HEADS_UP_COPY = {
  title: 'A heads-up',
  body: 'The next few days may be harder than usual. Plan a little lighter if you can.',
} as const;

/** The moment to fire, or null. Local time. */
export function headsUpAt(model: CycleModel | null, now: Date): Date | null {
  if (!model || model.mode !== 'regular' || !model.prediction) return null;
  const dk = shiftDay(model.prediction.early, -HEADS_UP_DAYS);
  const [y, m, d] = dk.split('-').map(Number);
  const at = new Date(y, m - 1, d, HEADS_UP_HOUR, 0, 0);
  return at.getTime() > now.getTime() ? at : null;
}
