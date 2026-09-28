/**
 * The Dysautonomia Awareness Month giveaway: when it runs and how many entries
 * a journal has earned. Pure — the card and the entry sheet live in
 * features/Giveaway.tsx, the "has this install entered" memory beside them.
 *
 * An entry is a DAY with an HRV reading that counts (`hasHrvReadingOn`, so a
 * short imported sample earns nothing, the same rule every average follows),
 * one per day, capped at `GIVEAWAY_MAX_ENTRIES`. Only the fact that a reading
 * was taken ever leaves the phone, never the reading.
 */
import type { AppState } from './types';
import { isTrustedReading } from './hrvQuality';
import { methodCode, type MethodCode } from './ping';

/** First and last day readings count, inclusive (Dysautonomia Awareness Month). */
export const GIVEAWAY_START = '2026-10-01';
export const GIVEAWAY_END = '2026-10-31';
export const GIVEAWAY_MAX_ENTRIES = 10;
export const GIVEAWAY_INFO_URL = 'https://autonomic.care/dysautonomia-awareness-giveaway/';

/** Is the card shown on this day? From now until the last day of the window. */
export const giveawayOpen = (dk: string): boolean => dk <= GIVEAWAY_END;

/** One earned entry as the sign-up sends it: the day, and the sensor letter of
 *  that day's first counting reading (`null` for one with no live sensor, e.g.
 *  an import). Never the reading itself. */
export interface GiveawayEntry { d: string; m: MethodCode | null }

const HRV_TYPES = new Set(['hrv', 'breathHrv']);

/** Entries earned by `dk`, oldest first: days inside the window, up to and
 *  including `dk`, holding a reading that counts, capped at the maximum. Day
 *  keys are ISO, so a string compare is a date compare. */
export function giveawayEntryList(days: AppState['days'] | undefined, dk: string): GiveawayEntry[] {
  const out: GiveawayEntry[] = [];
  for (const k of Object.keys(days || {}).sort()) {
    if (k < GIVEAWAY_START || k > GIVEAWAY_END || k > dk) continue;
    const readings = (days![k].readings || [])
      .filter((r) => HRV_TYPES.has(r.type) && isTrustedReading(r))
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    if (!readings.length) continue;
    out.push({ d: k, m: methodCode(readings[0].source as string | undefined) ?? null });
    if (out.length >= GIVEAWAY_MAX_ENTRIES) break;
  }
  return out;
}

export const giveawayEntries = (days: AppState['days'] | undefined, dk: string): number =>
  giveawayEntryList(days, dk).length;

/** What the sign-up POSTs. `dev` marks a development build's row on the
 *  dashboard rather than keeping it off the server, so the flow can be tested
 *  end to end. */
export const giveawayBody = (email: string, entries: GiveawayEntry[], dev: boolean) =>
  ({ email: email.trim().toLowerCase(), entries, dev });

/** Deliberately loose: the store of record is the server, and a strict pattern
 *  here only refuses real addresses. Something@something.tld is the bar. */
export const isPlausibleEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
