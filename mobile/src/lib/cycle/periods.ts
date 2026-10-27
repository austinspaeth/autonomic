/**
 * Logged bleeding → periods → cycles. Pure: a days map in, the structure out.
 *
 * Everything in src/lib/cycle is DERIVED, the way scores are: the journal holds
 * only what was logged (`days[dk].cycle.flow`), and a period, a cycle and a
 * phase are recomputed from it on every read. Nothing here is stored, so a
 * corrected day re-draws every phase after it with no migration.
 *
 * Conventions, and why:
 *  - Cycle day 1 is the first day of real flow. Spotting never starts a
 *    period and never joins one: it is HealthKit's intermenstrual bleeding,
 *    and counting a day of spotting as day 1 shifts every phase in the cycle
 *    by however long it ran early.
 *  - One unlogged day inside a period is tolerated (`PERIOD_GAP_DAYS`).
 *    People skip logging the light tail; splitting one period into two would
 *    invent a 3-day cycle.
 *  - A cycle outside `MIN_CYCLE_DAYS`..`MAX_CYCLE_DAYS` is IMPLAUSIBLE and
 *    kept out of every statistic. Under 15 days is bleeding that was not a
 *    new period; over 60 is far more often a stretch nobody logged than a
 *    real 70-day cycle, and reading it as one would put a luteal phase on
 *    two months of guesswork.
 */
import type { CycleFlow, DayRecord } from '../types';

export const PERIOD_GAP_DAYS = 1;
export const MIN_CYCLE_DAYS = 15;
export const MAX_CYCLE_DAYS = 60;
/** A period longer than this is still a period, but worth naming (a prolonged
 *  period is one of the things a doctor asks about). */
export const LONG_PERIOD_DAYS = 8;

export interface Period {
  /** First day of flow (cycle day 1). */
  start: string;
  /** Last logged day of flow. */
  end: string;
  /** Calendar days from start to end, inclusive. */
  days: number;
  /** Days logged as heavy. */
  heavyDays: number;
}

export interface Cycle {
  /** Day 1. */
  start: string;
  /** The next cycle's day 1, or null for the cycle in progress. */
  next: string | null;
  /** Days from start to next, or null while in progress. */
  length: number | null;
  /** Inside the plausible range — only these count toward any statistic. */
  plausible: boolean;
  /** The period that opened this cycle. */
  period: Period;
}

const DAY_MS = 86400000;
/** Whole days from `a` to `b` (b - a). Parsed as UTC so DST cannot shave an hour
 *  off a day and round it away. */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** `dk` shifted by `n` days, without touching local time. */
export function shiftDay(dk: string, n: number): string {
  const [y, m, d] = dk.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Every logged flow day, sorted. */
export function flowDays(days: Record<string, Pick<DayRecord, 'cycle'> | undefined>): { dk: string; flow: CycleFlow }[] {
  const out: { dk: string; flow: CycleFlow }[] = [];
  for (const dk of Object.keys(days)) {
    const f = days[dk]?.cycle?.flow;
    if (f) out.push({ dk, flow: f });
  }
  return out.sort((a, b) => (a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0));
}

/** Logged flow stitched into periods (spotting excluded), oldest first. */
export function findPeriods(days: Record<string, Pick<DayRecord, 'cycle'> | undefined>): Period[] {
  const flow = flowDays(days).filter((f) => f.flow !== 'spotting');
  const out: Period[] = [];
  let cur: Period | null = null;
  for (const f of flow) {
    if (cur && dayDiff(cur.end, f.dk) <= PERIOD_GAP_DAYS + 1) {
      cur.end = f.dk;
      cur.days = dayDiff(cur.start, f.dk) + 1;
      if (f.flow === 'heavy') cur.heavyDays++;
      continue;
    }
    cur = { start: f.dk, end: f.dk, days: 1, heavyDays: f.flow === 'heavy' ? 1 : 0 };
    out.push(cur);
  }
  return out;
}

/** Periods → cycles. The last one is in progress (`next: null`). */
export function findCycles(periods: Period[]): Cycle[] {
  return periods.map((p, i) => {
    const next = periods[i + 1]?.start ?? null;
    const length = next ? dayDiff(p.start, next) : null;
    return {
      start: p.start,
      next,
      length,
      plausible: length == null ? true : length >= MIN_CYCLE_DAYS && length <= MAX_CYCLE_DAYS,
      period: p,
    };
  });
}

export interface CycleStats {
  /** Finished, plausible cycles the figures below come from (most recent
   *  `STATS_WINDOW`). */
  n: number;
  medianLength: number | null;
  minLength: number | null;
  maxLength: number | null;
  medianPeriod: number | null;
  /** Shortest to longest within the window is at most `REGULAR_SPREAD` days.
   *  Null below two cycles: one cycle is not a pattern. */
  regular: boolean | null;
}

/** How many recent cycles describe "your cycle". Six is half a year: long
 *  enough to see a pattern, short enough to follow a change (perimenopause,
 *  stopping contraception). */
export const STATS_WINDOW = 6;
/** Spread at which a cycle stops being called regular. Clinical definitions
 *  sit at 7-9 days between shortest and longest. */
export const REGULAR_SPREAD = 8;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function cycleStats(cycles: Cycle[]): CycleStats {
  const done = cycles.filter((c) => c.length != null && c.plausible).slice(-STATS_WINDOW);
  const lens = done.map((c) => c.length as number);
  const n = lens.length;
  return {
    n,
    medianLength: median(lens),
    minLength: n ? Math.min(...lens) : null,
    maxLength: n ? Math.max(...lens) : null,
    medianPeriod: median(done.map((c) => c.period.days)),
    regular: n >= 2 ? Math.max(...lens) - Math.min(...lens) <= REGULAR_SPREAD : null,
  };
}
