/**
 * The review REQUEST CARD — Claude Design "Review Request Card" (71a).
 *
 * A different object from the OS review prompt beside it (./index): that one is
 * `SKStoreReviewController`, submitted in place and rate-limited by the
 * platform. This is a card in the Journal, in Austin's own voice, offering two
 * doors out — the store's review composer, or an email to him. It is the one
 * place in the app that asks for a favour in the first person.
 *
 * Because it is a favour, the bar is ENGAGEMENT AND A CLEAN RECORD, and the two
 * halves of that are different kinds of claim:
 *
 *  - A week of days the user put something into themselves (`engagedDayCount`,
 *    so a year of back-filled Health history is not a week of use). This is the
 *    same bar door A of the OS prompt uses, read off the journal, which is a
 *    fact we hold about every install however long ago it started.
 *  - NO FAILED READING. That one cannot be read off the journal: a refused or
 *    abandoned capture leaves nothing behind in it (see `CAPTURE_TAGS` in
 *    ../hrv/refusal). So it is COUNTED FORWARD by the shell (./cardMemory,
 *    stamped from the three places a reading fails), and the card therefore
 *    will not open until the install has been WATCHED for `WATCH_DAYS`. A
 *    phone that updated into this feature yesterday has a clean record because
 *    nobody was looking, and "no failures" has to mean we were there to see.
 *
 * And it is never shown to an iOS user capturing with the phone camera or a
 * Garmin watch. Those are the two weak sensors (`weakSensorFor` in
 * ../strapSuggest), their readings are the ones the app refuses, and asking
 * somebody for five stars while the measurement keeps failing is the ask that
 * earns one star back.
 *
 * Everything else here is suppression, and it is the same suppression the OS
 * prompt carries, for the same reason: nobody is asked for a favour on a crash
 * day, during a downturn or a strain warning, or in a sitting where they just
 * met a subscription wall. The two offer cards are excluded too — the Journal
 * has one slot under the Outlook for something the app raised on its own
 * initiative, and two asks in it read as a sales screen.
 *
 * Pure: no store, no MMKV, no Linking, no React. The shell is ./cardMemory and
 * the card is ../../features/ReviewRequestCard.
 */
import type { CustomTypes, Protocol } from '../types';
import type { ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, type DaysMap } from '../scoring/day';
import { detectDownturn } from '../scoring/downturn';
import { detectStrain } from '../scoring/strain';
import { engagedDayCount } from '../engaged';
import { weakSensorFor } from '../strapSuggest';

/** Days of the user's own entries before the card may open. Austin's "used my
 *  app for at least 7 days", and deliberately the same number as the OS
 *  prompt's `ENGAGED_DOOR_DAYS`, so the two asks agree what a week of use is. */
export const MIN_ENGAGED_DAYS = 7;

/**
 * How long an install must have been watched for failures before its clean
 * record counts for anything.
 *
 * The failure count only ever runs forward from the first launch of a build
 * that records them, so without this the card would open on the next launch
 * after an update and call a week nobody watched a week without failures. Seven
 * days, matching the engagement bar: one rule, "a good week".
 */
export const WATCH_DAYS = 7;

const DAY_MS = 86_400_000;

/** Where "Leave a review" goes: the listing, with the review composer asked
 *  for by query. Apple opens straight into the write-a-review sheet;
 *  Play has no equivalent parameter and lands on the listing's reviews. */
export const REVIEW_URL_IOS = 'https://apps.apple.com/app/id6789786971?action=write-review';
export const REVIEW_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.autonomic.journal&showAllReviews=true';

export const reviewUrlFor = (platform: string): string =>
  (platform === 'ios' ? REVIEW_URL_IOS : REVIEW_URL_ANDROID);

/** The subject on "Send me a note". Plain, because it is going to one inbox. */
export const NOTE_SUBJECT = 'A note about Autonomic';

/** What the shell remembers (./cardMemory, flags MMKV). */
export interface ReviewCardMemory {
  /** Dismissed, or either button tapped. Either way it never returns. */
  answered: boolean;
  /**
   * The card has been RAISED. From that moment it STANDS until it is answered,
   * and no rule below may take it down.
   *
   * This is the annual card's rule and it is here for the same reason. Every
   * gate in `reviewCardDue` is about whether to START asking — whether today is
   * a day to ask a favour on. Once the card is on screen the question has been
   * asked, and a card that quietly vanished because a downturn began, or an
   * offer appeared, or a reading failed overnight, would be the app withdrawing
   * a question the reader was still deciding about. Worse, for the one user who
   * was about to tap it, it reads as a bug.
   */
  standing: boolean;
  /** Failed readings recorded since `watchingSince`. */
  failures: number;
  /** When this install started recording failures, epoch ms. Null = never. */
  watchingSince: number | null;
}

