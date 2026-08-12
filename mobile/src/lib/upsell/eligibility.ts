/**
 * Pure gate for app-initiated upgrade offers: given the journal and what we've
 * already put in front of this user, is there a surface worth showing right now
 * — and which one?
 *
 * The distinction this module exists to hold is REACTIVE vs PROACTIVE. A user
 * who taps a locked Week segment and gets the paywall asked for it; that path
 * never comes through here and is never rate-limited (gating it would just make
 * the app look broken). What comes through here is the other kind: the app
 * raising an offer nobody asked for. That decision used to live inside whatever
 * component happened to render the card, which meant "is the app being pushy
 * right now?" was an emergent property no test could pin. Now it's one function.
 *
 * It returns a winning SURFACE rather than a boolean, deliberately. Exactly one
 * proactive offer may be live at a time, and the return type is what guarantees
 * it — a boolean gate would let three surfaces pass at once, which is the bug
 * this replaces. The verdict also carries the `trigger` phrase that picked the
 * surface, so the card's copy is derived from the condition that fired it and
 * can never drift away from it.
 *
 * Most of the file is suppression, same as ../review/eligibility, and for the
 * same reason: this is an app for people with a chronic condition. Nobody gets
 * sold to mid-slide, on the day the crash warning fired, or in a session where
 * we already asked them for a review.
 *
 * Pure: no store, no MMKV, no expo. The shell in ./index supplies the memory
 * and records what happened.
 */
import { todayKey } from '../dates';
import type { CustomTypes, Protocol } from '../types';
import type { Tier } from '../tier';
import type { ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, type DaysMap } from '../scoring/day';
import { detectDownturn } from '../scoring/downturn';
import { engagedDayCount } from '../review/eligibility';

/**
 * Minimum gap between two proactive offers, whichever surfaces they are.
 *
 * 10 days, where ../review/eligibility's MIN_DAYS_BETWEEN_ASKS is 120, and the
 * gap between those numbers is the point: the review ask is scarce because iOS
 * allows three prompts a year and silently swallows the rest, so a wasted ask
 * is a destroyed asset. An upsell has no OS quota. The only thing being spent
 * here is the user's patience, so the constant is tuned to that and nothing
 * else.
 */
export const MIN_DAYS_BETWEEN_PROMPTS = 10;
/** How long a surface stays gone once the user has told us they don't want it. */
export const RETIRE_DAYS = 30;
/** Explicit ✕ presses that retire a surface. */
export const DISMISSALS_TO_RETIRE = 2;
/**
 * Shown-and-scrolled-past sessions that retire a surface.
 *
 * Counting ignores as well as dismissals matters more than it looks: most
 * people never press ✕, they just scroll. Retiring on explicit dismissals alone
 * would mean the rule almost never fires for exactly the users who most clearly
 * don't want the card.
 */
export const IGNORES_TO_RETIRE = 3;

/** Days logged before the free Day view (last 14 days, ../analysis/buckets)
 *  starts clipping history the user actually has. */
export const HISTORY_HORIZON_DAYS = 15;
/** A month of real use. */
export const MONTH_MILESTONE_DAYS = 30;

/**
 * The proactive surfaces, in priority order — the order of this union IS the
 * order they're considered in.
 */
export type UpsellSurface =
  | 'history-horizon'   // 15+ days logged; the free Day view clips at 14
  | 'month-milestone'   // 30 engaged days
  | 'crash-pattern'     // Nth crash day logged
  | 'streak-milestone'  // protocol streak milestone reached
  | 'improvement'       // measurable 30-day upturn
  | 'second-trial';     // the earned second-trial gift

export const SURFACE_ORDER: UpsellSurface[] = [
  'history-horizon', 'month-milestone', 'crash-pattern',
  'streak-milestone', 'improvement', 'second-trial',
];

/** What the shell remembers about one surface (./index, flags MMKV). */
export interface SurfaceMemory {
  shown: number;
  dismissed: number;
  /** Shown, then the session ended with no tap either way. */
  ignored: number;
  lastShownAtMs?: number;
  retiredUntilMs?: number;
}

export interface UpsellMemory {
  /** When any surface was last shown, epoch ms — the global pacing clock. */
  lastPromptAtMs?: number | null;
  perSurface: Partial<Record<UpsellSurface, SurfaceMemory>>;
}

export interface UpsellInput {
  days: DaysMap;
  /** Day being evaluated; defaults to today. */
  dk?: string;
  /** 'pro' and 'trial' are never prompted — there is nothing to sell them. */
  tier: Tier;
  ctx?: ScoreContext;
  protocol?: Protocol;
  custom?: CustomTypes;
  memory: UpsellMemory;
  nowMs: number;
  /** The crash warning fired today (settings.crashAlert.lastFired === dk). */
  crashAlertFiredToday?: boolean;
  /**
   * The store review prompt was requested this session. The review ask wins
   * every tie: it's OS-quota-limited and far rarer, and both systems want the
   * same scarce resource — the user's goodwill on a day they feel better.
   */
  reviewAskedThisSession?: boolean;
  /** A sheet is open; the user is mid-task and not to be talked over. */
  sheetOpen?: boolean;
}

