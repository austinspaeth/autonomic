/**
 * The sleep report, computed.
 *
 * Everything the report renders is derived here, from the journal alone: the
 * grade and why it landed where it did, the nocturnal dip, stage totals
 * against the user's own average, schedule consistency, the running sleep
 * balance against their own target, and what the next day looked like.
 *
 * Two rules shape all of it.
 *
 *  - **Absent, not empty.** Every section is nullable and the report component
 *    renders nothing for a null one. A night with only bed, wake and quality
 *    still produces a complete report; it just has fewer sections.
 *  - **Never diagnose.** Copy describes a pattern in the user's own log. It is
 *    not a finding, not a diagnosis, not a risk score, and it never tells them
 *    what it means for their health.
 *
 * Pure: no store, no native imports, no React — `addDays` is passed in so this
 * stays free of even the date helpers' module graph, and jest exercises it
 * directly.
 */
import { scoreSet, sleepGradeParts, sleepHours, SLEEP_HR_HIGH, SLEEP_HR_LOW_1, SLEEP_HR_LOW_2, resolveProtocol } from '../scoring/day';
import type { DaysMap } from '../scoring/day';
import type { ScoreContext } from '../scoring';
import { trustedReadings } from '../hrvQuality';
import type { DayRecord, Protocol, ScoreCat } from '../types';
import {
  DIP_DIPPING_PCT, DIP_MIN_BASELINE, dipHistory, nocturnalDip, overnightLow,
  restingHrBaseline, type DipNight, type DipResult,
} from './dip';
import {
  lowestRollingMean, typicalOvernightLow, wakeStats, type HrPoint,
  type RespPoint, type StageSpan, type WakeStats,
} from './night';
import {
  SCHEDULE_MIN_NIGHTS, nightOf, recentNights, scheduleSeries, sleepBalance,
  stageSeries, type Night, type ScheduleNight, type SleepBalance,
} from './nights';
import { fmtMin } from './stages';

export * from './dip';
export * from './night';
export * from './nights';
export * from './stages';

/** How many nights the schedule and balance sections look back over. */
export const REPORT_WINDOW_NIGHTS = 14;
/** How many nights the dip trend shows. */
export const DIP_TREND_NIGHTS = 10;

export type AddDays = (k: string, n: number) => string;

/* ---------- why this grade ---------- */

export interface GradeReason {
  /** Grade colour for the dot: what this input did to the grade. `null` =
   *  it was read and cost nothing. */
  cat: ScoreCat | null;
  text: string;
}

const hoursText = (h: number) => fmtMin(Math.round(h * 60));

/**
 * One line per input the grade actually used, in the order it was applied.
 * Built from `sleepGradeParts`, so the explanation cannot drift from the
 * grade — if a threshold moves in the scoring engine, this moves with it.
 */
export function gradeReasons(days: DaysMap, dk: string): GradeReason[] {
  const parts = sleepGradeParts(days, dk);
  if (!parts) return [];
  const out: GradeReason[] = [];
  const night = nightOf(days, dk);
  const asleep = night && night.asleepMin != null ? night.asleepMin : null;

  const durText = asleep != null ? `${fmtMin(asleep)} asleep` : `${hoursText(parts.hours)} in bed`;
  const baseWord = parts.base === 'great' ? 'an Excellent'
    : parts.base === 'good' ? 'a Good'
      : parts.base === 'ok' ? 'a Moderate'
        : parts.base === 'bad' ? 'a Compromised' : 'a Bad';
  out.push({
    cat: parts.base,
    text: parts.interrupted
      // "recorded as", not "you marked it": the flag is usually NOT the user's.
      // A Health import sets it whenever the watch staged more than
      // INTERRUPTED_AWAKE_MIN minutes awake (health/sleepSummary), so telling
      // someone they marked a night they never touched is simply wrong.
      ? `${durText}, but the night was recorded as interrupted, which costs a step. On duration and quality this was ${baseWord} night.`
      : `${durText}, uninterrupted. On duration alone this was ${baseWord} night.`,
  });

  if (parts.hrLow != null) {
    out.push(parts.demoteLow
      ? {
        cat: parts.demoteLow >= 2 ? 'crash' : 'bad',
        text: `Overnight low of ${Math.round(parts.hrLow)} bpm. Anything at or above ${SLEEP_HR_LOW_1} costs a step, at or above ${SLEEP_HR_LOW_2} costs two.`,
      }
      : {
        cat: null,
        text: `Overnight low of ${Math.round(parts.hrLow)} bpm settled under the ${SLEEP_HR_LOW_1} bpm threshold, so it cost nothing.`,
      });
  }

  if (parts.hrHigh != null) {
    out.push(parts.demoteHigh
      ? { cat: 'bad', text: `Peak of ${Math.round(parts.hrHigh)} bpm reached the ${SLEEP_HR_HIGH} bpm threshold, which costs a step.` }
      : { cat: null, text: `Peak of ${Math.round(parts.hrHigh)} bpm stayed under the ${SLEEP_HR_HIGH} bpm threshold, so it cost nothing.` });
  }

  return out;
}

