/**
 * The founding-member offer — pure logic, unit-tested (see __tests__/founder).
 *
 * One card, once, on ONE day: the first time a user opens the app after they
 * have logged five days of their own content, while the install trial is still
 * running. It offers the first year of Pro at the introductory price.
 *
 * Five days is the point at which the app has something to show them that
 * isn't a demo — the Trend card, the first correlations, a real streak — and
 * the trial is the window in which they can still see it. Asking on day six of
 * a fourteen-day trial is asking someone who has just been convinced, rather
 * than someone whose access is about to be taken away.
 *
 * The day it is due is a strict "the day AFTER the fifth logged day": the fifth
 * day's own entries are still arriving, so a card that appeared halfway through
 * it would be congratulating a day in progress. `engagedBefore` counts only day
 * keys strictly earlier than `dk`, the same "the analysis window ends at the
 * last COMPLETE day" rule that ../insights uses.
 *
 * Once claimed, that calendar day is the whole life of the offer — it does not
 * come back tomorrow, and the ✕ / "No thanks" ends it early and permanently.
 * There is deliberately no second chance and no re-offer: an offer that returns
 * isn't a founding one.
 *
 * Pure: no store, no MMKV, no expo. ./founderMemory supplies the persistence and
 * ../../features/FounderOffer renders the thing.
 */
import type { DaysMap } from '../scoring/day';
import type { Tier } from '../tier';
import { engagedDayCount } from '../review/eligibility';

/** Days of the user's OWN content before the offer is due. */
export const FOUNDER_MIN_DAYS = 5;

export interface FounderMemory {
  /** The calendar day the card claimed. Its whole life; never re-claimed. */
  shownDk?: string;
  /** ✕ or "No thanks". Permanent — the offer never returns. */
  dismissed?: boolean;
}

export const emptyFounderMemory = (): FounderMemory => ({});

/**
 * Days carrying the user's own entries STRICTLY BEFORE `dk`.
 *
 * Imported Health rows don't count (that's `engagedDayCount`'s rule, reused
 * here) — five days of a backfill is not five days of using the app.
 */
export function engagedBefore(days: DaysMap, dk: string): number {
  const before: DaysMap = {};
  for (const k of Object.keys(days)) if (k < dk) before[k] = days[k];
  return engagedDayCount(before);
}

export interface FounderInput {
  days: DaysMap;
  /** Day being evaluated. */
  dk: string;
  /**
   * Only ever offered inside the install trial. 'pro' has nothing to sell and
   * 'free' means the trial already lapsed — at that point the user has met the
   * locks, and this is no longer the "you've seen it, keep it" moment the copy
   * claims to be. They get the regular paywall and the 30/90/180-day annual
   * offer instead.
   */
  tier: Tier;
  memory: FounderMemory;
  /** A sheet is open; the user is mid-task and not to be talked over. */
  sheetOpen?: boolean;
  /** The crash warning fired today (settings.crashAlert.lastFired === dk). */
  crashAlertFiredToday?: boolean;
  /** `detectDownturn` says the user is sliding. */
  downturn?: boolean;
  /**
   * Another offer was raised inside the shared cool-down (./pacing). The app
   * shows ONE offer at a time — and the annual card's 24h unlock reports
   * 'trial', so without this it made THIS card due the moment it appeared.
   */
  offerCooldown?: boolean;
  /**
   * The half-off annual window is running right now (./annual). Suppresses this
   * card outright — INCLUDING on a day it had already claimed, which is the one
   * thing the cool-down can't reach, because a claimed day renders from memory
   * and never asks again. That's how a phone already holding both offers gets
   * back to showing one: the live window wins, since it is the offer the user
   * can currently act on and it is over within a day.
   */
  annualOfferLive?: boolean;
}

export type FounderVerdict =
  /** Render it. `claim` is true the first time, i.e. when the shell must stamp
   *  `shownDk` — a card re-rendering on its own claimed day must not re-write. */
  | { ok: true; claim: boolean }
  | { ok: false; reason: string };

/**
 * Should the founding-member card be on screen right now?
 *
 * Note what a bad day does here: it does NOT spend the offer, it defers it. The
 * window is a single day, so suppressing on a crash-alert day the way every
 * other surface does would silently throw the offer away rather than delay it.
 * The card simply isn't due yet, and lands on a calmer open instead — the same
 * "the milestone stays due" behaviour as ./annual.
 */
export function founderVerdict(input: FounderInput): FounderVerdict {
  const { days, dk, tier, memory } = input;

  if (memory.dismissed) return { ok: false, reason: 'dismissed' };
  // Checked BEFORE the claimed-day shortcut below: two offers on screen at once
  // is worse than this one going quiet, whatever it has already claimed.
  if (input.annualOfferLive) return { ok: false, reason: 'annual-offer-live' };
  // Already claimed a day. Today or never.
  if (memory.shownDk) {
    return memory.shownDk === dk ? { ok: true, claim: false } : { ok: false, reason: 'day-passed' };
  }

  if (tier !== 'trial') return { ok: false, reason: tier === 'pro' ? 'already-pro' : 'trial-over' };
  if (engagedBefore(days, dk) < FOUNDER_MIN_DAYS) return { ok: false, reason: 'too-few-days' };

  // Deferrals — the offer stays due and fires on a calmer open.
  if (input.sheetOpen) return { ok: false, reason: 'sheet-open' };
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.downturn) return { ok: false, reason: 'downturn' };
  if (input.offerCooldown) return { ok: false, reason: 'offer-cooldown' };

  return { ok: true, claim: true };
}

/**
 * "30%" off, computed from the two localized prices the store actually returned
 * rather than hardcoded from the App Store Connect setup.
 *
 * Null when either price doesn't parse, in which case the caller drops the
 * claim rather than guessing — a discount percentage that doesn't match what
 * the store charges is the kind of thing review rejects, and the introductory
 * price is a per-territory setting we don't control from here.
 */
export function discountPct(introPrice: string, fullPrice: string): number | null {
  const amount = (s: string): number | null => {
    const m = s.match(/\d[\d.,\s]*/);
    if (!m) return null;
    // Strip grouping separators, keep the last separator as the decimal point:
    // handles "1.234,56" and "1,234.56" alike.
    const raw = m[0].replace(/\s/g, '');
    const lastSep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
    const norm = lastSep >= 0 && raw.length - lastSep <= 3
      ? `${raw.slice(0, lastSep).replace(/[.,]/g, '')}.${raw.slice(lastSep + 1)}`
      : raw.replace(/[.,]/g, '');
    const n = parseFloat(norm);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const intro = amount(introPrice);
  const full = amount(fullPrice);
  if (intro == null || full == null || intro >= full) return null;
  const pct = Math.round((1 - intro / full) * 100);
  return pct >= 5 ? pct : null;
}
