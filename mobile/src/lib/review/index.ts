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
import { shouldAskForReview, type ReviewMemory, type ReviewVerdict } from './eligibility';

export { engagedDayCount, shouldAskForReview, MIN_ENGAGED_DAYS, MIN_DAYS_BETWEEN_ASKS } from './eligibility';
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

/** The reverse of the above, read by src/lib/upsell: once we've spent the
 *  review ask this session, the app doesn't also try to sell them something.
 *  The two compete for the same day — detectUpturn is the review prompt's
 *  precondition and the upsell 'improvement' surface's trigger — and the review
 *  ask wins, because it's the one with an OS quota behind it. */
let reviewAsked = false;
export function noteReviewAsked(): void { reviewAsked = true; }
export function reviewAskedThisSession(): boolean { return reviewAsked; }

/** The eligibility verdict for right now — exported so a dev build can log why
 *  the prompt is (not) showing without duplicating the wiring. */
export function reviewVerdict(): ReviewVerdict {
  const s = getState();
  const dk = todayKey();
  return shouldAskForReview({
    days: s.days,
    dk,
    ctx: { sex: s.profile.sex, height: s.profile.height },
    protocol: resolveProtocol(s.settings.protocol),
    custom: s.customTypes,
    memory: reviewMemory(),
    appVersion: appVersion(),
    nowMs: Date.now(),
    crashAlertFiredToday: s.settings.crashAlert?.lastFired === dk,
    paywallSeenThisSession: paywallSeen,
  });
}

/**
 * Ask, if this is a moment worth asking on. Returns true when the prompt was
 * requested (not when it was shown — the OS never tells us that).
 */
export async function maybeAskForReview(): Promise<boolean> {
  try {
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
    }
    reviewAsked = true;   // the upsell gate reads this for the rest of the session
    await StoreReview.requestReview();
    return true;
  } catch {
    // A review prompt is the least important thing in the app.
    return false;
  }
}
