/**
 * The trend metric registry — the single source of truth for "is this metric
 * moving?", the way src/lib/registry.ts is the single source of truth for entry
 * types.
 *
 * Before this existed, three places answered that question and disagreed:
 * a week-trend helper in src/lib/widgets.ts fired an arrow on any non-zero percentage
 * change of a MEAN with no coverage requirement, while ../scoring/downturn and
 * ../scoring/upturn each implemented their own windowed comparison. The
 * home-screen widget could therefore show a rising arrow on the same day the
 * app showed a downturn warning.
 *
 * Everything in ./series and ./compare is generic machinery over this table.
 * Adding a metric means adding a row here — never a comparison at a call site.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import type { DayRecord, Entry } from '../types';
import { orthoMaxDelta, totalPower, type ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, dayCleanliness, scoreCat, scoreSet, sleepHours, type DaysMap } from '../scoring/day';
import { isTrustedReading } from '../hrvQuality';

export type TrendMetricId =
  // The six the Journal's Trend card walks (TREND_PRIORITY).
  | 'score' | 'badDays' | 'rmssd' | 'restingHr' | 'sleepConsistency' | 'sleepDuration'
  // Added for ../insights: outcomes a correlation can be tested against, and
  // the wider set Trend Watch may report. Everything the app is willing to make
  // a claim about is a row in this file and nowhere else — which is also how
  // metrics nobody should be shown a trend for (MxDMn, AMo50, Baevsky stress
  // index) stay off the screen: they are deliberately absent.
  | 'sdnn' | 'pnn50' | 'totalPower' | 'lfPeak'
  | 'sys' | 'dia' | 'sleepingHr'
  | 'symptomLoad' | 'bmCount' | 'waterIntake' | 'cleanDays' | 'orthoDelta';

/**
 * How a window's per-day values collapse to one number.
 *
 * `median` is the default and the reason this module exists — see ./compare.
 * The other two are not stylistic: `badDays` is a 0/1 indicator whose median
 * could never move by its 2-day threshold, and `sleepConsistency` is a
 * dispersion statistic that has no meaning for a single day. Both are declared
 * here rather than special-cased downstream, so the machinery stays generic.
 */
export type TrendAggregate = 'median' | 'count' | 'stdev';

export interface TrendMetricDef {
  id: TrendMetricId;
  label: string;
  /** Sentence opener including the verb, so plural metrics read correctly:
   *  "Your bad days are" vs "Your resting heart rate is". */
  subject: string;
  unit: string;
  /** What the window count is counting, for the detail line. */
  countNoun: string;
  /** Which way is good. 'band' = closer to `target` is better. */
  better: 'up' | 'down' | 'band';
  target?: [number, number];
  /** How per-day values collapse to the window's number. */
  aggregate: TrendAggregate;
  /** Smallest change worth telling a user about — clinical, not statistical. */
  minDelta: number;
  /** Whether minDelta is absolute or a fraction of the prior window. */
  deltaKind: 'absolute' | 'relative';
  /** Minimum data points required in EACH window. */
  minPoints: number;
  /** Per-day value, or null when that day has nothing to say. */
  value: (d: DayRecord | undefined, dk: string, days: DaysMap, ctx: ScoreContext) => number | null;
  /** "down 6 bpm" — direction word plus magnitude, no subject.
   *
   *  A DISPERSION metric (`aggregate: 'stdev'`) deliberately carries no number:
   *  see `sleepConsistency`. */
  phrase: (delta: number) => string;
  /** How the headline closes. Defaults to 'since last month'; a comparative
   *  phrase needs 'than last month' to be grammatical. */
  tail?: string;
  /** Window number for the detail line ("62"). */
  fmt: (v: number) => string;
}

/* ---------- extractors ---------- */

/** Readings of one type that clear the HRV trust bar, as numbers.
 *
 *  Routing HRV through `isTrustedReading` is non-negotiable (see CLAUDE.md):
 *  health stores are full of ~1-minute passive HRV samples, and a trend built
 *  on those reports noise as recovery. Every other aggregate in the app already
 *  excludes them; a trend that didn't would contradict the charts beside it. */
function vals(d: DayRecord | undefined, type: string, key: string): number[] {
  if (!d) return [];
  const out: number[] = [];
  (d.readings || []).forEach((r: Entry) => {
    if (r.type !== type || !isTrustedReading(r)) return;
    const v = parseFloat(r[key] as string);
    if (!isNaN(v)) out.push(v);
  });
  return out;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Readings sorted the way scoreSet's callers sort them, so a score computed
 *  here matches one computed anywhere else for the same day. */
const sortedReadings = (d: DayRecord): Entry[] =>
  (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));

