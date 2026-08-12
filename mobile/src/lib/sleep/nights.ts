/**
 * Nights as a series: the run of recent nights behind the schedule, sleep
 * balance and stage-comparison sections of the sleep report.
 *
 * Clock times are carried as MINUTES PAST NOON (noon = 0, 9pm = 540, 12:40am =
 * 760, 7:18am = 1158). Bedtimes straddle midnight, and a stdev or a mean of
 * raw clock minutes wraps 23:50 and 00:10 to opposite ends of the day — which
 * is exactly the kind of quiet arithmetic error that turns a steady sleeper
 * into an erratic one on screen.
 *
 * Pure: no store, no native imports, no React.
 */
import { catFromBands } from '../scoring';
import { stagesForWindow } from '../scoring/day';
import type { DaysMap } from '../scoring/day';
import type { Band, ScoreCat, SleepStages } from '../types';
import { STAGE_ORDER, asleepMinutes } from './stages';

/** Minutes past noon for a `HH:MM` clock time, or null when unparseable. */
export function minsPastNoon(t?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return null;
  const mins = +m[1] * 60 + +m[2];
  return mins < 720 ? mins + 720 : mins - 720;
}

/** The inverse, back to a `HH:MM` clock time. */
export function clockFromNoon(v: number): string {
  const mins = ((Math.round(v) + 720) % 1440 + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export interface Night {
  dk: string;
  /** Bedtime and wake in minutes past noon; wake may exceed 1440 only if the
   *  window were longer than a day, which the journal cannot produce. */
  bedAt: number;
  wakeAt: number;
  /** Length of the bed→wake window in minutes. */
  inBedMin: number;
  /** Minutes actually asleep when staging describes this window, else null. */
  asleepMin: number | null;
  interrupted: boolean;
  stages: SleepStages | null;
}

/** The night recorded on `dk`, or null when bed/wake are not both set. */
export function nightOf(days: DaysMap, dk: string): Night | null {
  const sleep = days[dk]?.sleep;
  if (!sleep) return null;
  const bedAt = minsPastNoon(sleep.bed);
  const wakeAt = minsPastNoon(sleep.wake);
  if (bedAt == null || wakeAt == null) return null;
  const inBedMin = wakeAt >= bedAt ? wakeAt - bedAt : wakeAt + 1440 - bedAt;
  const stages = stagesForWindow(sleep);
  return {
    dk,
    bedAt,
    wakeAt: bedAt + inBedMin,
    inBedMin,
    asleepMin: stages ? asleepMinutes(stages) : null,
    interrupted: sleep.quality === 'interrupted',
    stages,
  };
}

/**
 * The last `count` nights ending at `dk`, oldest first. Nights with no record
 * are skipped rather than zero-filled: an unlogged night is not a short night,
 * and the schedule and balance charts both read as counts of what happened.
 */
export function recentNights(
  days: DaysMap,
  dk: string,
  count: number,
  addDays: (k: string, n: number) => string,
): Night[] {
  const out: Night[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const n = nightOf(days, addDays(dk, -i));
    if (n) out.push(n);
  }
  return out;
}

/** Sleep duration a night counts for: staged sleep when it describes the
 *  window, otherwise the bed→wake window itself. */
export const nightMinutes = (n: Night): number => (n.asleepMin != null ? n.asleepMin : n.inBedMin);

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/* ---------- schedule ---------- */

/**
 * How many nights the schedule chart plots. Two weeks: long enough that a
 * drifting bedtime is visible, short enough that the bars stay wide enough to
 * read individually.
 */
export const SCHEDULE_NIGHTS = 14;
/** Nights in the trailing average the chart draws as a band. */
export const SCHEDULE_ROLL_NIGHTS = 7;
/** Prior nights needed before that average exists at all. */
export const SCHEDULE_ROLL_MIN = 3;
/**
 * Extra days of runway read BEFORE the plotted window, so the first bar's
 * average is built from the nights that actually preceded it rather than from
 * nothing. Without this the band would start a few bars in and, worse, the
 * whole average would silently be "a rolling average of what happens to be on
 * screen" — a number that changes meaning with the window size.
 */
export const SCHEDULE_RUNWAY_NIGHTS = SCHEDULE_ROLL_NIGHTS * 3;
/** Logged nights needed before the section renders at all. */
export const SCHEDULE_MIN_NIGHTS = 5;

/**
 * How a schedule bar is graded: on how long the night was.
 *
 * This is the duration ladder out of `sleepGrade` (../scoring/day) with its
 * interruption and overnight-HR modifiers left off — a bar is one shape and
 * one colour, and its length IS its duration, so grading it on anything else
 * would have the colour disagree with the picture. **Move these with
 * `sleepGradeParts` or the card will contradict the grade above it.**
 *
 * Minutes asleep (staged nights) or in bed (everything else).
 */
export const SLEEP_DURATION_BANDS: Band[] = [
  { max: 5 * 60, cat: 'crash' },
  { max: 6 * 60, cat: 'bad' },
  { max: 7 * 60, cat: 'ok' },
  { max: 8 * 60, cat: 'good' },
  { max: Infinity, cat: 'great' },
];

export interface ScheduleNight {
  dk: string;
  /** Minutes past noon; null on a night with no record. */
  bedAt: number | null;
  wakeAt: number | null;
  /** The trailing rolling average at that point, null until it exists. */
  avgBedAt: number | null;
  avgWakeAt: number | null;
  /** What the night counted for, and its grade. */
  minutes: number | null;
  cat: ScoreCat | null;
}

/**
 * The schedule chart's series: every night in the window, graded on its
 * duration, with the rolling average as it stood THAT night behind it.
 *
 * The average is trailing and excludes the night itself — a night sitting
 * inside the average it is drawn against always looks steadier than it was.
 * Unlogged nights stay in the series as nulls so the x-axis remains a run of
 * dates rather than a compacted list.
 */
export function scheduleSeries(
  days: DaysMap,
  dk: string,
  addDays: (k: string, n: number) => string,
  count = SCHEDULE_NIGHTS,
  roll = SCHEDULE_ROLL_NIGHTS,
): ScheduleNight[] {
  // Read a run of runway before the window so the leftmost bars have real
  // history behind them; only the last `count` are returned.
  const runway = SCHEDULE_RUNWAY_NIGHTS;
  const total = count + runway;
  const allKeys: string[] = [];
  for (let i = total - 1; i >= 0; i--) allKeys.push(addDays(dk, -i));
  const allNights = allKeys.map((k) => nightOf(days, k));

  return allKeys.slice(runway).map((key, w) => {
    const i = runway + w;
    const n = allNights[i];
    // The last `roll` LOGGED nights before this one, however far back they sit.
    const prior: Night[] = [];
    for (let j = i - 1; j >= 0 && prior.length < roll; j--) if (allNights[j]) prior.push(allNights[j]!);
    const enough = prior.length >= SCHEDULE_ROLL_MIN;
    const minutes = n ? nightMinutes(n) : null;
    return {
      dk: key,
      bedAt: n ? n.bedAt : null,
      wakeAt: n ? n.wakeAt : null,
      avgBedAt: enough ? mean(prior.map((q) => q.bedAt)) : null,
      avgWakeAt: enough ? mean(prior.map((q) => q.wakeAt)) : null,
      minutes,
      cat: minutes != null ? (catFromBands(minutes, SLEEP_DURATION_BANDS) as ScoreCat) : null,
    };
  });
}

/* ---------- balance ---------- */

export interface SleepBalance {
  /** The user's own sleep target, in hours. */
  targetHours: number;
  /** Running total of hours over/under target across the window. */
  totalDeltaHours: number;
  /** Mean nightly duration across the window, in hours. */
  avgHours: number;
  /** Cumulative delta after each night, index-aligned to the nights. */
  cumulative: number[];
  nights: Night[];
}

/** Nights needed before a running balance is worth showing. */
export const BALANCE_MIN_NIGHTS = 4;

/**
 * Hours over or under the user's own target across a run of nights. It is a
 * line to steer by, not a debt: nothing here tells them to make it up.
 */
export function sleepBalance(nights: Night[], targetHours: number): SleepBalance | null {
  if (nights.length < BALANCE_MIN_NIGHTS || !(targetHours > 0)) return null;
  const hours = nights.map((n) => nightMinutes(n) / 60);
  let cum = 0;
  const cumulative = hours.map((h) => (cum += h - targetHours));
  return {
    targetHours,
    totalDeltaHours: cum,
    avgHours: mean(hours),
    cumulative,
    nights,
  };
}

/* ---------- wakefulness ---------- */

/**
 * Awake time is graded in MINUTES, on the clinical scale for wake after sleep
 * onset: under about half an hour is the normal amount of stirring, and beyond
 * that a night is fragmented.
 *
 * Minutes rather than a share of the night, which is the other obvious scale
 * (the complement of sleep efficiency). Two reasons. It is the measure sleep
 * medicine actually quotes for wakefulness, and it is the number a person
 * recognises — you remember lying awake for forty minutes, not for 9% of a
 * night. It also means the chart can grade itself the way every other chart in
 * the app does, with zone lines on its own y-axis: a share-based grade on a
 * minutes axis has boundaries that move with each night's length, so nothing
 * could be drawn.
 *
 * Absolute bands are defensible here and not for bedtime, since how much of
 * the night you spent awake does not depend on WHEN you slept.
 */
export const WAKE_MINUTES_BANDS: Band[] = [
  { max: 15, cat: 'great' },
  { max: 30, cat: 'good' },
  { max: 45, cat: 'ok' },
  { max: 60, cat: 'bad' },
  { max: Infinity, cat: 'crash' },
];

/** Grade for a night's awake time, or null without staging. */
export function wakeCat(stages: SleepStages | null | undefined): ScoreCat | null {
  if (!stages) return null;
  return catFromBands(stages.awake, WAKE_MINUTES_BANDS) as ScoreCat;
}

/* ---------- stage series ---------- */

export interface StageTotal {
  key: (typeof STAGE_ORDER)[number];
  minutes: number;
}

/**
 * Stage minutes night by night across the last `count` nights ending at `dk`,
 * oldest first — the series the report's stage chart plots. Unlike
 * {@link recentNights} this keeps unstaged nights as `null` rather than
 * skipping them, because a line chart's x-axis is a run of dates: dropping the
 * nights a watch missed would silently redraw them as continuous.
 */
export function stageSeries(
  days: DaysMap,
  dk: string,
  count: number,
  addDays: (k: string, n: number) => string,
): { dk: string; stages: SleepStages | null }[] {
  const out: { dk: string; stages: SleepStages | null }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = addDays(dk, -i);
    const n = nightOf(days, key);
    out.push({ dk: key, stages: n ? n.stages : null });
  }
  return out;
}
