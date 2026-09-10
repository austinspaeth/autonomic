/**
 * The ONE next thing to log. Never two.
 *
 * A list of chores is the fastest way to make somebody close an app, and this
 * audience opens it on days when three tasks is three too many. So the strip
 * shows a single "Todo", the most valuable one first, and the rest stay
 * invisible until that one is done.
 *
 * The order is by how much the missing input is WORTH to the budget, not by
 * how easy it is: HRV first because everything downstream is built from it,
 * then last night's sleep, then the standing test that fits the upright band
 * to this person, then steps, which is the one passive signal every user has
 * whether or not they own a wearable.
 *
 * Pure: no store, no native, no React.
 */
import { hasHrvReading, isTrustedReading } from '../hrvQuality';
import { sleepHours, type DaysMap } from '../scoring/day';
import type { Entry } from '../types';
import { LEARN_DAYS } from './baseline';

/**
 * Every Todo names something the user ALREADY does in this app: take a
 * reading, log a night, log a session, connect a source. Nothing here may be a
 * question the pacing budget invented for itself — a card that interrogates
 * the reader is a card they stop opening.
 */
export type RecommendationId = 'hrv' | 'sleep' | 'orthostatic' | 'steps' | 'activity' | 'learning';

export interface Recommendation {
  id: RecommendationId;
  /** The whole subtext line, "Todo: " included where it belongs. */
  title: string;
  /** False for the ones that are a statement rather than a task. */
  actionable: boolean;
}

/** After this hour, a day with nothing logged and no series is worth asking
 *  about. Before it, the user may simply not have done anything yet. */
const ACTIVITY_ASK_HOUR = 14;

export interface RecommendInput {
  days: DaysMap;
  dk: string;
  /** Minutes past midnight. */
  nowMin: number;
  /** 0..1 from the envelope. */
  learning: number;
  heldDays: number;
  /** The upright signature's source, so a default band asks for a stand test. */
  signatureSource: 'standTest' | 'orthostatic' | 'default' | null;
  hasHrSeries: boolean;
  stepsGranted: boolean;
  spentShare: number;
}

export function nextRecommendation(input: RecommendInput): Recommendation | null {
  const { days, dk } = input;
  const day = days[dk];

  // 1. HRV. Everything downstream is built from it, so it always leads.
  const hrvToday = (day?.readings || []).some(
    (r: Entry) => (r.type === 'hrv' || r.type === 'breathHrv') && isTrustedReading(r),
  );
  if (!hrvToday) return { id: 'hrv', title: 'Todo: Take an HRV reading', actionable: true };

  // 2. Last night's sleep.
  if (sleepHours(days, dk) == null) return { id: 'sleep', title: 'Todo: Log your sleep', actionable: true };

  // 3. A standing test, but only when there is a heart-rate series for it to
  //    calibrate. Without one there is no standing band to fit.
  if (input.hasHrSeries && input.signatureSource === 'default') {
    return { id: 'orthostatic', title: 'Todo: Log a standing test', actionable: true };
  }

  // 4. Steps. Every phone counts them; this is the passive floor.
  if (!input.stepsGranted) return { id: 'steps', title: 'Todo: Connect steps', actionable: true };

  // 5. A day with nothing in it by mid-afternoon.
  const hour = Math.floor(input.nowMin / 60);
  if (hour >= ACTIVITY_ASK_HOUR && !(day?.activities || []).length && !input.hasHrSeries) {
    return { id: 'activity', title: 'Todo: Log what you did this morning', actionable: true };
  }

  // 6. Nothing missing, but the ceiling is still being fitted. A statement,
  //    not a task, so the line is never empty during the learning period.
  if (input.learning < 1) {
    const day1 = Math.min(LEARN_DAYS, input.heldDays + 1);
    return { id: 'learning', title: `Learning your ceiling, day ${day1} of ${LEARN_DAYS}`, actionable: false };
  }

  return null;
}

/** Re-exported for the sheet's empty state, which asks the same question. */
export { hasHrvReading };