/** The day's autonomic score, or null when the day can't be scored. */
export function dayScore(d: DayRecord | undefined, dk: string, days: DaysMap, ctx: ScoreContext): number | null {
  if (!d) return null;
  return scoreSet(sortedReadings(d), d, dk, days, ctx).score ?? null;
}

/** Bedtime as minutes past noon, so an 11:30pm and a 12:30am bedtime read as
 *  adjacent (690 and 750) instead of a 23-hour gap. Noon is the natural cut for
 *  a population whose bedtimes cluster in the evening; a genuine pre-noon
 *  bedtime lands at the far end of the scale, which is rare and honest. */
function bedtimeMinutes(d: DayRecord | undefined): number | null {
  const bed = d && d.sleep ? d.sleep.bed : '';
  if (!bed) return null;
  const [h, m] = bed.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return ((h * 60 + m) - 720 + 1440) % 1440;
}

/** The day's average of one HRV field across BOTH session types, the way the
 *  `rmssd` row already does it. Both are seated 5-minute-class readings and a
 *  user who captures one kind on some days and the other on the rest would
 *  otherwise see two half-empty series instead of one usable one. */
const hrvAvg = (d: DayRecord | undefined, key: string): number | null =>
  avg([...vals(d, 'breathHrv', key), ...vals(d, 'hrv', key)]);

/** Trusted HRV readings of both session types, for extractors that need the
 *  whole entry rather than one field. */
function hrvReadings(d: DayRecord | undefined): Entry[] {
  if (!d) return [];
  return (d.readings || []).filter((r) => (r.type === 'hrv' || r.type === 'breathHrv') && isTrustedReading(r));
}

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * A count of something the user logs per day.
 *
 * `null` for a day with no record at all, `0` for a day that exists but holds
 * none — the distinction ../compare's coverage rules are built on. A gap in the
 * journal is not a zero-symptom day.
 */
const dayCount = (d: DayRecord | undefined, pick: (d: DayRecord) => number): number | null =>
  (d ? pick(d) : null);

/* ---------- copy helpers ---------- */

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const dir = (delta: number, up: string, down: string) => (delta > 0 ? up : down);
const plural = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many);

/**
 * Minutes as a duration a person reads rather than converts: "1h 29m", not
 * "89 min". Under an hour it keeps the word ("35 min"), which reads better
 * inside a sentence than a bare "35m".
 *
 * Sign is dropped — every phrase states its own direction in words.
 */