export const EMPTY_CARD_MEMORY: ReviewCardMemory = {
  answered: false, standing: false, failures: 0, watchingSince: null,
};

/** Is the card on screen right now because it was already raised? Asked BEFORE
 *  `reviewCardDue`, never composed with it: a standing card renders from this
 *  alone. */
export const reviewCardLive = (m: ReviewCardMemory): boolean => m.standing && !m.answered;

export interface ReviewCardInput {
  days: DaysMap;
  /** The day being rendered. The card is today's only. */
  dk: string;
  /** Today, so a back-dated Journal can be told from the present. */
  today: string;
  ctx?: ScoreContext;
  protocol?: Protocol;
  custom?: CustomTypes;
  memory: ReviewCardMemory;
  nowMs: number;
  /** `settings.lastHrvSource`: the sensor the user deliberately picked. */
  source?: string | null;
  /** `Platform.OS`. */
  platform: string;
  /** The crash warning fired today (`settings.crashAlert.lastFired === dk`). */
  crashAlertFiredToday?: boolean;
  /** The paywall was raised at some point this session. */
  paywallSeenThisSession?: boolean;
  /** An offer card already holds the slot under the Outlook. */
  offerLive?: boolean;
  /**
   * When the OS review prompt was last requested on this install, epoch ms
   * (`ReviewMemory.lastAskedAtMs`). Null/absent = never. Read through
   * `osAskSpent`, which is where the one forgiven case is decided.
   */
  osAskedAtMs?: number | null;
}

export type ReviewCardVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Does a spent OS prompt still bar the card?
 *
 * Normally yes, permanently: the two asks share one budget and whichever got
 * there first wins (../review/index reads this memory in the other direction).
 * But for ONE window they were never racing at all.
 *
 * `WATCH_DAYS` means the card cannot be raised for the first week of an
 * install's life on a build that carries it, while the OS prompt has no such
 * wait. So between `watchingSince` and `watchingSince + WATCH_DAYS` the OS ask
 * was not winning a race — it was walking into an empty room. Worse, the card
 * shipped on a new version number, which is exactly what clears the OS
 * prompt's own `asked-this-version` bar, so the engaged population was handed
 * to the OS prompt on precisely the launch where the card was locked out. An
 * ask that landed in there is not evidence this install was fairly asked, so
 * it is forgiven.
 *
 * It is the bug's own signature and nothing else matches it, which is what
 * makes forgiving it safe rather than a general loosening:
 *
 *  - An ask from BEFORE the watch began is a real spend. The card did not
 *    exist on that build, and "an install the OS already asked never meets the
 *    card" was a decision, not an accident — this must not quietly reverse it.
 *  - An ask from AFTER the window closed is the honest race the design wants.
 *  - An install that was never watched at all has no window to have been
 *    robbed of.
 *
 * Forgiving it does not mean asking at once: the card goes on waiting
 * `WATCH_DAYS` from THE ASK ITSELF, so nobody meets an OS sheet and this card
 * in the same week. That reuses the window rather than inventing a second
 * number for the same idea.
 */
export function osAskSpent(
  input: Pick<ReviewCardInput, 'osAskedAtMs' | 'memory' | 'nowMs'>,
): boolean {
  const at = input.osAskedAtMs;
  if (at == null || !Number.isFinite(at)) return false;          // never asked
  const since = input.memory.watchingSince;
  if (since == null || !Number.isFinite(since)) return true;     // asked while nobody was watching
  const inRaceWindow = at >= since && at < since + WATCH_DAYS * DAY_MS;
  if (!inRaceWindow) return true;
  // Forgiven, but not yet: let the ask itself age out of the same window.
  return input.nowMs - at < WATCH_DAYS * DAY_MS;
}

/**
 * Should the card be RAISED right now?
 *
 * Only ever asked of an install whose card is not already standing
 * (`reviewCardLive`), because every rule in here is about whether today is a
 * day to start asking — see `standing` above.
 *
 * Ordered cheapest-first, and the two detector calls are last on purpose: they
 * sweep the journal, and every install that fails an earlier rule never pays
 * for them.
 */
