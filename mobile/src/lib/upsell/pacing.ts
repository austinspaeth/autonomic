/**
 * The shared cool-down between offers — pure logic, unit-tested
 * (see __tests__/pacing).
 *
 * There are exactly two proactive offers (./annual, ./founder) and each owns
 * its own trigger, but "when may an offer be raised AT ALL" is not a question
 * either of them can answer alone: each one only knows about itself. The result
 * shipped: the annual card's 24-hour window reports 'trial' (src/store/tier.ts
 * grants the unlock), the founding-member card fires inside a trial, so opening
 * the annual offer immediately made the founder card due and the Journal showed
 * a half-price year with "join us early" stacked underneath it. Two offers at
 * once is worse than either offer alone.
 *
 * So the two share ONE clock. An offer may only OPEN when nothing else has been
 * raised in the last `OFFER_COOLDOWN_MS`, and opening one stamps it. This is a
 * gate on STARTING, never on rendering: a card that has already claimed its
 * window (the annual card's live 24 hours, the founder card's claimed day) goes
 * on drawing itself against its own memory, or the clock it set would retire it
 * a frame after it appeared.
 *
 * Blocked is DEFERRED, not spent — the same rule both offers already follow for
 * a crash-alert day. The annual milestone stays due and fires a week later; the
 * founder card, which lives for a single day, simply is not due yet.
 *
 * Pure: no store, no MMKV, no expo. ./pacingMemory supplies the persistence.
 */

const DAY_MS = 86_400_000;

/** How long the app stays quiet after raising any offer. */
export const OFFER_COOLDOWN_MS = 7 * DAY_MS;

/** The offers that share the clock. A string rather than a union of the two
 *  names so a third offer is a new module and not an edit here. */
export type OfferSurface = 'annual' | 'founder';

export interface OfferPacing {
  /** Which offer was last raised — diagnostics, and the reason a blocked card
   *  can say what blocked it. */
  lastSurface?: OfferSurface;
  /** When it was raised, epoch ms. */
  lastShownAtMs?: number;
}

export const emptyOfferPacing = (): OfferPacing => ({});

/**
 * Milliseconds until another offer may be raised (0 when one may be now).
 *
 * A stamp in the future means the clock was rolled back after stamping; clamp
 * it to now rather than holding the cool-down open forever, the same defence
 * `offerMsLeft` (./annual) makes.
 */
export function offerCooldownMsLeft(nowMs: number, m: OfferPacing): number {
  const at = m.lastShownAtMs;
  if (at == null || !Number.isFinite(at)) return 0;
  return Math.max(0, Math.min(at, nowMs) + OFFER_COOLDOWN_MS - nowMs);
}

/** May an offer be OPENED right now? (Never asked about one already running.) */
export function offerAllowed(nowMs: number, m: OfferPacing): boolean {
  return offerCooldownMsLeft(nowMs, m) <= 0;
}

/** Stamp the clock. Called when an offer's window OPENS, not when it renders. */
export function noteOffer(m: OfferPacing, surface: OfferSurface, nowMs: number): OfferPacing {
  return { ...m, lastSurface: surface, lastShownAtMs: nowMs };
}
