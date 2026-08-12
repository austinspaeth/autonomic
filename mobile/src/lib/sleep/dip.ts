/**
 * Nocturnal dip — the night's overnight low measured against the user's OWN
 * daytime resting heart rate.
 *
 * Overnight heart rate normally settles well below the daytime resting rate.
 * How far below is the only number here, and it is only meaningful against a
 * baseline the user actually produced: a dip percent computed off one or two
 * resting readings is worse than no dip at all, so below
 * {@link DIP_MIN_BASELINE} readings this returns null and the section does not
 * render.
 *
 * This describes a pattern in the user's own log. It is not a finding, a
 * diagnosis or a risk score, and nothing here should be phrased as one.
 *
 * Pure: no store, no native imports, no React.
 */
import type { DaysMap } from '../scoring/day';
import type { Entry, ScoreCat } from '../types';

/* ---------- thresholds (named, never inline at a call site) ---------- */

/** A dip at or above this percent is the normal overnight pattern. */
export const DIP_DIPPING_PCT = 10;
/** Between this and {@link DIP_DIPPING_PCT} the dip is reduced. */
export const DIP_REDUCED_PCT = 5;
/** Below 0 the overnight low sat above the daytime resting rate. */
export const DIP_REVERSE_PCT = 0;

/** Resting readings needed before a baseline is shown at all. */
export const DIP_MIN_BASELINE = 3;
/** How far back the baseline looks for resting readings. */
export const DIP_BASELINE_DAYS = 21;

/**
 * Which `restingHr` readings count toward the baseline.
 *
 * The registry offers two positions, Laying and Sitting (`READING_TYPES
 * .restingHr`), and neither is a postural challenge — there is no Standing
 * option to exclude, because a standing heart rate is an orthostatic reading
 * and lives in the POTS types instead. So every resting reading counts,
 * including ones saved before the position field existed. If a Standing
 * position is ever added to the registry it must be filtered out here: it is
 * not a resting baseline and would inflate the denominator.
 */
const POSITION_EXCLUDED = new Set(['standing']);

export const countsTowardBaseline = (r: Entry): boolean =>
  !POSITION_EXCLUDED.has(String(r.position || '').toLowerCase());

/* ---------- bands ---------- */

export type DipBandKey = 'dipping' | 'reduced' | 'nonDipping' | 'reverse';

export interface DipBand {
  key: DipBandKey;
  label: string;
  /** Grade category, so the UI resolves the colour from SCORE_COLORS. */
  cat: ScoreCat;
  /** Inclusive lower bound in percent (-Infinity for the bottom band). */
  from: number;
  /** Exclusive upper bound in percent (Infinity for the top band). */
  to: number;
}

/**
 * Ordered worst → best, which is also the order the band strip draws in.
 *
 * The `cat` is the app's universal grade scale (SCORE_COLORS), not a palette of
 * this section's own: a normal dip is 'great' (the bright green the app uses for
 * its top tier), a reduced one 'good' (the deeper green), non-dipping 'bad'
 * (orange) and reverse 'crash' (red). Nothing here picks a colour directly.
 */
export const DIP_BANDS: DipBand[] = [
  { key: 'reverse', label: 'Reverse', cat: 'crash', from: -Infinity, to: DIP_REVERSE_PCT },
  { key: 'nonDipping', label: 'Non-dipping', cat: 'bad', from: DIP_REVERSE_PCT, to: DIP_REDUCED_PCT },
  { key: 'reduced', label: 'Reduced', cat: 'good', from: DIP_REDUCED_PCT, to: DIP_DIPPING_PCT },
  { key: 'dipping', label: 'Dipping', cat: 'great', from: DIP_DIPPING_PCT, to: Infinity },
];

export const dipBandFor = (pct: number): DipBand =>
  DIP_BANDS.find((b) => pct >= b.from && pct < b.to) || DIP_BANDS[DIP_BANDS.length - 1];

/* ---------- baseline ---------- */

const num = (x: unknown): number | null => {
  const v = parseFloat(String(x));
  return Number.isFinite(v) && v > 0 ? v : null;
};

