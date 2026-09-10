/**
 * Pacing alerts: when the budget is worth interrupting somebody's day for.
 *
 * A notification is the loudest thing the app does, and this population is
 * the one a nagging phone hurts most, so every rule here is about RESTRAINT:
 *
 *   ONE ALERT PER CHECK, ONE OF EACH KIND PER DAY. Heart-rate alerts are the
 *   one exception (two, three hours apart), because a second hard stretch in
 *   the evening is a different afternoon from the first.
 *
 *   A GAP BETWEEN ANY TWO. `MIN_GAP_MIN` apart whatever their kind, and never
 *   more than `MAX_PER_DAY`. "Nearly spent" at 2pm and "over" at 2:10 is two
 *   pushes for one afternoon; the second waits.
 *
 *   ESCALATION ONLY. Once "over" has fired, "nearly" and "ahead" are spent for
 *   the day, and once "nearly" has, "ahead" is. Telling somebody they are
 *   running ahead after telling them they are out is going backwards.
 *
 *   NEVER A NUMBER ON A BAD DAY. A suppressed budget publishes no figure, and
 *   neither does a notification about it (index.ts rule 4). A day the crash
 *   warning already fired on gets nothing at all: that notification already
 *   told them to rest.
 *
 *   NEVER OVERNIGHT, never before the logged wake, never after the pace
 *   marker's own day end.
 *
 *   NEVER "DO MORE". There is no "you have 2h left" alert, and nothing
 *   congratulates a day for staying under.
 *
 *   SAY THE NUMBER. The heart-rate alert names the user's own bpm, never "your
 *   line": a threshold nobody can see is not one anybody can act on.
 *
 * Pure: no store, no native, no React. The shell is src/store/pacingAlerts.ts.
 */
import type { PacingAlertKind } from '../types';
import type { BudgetView } from './index';
import { about, clock, hm } from './format';
import { HR_GAP_MIN, type Span } from './burn';
import { DAY_END_MIN, DEFAULT_WAKE_MIN, minutesOf } from './pace';
import { RECOVERY_MIN } from './upright';

export type { PacingAlertKind };

/** Display order, and the order the Notifications sheet lists them in. */
export const PACING_ALERT_KINDS: PacingAlertKind[] = ['ahead', 'nearly', 'over', 'exertion', 'easy'];

/** "Nearly spent" once this share of the budget is gone. */
export const NEARLY_SHARE = 0.85;
/** Minutes between any two pacing alerts, whatever their kind. */
export const MIN_GAP_MIN = 45;
/** Pacing alerts in one day, all kinds together. */
export const MAX_PER_DAY = 3;
/** "Ahead" needs this much day behind it: the pace rate before it is noise. */
export const AHEAD_MIN_ELAPSED = 90;
/** ...and this share of the budget spent, so a morning shower is not a pace. */
export const AHEAD_MIN_SHARE = 0.25;
/** A heart-rate stretch has to run this long to be worth a push. */
export const EXERTION_RUN_MIN = 20;
/** The newest heart-rate sample must be this recent, or the stretch may be over. */
export const EXERTION_FRESH_MIN = 15;
/** Two heart-rate alerts in one day must be this far apart. */
export const EXERTION_REPEAT_MIN = 180;
export const EXERTION_MAX_PER_DAY = 2;
/** The morning-after nudge is a morning thing; past noon it is just news. */
export const EASY_UNTIL_MIN = 12 * 60;

/** Below this the estimate is still being fitted, so the copy softens the
 *  ceiling the same way the strip's figure does. Mirrors FIRM_LEARNING. */
const SOFT_LEARNING = 0.5;

/** What has fired today, as epoch ms per kind. A memory for another day is
 *  simply ignored, which is what resets it at midnight. */
export interface AlertMemory {
  dk: string;
  fired: Partial<Record<PacingAlertKind, number[]>>;
}

export interface PacingAlert {
  kind: PacingAlertKind;
  title: string;
  body: string;
}

/**
 * Which kinds are on. Undefined is ON: a kind the user never chose for is
 * enabled the moment notifications are, and only an explicit off turns one
 * off. Permission is the shell's question, not this one's.
 */