const hm = (mins: number) => {
  const m = Math.round(Math.abs(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

/* ---------- the registry ---------- */

export const TREND_METRICS: Record<TrendMetricId, TrendMetricDef> = {
  score: {
    id: 'score',
    label: 'Daily score',
    subject: 'Your daily score is',
    unit: 'pts',
    countNoun: 'scored days',
    better: 'up',
    aggregate: 'median',
    minDelta: 0.5,
    deltaKind: 'absolute',
    minPoints: 8,
    value: (d, dk, days, ctx) => dayScore(d, dk, days, ctx),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} points`,
    fmt: (v) => String(round1(v)),
  },

  badDays: {
    id: 'badDays',
    label: 'Bad days',
    subject: 'Your bad days are',
    unit: 'days',
    countNoun: 'scored days',
    better: 'down',
    // A count, not a median: the per-day value is a 0/1 indicator, whose median
    // can only ever be 0 or 1 and so could never clear a 2-day threshold.
    aggregate: 'count',
    minDelta: 2,
    deltaKind: 'absolute',
    minPoints: 8,
    // Bad and Crash days — the bottom two bands of SCORE_CATS.
    value: (d, dk, days, ctx) => {
      const s = dayScore(d, dk, days, ctx);
      if (s == null) return null;
      const short = scoreCat(s).short;
      return short === 'Bad' || short === 'Crash' ? 1 : 0;
    },
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} days`,
    fmt: (v) => String(Math.round(v)),
  },

  rmssd: {
    id: 'rmssd',
    label: 'HRV (RMSSD)',
    subject: 'Your HRV is',
    unit: 'ms',
    countNoun: 'readings',
    better: 'up',
    aggregate: 'median',
    minDelta: 0.10,
    deltaKind: 'relative',
    minPoints: 5,
    value: (d) => avg([...vals(d, 'breathHrv', 'rmssd'), ...vals(d, 'hrv', 'rmssd')]),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} ms`,
    fmt: (v) => String(round1(v)),
  },

  restingHr: {
    id: 'restingHr',
    label: 'Resting heart rate',
    subject: 'Your resting heart rate is',
    unit: 'bpm',
    countNoun: 'readings',
    better: 'down',
    aggregate: 'median',
    minDelta: 3,
    deltaKind: 'absolute',
    minPoints: 5,
    // Same source preference the day score and the widgets use: dedicated
    // resting-HR readings, else the HRV session's heart rate.
    value: (d) => avg(vals(d, 'restingHr', 'hr'))
      ?? avg(vals(d, 'breathHrv', 'hr'))
      ?? avg(vals(d, 'hrv', 'avgHr')),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} bpm`,
    fmt: (v) => String(Math.round(v)),
  },

  sleepConsistency: {
    id: 'sleepConsistency',
    label: 'Bedtime consistency',
    subject: 'Your bedtime is',
    unit: 'min',
    countNoun: 'nights',
    // Lower spread is better, unambiguously and with good evidence behind it —
    // often a better story to tell than duration.
    better: 'down',
    aggregate: 'stdev',
    minDelta: 20,
    deltaKind: 'absolute',
    minPoints: 8,
    value: (d) => bedtimeMinutes(d),
    // THE ONLY PHRASE IN THE REGISTRY THAT CARRIES NO NUMBER, on purpose.
    //
    // This metric is a standard deviation, so its delta is a change in SCATTER
    // — a second-order quantity almost nobody can picture. Every numeric
    // wording of it failed the same way: "steadier by 89 min" and "swings
    // 1h 29m less" both invite "89 minutes of what?" and neither has an answer
    // a reader can check against their own week. Reporting no number is more
    // honest than reporting one that can't be interpreted; the user is one tap
    // from the Sleep charts, where the actual spread is drawn.
    //
    // The magnitude word is banded instead, so a change that just clears
    // minDelta (20 min) doesn't get the same superlative as one four times it.
    phrase: (delta) => {
      const mag = Math.abs(delta);
      const much = mag >= 90 ? 'far more' : mag >= 45 ? 'much more' : 'more';
      return `${much} ${dir(delta, 'variable', 'consistent')}`;
    },
    // Comparative adjective, so "than", not "since".
    tail: 'than last month',
    // The readout column stays numeric: it is a ± spread next to a 'min' unit,
    // not a sentence, and there the number IS interpretable.
    fmt: (v) => `±${Math.round(v)}`,
  },

  sleepDuration: {
    id: 'sleepDuration',
    label: 'Sleep',
    subject: 'Your sleep is',
    unit: 'h',
    countNoun: 'nights',
    // NOT monotonic: 11 hours is not better than 8. Movement is scored toward
    // the band, and two windows already inside it have nothing to report.
    better: 'band',
    target: [7, 9],
    aggregate: 'median',
    minDelta: 0.5,
    deltaKind: 'absolute',
    minPoints: 8,
    value: (d, dk, days) => sleepHours(days, dk),
    // Hours in, minutes out: "up 0.8h" is another number the reader converts.
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${hm(delta * 60)}`,
    // Unit-free, like every other row: callers append `unit` themselves, so a
    // trailing 'h' here produced "7h → 8h h" in the Journal's trend detail line.
    fmt: (v) => String(round1(v)),
  },

  /* ---------- outcomes added for ../insights ---------- */

  sdnn: {
    id: 'sdnn',
    label: 'HRV (SDNN)',
    subject: 'Your SDNN is',
    unit: 'ms',
    countNoun: 'readings',
    better: 'up',
    aggregate: 'median',
    minDelta: 0.10,
    deltaKind: 'relative',
    minPoints: 5,
    value: (d) => hrvAvg(d, 'sdnn'),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} ms`,
    fmt: (v) => String(round1(v)),
  },

  pnn50: {
    id: 'pnn50',
    label: 'HRV (pNN50)',
    subject: 'Your pNN50 is',
    unit: '%',
    countNoun: 'readings',
    better: 'up',
    // A wider bar than RMSSD's: pNN50 is a proportion of beat pairs crossing a
    // 50 ms cliff, so it swings far harder than the metrics either side of it.
    aggregate: 'median',
    minDelta: 0.20,
    deltaKind: 'relative',
    minPoints: 5,
    value: (d) => hrvAvg(d, 'pnn50'),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} points`,
    fmt: (v) => String(round1(v)),
  },

  totalPower: {
    id: 'totalPower',
    label: 'HRV total power',
    subject: 'Your total power is',
    unit: 'ms²',
    countNoun: 'readings',
    better: 'up',
    aggregate: 'median',
    minDelta: 0.20,
    deltaKind: 'relative',
    minPoints: 5,
    value: (d) => avg(hrvReadings(d).map(totalPower).filter((v): v is number => v != null)),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} ms²`,
    fmt: (v) => String(Math.round(v)),
  },

  lfPeak: {
    id: 'lfPeak',
    label: 'LF peak frequency',
    subject: 'Your LF peak is',
    unit: 'Hz',
    countNoun: 'readings',
    // Banded, not monotonic: baroreflex resonance sits near 0.1 Hz, and a peak
    // that has drifted ABOVE it is not better than one sitting on it. The band
    // is the great/good span of BANDS.lfPeak.
    better: 'band',
    target: [0.085, 0.115],
    aggregate: 'median',
    minDelta: 0.008,
    deltaKind: 'absolute',
    minPoints: 5,
    value: (d) => hrvAvg(d, 'lfPeak'),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round2(Math.abs(delta))} Hz`,
    fmt: (v) => String(round2(v)),
  },

  sys: {
    id: 'sys',
    label: 'Systolic pressure',
    subject: 'Your systolic pressure is',
    unit: 'mmHg',
    countNoun: 'readings',
    // Banded for the obvious reason and the less obvious one: this population
    // runs low as often as high, so "down is good" would congratulate someone on
    // the way into a faint.
    better: 'band',
    target: [108, 129],
    aggregate: 'median',
    minDelta: 4,
    deltaKind: 'absolute',
    minPoints: 5,
    value: (d) => avg(vals(d, 'bp', 'sys')),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} mmHg`,
    fmt: (v) => String(Math.round(v)),
  },

  dia: {
    id: 'dia',
    label: 'Diastolic pressure',
    subject: 'Your diastolic pressure is',
    unit: 'mmHg',
    countNoun: 'readings',
    better: 'band',
    target: [65, 83],
    aggregate: 'median',
    minDelta: 3,
    deltaKind: 'absolute',
    minPoints: 5,
    value: (d) => avg(vals(d, 'bp', 'dia')),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} mmHg`,
    fmt: (v) => String(Math.round(v)),
  },

  sleepingHr: {
    id: 'sleepingHr',
    label: 'Sleeping heart rate',
    subject: 'Your sleeping heart rate is',
    unit: 'bpm',
    countNoun: 'nights',
    better: 'down',
    aggregate: 'median',
    minDelta: 3,
    deltaKind: 'absolute',
    minPoints: 8,
    // The night's floor, which is what the watch and Health Connect both report
    // and what sleepGrade already demotes a night on.
    value: (d) => (d && d.sleep ? num(d.sleep.hrLow) : null),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} bpm`,
    fmt: (v) => String(Math.round(v)),
  },

  symptomLoad: {
    id: 'symptomLoad',
    label: 'Symptoms logged',
    subject: 'Your symptom load is',
    unit: 'entries',
    countNoun: 'logged days',
    better: 'down',
    // A window total, for the same reason badDays is: the per-day value is a
    // small integer whose median could never clear a meaningful threshold.
    aggregate: 'count',
    minDelta: 4,
    deltaKind: 'absolute',
    minPoints: 8,
    value: (d) => dayCount(d, (x) => (x.symptoms || []).length),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} ${plural(delta, 'entry', 'entries')}`,
    fmt: (v) => String(Math.round(v)),
  },

  bmCount: {
    id: 'bmCount',
    label: 'Bowel movements',
    subject: 'Your bowel movements are',
    unit: 'a day',
    countNoun: 'logged days',
    // One to two a day is the target; three is not twice as good as one, and
    // zero is the direction that matters most here.
    better: 'band',
    target: [1, 2],
    aggregate: 'median',
    minDelta: 0.5,
    deltaKind: 'absolute',
    minPoints: 8,
    value: (d) => dayCount(d, (x) => ((x.digestion && x.digestion.movements) || []).length),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} a day`,
    fmt: (v) => String(round1(v)),
  },

  waterIntake: {
    id: 'waterIntake',
    label: 'Water',
    subject: 'Your water intake is',
    unit: 'L',
    countNoun: 'logged days',
    better: 'up',
    aggregate: 'median',
    minDelta: 0.3,
    deltaKind: 'absolute',
    minPoints: 8,
    // Only days the user actually recorded water count. A zero here is
    // overwhelmingly "didn't log it" rather than "drank nothing", and counting
    // those would manufacture a rising trend out of somebody simply starting to
    // track hydration.
    value: (d) => { const w = d && d.food ? num(d.food.water) : null; return w != null && w > 0 ? w : null; },
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${round1(Math.abs(delta))} L`,
    fmt: (v) => `${round1(v)}`,
  },

  cleanDays: {
    id: 'cleanDays',
    label: 'Clean days',
    subject: 'Your clean days are',
    unit: 'days',
    countNoun: 'logged days',
    better: 'up',
    aggregate: 'count',
    minDelta: 3,
    deltaKind: 'absolute',
    minPoints: 8,
    // dayCleanliness returns null for a day with no record, which is exactly the
    // null this series wants — a gap is not a broken day.
    value: (d, dk, days, ctx) => {
      const c = dayCleanliness(days, dk, ctx.protocol || DEFAULT_PROTOCOL, ctx.customTypes);
      return c ? (c.clean ? 1 : 0) : null;
    },
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} ${plural(delta, 'day', 'days')}`,
    fmt: (v) => String(Math.round(v)),
  },

  orthoDelta: {
    id: 'orthoDelta',
    label: 'Standing HR rise',
    subject: 'Your standing heart-rate rise is',
    unit: 'bpm',
    countNoun: 'episodes',
    better: 'down',
    aggregate: 'median',
    minDelta: 5,
    deltaKind: 'absolute',
    minPoints: 5,
    // Episodes only exist on days one happened, so this series is sparse by
    // nature and its windows will often read 'unknown'. That is the honest
    // answer: it is kept out of WATCH_PRIORITY and used only as a correlation
    // outcome, where a null day simply drops out of the pairing.
    value: (d, dk, days, ctx) => avg((d ? d.readings || [] : [])
      .filter((r) => r.type === 'orthostatic')
      .map((r) => orthoMaxDelta(r, ctx.hrCurve ? ctx.hrCurve(r.id) : null))
      .filter((v): v is number => v != null)),
    phrase: (delta) => `${dir(delta, 'up', 'down')} ${Math.abs(Math.round(delta))} bpm`,
    fmt: (v) => String(Math.round(v)),
  },
};