export type UpsellVerdict =
  | { ok: true; surface: UpsellSurface; trigger: string }
  | { ok: false; reason: string };

const DAY_MS = 86400000;

const EMPTY: SurfaceMemory = { shown: 0, dismissed: 0, ignored: 0 };

/**
 * When a surface's own history says it should stay gone, until when.
 *
 * Derived from the counts rather than read from a stamp, so the rule holds even
 * for memory written before the stamp existed; the shell calls this to write
 * `retiredUntilMs` and the check below honours whichever is later.
 */
export function retireUntil(m: SurfaceMemory | undefined): number | undefined {
  if (!m || !m.lastShownAtMs) return undefined;
  const done = m.dismissed >= DISMISSALS_TO_RETIRE || m.ignored >= IGNORES_TO_RETIRE;
  return done ? m.lastShownAtMs + RETIRE_DAYS * DAY_MS : undefined;
}

function isRetired(m: SurfaceMemory | undefined, nowMs: number): boolean {
  const until = Math.max(m?.retiredUntilMs ?? 0, retireUntil(m) ?? 0);
  return until > nowMs;
}

/** Everything a trigger check may look at, resolved once. */
interface TriggerCtx {
  days: DaysMap;
  dk: string;
  ctx: ScoreContext;
  protocol: Protocol;
  custom?: CustomTypes;
  engaged: number;
  nowMs: number;
}

/**
 * Per-surface trigger: the short human phrase describing why this is the
 * moment, or null when the condition doesn't hold. The phrase is what the card
 * renders, so it names the user's own data ("31 days logged"), never a feature.
 */
const TRIGGERS: Record<UpsellSurface, (c: TriggerCtx) => string | null> = {
  // No upper bound: a user past a month still has clipped history, and if this
  // surface has been retired the month one below picks them up.
  'history-horizon': (c) =>
    (c.engaged >= HISTORY_HORIZON_DAYS ? `${c.engaged} days logged` : null),

  'month-milestone': (c) =>
    (c.engaged >= MONTH_MILESTONE_DAYS ? `${c.engaged} days logged` : null),

  // TODO(surface): Nth crash day logged — needs a crash-day count over a window
  // and a copy line that doesn't read as selling to someone on a bad month.
  'crash-pattern': () => null,

  // TODO(surface): protocol streak milestone (streakInfo in ../scoring/day).
  'streak-milestone': () => null,

  // TODO(surface): measurable 30-day upturn. Note this one collides with the
  // review ask by design (both fire on a good day) — reviewAskedThisSession
  // above is what resolves it, and the review prompt wins.
  improvement: () => null,

  // TODO(surface): the earned second-trial gift; needs the trial re-grant path
  // in src/store/tier.ts, which doesn't exist yet.
  'second-trial': () => null,
};

/**
 * The one proactive offer that may be live right now, if any.
 *
 * Suppression runs first and in a fixed order, each rule returning its own
 * reason string — the review module does the same, and it's what makes "why is
 * nothing showing?" answerable from a dev build instead of by bisecting.
 */
export function nextUpsell(input: UpsellInput): UpsellVerdict {
  const {
    days, tier, ctx = {}, protocol = DEFAULT_PROTOCOL, custom, memory, nowMs,
  } = input;
  const dk = input.dk || todayKey();

  // ---- nothing to sell / not a moment to sell in ----
  if (tier !== 'free') return { ok: false, reason: 'not-free' };
  if (input.sheetOpen) return { ok: false, reason: 'sheet-open' };
  if (input.crashAlertFiredToday) return { ok: false, reason: 'crash-alert-today' };
  if (input.reviewAskedThisSession) return { ok: false, reason: 'review-this-session' };
  if (detectDownturn(days, dk, ctx, protocol, custom)) return { ok: false, reason: 'downturn' };

  // ---- pacing ----
  if (memory.lastPromptAtMs && nowMs - memory.lastPromptAtMs < MIN_DAYS_BETWEEN_PROMPTS * DAY_MS) {
    return { ok: false, reason: 'prompted-recently' };
  }

  // ---- highest-priority surface that has something to say and isn't retired ----
  const c: TriggerCtx = {
    days, dk, ctx, protocol, custom, nowMs, engaged: engagedDayCount(days),
  };
  for (const surface of SURFACE_ORDER) {
    const m = memory.perSurface[surface] ?? EMPTY;
    if (isRetired(m, nowMs)) continue;          // retired: fall through, don't block
    const trigger = TRIGGERS[surface](c);
    if (trigger) return { ok: true, surface, trigger };
  }
  return { ok: false, reason: 'no-trigger' };
}
