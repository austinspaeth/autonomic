/**
 * The Black Friday offer — pure logic, unit-tested (see __tests__/holiday).
 *
 * The third proactive offer, and the first whose trigger is a DATE rather than
 * something about the user. ./annual fires at calendar days since install and
 * ./founder at days of the user's own content; this one fires because it is
 * Black Friday weekend, for everybody at once, and is gone on Tuesday.
 *
 * THIS OFFER TAKES PRECEDENCE, and it is the only one that does. Its window is
 * four fixed days that cannot be moved, so every other way of resolving a
 * clash costs it the promotion outright. Two consequences, and they are the
 * reason ./holidayMemory exports `holidayOwnsSlot`:
 *
 *   - It does not ASK the shared cool-down (./pacing) — four days is shorter
 *     than the cool-down, so asking would mean an install that met either other
 *     card in the preceding week silently misses the sale — but it STAMPS the
 *     clock the moment it is raised, so neither of the other two may open on
 *     top of it or for a week after it.
 *   - It also wins against a card that is ALREADY STANDING, which the clock
 *     cannot reach: ../../features/AnnualOffer returns null for the duration of
 *     the window and ../../features/FounderOffer with it. Nothing is answered
 *     and no memory is touched by that, so a standing annual card is exactly
 *     where it was on the Tuesday.
 *
 * `holidayOwnsSlot` deliberately answers from the WINDOW rather than from
 * whether this card has already been raised. The raise happens in an effect,
 * and a liveness read that waited for it would let the other cards paint a
 * frame first on the launch that opens the window. Answering from the window is
 * synchronous, order-independent, and correct in the one case where this card
 * defers (a crash-alert day), since the app should raise NO offer then.
 *
 * It sells FOUNDER_YEARLY_SKU, the same permanently discounted year the other
 * two cards sell, so the promotion is the OCCASION rather than a fourth price.
 * Nothing on the card is hardcoded: every figure comes from the two localized
 * prices the store returned, exactly as ./founder's does.
 *
 * Shown to free AND trial installs — unlike ./founder (trial only) and
 * ./annual (free only). A seasonal sale is not an argument about where the
 * reader is in their trial, and splitting the window by tier would mean half
 * the audience never sees a promotion the app is running.
 *
 * It STANDS once raised. Every gate below except the four permanent ones
 * (switched off, dismissed, window, subscriber) is a gate on RAISING, so a
 * downturn beginning on the Saturday cannot withdraw a card the reader was
 * still deciding on — the same rule ../review/card and ./annual follow, and the
 * reason the bad-day gates here DEFER into a later day of the window rather
 * than spending it.
 *
 * Pure: no store, no MMKV, no expo. ./holidayMemory supplies the persistence
 * and ../../features/HolidayOffer renders the thing.
 */
import type { Tier } from '../tier';

/**
 * The offer is ON.
 *
 * A switch rather than a deletion, the FOUNDER_ENABLED pattern: the window
 * below has a year in it, so next November is this constant plus two dates and
 * not an archaeology exercise. Checked FIRST, ahead of the standing-card
 * shortcut, so switching it off takes down a card that has already been raised
 * rather than leaving it up until the window closes. Nothing is spent on a
 * refusal — no memory is written and the shared clock is never stamped.
 */
export const HOLIDAY_OFFER_ENABLED = true;

/**
 * The window, as two absolute instants.
 *
 * US Eastern, written as an offset rather than resolved from the device clock:
 * the promotion is one global window with one end, and a phone in Berlin must
 * not get an extra six hours of it or lose them. Late November is EST (UTC-5)
 * in every year this constant will live through; a window that ever straddles a
 * DST change needs two offsets, not one.
 *
 * Friday 27 November 2026 00:00 ET through Monday 30 November 2026 23:59:59.999
 * ET — Black Friday to the end of Cyber Monday, four days inclusive.
 */
export const HOLIDAY_START_MS = Date.parse('2026-11-27T00:00:00-05:00');
export const HOLIDAY_END_MS = Date.parse('2026-11-30T23:59:59.999-05:00');

/** What the card calls itself. One constant, because the header, the fine
 *  print and the tests must agree about what is being announced. */