export function alertsEnabled(
  settings: {
    pacingAlertsEnabled?: boolean;
    pacingAlerts?: Partial<Record<PacingAlertKind, boolean>>;
  } | undefined | null,
): Record<PacingAlertKind, boolean> {
  // The master switch wins: off means every kind is off, whatever each holds,
  // so switching it back on restores the user's own per-kind choices.
  const master = settings?.pacingAlertsEnabled !== false;
  const out = {} as Record<PacingAlertKind, boolean>;
  PACING_ALERT_KINDS.forEach((k) => { out[k] = master && settings?.pacingAlerts?.[k] !== false; });
  return out;
}

export interface HrRun {
  startMin: number;
  endMin: number;
  min: number;
}

/**
 * The stretch above `lineBpm` the heart is in RIGHT NOW, if it is in one.
 *
 * Walks back from the newest sample using the same rule `hrMinutesAbove`
 * charges by (an interval counts when its two samples average above the line,
 * and a gap past HR_GAP_MIN is unknown, so it ends the run). The newest sample
 * has to be recent: a watch that stopped reporting at 2pm says nothing about
 * whether 2:30 is still hard.
 *
 * `series` is `{ t: seconds past local midnight, bpm }`, the shape the shell
 * reads and the sidecar keeps.
 */
export function currentHrRun(
  series: { t: number; bpm: number }[] | null | undefined,
  lineBpm: number | null,
  nowSec: number,
): HrRun | null {
  if (!series || lineBpm == null) return null;
  const pts = series
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  if (nowSec - last.t > EXERTION_FRESH_MIN * 60) return null;

  let startSec: number | null = null;
  for (let i = pts.length - 1; i > 0; i--) {
    const gapMin = (pts[i].t - pts[i - 1].t) / 60;
    if (gapMin <= 0) continue;
    if (gapMin > HR_GAP_MIN) break;
    if ((pts[i - 1].bpm + pts[i].bpm) / 2 <= lineBpm) break;
    startSec = pts[i - 1].t;
  }
  if (startSec == null) return null;
  return { startMin: startSec / 60, endMin: last.t / 60, min: (last.t - startSec) / 60 };
}

/**
 * Logged activities as windows, with the recovery tail the upright inference
 * also carves out. A stretch inside one is a workout the user already knows
 * about, and a push telling them their heart rate is up mid-run is noise.
 */
export function loggedWindows(activities: { time?: unknown; duration?: unknown }[] | undefined | null): Span[] {
  const out: Span[] = [];
  (activities || []).forEach((a) => {
    const start = minutesOf(typeof a.time === 'string' ? a.time : null);
    if (start == null) return;
    const d = parseFloat(String(a.duration ?? ''));
    const dur = Number.isFinite(d) && d > 0 ? d : 20;
    out.push({ startMin: start, endMin: start + dur + RECOVERY_MIN });
  });
  return out;
}

export interface PacingAlertInput {
  dk: string;
  now: Date;
  /** Today's live view, built for `now`. */
  view: BudgetView;
  /** Yesterday's finished view, or null when the caller did not build it. */
  yesterday: BudgetView | null;
  /** Today's logged wake, minutes past midnight. */
  wakeMin: number | null;
  /** Today's heart-rate curve (seconds past midnight). */
  hr: { t: number; bpm: number }[] | null | undefined;
  /** The exertion line today's load was read against. */
  lineBpm: number | null;
  /** Logged activity windows, see `loggedWindows`. */
  activities: Span[];
  enabled: Record<PacingAlertKind, boolean>;
  memory: AlertMemory | null;
  /** The crash warning already fired today. */
  crashFiredToday: boolean;
}

/**
 * The one alert worth sending now, or null.
 *
 * Priority is by how much the reader can still do about it: over, nearly
 * spent, a heart-rate stretch in progress, the morning-after nudge, and last
 * the early "ahead of pace" warning, which is the softest claim.
 */
