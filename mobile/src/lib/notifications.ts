/**
 * What the app's local notifications SAY, and when the ones that are decided
 * rather than scheduled may fire. The shell is ./reminders.
 *
 * A notification arrives with no screen around it, so each one has to carry its
 * own facts: a reading's own number, the day's own verdict, the user's own
 * link. One that could have been written before anything happened is a canned
 * message, and a canned message is the kind people learn to swipe away.
 *
 * Pure: no store, no expo, no React.
 */
import type { HrvResult } from './hrv';

export interface NotificationCopy {
  title: string;
  body: string;
}

/* ---------- a reading that finished while the app was in the background ---------- */

/**
 * What a reading finishing out of sight says. It used to be "Open Autonomic to
 * save it" for every reading, which was wrong twice over: a reading that passes
 * is filed without a question, and a reading the app REFUSES was announced as
 * complete. So the verdict is taken first, the same `computeHrv` the results
 * card runs, and the notification says which of three things happened.
 *
 * `result` is null for a reading taken on a watch, whose beats have not reached
 * the phone yet when the session ends.
 */
export function readingDoneCopy(result: HrvResult | null, watchName?: string): NotificationCopy {
  if (!result) {
    return {
      title: 'Reading complete',
      body: `Open Autonomic to bring it in from your ${watchName || 'watch'}.`,
    };
  }
  if (result.ok) {
    const rmssd = Number(result.fields.rmssd);
    const hr = Number(result.fields.hr);
    const parts = [
      Number.isFinite(rmssd) ? `RMSSD ${Math.round(rmssd)} ms` : null,
      Number.isFinite(hr) ? `heart rate ${Math.round(hr)} bpm` : null,
    ].filter(Boolean);
    return {
      title: 'Reading complete',
      body: parts.length
        ? `${capitalise(parts.join(', '))}. It is in your journal.`
        : 'It is in your journal.',
    };
  }
  if (result.salvageable) {
    return {
      title: 'Your reading needs a decision',
      body: `It came out noisier than the app will file on its own (${Math.round(result.artifactPct)}% artifacts). Open Autonomic to keep it or try again.`,
    };
  }
  return {
    title: 'That reading could not be used',
    body: 'Too little clean pulse came through to measure. Open Autonomic to see what usually fixes it.',
  };
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------- the morning reminder ---------- */

/** How many mornings ahead are armed at once. A week, so somebody who does not
 *  open the app for a few days is still reminded, well inside iOS's 64. */
export const MORNING_AHEAD = 7;

/**
 * The instants the morning reminder should fire at, soonest first.
 *
 * It used to be one repeating DAILY trigger, which cannot skip a day: it told
 * somebody who had measured at 7:30 to take their morning reading at 8:00. So
 * each morning is its own one-shot, re-planned on launch, foreground and after
 * every journal change, and today's is left out once today holds a reading
 * (or its time has passed).
 */
export function morningFireTimes(now: Date, hhmm: string, readingToday: boolean, ahead = MORNING_AHEAD): Date[] {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8;
  const minute = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0;
  const out: Date[] = [];
  for (let i = 0; out.length < ahead && i <= ahead; i++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (i === 0 && (readingToday || t.getTime() <= now.getTime())) continue;
    out.push(t);
  }
  return out;
}

/* ---------- low barometric pressure ---------- */

/** No pressure notification before this hour or from this hour on. A weather
 *  note is not worth waking anybody for, and in the evening the day is spent. */
export const PRESSURE_FROM_HOUR = 7;
export const PRESSURE_UNTIL_HOUR = 20;

export interface PressureAlertInput {
  /** `settings.pressureAlert?.enabled`; undefined reads as on. */
  enabled: boolean | undefined;
  lastFired: string | undefined;
  dk: string;
  hour: number;
  /** Today reads LOW against the user's own normal (lib/pressure). */
  low: boolean;
  /** A link the Insights sweep has actually found, pointing the bad way. */
  linked: boolean;
  /** Either warning detector has something to say today, or the crash
   *  notification already fired: one warning a day, the Journal card's rule. */
  otherWarning: boolean;
}

export type PressureAlertVerdict = 'fire' | 'quiet';

/**
 * Whether today's low pressure is worth a notification. Only ever about THIS
 * person's own found link, which is the rule the Journal card already follows:
 * nobody is told the weather gets to them because a textbook says it might.
 */
export function pressureAlertVerdict(i: PressureAlertInput): PressureAlertVerdict {
  if (i.enabled === false) return 'quiet';
  if (i.lastFired === i.dk) return 'quiet';
  if (!i.low || !i.linked || i.otherWarning) return 'quiet';
  if (i.hour < PRESSURE_FROM_HOUR || i.hour >= PRESSURE_UNTIL_HOUR) return 'quiet';
  return 'fire';
}
