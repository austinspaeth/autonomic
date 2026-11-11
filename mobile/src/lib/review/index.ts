/**
 * The App Store / Play review ask — stateful shell around ./eligibility.
 *
 * Deliberately the OS prompt (`expo-store-review`) rather than a modal of our
 * own: it submits in place, and the platform rate-limits it (iOS shows at most
 * 3 a year per user and silently no-ops past that). A homemade "rate us" sheet
 * that deep-links to the store loses most people at the store page, and the
 * "do you like the app? → yes: review / no: feedback" funnel is against Apple's
 * guidelines outright.
 *
 * Because the prompt may silently no-op, there is no success callback and no
 * way to know whether the sheet appeared. Every call is therefore treated as
 * spent: we stamp the ask before requesting, so a swallowed prompt can never
 * turn into a loop of retries. Our own memory is stricter than the OS quota
 * (once per app version, and at most every ~4 months) precisely because the
 * quota has to be spent on good days — see ./eligibility for what makes a day
 * good enough.
 *
 * Memory lives in the plaintext flags MMKV next to the trial stamp and the
 * health-import declines: it isn't health data, must never ride export/import,
 * and should survive "Erase journal".
 */
import { MMKV } from 'react-native-mmkv';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { todayKey } from '../dates';
import { resolveProtocol } from '../scoring/day';
import { getState } from '../../store/store';
import { pingReviewAsked } from '../../store/ping';
import { getInstalledAtMs, getTier } from '../../store/tier';
import { shouldAskForReview, type ReviewMemory, type ReviewVerdict } from './eligibility';
import { reviewCardAnswered, reviewCardStanding } from './cardMemory';
import { reviewCardReserves } from './card';
import { reviewCardInput } from './cardContext';
import { profileCtx } from '../scoring';

export {
  engagedDayCount, shouldAskForReview, MIN_ENGAGED_DAYS, MIN_DAYS_BETWEEN_ASKS,
  ENGAGED_DOOR_DAYS, ENGAGED_DOOR_READINGS, ENGAGED_DOOR_INSTALL_DAYS,
} from './eligibility';
export type { ReviewMemory, ReviewVerdict } from './eligibility';

/** TEMP (dev only): bypass every eligibility rule to see the prompt in a dev
 *  build. Note the sheet renders but never submits off TestFlight/the store, so
 *  this only proves placement and timing. Leave false in committed code. */
const FORCE_REVIEW_PROMPT = false;

const FLAGS_ID = 'autonomic.flags';
const KEY_LAST_ASKED = 'reviewAskedAt';        // epoch ms, as a string
const KEY_ASKED_VERSION = 'reviewAskedVersion';

let kv: MMKV | null | undefined;
const mem = new Map<string, string>();
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
function readFlag(key: string): string | undefined {
  const s = store();
  if (!s) return mem.get(key);
  try { return s.getString(key) ?? mem.get(key); } catch { return mem.get(key); }
}
function writeFlag(key: string, value: string): void {
  mem.set(key, value);
  try { store()?.set(key, value); } catch { /* in-memory only this session */ }
}

const appVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

export function reviewMemory(): ReviewMemory {
  const raw = readFlag(KEY_LAST_ASKED);
  const ms = raw ? Number(raw) : NaN;
  return {
    lastAskedAtMs: Number.isFinite(ms) ? ms : null,
    askedVersion: readFlag(KEY_ASKED_VERSION) ?? null,
  };
}

/** Session-scoped: someone who just hit a subscription wall is not being asked
 *  for a favour in the same sitting. Reset by app relaunch, which is the point. */
let paywallSeen = false;
export function notePaywallSeen(): void { paywallSeen = true; }
/** Read by the review request card (../review/card), which carries the same
 *  suppression for the same reason. */
export function paywallSeenThisSession(): boolean { return paywallSeen; }

/** The eligibility verdict for right now — exported so a dev build can log why
 *  the prompt is (not) showing without duplicating the wiring. */
export function reviewVerdict(): ReviewVerdict {
  const s = getState();
  const dk = todayKey();
  return shouldAskForReview({
    days: s.days,
    dk,
    ctx: profileCtx(s.profile),
    protocol: resolveProtocol(s.settings.protocol),
    custom: s.customTypes,
    memory: reviewMemory(),
    appVersion: appVersion(),
    nowMs: Date.now(),
    crashAlertFiredToday: s.settings.crashAlert?.lastFired === dk,
    paywallSeenThisSession: paywallSeen,
    tier: getTier(),
    installedAtMs: getInstalledAtMs(),
  });
}

/**
 * Does the request card (./card) hold this install's one ask?
 *
 * Three ways it can, and the third is the one that was missing. A card already
 * ANSWERED is spent, and a card STANDING is a question in progress that the OS
 * sheet would land on top of — both of those were here from the start. But a
 * card still inside its WATCH WINDOW is also claimed: it cannot be raised yet,
 * the wait is ours rather than the user's, and it WILL be raised when the week
 * is up.
 *
 * Without that third case the window was a seven-day head start handed to this
 * prompt on every install, and since the card bars itself permanently on a
 * spent OS ask, every install the prompt took during it was taken for good —
 * starting with the most engaged ones, which are exactly the card's own
 * population. See `reviewCardReserves`.
 *
 * Defensive: a card that cannot answer must never be able to silence the
 * prompt, so anything thrown here means "not held".
 */
function cardHoldsTheAsk(): boolean {
  if (reviewCardAnswered() || reviewCardStanding()) return true;
  try {
    return reviewCardReserves(reviewCardInput({
      paywallSeenThisSession: paywallSeen,
      osAskedAtMs: reviewMemory().lastAskedAtMs,
    }));
  } catch {
    return false;
  }
}

/**
 * Ask, if this is a moment worth asking on. Returns true when the prompt was
 * requested (not when it was shown — the OS never tells us that). A request
 * is also counted on the anonymous `rvw` ping, as an ask.
 */
export async function maybeAskForReview(): Promise<boolean> {
  try {
    // The request card (./card) is the other way this install can be asked,
    // and one ask is the whole budget. The card reads this memory in the other
    // direction, so whichever gets there first wins — which only works if this
    // side yields while the card is still WAITING to be allowed to go, and not
    // merely once it has gone (see `cardHoldsTheAsk`).
    if (!FORCE_REVIEW_PROMPT && cardHoldsTheAsk()) return false;
    if (!FORCE_REVIEW_PROMPT && !reviewVerdict().ok) return false;
    // hasAction() covers the platform cases where a prompt can't lead anywhere
    // (no store client, unsupported OS version).
    if (!(await StoreReview.isAvailableAsync())) return false;
    if (!(await StoreReview.hasAction())) return false;
    // Stamp BEFORE requesting: the call is fire-and-forget and may be silently
    // swallowed by the OS quota, and an unstamped swallow would ask again on
    // the next journal change. A forced (dev) ask deliberately stamps nothing,
    // so poking at it on a device can't burn that device's real ask.
    if (!FORCE_REVIEW_PROMPT) {
      writeFlag(KEY_LAST_ASKED, String(Date.now()));
      writeFlag(KEY_ASKED_VERSION, appVersion());
      // Counted as an ASK, not a showing — the OS never says which (see
      // pingReviewAsked). Beside the stamp so the two cannot disagree.
      pingReviewAsked();
    }
    await StoreReview.requestReview();
    return true;
  } catch {
    // A review prompt is the least important thing in the app.
    return false;
  }
}