/**
 * Display/selection priority, highest first.
 *
 * Score and bad days lead because they are the app's own headline numbers and
 * the most legible thing to be told has improved. Sleep duration is last
 * because it is the least specific claim of the six.
 */
export const TREND_PRIORITY: TrendMetricId[] = [
  'score', 'badDays', 'rmssd', 'restingHr', 'sleepConsistency', 'sleepDuration',
];

/**
 * Every metric a correlation may be tested against. This is the complete key
 * set of TREND_METRICS — the registry-coverage test asserts as much, so a new
 * row can never be added without landing here.
 */
export const INSIGHT_OUTCOMES: TrendMetricId[] = [
  'score', 'badDays', 'rmssd', 'sdnn', 'pnn50', 'totalPower', 'lfPeak',
  'restingHr', 'sleepingHr', 'sys', 'dia',
  'sleepDuration', 'sleepConsistency', 'symptomLoad', 'bmCount', 'waterIntake',
  'cleanDays', 'orthoDelta',
];

/**
 * What Trend Watch is allowed to put on screen, most important first.
 *
 * Deliberately narrower than INSIGHT_OUTCOMES. A trend line is a claim the user
 * reads at a glance with no context, so it has to be a metric they recognise and
 * could act on. `orthoDelta` is out because its series is event-driven and its
 * windows are rarely comparable; `pnn50`, `totalPower` and `lfPeak` are out
 * because they move together with RMSSD and SDNN and would fill the list with
 * five restatements of one finding. Correlations can still use all of them.
 */
