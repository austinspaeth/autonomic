/**
 * Pure gate for the App Store / Play review prompt: given the journal and what
 * we've asked before, is this a moment worth asking on?
 *
 * Two things drive it. The user has to have actually used the app (four days
 * they put something into themselves — a year of back-filled Health history is
 * not four days of use), and today has to be going *better than their own
 * recent normal* (./scoring/upturn — direction, not a green badge).
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
import { todayKey } from '../dates';
import type { CustomTypes, DayRecord, Entry, Protocol } from '../types';
import type { ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, type DaysMap } from '../scoring/day';
import { detectDownturn } from '../scoring/downturn';
import { detectUpturn, type Upturn } from '../scoring/upturn';

/** Days of the user's own entries before the prompt is even considered. */
export const MIN_ENGAGED_DAYS = 4;
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
}

export type ReviewVerdict =
  | { ok: true; upturn: Upturn }
  | { ok: false; reason: string };

/**
 * Days holding something the user entered themselves.
 *
 * Imported entries don't count: connecting Health back-fills a year in one tap,
 * and that says nothing about whether the app has been useful to them. Sleep is
 * ignored outright — a night carries no provenance flag, so there's no way to
 * tell a hand-typed bedtime from an imported one, and undercounting is the safe
 * direction here.
 */
const own = (list: Entry[] | undefined): boolean => (list || []).some((e) => !e.imported);

export function engagedDayCount(days: DaysMap): number {
  return Object.keys(days).filter((k) => {
    const d: DayRecord | undefined = days[k];
    if (!d) return false;
    if (own(d.readings) || own(d.activities) || own(d.meds) || own(d.symptoms)) return true;
    if ((d.digestion?.movements || []).length) return true;
    if ((d.food?.meals || []).length) return true;
    if (d.food && +d.food.water > 0) return true;
    if (d.food?.triggers && Object.values(d.food.triggers).some((n) => n > 0)) return true;
    if (d.notes && d.notes.trim()) return true;
    return false;
  }).length;
}

const DAY_MS = 86400000;

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
  if (engagedDayCount(days) < MIN_ENGAGED_DAYS) return { ok: false, reason: 'too-few-days' };

  // ---- never on a bad day ----
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.paywallSeenThisSession) return { ok: false, reason: 'paywall-this-session' };
  if (detectDownturn(days, dk, ctx, protocol, custom)) return { ok: false, reason: 'downturn' };

  // ---- is today actually going well, by their own baseline? ----
  const upturn = detectUpturn(days, dk, ctx);
  if (!upturn) return { ok: false, reason: 'no-upturn' };

  return { ok: true, upturn };
}
