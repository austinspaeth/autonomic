/**
 * How often the Journal's Trend card is allowed to speak, and about what.
 *
 * `findTrend` answers "is something better than it was?", and on a journal that
 * is genuinely improving the answer is yes every single day. Left ungoverned the
 * card became a readout: "your bedtime is steadier by 130 min", then 125, then
 * 120 — the same congratulation restated with a slightly worse number each
 * morning, which reads as noise and teaches people to skip the card entirely.
 *
 * So a finding is CLAIMED rather than recomputed:
 *
 *  1. A claim pins its headline for the day it was made, so the number on screen
 *     cannot drift under the reader while the card is up.
 *  2. After that the card goes quiet for a week. One celebration per week, at
 *     most — a congratulation that arrives daily isn't one.
 *  3. And the SUBJECT is retired for a month (by `OUTCOME_FAMILY`, so sleep
 *     duration can't immediately restate sleep consistency). The next thing the
 *     card says has to be about something else, or it says nothing.
 *
 * Rule 3 is why this exists at all: the pacing is not just rate limiting, it is
 * what makes the card's claims feel like separate pieces of news.
 *
 * Pure: no store, no MMKV, no React. The shell is ./memory.
 */
import { OUTCOME_FAMILY, type TrendMetricId } from './metrics';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** How long a claimed finding stays on screen before the card goes quiet. */
export const TREND_LIVE_HOURS = 24;
/** Minimum gap between two celebrations, whatever else improved meanwhile. */
export const TREND_MIN_DAYS_BETWEEN = 7;
/** How long one subject is retired after being celebrated. */
export const TREND_FAMILY_COOLDOWN_DAYS = 30;

/**
 * Bump whenever the WORDING of a headline changes (a `subject`, a `phrase`, the
 * sentence findTrend assembles).
 *
 * A claim pins the finished sentence, which is the whole point — but it also
 * means a copy fix cannot reach a claim that is already stored. Without this,
 * editing the copy leaves the old wording on the Journal for up to a day, and
 * its subject retired for a month, after the code that produced it is gone.
 * That is not a dev-only annoyance: an OTA update ships copy fixes to phones
 * holding live claims.
 */
export const TREND_COPY_VERSION = 3;

/** The finding currently (or most recently) on screen. */
export interface TrendClaim {
  metric: TrendMetricId;
  headline: string;
  /** TREND_COPY_VERSION at the time the sentence was written. */
  v: number;
  /** The journal day it was computed for — a "since last month" claim is only
   *  true relative to that day, so it is pinned to it and not to the clock. */
  dk: string;
  atMs: number;
}

export interface TrendMemory {
  last?: TrendClaim;
  /** OUTCOME_FAMILY key → when it was last celebrated. */
  families: Record<string, number>;
}

export const emptyTrendMemory = (): TrendMemory => ({ families: {} });

export type TrendGate =
  /** Show this exact headline again — same day, still live. */
  | { kind: 'pinned'; claim: TrendClaim }
  /** Look for a finding, but not about these families. */
  | { kind: 'search'; exclude: string[] }
  /** Say nothing at all. */
  | { kind: 'quiet' };

export function trendGate(m: TrendMemory, dk: string, nowMs: number): TrendGate {
  const last = m.last;
  if (last) {
    const age = nowMs - last.atMs;
    // A clock moved backwards (timezone, manual set) reads as a negative age;
    // treat it as expired rather than pinning a card open indefinitely.
    if (age >= 0) {
      if (last.dk === dk && age < TREND_LIVE_HOURS * HOUR) return { kind: 'pinned', claim: last };
      if (age < TREND_MIN_DAYS_BETWEEN * DAY) return { kind: 'quiet' };
    }
  }
  const cutoff = nowMs - TREND_FAMILY_COOLDOWN_DAYS * DAY;
  return { kind: 'search', exclude: Object.keys(m.families).filter((f) => m.families[f] > cutoff) };
}

/** Record a finding as said. Stamps both the global clock and its family. */
export function claimTrend(m: TrendMemory, claim: Omit<TrendClaim, 'v'>): TrendMemory {
  const stamped: TrendClaim = { ...claim, v: TREND_COPY_VERSION };
  return {
    last: stamped,
    families: { ...m.families, [OUTCOME_FAMILY[claim.metric]]: claim.atMs },
  };
}

/**
 * Drop a memory written by older copy. Wholesale rather than just clearing the
 * pinned sentence: the cooldowns exist to space out CLAIMS, and once the claims
 * are void there is nothing left for them to be spacing.
 */
export function migrateTrendMemory(m: TrendMemory): TrendMemory {
  return m.last && m.last.v !== TREND_COPY_VERSION ? emptyTrendMemory() : m;
}
