/**
 * When to offer the morning reminder on the reading-complete card.
 *
 * A single reading is a snapshot; the thing the app is actually for is a
 * baseline taken under the same conditions each morning. The moment a user has
 * just finished a reading is the only moment that argument is obviously true,
 * so the offer lives at the top of the results card rather than in Settings.
 *
 * It is an offer, so it has to be able to be refused. The pacing is deliberately
 * blunt and finite: the first ✕ buys ten more readings of silence, and a second
 * ✕ when it comes back retires it for good. Nobody is asked a third time.
 *
 * Pure — the flags-MMKV half is ./reminderNudgeMemory, the same split as
 * upsell/annual + annualMemory.
 */

export type NudgeMemory = {
  /** How many times the ✕ has been pressed (0, 1, or 2 = retired). */
  dismissed: number;
  /** Readings finished since the first dismissal, while it is counting down. */
  since: number;
};

export const emptyNudgeMemory = (): NudgeMemory => ({ dismissed: 0, since: 0 });

/** Readings of silence bought by the first ✕. */
export const NUDGE_SKIP = 10;

/** 'skip' is distinct from 'never' because only a skip advances the counter. */
export type NudgeDecision = 'show' | 'skip' | 'never';

export function nudgeDecision(m: NudgeMemory, reminderOn: boolean): NudgeDecision {
  // Nothing to offer once it's armed — including when they armed it from here.
  if (reminderOn) return 'never';
  if (m.dismissed <= 0) return 'show';
  if (m.dismissed === 1) return m.since >= NUDGE_SKIP ? 'show' : 'skip';
  return 'never';
}

/** One more reading passed while the first dismissal is counting down. */
export function nudgeSkipped(m: NudgeMemory): NudgeMemory {
  return { ...m, since: m.since + 1 };
}

/** ✕. The second one retires the card permanently (nudgeDecision reads > 1). */
export function nudgeDismissed(m: NudgeMemory): NudgeMemory {
  return { dismissed: m.dismissed + 1, since: 0 };
}

/**
 * The time to pre-fill the offer with: the reading the user just took, rounded
 * to the nearest quarter hour, because "the same time each morning" means this
 * time. Outside a plausible morning window it falls back to `fallback` — an
 * evening reading is not a proposal for a morning alarm.
 */
export function suggestedReminderTime(readingTime: string, fallback: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(readingTime || '');
  if (!m) return fallback;
  const mins = Math.round((+m[1] * 60 + +m[2]) / 15) * 15;
  if (mins < 4 * 60 || mins > 11 * 60) return fallback;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
