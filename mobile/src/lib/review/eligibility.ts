/**
 * Pure gate for the App Store / Play review prompt: given the journal and what
 * we've asked before, is this a moment worth asking on?
 *
 * There are TWO doors in, and either will do.
 *
 *  - Door A, ENGAGEMENT: a week of days the user put something into themselves,
 *    five trusted HRV readings, and either Pro or two weeks since install. It
 *    exists because door B alone asked about 5% of installs: an app for a
 *    chronic condition is valuable for keeping somebody level, plenty of users
 *    never trend up, and gating the ask on improvement systematically skipped
 *    the most engaged people we have.
 *  - Door B, UPTURN: four days of use and today going *better than their own
 *    recent normal* (./scoring/upturn — direction, not a green badge). A genuine
 *    upturn is still the best moment there is, so it stays as it was.
 *
 * Neither counts a year of back-filled Health history as use (`engagedDayCount`).
 *
 * The Bad-day floor applies to BOTH doors, and for door A it is STRICT: today
 * must carry a score of at least `MIN_TODAY`. It used to live only inside
 * `detectUpturn`, and a day with no score is unknown, not safe — door A would
 * otherwise ask on a crash day the app simply could not see.
 *
 * Everything else here is suppression, and it's the part that matters most in
 * an app for people with a chronic condition. Nobody gets asked to rate an app
 * on a crash day, in the middle of a slide, on the day the crash warning fired,
 * or in a session where they just hit a subscription wall. A prompt landing on
 * one of those days reads as tone-deaf, and it's the kind of thing that earns a
 * one-star review rather than a five.
 *
 * Pure: no store, no MMKV, no StoreReview. The shell in ./index supplies the
 * memory and performs the ask.
 */
import { addDays, todayKey } from '../dates';
import type { CustomTypes, Protocol } from '../types';
import type { ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, type DaysMap } from '../scoring/day';
import { detectDownturn } from '../scoring/downturn';
import { detectStrain } from '../scoring/strain';
import { detectUpturn, MIN_TODAY, type Upturn } from '../scoring/upturn';
import { keyRange, metricSeries } from '../trends/series';
import { isTrustedReading } from '../hrvQuality';
import type { Tier } from '../tier';
import { engagedDayCount } from '../engaged';

/** Days of the user's own entries before the prompt is even considered (door B). */
export const MIN_ENGAGED_DAYS = 4;
/** Door A: days of the user's own entries. */
export const ENGAGED_DOOR_DAYS = 7;
/** Door A: trusted HRV readings, ever. */
export const ENGAGED_DOOR_READINGS = 5;
/** Door A: install age a non-Pro user must reach (Pro is admitted sooner). */
export const ENGAGED_DOOR_INSTALL_DAYS = 14;
/** Once asked, don't ask again for this long — the OS quota is small (iOS
 *  allows 3 prompts a year) and must be spent on good moments, not burned. */
export const MIN_DAYS_BETWEEN_ASKS = 120;

/** What the shell remembers about previous asks (./index, flags MMKV). */
export interface ReviewMemory {
  /** When we last asked, epoch ms. */
  lastAskedAtMs?: number | null;
  /** App version we last asked on — never ask twice on the same version. */
  askedVersion?: string | null;
}

export interface ReviewInput {
  days: DaysMap;
  /** Day being evaluated (today, in practice). */
  dk?: string;
  ctx?: ScoreContext;
  protocol?: Protocol;
  custom?: CustomTypes;
  memory: ReviewMemory;
  appVersion: string;
  nowMs: number;
  /** The crash warning fired today (settings.crashAlert.lastFired === dk). */
  crashAlertFiredToday?: boolean;
  /** The paywall was raised at some point this session. */
  paywallSeenThisSession?: boolean;
  /** Door A: the install's tier right now. Unknown admits nobody through it. */
  tier?: Tier | null;
  /** Door A: when this install first ran, epoch ms. Unknown counts as day zero. */
  installedAtMs?: number | null;
}

export type ReviewVerdict =
  | { ok: true; door: 'upturn'; upturn: Upturn }
  | { ok: true; door: 'engaged'; score: number }
  | { ok: false; reason: string };

// The "engaged day" rule lives in ../engaged so modules the review gate itself
// imports (../scoring/strain, via ../digestion) can share it without a cycle.
export { isEngagedDay, engagedDayCount } from '../engaged';

const DAY_MS = 86400000;
const HRV_TYPES = new Set(['hrv', 'breathHrv']);

/** Trusted HRV readings across the whole journal: the same rule every other
 *  consumer uses, so a year of short imported samples cannot open door A. */
export function trustedHrvCount(days: DaysMap): number {
  let n = 0;
  for (const dk of Object.keys(days)) {
    for (const r of days[dk]?.readings || []) if (HRV_TYPES.has(r.type) && isTrustedReading(r)) n++;
  }
  return n;
}

/** Door A's own question, apart from the day: has this person used the app
 *  enough, for long enough, to have an opinion of it? */
export function engagedDoorOpen(input: Pick<ReviewInput, 'days' | 'tier' | 'installedAtMs' | 'nowMs'>): boolean {
  if (engagedDayCount(input.days) < ENGAGED_DOOR_DAYS) return false;
  if (trustedHrvCount(input.days) < ENGAGED_DOOR_READINGS) return false;
  if (input.tier === 'pro') return true;
  if (input.installedAtMs == null || !Number.isFinite(input.installedAtMs)) return false;
  return input.nowMs - input.installedAtMs >= ENGAGED_DOOR_INSTALL_DAYS * DAY_MS;
}

export function shouldAskForReview(input: ReviewInput): ReviewVerdict {
  const {
    days, ctx = {}, protocol = DEFAULT_PROTOCOL, custom, memory, appVersion, nowMs,
  } = input;
  const dk = input.dk || todayKey();

  // ---- what we've already spent ----
  if (memory.askedVersion && memory.askedVersion === appVersion) return { ok: false, reason: 'asked-this-version' };
  if (memory.lastAskedAtMs && nowMs - memory.lastAskedAtMs < MIN_DAYS_BETWEEN_ASKS * DAY_MS) {
    return { ok: false, reason: 'asked-recently' };
  }

  // ---- has the app been used enough to have an opinion about? ----
  // Door B's bar is the lower one, so nobody under it can pass either door.
  if (engagedDayCount(days) < MIN_ENGAGED_DAYS) return { ok: false, reason: 'too-few-days' };

  // ---- never on a bad day ----
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.paywallSeenThisSession) return { ok: false, reason: 'paywall-this-session' };
  if (detectDownturn(days, dk, ctx, protocol, custom)) return { ok: false, reason: 'downturn' };
  // Same rule for the strain warning: a day the Journal is showing a caution
  // card is not a day to ask for a favour, however the card got there.
  if (detectStrain(days, dk, ctx)) return { ok: false, reason: 'downturn' };

  // ---- door B: is today actually going well, by their own baseline? ----
  // (`detectUpturn` carries the Bad-day floor itself.)
  const upturn = detectUpturn(days, dk, ctx);
  if (upturn) return { ok: true, door: 'upturn', upturn };

  // ---- door A: an engaged user, on a day KNOWN to clear the floor ----
  if (!engagedDoorOpen(input)) return { ok: false, reason: 'no-upturn' };
  const score = metricSeries(days, keyRange(dk, 1, addDays), ['score'], ctx).score[0];
  if (score == null) return { ok: false, reason: 'unscored-today' };
  if (score < MIN_TODAY) return { ok: false, reason: 'below-floor' };
  return { ok: true, door: 'engaged', score };
}
