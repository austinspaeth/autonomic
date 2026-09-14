/**
 * The half-off annual offer — pure logic, unit-tested (see __tests__/annual).
 *
 * A free user who is still here at day 30, 90, 180 or 365 is asked, once, to
 * pay for the app. The card STANDS on the Journal until they answer it: the ✕
 * is the only thing that takes it down, and it comes back at the next milestone
 * rather than at a time of its own choosing.
 *
 * It used to be a 24-hour window that also unlocked Pro for the same day. Both
 * are gone. The unlock sold the wrong thing — a day of access somebody had to
 * spend before the card expired, which is a countdown wearing a gift's clothes —
 * and an offer that took itself down overnight meant the user who was too
 * unwell to read it that day simply never saw it. The ask now waits.
 *
 * Milestones are CALENDAR days since install, not days logged. That's a
 * deliberate difference from the surfaces in ./eligibility, which fire off
 * `engagedDayCount` because they're arguments about the user's own data. This
 * one isn't; it's a renewal-shaped moment, and it should land on day 30 whether
 * the user logged thirty days or three.
 *
 * The milestone is spent at the moment the card OPENS, not when it is answered:
 * `startOffer` consumes every milestone at or below the one being awarded. That
 * keeps a user who installs and disappears for 200 days from being handed four
 * offers in a row on their return — they get one, the highest they reached.
 *
 * Pure: no store, no MMKV, no expo. ./annualMemory supplies the persistence and
 * ../../features/AnnualOffer renders the thing.
 */

const DAY_MS = 86_400_000;

/** Days since install at which the offer may be raised, ascending. */
export const OFFER_MILESTONE_DAYS = [30, 90, 180, 365];

export interface AnnualOfferMemory {
  /** Milestones already spent. Written when a card OPENS, not when it is answered. */
  consumed: number[];
  /**
   * When the standing card was raised, epoch ms. Nothing gates on it any more —
   * it is kept because ./pacingMemory backfills the shared offer clock from it
   * on a phone that predates that clock, and the support dump reports it.
   */
  startedAtMs?: number;
  /**
   * The milestone the card on screen belongs to, or undefined when no card is
   * standing. Cleared by `dismissOffer` — that is the ✕, and it is what ends the
   * ask until the next milestone comes round.
   */
  milestone?: number;
}

export const emptyAnnualMemory = (): AnnualOfferMemory => ({ consumed: [] });

/**
 * Whole days elapsed since install. A stamp in the future means the clock was
 * rolled back after stamping; report 0 rather than a negative age, mirroring
 * the same defence in `trialMsLeft` (../tier.ts).
 */
export function daysSinceInstall(installedAtMs: number | null, nowMs: number): number {
  if (installedAtMs == null || !Number.isFinite(installedAtMs)) return 0;
  return Math.max(0, Math.floor((nowMs - Math.min(installedAtMs, nowMs)) / DAY_MS));
}

/** The card standing right now, if any. No clock: it stands until dismissed. */
export function liveOffer(m: AnnualOfferMemory): { milestone: number } | null {
  return m.milestone == null ? null : { milestone: m.milestone };
}

/**
 * The milestone that should RAISE a card right now, or null.
 *
 * Null while one is already standing — a card on screen isn't a due one — and
 * null once every reached milestone has been spent.
 */
export function dueMilestone(installedAtMs: number | null, nowMs: number, m: AnnualOfferMemory): number | null {
  if (m.milestone != null) return null;
  const age = daysSinceInstall(installedAtMs, nowMs);
  const spent = new Set(m.consumed);
  const reached = OFFER_MILESTONE_DAYS.filter((d) => age >= d && !spent.has(d));
  return reached.length ? Math.max(...reached) : null;
}

/**
 * Raise the card for `milestone`. Spends that milestone and every smaller one,
 * so a long absence collapses into a single ask.
 */
export function startOffer(m: AnnualOfferMemory, milestone: number, nowMs: number): AnnualOfferMemory {
  const spent = new Set(m.consumed);
  for (const d of OFFER_MILESTONE_DAYS) if (d <= milestone) spent.add(d);
  return { consumed: [...spent].sort((a, b) => a - b), startedAtMs: nowMs, milestone };
}

/**
 * The ✕. Takes the card down and leaves the milestone spent, so the next ask is
 * the next milestone and never this one again.
 */
export function dismissOffer(m: AnnualOfferMemory): AnnualOfferMemory {
  return { ...m, milestone: undefined };
}
