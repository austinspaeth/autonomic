/**
 * What the phone was told a Garmin reading WAS.
 *
 * The watch app has one reading and no idea whether the wearer is doing a
 * baseline or paced-breathing training: it records the beats and sends
 * `type: 'hrv'`. The choice lives on the phone — the user picked Training,
 * followed the breathing guide on the phone's session card, and the watch
 * simply supplied the beats. So without this every Garmin training reading
 * landed as a BASELINE, took the baseline slot in the day score, and never
 * counted as training at all.
 *
 * `beginCollection` arms an intent when a Garmin session starts; the receiver
 * asks `claimGarminIntent` whether an arriving reading is the one that session
 * was for, and if so files it under the phone's kind, pattern and period.
 *
 * Matched by the reading's own start time rather than by arrival: the watch
 * queues while the phone is unreachable, so the reading can land long after
 * the session ended, and an unrelated reading taken hours later must never be
 * relabelled by a session the user has forgotten about. One intent claims one
 * reading.
 *
 * Memory-only on purpose. Losing it (the app killed mid-reading) files the
 * reading as a baseline, which is exactly what happened before — the one
 * outcome that is never worse than today.
 */
import type { Entry } from '../types';

export interface GarminIntent {
  kind: 'breath' | 'unstructured';
  style?: string;
  period?: 'Morning' | 'Evening' | 'Other';
  /** When the phone's session started collecting. */
  armedAtMs: number;
}

/**
 * How far the watch's start may sit from the phone's. The wearer starts the
 * watch first and then taps "I started the reading", so the watch usually
 * leads — by however long the tap took. Ten minutes either side covers a slow
 * start without reaching into the next reading, which is five minutes long and
 * cannot start until this one ends.
 */
export const INTENT_WINDOW_MS = 10 * 60_000;

/** Does this entry belong to the session that armed `intent`? Pure. */
export function intentMatches(entry: Entry, intent: GarminIntent): boolean {
  if (entry.type !== 'hrv' || typeof entry.startedAt !== 'string') return false;
  const t = Date.parse(entry.startedAt);
  if (!isFinite(t)) return false;
  return Math.abs(t - intent.armedAtMs) <= INTENT_WINDOW_MS;
}

/**
 * The entry as the phone's session described it. Pure: returns a new entry.
 * Only the LABEL moves — the beats and every metric computed from them are the
 * same whichever kind of reading they were (`computeHrv` writes both `hr` and
 * `avgHr`, which is what the two types read).
 */
export function applyIntent(entry: Entry, intent: GarminIntent): Entry {
  const out: Entry = { ...entry };
  if (intent.kind === 'breath') {
    out.type = 'breathHrv';
    if (intent.style) out.style = intent.style;
  }
  if (intent.period) out.period = intent.period;
  return out;
}

let pending: GarminIntent | null = null;

export function armGarminIntent(intent: GarminIntent) { pending = intent; }

/** The matching intent, consumed; null when this reading is not the session's. */
export function claimGarminIntent(entry: Entry): GarminIntent | null {
  if (!pending || !intentMatches(entry, pending)) return null;
  const hit = pending;
  pending = null;
  return hit;
}

/** Tests only. */
export function resetGarminIntent() { pending = null; }