/** The footnote under the reasons — it says what the grade could see, which is
 *  the honest difference between a watch-staged night and a hand-logged one. */
export function gradeNote(days: DaysMap, dk: string): string {
  const parts = sleepGradeParts(days, dk);
  if (!parts) return '';
  if (parts.hrLow == null && parts.hrHigh == null) {
    return 'This night has no overnight heart rate recorded, so times and interruption are all this grade used.';
  }
  return 'Duration and interruption set the base grade. An elevated overnight low then demotes it.';
}

/* ---------- what this night did ---------- */

export interface NextDayStat {
  label: string;
  value: number;
  unit: string;
  /** The user's own median for comparison, null when there isn't one. */
  median: number | null;
}

/** Median helper shared below; medians, not means — one artifact day is normal
 *  here and would drag a mean into a false claim. */
const median = (vals: number[]): number | null => {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Days of history the medians in "what this night did" are drawn from. */
export const NEXT_DAY_MEDIAN_DAYS = 60;
/** Values needed before a median is quoted at all. */
export const NEXT_DAY_MIN_VALUES = 5;

const rmssdOf = (d: DayRecord | undefined, type: string): number | null => {
  if (!d) return null;
  // Untrusted imported HRV must not appear in this report either.
  const vals = trustedReadings(d.readings)
    .filter((r) => r.type === type)
    .map((r) => parseFloat(String(r.rmssd)))
    .filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? vals[vals.length - 1] : null;
};

/** The day's HRV: the training reading when there is one, else the baseline —
 *  the same precedence the day score gives them. */
const dayHrv = (d: DayRecord | undefined): number | null => rmssdOf(d, 'breathHrv') ?? rmssdOf(d, 'hrv');

/**
 * The day's Autonomic Score, but only when something other than the night
 * itself fed it. Sleep is a component of the score, so on a day with no
 * readings the "impact" would be the sleep grade reflected back — a circle,
 * not a next-day signal.
 */
const dayScoreFromReadings = (d: DayRecord | undefined, dk: string, days: DaysMap, ctx: ScoreContext): number | null => {
  if (!d) return null;
  const res = scoreSet(d.readings || [], d, dk, days, ctx);
  if (res.score == null) return null;
  return res.comps.some((c) => c.label !== 'Sleep' && c.label !== 'Activity') ? res.score : null;
};

/**
 * The morning after: the day's own HRV and Autonomic Score, each against the
 * user's own median. Association in their log, never a claim of cause.
 */
export function nextDayImpact(
  days: DaysMap, dk: string, ctx: ScoreContext, addDays: AddDays,
): NextDayStat[] {
  const out: NextDayStat[] = [];
  const today = days[dk];
  const hrvs: number[] = [];
  const scores: number[] = [];
  for (let i = 0; i < NEXT_DAY_MEDIAN_DAYS; i++) {
    const key = addDays(dk, -i);
    const d = days[key];
    if (!d) continue;
    const h = dayHrv(d);
    if (h != null) hrvs.push(h);
    const s = dayScoreFromReadings(d, key, days, ctx);
    if (s != null) scores.push(s);
  }
  const hrvMedian = hrvs.length >= NEXT_DAY_MIN_VALUES ? median(hrvs) : null;
  const scoreMedian = scores.length >= NEXT_DAY_MIN_VALUES ? median(scores) : null;

  const hrv = dayHrv(today);
  if (hrv != null) {
    out.push({ label: 'Next morning HRV', value: Math.round(hrv), unit: 'ms', median: hrvMedian ? Math.round(hrvMedian) : null });
  }
  const score = dayScoreFromReadings(today, dk, days, ctx);
  if (score != null) {
    out.push({ label: "That day's score", value: score, unit: '/ 100', median: scoreMedian != null ? Math.round(scoreMedian) : null });
  }
  return out;
}

/* ---------- what the best days share ---------- */

/** Scored days with a night needed before any shared trait is claimed. */
export const SHARED_MIN_DAYS = 15;
/** How far back the comparison looks. */
export const SHARED_LOOKBACK_DAYS = 90;
/** A trait must hold on at least this share of the best days... */
const SHARED_MIN_RATE = 0.6;
/** ...and be at least this much more common there than on the rest. */
const SHARED_MIN_LIFT = 0.2;

interface Trait { label: string; holds: (n: Night, days: DaysMap) => boolean | null }

/** Deliberately few, and each one is something the user can act on tonight. */
const TRAITS: Trait[] = [
  { label: 'Bed before 11pm', holds: (n) => n.bedAt < 11 * 60 },
  { label: 'Seven hours or more', holds: (n) => (n.asleepMin != null ? n.asleepMin : n.inBedMin) >= 7 * 60 },
  { label: 'An uninterrupted night', holds: (n) => !n.interrupted },
  {
    label: `A dip of ${DIP_DIPPING_PCT} percent or more`,
    holds: (n, days) => {
      const dip = nocturnalDip(days, n.dk);
      return dip ? dip.pct >= DIP_DIPPING_PCT : null;
    },
  },
];

/**
 * Traits the user's own highest-scoring days share, when the log is long
 * enough to see one. Patterns, not proof of cause — the copy that renders this
 * says so, and it must keep saying so.
 */
export function sharedTraits(days: DaysMap, dk: string, ctx: ScoreContext, addDays: AddDays): string[] {
  const rows: { night: Night; score: number }[] = [];
  for (let i = 0; i < SHARED_LOOKBACK_DAYS; i++) {
    const key = addDays(dk, -i);
    const d = days[key];
    if (!d) continue;
    const night = nightOf(days, key);
    if (!night) continue;
    const score = dayScoreFromReadings(d, key, days, ctx);
    if (score == null) continue;
    rows.push({ night, score });
  }
  if (rows.length < SHARED_MIN_DAYS) return [];
  rows.sort((a, b) => b.score - a.score);
  const cut = Math.max(4, Math.round(rows.length / 3));
  const best = rows.slice(0, cut);
  const rest = rows.slice(cut);
  if (!rest.length) return [];

  const rate = (set: typeof rows, t: Trait) => {
    const known = set.map((r) => t.holds(r.night, days)).filter((v): v is boolean => v != null);
    return known.length >= 4 ? known.filter(Boolean).length / known.length : null;
  };
  return TRAITS.filter((t) => {
    const a = rate(best, t), b = rate(rest, t);
    return a != null && b != null && a >= SHARED_MIN_RATE && a - b >= SHARED_MIN_LIFT;
  }).map((t) => t.label);
}

/* ---------- the report ---------- */

export interface SleepReport {
  dk: string;
  night: Night;
  /** Whether the night carries anything beyond hand-entered times. */
  staged: boolean;
  grade: ScoreCat | null;
  reasons: GradeReason[];
  gradeNote: string;
  hrLow: number | null;
  hrHigh: number | null;
  /** The dip, when both an overnight low and a real baseline exist. */
  dip: DipResult | null;
  /** Set instead of `dip` when the low is known but the baseline is too thin:
   *  the section becomes a short prompt rather than disappearing, so nothing
   *  reads as withheld. Null when there is no low either. */
  dipPrompt: { low: number; baselineCount: number; needed: number } | null;
  /** The same window as the trend chart, each night carrying its whole dip so
   *  selecting one can re-read its low and baseline, not just its percentage. */
  dipTrend: DipNight[];
  /** Stage minutes across the report window, for the stage chart. Every night
   *  is present; unstaged ones are null, so the x-axis stays a run of dates. */
  stageNights: { dk: string; stages: import('../types').SleepStages | null }[];
  /** Nights for the schedule chart, or null when too few were logged to draw
   *  a rolling week behind them. */
  schedule: ScheduleNight[] | null;
  balance: SleepBalance | null;
  nextDay: NextDayStat[];
  shared: string[];

  /* ---- the night as a series (pass 2), when one was captured ---- */
  /** The overnight heart-rate curve, seconds from bed. */
  hr: HrPoint[] | null;
  /** Respiratory rate across the same window. */
  resp: RespPoint[] | null;
  /** The hypnogram: every stage block in the order it happened. */
  spans: StageSpan[] | null;
  /** Wakefulness read off those spans. */
  wake: WakeStats | null;
  /** Median overnight low across the user's recent nights — the reference line
   *  the curve is read against. */
  typicalLow: number | null;
}

/**
 * The night's stored series, read out of the waveform sidecar by the caller
 * (this module stays free of the store). Everything is optional: a night
 * logged by hand has none of it and the report simply has fewer sections.
 */
export interface NightSeries {
  hr?: HrPoint[] | null;
  resp?: RespPoint[] | null;
  spans?: StageSpan[] | null;
}

/**
 * The whole report for the night ending the morning of `dk`, or null when
 * there is no night recorded (the card that opens it is only tappable when
 * there is, but the sheet must survive a delete underneath it).
 */
export function buildSleepReport(
  days: DaysMap,
  dk: string,
  addDays: AddDays,
  ctx: ScoreContext = {},
  protocol?: Partial<Protocol> | null,
  series: NightSeries = {},
): SleepReport | null {
  const night = nightOf(days, dk);
  if (!night) return null;
  const parts = sleepGradeParts(days, dk);
  const nights = recentNights(days, dk, REPORT_WINDOW_NIGHTS, addDays);
  const target = resolveProtocol(protocol).sleep.hours;

  // With the curve in hand the dip is measured from the lowest settled stretch
  // rather than the single lowest beat, and it says which it used — one stray
  // sample can move a single-minimum dip by several percent.
  const hr = series.hr && series.hr.length ? series.hr : null;
  const settled = hr ? lowestRollingMean(hr) : null;
  const dip = settled != null
    ? nocturnalDip(days, dk, { low: settled, basis: 'rolling-low' })
    : nocturnalDip(days, dk);
  const low = overnightLow(days, dk);
  const baseline = restingHrBaseline(days, dk);
  const dipTrend = dipHistory(days, dk, DIP_TREND_NIGHTS, addDays);

  return {
    dk,
    night,
    staged: !!night.stages,
    grade: parts ? parts.cat : null,
    reasons: gradeReasons(days, dk),
    gradeNote: gradeNote(days, dk),
    hrLow: parts ? parts.hrLow : null,
    hrHigh: parts ? parts.hrHigh : null,
    dip,
    dipPrompt: !dip && low != null
      ? { low, baselineCount: baseline ? baseline.count : countRestingReadings(days, dk, addDays), needed: DIP_MIN_BASELINE }
      : null,
    dipTrend,
    stageNights: stageSeries(days, dk, REPORT_WINDOW_NIGHTS, addDays),
    schedule: nights.length >= SCHEDULE_MIN_NIGHTS ? scheduleSeries(days, dk, addDays) : null,
    balance: sleepBalance(nights, target),
    nextDay: nextDayImpact(days, dk, ctx, addDays),
    shared: sharedTraits(days, dk, ctx, addDays),
    hr,
    resp: series.resp && series.resp.length ? series.resp : null,
    spans: series.spans && series.spans.length ? series.spans : null,
    wake: wakeStats(series.spans),
    typicalLow: typicalOvernightLow(days, dk),
  };
}

/** Resting readings inside the baseline window, for the "you have N" prompt. */
function countRestingReadings(days: DaysMap, dk: string, addDays: AddDays): number {
  let n = 0;
  for (let i = 0; i < 21; i++) {
    const d = days[addDays(dk, -i)];
    if (!d) continue;
    n += (d.readings || []).filter((r) => r.type === 'restingHr' && parseFloat(String(r.hr)) > 0).length;
  }
  return n;
}

/** Whether the Journal's "Last night" card should open a report. Today it is
 *  simply "a night was recorded" — the report degrades to the verdict alone. */
export const hasSleepReport = (days: DaysMap, dk: string): boolean => sleepHours(days, dk) != null;
