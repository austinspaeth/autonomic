/**
 * What the Apple Watch's score and pacing complications are fed, and when the
 * phone may spend a wake-up on them.
 *
 * The score block is the widget payload's own score (`buildWidgetPayload`), so
 * the Outlook card, the home-screen Score widget and the wrist read the same
 * number in the same grade colour. Like the pacing block it carries its day
 * key, and the watch refuses one from a day that has passed.
 *
 * The application context reaches the watch only when the watch app next runs.
 * Complication user info wakes it in the background, so the face redraws with
 * the app closed, but Apple meters it (about 50 a day). `shouldPushComplication`
 * spends that budget on what a glance has to be right about: a new score, a
 * pacing state that flipped (on track to ahead, ahead to over), a new day. The
 * spend inside one state rides at most one wake-up per
 * `COMPLICATION_MIN_GAP_MS`, and once the budget runs low only the changes
 * that alter what the glance says are sent. The pace marker needs none of
 * this: the watch lays out one timeline entry per frame and walks it alone.
 */
import type { WidgetPayload } from '../widgets';
import type { WatchPacing } from './pacing';

export const WATCH_SCORE_SCHEMA = 1;

export interface WatchScore {
  schemaVersion: number;
  date: string;
  hasScore: boolean;
  /** Rounded, 0 while unscored. */
  score: number;
  /** The grade colour (SCORE_COLORS), dim grey while unscored. */
  color: string;
  label: string;
}

export function watchScore(payload: WidgetPayload): WatchScore {
  return {
    schemaVersion: WATCH_SCORE_SCHEMA,
    date: payload.date,
    hasScore: payload.hasScore,
    score: payload.hasScore ? Math.round(payload.score) : 0,
    color: payload.color,
    label: payload.label,
  };
}

/** Spend inside one pacing state is sent at most this often. */
export const COMPLICATION_MIN_GAP_MS = 20 * 60_000;
/** Below this many transfers left, only a change the glance would SAY is sent. */
export const COMPLICATION_RESERVE = 10;

export interface ComplicationSent {
  at: number;
  /** What the glance says: day, score, and the pacing state now in force. */
  key: string;
  /** Transfers the phone reported left after that send. */
  remaining: number;
}

/** The part of a push a glance would read differently. */
export function complicationKey(score: WatchScore | null, pacing: WatchPacing | null, now: Date): string {
  const nowIso = now.toISOString();
  let state = '';
  if (pacing) {
    const current = pacing.frames.filter((f) => f.at <= nowIso).pop() ?? pacing.frames[0];
    state = current?.state ?? '';
  }
  return JSON.stringify([
    score?.date ?? '', score?.hasScore ?? false, score?.score ?? 0,
    pacing?.date ?? '', state,
  ]);
}

export function shouldPushComplication(last: ComplicationSent | null, key: string, now: number): boolean {
  if (!last) return true;
  const changed = key !== last.key;
  if (last.remaining >= 0 && last.remaining < COMPLICATION_RESERVE) return changed;
  return changed || now - last.at >= COMPLICATION_MIN_GAP_MS;
}
