/**
 * One place that builds `ReviewCardInput` out of the live store.
 *
 * It exists because TWO call sites now need the card's verdict, and they must
 * not be able to disagree:
 *
 *  - ../../features/ReviewRequestCard asks whether to RAISE the card.
 *  - ./index asks, before requesting the OS prompt, whether this install is
 *    still inside the window where the card cannot be raised yet and must
 *    therefore not have its ask spent out from under it (`reviewCardReserves`).
 *
 * A reservation computed from a different journal than the raise is the same
 * race with extra steps, so both read one builder.
 *
 * Shell, not logic: every rule lives in ./card. The two session-scoped facts
 * (the paywall, the OS prompt's own memory) are PASSED IN rather than read
 * here, because they live in ./index and reaching for them would close a
 * require cycle — ./index imports this module.
 */
import { Platform } from 'react-native';
import { getState } from '../../store/store';
import { todayKey } from '../dates';
import { profileCtx } from '../scoring';
import { resolveProtocol } from '../scoring/day';
import { liveOffer } from '../upsell/annual';
import { annualMemory } from '../upsell/annualMemory';
import { founderMemory } from '../upsell/founderMemory';
import { holidayOwnsSlot } from '../upsell/holidayMemory';
import type { ReviewCardInput } from './card';
import { reviewCardMemory } from './cardMemory';

/**
 * Is one of the three proactive offer cards holding the slot under the
 * Outlook? The Journal has ONE slot for something the app raised on its own
 * initiative, and two asks sitting in it read as a sales screen.
 *
 * Read the same way FounderOffer reads the annual card's liveness, and the
 * holiday card is asked about the WINDOW rather than about whether it has been
 * raised yet — its raise happens in an effect, so a liveness read that waited
 * for it would let this card paint one frame beside it.
 */
export function offerLive(dk: string): boolean {
  if (liveOffer(annualMemory()) != null) return true;
  if (holidayOwnsSlot()) return true;
  const f = founderMemory();
  return f.shownDk === dk && !f.dismissed;
}

export interface CardContextOpts {
  /** The day being rendered. Defaults to today, which is what the OS prompt
   *  wants — it has no rendered day. */
  dk?: string;
  /** `paywallSeenThisSession()` from ./index. */
  paywallSeenThisSession: boolean;
  /** `reviewMemory().lastAskedAtMs` from ./index. */
  osAskedAtMs: number | null | undefined;
}

export function reviewCardInput(opts: CardContextOpts): ReviewCardInput {
  const s = getState();
  const today = todayKey();
  const dk = opts.dk ?? today;
  return {
    days: s.days,
    dk,
    today,
    ctx: profileCtx(s.profile),
    protocol: resolveProtocol(s.settings.protocol),
    custom: s.customTypes,
    memory: reviewCardMemory(),
    nowMs: Date.now(),
    source: s.settings.lastHrvSource,
    platform: Platform.OS,
    crashAlertFiredToday: s.settings.crashAlert?.lastFired === dk,
    paywallSeenThisSession: opts.paywallSeenThisSession,
    offerLive: offerLive(dk),
    osAskedAtMs: opts.osAskedAtMs,
  };
}