export function decidePacingAlert(input: PacingAlertInput): PacingAlert | null {
  const { view: v, now, enabled } = input;
  if (v.past || input.crashFiredToday) return null;

  const nowMs = now.getTime();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowSec = nowMin * 60 + now.getSeconds();
  const wake = input.wakeMin != null && Number.isFinite(input.wakeMin) ? input.wakeMin : DEFAULT_WAKE_MIN;
  if (nowMin < wake || nowMin > DAY_END_MIN) return null;

  const fired = input.memory && input.memory.dk === input.dk ? input.memory.fired : {};
  const times = Object.values(fired).flatMap((xs) => xs || []);
  if (times.length >= MAX_PER_DAY) return null;
  if (times.some((t) => nowMs - t < MIN_GAP_MIN * 60_000)) return null;
  const has = (k: PacingAlertKind) => (fired[k]?.length ?? 0) > 0;

  const env = v.envelope.effortMin;
  const live = v.state === 'healthy' || v.state === 'ahead' || v.state === 'low';
  const soft = v.envelope.confidence === 'low' || v.envelope.learning < SOFT_LEARNING;

  /* ---------- over ---------- */
  if (enabled.over && !has('over') && v.state === 'over' && v.overByMin != null) {
    return {
      kind: 'over',
      title: "Over today's pacing budget",
      body: `Over by ${hm(v.overByMin)} of your pacing budget. Resting now brings this back down.`,
    };
  }

  /* ---------- nearly spent ---------- */
  if (
    enabled.nearly && !has('nearly') && !has('over') && live && !v.skeleton
    && env != null && env > 0 && v.fill >= NEARLY_SHARE && (v.leftMin ?? 0) >= 1
  ) {
    const of = soft ? about(env).replace(/^About /, 'roughly ') : hm(env);
    return {
      kind: 'nearly',
      title: 'Pacing budget nearly spent',
      body: `${hm(v.leftMin!)} left of today's ${of} pacing budget. A good time to slow down.`,
    };
  }

  /* ---------- a heart-rate stretch in progress ---------- */
  if (enabled.exertion && input.lineBpm != null) {
    const past = fired.exertion || [];
    const spaced = !past.some((t) => nowMs - t < EXERTION_REPEAT_MIN * 60_000);
    if (past.length < EXERTION_MAX_PER_DAY && spaced) {
      const run = currentHrRun(input.hr, input.lineBpm, nowSec);
      const inActivity = run != null
        && input.activities.some((w) => run.startMin < w.endMin && run.endMin > w.startMin);
      if (run && run.min >= EXERTION_RUN_MIN && !inActivity) {
        return {
          kind: 'exertion',
          title: `Heart rate above ${Math.round(input.lineBpm)} bpm for ${hm(run.min)}`,
          body: `Since ${clock(run.startMin)}. Sitting or lying down now lets it settle.`,
        };
      }
    }
  }

  /* ---------- the morning after an over day ---------- */
  if (
    enabled.easy && !has('easy') && nowMin <= EASY_UNTIL_MIN && v.state !== 'suppressed'
    && input.yesterday?.state === 'final-over' && input.yesterday.overByMin != null
  ) {
    return {
      kind: 'easy',
      title: 'Yesterday ran over budget',
      body: `It finished ${hm(input.yesterday.overByMin)} over your pacing budget. Effort often catches up a day or two later, so pace gently today.`,
    };
  }

  /* ---------- ahead of pace ---------- */
  if (
    enabled.ahead && !has('ahead') && !has('nearly') && !has('over') && live
    && v.pace?.status === 'ahead' && nowMin - wake >= AHEAD_MIN_ELAPSED && v.fill >= AHEAD_MIN_SHARE
  ) {
    const spent = `${hm(v.burn.effortMin)} of your pacing budget spent by ${clock(nowMin)}`;
    return {
      kind: 'ahead',
      title: 'Running ahead of pace',
      body: v.pace.runsOutMin != null
        ? `${spent}. At this pace it runs out around ${clock(v.pace.runsOutMin)}.`
        : `${spent}, ahead of an even day.`,
    };
  }

  return null;
}