export const HOLIDAY_LABEL = 'Black Friday';

export interface HolidayMemory {
  /**
   * When the card was first raised, epoch ms. Its presence is what makes the
   * card STAND for the rest of the window: a second day of it is not a second
   * ask, so the raise gates are never consulted again.
   */
  shownAtMs?: number;
  /** The ✕. Permanent, and the window never comes back. */
  dismissed?: boolean;
}

export const emptyHolidayMemory = (): HolidayMemory => ({});

/** Is the promotion running at `nowMs`? Inclusive at both ends. */
export function holidayWindowOpen(nowMs: number): boolean {
  return nowMs >= HOLIDAY_START_MS && nowMs <= HOLIDAY_END_MS;
}

/** One tile of the card's countdown: the figure, already padded, and its label. */
export interface CountdownCell { v: string; l: string }

/**
 * The countdown to the end of the window, as the card's four tiles.
 *
 * Floored at zero in every field rather than allowed to go negative, because
 * the clock is read once a second and the window can close under a card that is
 * on screen. The card itself is taken down by `holidayVerdict` on its next
 * render; until then it must not show "-1 SEC".
 *
 * Days are unpadded (the window is four days, so it is one digit and a leading
 * zero would read as a placeholder); hours, minutes and seconds are padded to
 * two, which is what stops the row reflowing every second even in a tabular
 * face.
 */
export function holidayCountdown(nowMs: number): CountdownCell[] {
  const left = Math.max(0, Math.floor((HOLIDAY_END_MS - nowMs) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    { v: String(Math.floor(left / 86_400)), l: 'DAYS' },
    { v: pad(Math.floor((left % 86_400) / 3600)), l: 'HRS' },
    { v: pad(Math.floor((left % 3600) / 60)), l: 'MIN' },
    { v: pad(left % 60), l: 'SEC' },
  ];
}

export interface HolidayInput {
  /** Now, epoch ms. */
  nowMs: number;
  /**
   * 'free' and 'trial' both get the card; 'pro' has nothing to be sold. Note
   * this is the one offer that does not care which of the two it is.
   */
  tier: Tier;
  memory: HolidayMemory;
  /** A sheet is open; the user is mid-task and not to be talked over. */
  sheetOpen?: boolean;
  /** The crash warning fired today (settings.crashAlert.lastFired === dk). */
  crashAlertFiredToday?: boolean;
  /** `detectDownturn` or `detectStrain` says the user is having a bad time. */
  downturn?: boolean;
  /**
   * Full access is being held open by an access code (store/tier
   * `hasAccessGrant`). The app does not sell to somebody it was told to let in.
   */
  codeAccess?: boolean;
}

export type HolidayVerdict =
  /** Render it. `claim` is true only on the FIRST raise, i.e. when the shell
   *  must stamp the memory and the shared offer clock. */
  | { ok: true; claim: boolean }
  | { ok: false; reason: string };

/**
 * Should the Black Friday card be on screen right now?
 *
 * The order is the argument. The four permanent refusals come first and apply
 * to a standing card as much as to a new one; everything after the standing
 * shortcut is about whether this is a decent moment to START asking, and each
 * of those simply defers into a later hour of the same window.
 */
export function holidayVerdict(input: HolidayInput): HolidayVerdict {
  const { nowMs, tier, memory } = input;

  if (!HOLIDAY_OFFER_ENABLED) return { ok: false, reason: 'disabled' };
  if (memory.dismissed) return { ok: false, reason: 'dismissed' };
  if (!holidayWindowOpen(nowMs)) {
    return { ok: false, reason: nowMs < HOLIDAY_START_MS ? 'before-window' : 'window-closed' };
  }
  if (tier === 'pro') return { ok: false, reason: 'already-pro' };

  // Already raised. It stands for the rest of the window.
  if (memory.shownAtMs != null) return { ok: true, claim: false };

  // Deferrals — the window is four days, so a bad moment costs an hour, not
  // the promotion.
  if (input.codeAccess) return { ok: false, reason: 'code-access' };
  if (input.sheetOpen) return { ok: false, reason: 'sheet-open' };
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.downturn) return { ok: false, reason: 'downturn' };

  return { ok: true, claim: true };
}