export function reviewCardDue(input: ReviewCardInput): ReviewCardVerdict {
  const { memory, nowMs } = input;

  // ---- already answered, or already asked another way ----
  if (memory.answered) return { ok: false, reason: 'answered' };
  if (memory.standing) return { ok: false, reason: 'standing' };
  if (osAskSpent(input)) return { ok: false, reason: 'os-prompt-spent' };

  // ---- today only ----
  if (input.dk !== input.today) return { ok: false, reason: 'not-today' };

  // ---- the weak sensors, on iOS ----
  if (input.platform === 'ios' && weakSensorFor(input.source)) {
    return { ok: false, reason: 'weak-sensor-ios' };
  }

  // ---- a clean record ----
  if (memory.failures > 0) return { ok: false, reason: 'had-failures' };

  // ---- has the app been used enough to have an opinion about? ----
  // Deliberately ABOVE the watch window rather than below it. `watching` is
  // not just one refusal among others any more: ../review/index reads it as
  // "this install is on track for the card, so do not spend its ask on the OS
  // prompt", and a reservation is only honest if everything else already
  // holds. Asked below, a two-day-old install would report `watching` and hold
  // an ask it had no claim to for a week.
  if (engagedDayCount(input.days) < MIN_ENGAGED_DAYS) return { ok: false, reason: 'too-few-days' };

  // ---- ...and long enough to mean it ----
  if (memory.watchingSince == null || !Number.isFinite(memory.watchingSince)) {
    return { ok: false, reason: 'not-watching' };
  }
  if (nowMs - memory.watchingSince < WATCH_DAYS * DAY_MS) return { ok: false, reason: 'watching' };

  // ---- never on a bad day, and never beside an offer ----
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.paywallSeenThisSession) return { ok: false, reason: 'paywall-this-session' };
  if (input.offerLive) return { ok: false, reason: 'offer-live' };
  const { days, dk, ctx = {}, protocol = DEFAULT_PROTOCOL, custom } = input;
  if (detectDownturn(days, dk, ctx, protocol, custom)) return { ok: false, reason: 'downturn' };
  if (detectStrain(days, dk, ctx)) return { ok: false, reason: 'strain' };

  return { ok: true };
}

/**
 * The reason that means "do not spend this install's ask elsewhere".
 *
 * `watching` is the one refusal that is not a no — it is a not yet, and the
 * wait is ours rather than the user's. Every other refusal is either permanent
 * (`had-failures`, `weak-sensor-ios`, `answered`) or about today in particular
 * (`downturn`, `offer-live`), and in both of those cases the OS prompt should
 * go ahead.
 */
const RESERVE_REASON = 'watching';

/**
 * Is this install inside the window where the card cannot be raised yet, but
 * would be once it closes?
 *
 * Read by ../review/index before it asks the OS prompt. Without it the watch
 * window is a seven-day head start handed to the OS prompt on every install:
 * the card blocks itself forever on a spent OS ask, while the OS prompt only
 * ever yielded to a card that was already ANSWERED or STANDING — neither of
 * which can be true while it is still being watched. So the ask that was meant
 * to go to whichever got there first went to the OS prompt every time, and the
 * card's own population was the one it drained first.
 *
 * Bounded by construction: after `WATCH_DAYS` the card either opens or is
 * disqualified, and every disqualifying reason releases the reservation on the
 * same pass. The OS ask is deferred at most a week, never lost.
 */
export function reviewCardReserves(input: ReviewCardInput): boolean {
  const v = reviewCardDue(input);
  return v.ok === false && v.reason === RESERVE_REASON;
}

/** Read a stored memory defensively; anything unreadable is a fresh install. */
export function parseCardMemory(raw: string | null | undefined): ReviewCardMemory {
  if (!raw) return EMPTY_CARD_MEMORY;
  try {
    const o = JSON.parse(raw) as Partial<ReviewCardMemory>;
    const since = typeof o.watchingSince === 'number' && Number.isFinite(o.watchingSince) && o.watchingSince > 0
      ? o.watchingSince
      : null;
    return {
      answered: o.answered === true,
      standing: o.standing === true,
      failures: typeof o.failures === 'number' && Number.isFinite(o.failures) && o.failures > 0 ? o.failures : 0,
      watchingSince: since,
    };
  } catch {
    return EMPTY_CARD_MEMORY;
  }
}