export const WATCH_PRIORITY: TrendMetricId[] = [
  'score', 'badDays', 'rmssd', 'sdnn', 'restingHr', 'sleepDuration',
  'sleepConsistency', 'sleepingHr', 'symptomLoad', 'cleanDays', 'waterIntake',
  'sys', 'dia', 'bmCount',
];

/**
 * Which findings say the same thing.
 *
 * RMSSD, SDNN, pNN50, total power and LF peak are five views of one autonomic
 * measurement, and a factor that moves one moves most of them. Without this,
 * "magnesium is linked to X" would occupy all four visible correlation slots.
 * ../insights keeps only the strongest finding per factor per family.
 */
export const OUTCOME_FAMILY: Record<TrendMetricId, string> = {
  score: 'score',
  badDays: 'score',
  cleanDays: 'protocol',
  rmssd: 'hrv',
  sdnn: 'hrv',
  pnn50: 'hrv',
  totalPower: 'hrv',
  lfPeak: 'hrv',
  restingHr: 'hr',
  sleepingHr: 'hr',
  orthoDelta: 'orthostatic',
  sys: 'bp',
  dia: 'bp',
  sleepDuration: 'sleep',
  sleepConsistency: 'sleep',
  symptomLoad: 'symptoms',
  bmCount: 'digestion',
  waterIntake: 'hydration',
};