const median = (vals: number[]): number => {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface DipBaseline {
  /** Median resting HR in bpm. */
  bpm: number;
  /** How many readings it was built from. */
  count: number;
  /** How far back it looked, in days. */
  days: number;
}

/**
 * Median of the user's recent daytime resting-HR readings, looking back
 * {@link DIP_BASELINE_DAYS} from (and including) `dk`. Median, not mean: a
 * single reading taken mid-flare would drag a mean into a false claim.
 *
 * Returns null below {@link DIP_MIN_BASELINE} readings — a baseline that thin
 * is not a baseline.
 */
export function restingHrBaseline(days: DaysMap, dk: string, windowDays = DIP_BASELINE_DAYS): DipBaseline | null {
  const vals: number[] = [];
  for (const key of Object.keys(days)) {
    if (key > dk) continue;
    if (daysBetween(key, dk) >= windowDays) continue;
    for (const r of days[key]?.readings || []) {
      if (r.type !== 'restingHr' || !countsTowardBaseline(r)) continue;
      const v = num(r.hr);
      if (v != null) vals.push(v);
    }
  }
  if (vals.length < DIP_MIN_BASELINE) return null;
  return { bpm: median(vals), count: vals.length, days: windowDays };
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`), without touching Date order. */
function daysBetween(a: string, b: string): number {
  const at = Date.parse(`${a}T00:00:00`), bt = Date.parse(`${b}T00:00:00`);
  return Math.round((bt - at) / 86400000);
}

/* ---------- the dip ---------- */

/**
 * How the overnight low was measured. Phase 1 has only the stored `hrLow`,
 * which a single artifact can drag; once the overnight HR series ships, a
 * sleeping mean or lowest rolling window is preferred, and the report says
 * which one it used rather than quietly changing meaning.
 */
export type DipBasis = 'single-minimum' | 'sleeping-mean' | 'rolling-low';

export const DIP_BASIS_LABEL: Record<DipBasis, string> = {
  'single-minimum': 'Single minimum',
  'sleeping-mean': 'Sleeping mean',
  'rolling-low': 'Lowest 10 minutes',
};

export interface DipResult {
  /** Percent below the daytime baseline. Positive = dipped, negative = above. */
  pct: number;
  band: DipBand;
  /** The overnight low used, in bpm. */
  low: number;
  baseline: DipBaseline;
  basis: DipBasis;
}

/** The stored overnight low for a night, or null when none was recorded. */
export const overnightLow = (days: DaysMap, dk: string): number | null =>
  num(days[dk]?.sleep?.hrLow);

/**
 * The night's dip, or null when either half is missing. `low` may be supplied
 * by the caller (with its basis) once the overnight series exists; by default
 * it is the stored single minimum.
 */
export function nocturnalDip(
  days: DaysMap,
  dk: string,
  opts: { low?: number | null; basis?: DipBasis; windowDays?: number } = {},
): DipResult | null {
  const low = opts.low != null ? opts.low : overnightLow(days, dk);
  if (low == null || low <= 0) return null;
  const baseline = restingHrBaseline(days, dk, opts.windowDays);
  if (!baseline) return null;
  const pct = ((baseline.bpm - low) / baseline.bpm) * 100;
  return { pct, band: dipBandFor(pct), low, baseline, basis: opts.basis || 'single-minimum' };
}

export interface DipNight { dk: string; dip: DipResult | null }

/**
 * The dip for each of the last `count` nights up to and including `dk`, oldest
 * first. Nights with no dip are `null` rather than dropped, so the trend reads
 * as a run of nights and not a compacted series — and each entry carries its
 * whole result, so selecting a night in the chart can re-read the low and the
 * baseline it was measured against, not just the percentage.
 *
 * Each night is measured against the baseline as it stood THAT night, which is
 * why this is a loop and not one baseline reused: a user whose resting rate is
 * falling would otherwise see their whole history rewritten every morning.
 */
export function dipHistory(
  days: DaysMap,
  dk: string,
  count: number,
  addDays: (k: string, n: number) => string,
): DipNight[] {
  const out: DipNight[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = addDays(dk, -i);
    out.push({ dk: key, dip: nocturnalDip(days, key) });
  }
  return out;
}
