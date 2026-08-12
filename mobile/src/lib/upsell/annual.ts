/**
 * The half-off annual offer — pure logic, unit-tested (see __tests__/annual).
 *
 * A free user who is still here at day 30, 90, 180 or 365 gets ONE shot at a
 * year of Pro at half price, and — because a discount on something you have
 * never used is not an argument — 24 hours of Pro unlocked alongside it. The
 * unlock and the offer are the same window: they start together when the card
 * is first shown and they end together.
 *
 * Milestones are CALENDAR days since install, not days logged. That's a
 * deliberate difference from the surfaces in ./eligibility, which fire off
 * `engagedDayCount` because they're arguments about the user's own data. This
 * one isn't; it's a renewal-shaped moment, and it should land on day 30 whether
 * the user logged thirty days or three.
 *
 * The window is spent at the moment it STARTS, not when it ends: `startOffer`
 * consumes every milestone at or below the one being awarded. That's what keeps
 * a user who installs and disappears for 200 days from being handed four
 * offers in a row on their return — they get one, the highest they reached.
 *
 * Pure: no store, no MMKV, no expo. ./annualMemory supplies the persistence and
 * ../../features/AnnualOffer renders the thing.
 */

const DAY_MS = 86_400_000;

/** Days since install at which the offer may be raised, ascending. */
export const OFFER_MILESTONE_DAYS = [30, 90, 180, 365];

/** How long the offer — and the Pro unlock riding with it — stays open. */
export const OFFER_WINDOW_MS = DAY_MS;

export interface AnnualOfferMemory {
  /** Milestones already spent. Written when a window OPENS, not when it closes. */
  consumed: number[];
  /** When the live window began, epoch ms. */
  startedAtMs?: number;
  /** Which milestone the live window belongs to. */
  milestone?: number;
  /**
   * The user collapsed the card. Remembered across launches so it stays
   * collapsed, but deliberately NOT carried by `startOffer` — a new milestone
   * is a new offer and opens expanded again.
   */
  collapsed?: boolean;
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

/** Milliseconds left in the live window (0 when none is running). */
export function offerMsLeft(nowMs: number, m: AnnualOfferMemory): number {
  const started = m.startedAtMs;
  if (started == null || !Number.isFinite(started)) return 0;
  // Clock rolled back below the stamp: treat the window as having started now,
  // so a wound-back device can't hold the unlock open indefinitely by drifting
  // further and further behind it.
  return Math.max(0, Math.min(started, nowMs) + OFFER_WINDOW_MS - nowMs);
}

/** The offer running right now, if any. */
export function liveOffer(nowMs: number, m: AnnualOfferMemory): { milestone: number; msLeft: number } | null {
  const msLeft = offerMsLeft(nowMs, m);
  if (msLeft <= 0 || m.milestone == null) return null;
  return { milestone: m.milestone, msLeft };
}

/**
 * The milestone that should OPEN a window right now, or null.
 *
 * Null while one is already live — a running offer isn't a due one — and null
 * once every reached milestone has been spent.
 */
export function dueMilestone(installedAtMs: number | null, nowMs: number, m: AnnualOfferMemory): number | null {
  if (offerMsLeft(nowMs, m) > 0) return null;
  const age = daysSinceInstall(installedAtMs, nowMs);
  const spent = new Set(m.consumed);
  const reached = OFFER_MILESTONE_DAYS.filter((d) => age >= d && !spent.has(d));
  return reached.length ? Math.max(...reached) : null;
}

/**
 * Open the window for `milestone`. Spends that milestone and every smaller one,
 * so the offer can never repeat and a long absence collapses into a single ask.
 */
export function startOffer(m: AnnualOfferMemory, milestone: number, nowMs: number): AnnualOfferMemory {
  const spent = new Set(m.consumed);
  for (const d of OFFER_MILESTONE_DAYS) if (d <= milestone) spent.add(d);
  return { consumed: [...spent].sort((a, b) => a - b), startedAtMs: nowMs, milestone };
}

/** "21h 04m" / "48m" / "0m" — the countdown under the CTA. */
export function formatMsLeft(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 60_000));
  const h = Math.floor(total / 60);
  const mins = total % 60;
  return h > 0 ? `${h}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
}
