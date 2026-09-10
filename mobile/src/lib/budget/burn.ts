/**
 * What today has COST so far, itemised by source.
 *
 * Four things can charge a day and one can refund it. In descending order of
 * how much of it we already had:
 *
 *   1. Logged activities x duration x the per-type weight (./load).
 *   2. Minutes the heart sat above the user's OWN exertion line, priced by how
 *      far above it sat. Not %HRmax — workoutZones.ts is right for the workout
 *      report and wrong here.
 *   3. Upright time, the real limiter in POTS and the axis nobody bills for.
 *   4. A named multiplier from the user's own correlations, capped and only
 *      ever charged when it can be named.
 *   5. Restorative entries, which REFUND (see CREDIT_CAP below).
 *
 * And a floor, not a sum: steps. A day with nothing logged still shows a
 * number, because every phone counts its own steps whether or not the user
 * owns a wearable.
 *
 * Pure: no store, no native, no React. The caller resolves types and passes
 * the exertion line in, so this module never reaches for a baseline.
 */
import type { DayRecord, DayLoad, Entry, TypeDef } from '../types';
import { CREDIT_CAP, entryCost, hrBoostFor, loadOf, type EntryCost } from './load';
import { hm, steps as fmtSteps } from './format';

/** A minute above the exertion line costs a moderate minute. It is real work
 *  by definition: the line is the user's own resting rate plus a margin. */
export const HR_PER_MIN = 1.0;

/**
 * How far above the line each intensity band reaches, in bpm.
 *
 * The bands exist because `DayLoad` cannot hold the curve — the all-day series
 * never enters the journal — and a single "minutes above" total cannot tell an
 * afternoon at line+2 from an afternoon at line+45. Three buckets is enough
 * resolution for a price and few enough to state in a sentence.
 *
 * The EDGES are a storage decision; the PRICE is `hrBoostFor`, so retuning the
 * slope reprices every stored day rather than needing a re-read.
 */
export const HR_BAND_EDGES = [0, 10, 25];

/**
 * The offset each band is charged at: the midpoint of a bounded band, the
 * lower edge of the open one — which already sits past the cap, so the top
 * band is simply the cap and an outlier peak cannot inflate it.
 */
export const HR_BAND_OFFSETS = HR_BAND_EDGES.map((lo, i) => (
  i + 1 < HR_BAND_EDGES.length ? (lo + HR_BAND_EDGES[i + 1]) / 2 : lo
));

/** Which band a heart rate `delta` bpm above the line belongs to. */
export function hrBandOf(delta: number): number {
  let i = 0;
  while (i + 1 < HR_BAND_EDGES.length && delta >= HR_BAND_EDGES[i + 1]) i++;
  return i;
}

/**
 * Effort minutes for a set of band minutes: each band's minutes at its own
 * multiplier. Equal to the flat total when everything sat just over the line,
 * and up to 1.5x when it did not.
 */
export function hrBandEffort(bands: number[] | null | undefined): number | null {
  if (!bands || !bands.length) return null;
  return bands.reduce((sum, min, i) => sum + min * hrBoostFor(HR_BAND_OFFSETS[i] ?? 0), 0);
}

/**
 * Take `minutes` off a band set from the TOP down, and return what is left.
 *
 * Used to net out a logged workout, whose own row already charged those
 * minutes at its own heart rate. Removing them from the cheapest band first
 * would leave the expensive minutes standing and bill the hard part twice —
 * a run is the top of the day, so it comes off the top.
 */
export function hrBandsLess(bands: number[], minutes: number): number[] {
  const out = [...bands];
  let left = minutes;
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(out[i], left);
    out[i] -= take;
    left -= take;
  }
  return out;
}

/**
 * A minute the heart spends BELOW the user's own recovery line, while awake,
 * pays back at the same rate a restorative activity does.
 *
 * This is the symmetric half of the heart-rate row: if minutes above the
 * exertion line are what the day costs, minutes genuinely settled below resting
 * are what it gives back. It is also the only credit the user does not have to
 * remember to log, which for this population matters more than it sounds —
 * lying down is the thing they are least likely to write in a journal.
 */
export const RECOVERY_PER_MIN = -0.2;

/** A minute upright costs a fifth of a moderate minute. Small per minute and
 *  large per day, which is exactly how standing works for this population:
 *  nobody is felled by four minutes in a queue and plenty are felled by four
 *  hours on their feet. */
export const UPRIGHT_PER_MIN = 0.2;

/** Effort minutes per step. 8,000 steps lands near 88, a moderate 90-minute
 *  day, which is the shape a phone-only user should see. */
export const STEP_EFFORT = 0.011;

/** The most a named correlation may multiply a day's cost by. */
export const MULTIPLIER_CAP = 1.25;

/** Gaps in the heart-rate series longer than this are UNCOVERED, not rest.
 *  A watch on the charger must never read as a restful afternoon. */
export const HR_GAP_MIN = 5;

/** Minutes of series a day needs before its heart-rate row is trusted at all. */
export const HR_MIN_COVERAGE = 120;
/** ...and before it is called full coverage rather than partial. */
export const HR_FULL_COVERAGE = 600;

/** Some step providers write one record spanning the whole day. Charging that
 *  as 24 hours of walking would be absurd, so a single span is capped. */
export const MAX_SPAN_MIN = 60;

export type SpendSource = 'hr' | 'upright' | 'activities' | 'steps' | 'multiplier' | 'credits';

export interface SpendMember {
  entryId: string;
  label: string;
  minutes: number;
  effortMin: number;
  credit: boolean;
  assumed: boolean;
}

export interface SpendRow {
  source: SpendSource;
  label: string;
  detail: string;
  /** Positive for a cost, negative for a credit. */
  effortMin: number;
  /** 0..1 against the largest row, for the row's own share bar. */
  share: number;
  members?: SpendMember[];
}

export type BurnCoverage = 'full' | 'partial' | 'logged-only' | 'none';

export interface Burn {
  /** What the day has cost, after credits, floored at zero. */
  effortMin: number;
  rows: SpendRow[];
  coverage: BurnCoverage;
  /** Minutes the credits gave back, after the cap. */
  creditedMin: number;
}

export interface Span {
  startMin: number;
  endMin: number;
}

/* ------------------------------------------------------------------ *
 * Series helpers. Both are fed raw by the shell and their outputs are
 * what gets stored, so the all-day heart-rate series never reaches the
 * journal.
 * ------------------------------------------------------------------ */

export interface HrAboveResult {
  aboveMin: number;
  /** Minutes per HR_BAND_EDGES band. Sums to `aboveMin` up to rounding. */
  bands: number[];
  coverageMin: number;
  stretches: number;
  longest: Span | null;
  peak: number | null;
}

/**
 * Minutes the heart spent above `lineBpm`, integrated over the gaps between
 * samples so an irregular sampling rate does not change the answer.
 *
 * A gap longer than HR_GAP_MIN contributes nothing to coverage OR to the
 * count. That asymmetry is the point: we would rather under-report a day than
 * invent one, and the sheet states its coverage so a thin day looks thin.
 */
export function hrMinutesAbove(
  series: { t: number; bpm: number }[] | null | undefined,
  lineBpm: number | null,
): HrAboveResult | null {
  if (!series || !series.length || lineBpm == null) return null;
  const pts = series
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  let aboveMin = 0;
  const bands = HR_BAND_EDGES.map(() => 0);
  let coverageMin = 0;
  let stretches = 0;
  let peak = 0;
  let runStart: number | null = null;
  let longest: Span | null = null;

  const closeRun = (endSec: number) => {
    if (runStart == null) return;
    const span = { startMin: Math.round(runStart / 60), endMin: Math.round(endSec / 60) };
    if (!longest || span.endMin - span.startMin > longest.endMin - longest.startMin) longest = span;
    runStart = null;
  };

  for (let i = 0; i < pts.length; i++) {
    peak = Math.max(peak, pts[i].bpm);
    if (i === 0) continue;
    const gapMin = (pts[i].t - pts[i - 1].t) / 60;
    if (gapMin <= 0) continue;
    if (gapMin > HR_GAP_MIN) {
      // Uncovered. Close any open run at the last sample we actually saw.
      closeRun(pts[i - 1].t);
      continue;
    }
    coverageMin += gapMin;
    // The interval is charged when its own two samples average above the line,
    // which is the same rule the drill-in's trace colours each segment by.
    const mid = (pts[i - 1].bpm + pts[i].bpm) / 2;
    if (mid > lineBpm) {
      aboveMin += gapMin;
      bands[hrBandOf(mid - lineBpm)] += gapMin;
      if (runStart == null) {
        runStart = pts[i - 1].t;
        stretches++;
      }
    } else {
      closeRun(pts[i - 1].t);
    }
  }
  closeRun(pts[pts.length - 1].t);

  return {
    aboveMin: Math.round(aboveMin),
    bands: bands.map((m) => Math.round(m)),
    coverageMin: Math.round(coverageMin),
    stretches,
    longest,
    peak: peak > 0 ? Math.round(peak) : null,
  };
}

/**
 * Minutes the heart spent settled BELOW `lineBpm`, excluding the windows the
 * caller says do not count.
 *
 * Sleep is the window that matters: eight hours of the lowest heart rate of the
 * day would otherwise pay back more than any real day could spend, and sleeping
 * is not the same claim as resting through an afternoon. Same gap rule as
 * `hrMinutesAbove` — an unsampled hour is unknown, not restful.
 */
export function hrMinutesBelow(
  series: { t: number; bpm: number }[] | null | undefined,
  lineBpm: number | null,
  exclude: Span[],
): number | null {
  if (!series || !series.length || lineBpm == null) return null;
  const pts = series
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const out = (m: number) => exclude.some((e) => m >= e.startMin && m < e.endMin);

  let below = 0;
  for (let i = 1; i < pts.length; i++) {
    const gapMin = (pts[i].t - pts[i - 1].t) / 60;
    if (gapMin <= 0 || gapMin > HR_GAP_MIN) continue;
    const midMin = (pts[i - 1].t + pts[i].t) / 120;
    if (out(midMin)) continue;
    if ((pts[i - 1].bpm + pts[i].bpm) / 2 < lineBpm) below += gapMin;
  }
  return Math.round(below);
}

/**
 * Minutes holding any steps, from the sample timestamps.
 *
 * Overlaps are MERGED, not summed. On an iPhone with a paired watch the health
 * store holds both devices' step records for the same minutes, and adding them
 * would report two hours of walking for one hour of it.
 */
export function walkingMinutes(spans: Span[] | null | undefined): number | null {
  if (!spans || !spans.length) return null;
  const clean = spans
    .filter((s) => Number.isFinite(s.startMin) && Number.isFinite(s.endMin) && s.endMin > s.startMin)
    .map((s) => ({ startMin: s.startMin, endMin: Math.min(s.endMin, s.startMin + MAX_SPAN_MIN) }))
    .sort((a, b) => a.startMin - b.startMin);
  if (!clean.length) return null;

  let total = 0;
  let cur = { ...clean[0] };
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].startMin <= cur.endMin) {
      cur.endMin = Math.max(cur.endMin, clean[i].endMin);
    } else {
      total += cur.endMin - cur.startMin;
      cur = { ...clean[i] };
    }
  }
  total += cur.endMin - cur.startMin;
  return Math.round(total);
}

/* ------------------------------------------------------------------ *
 * The spend itself.
 * ------------------------------------------------------------------ */

/** A correlation the sweep confirmed, reduced to what the budget needs. */
export interface BudgetMultiplier {
  /** "Short sleep multiplier" */
  label: string;
  /** "Your log runs 1.2x costlier under 7h" */
  detail: string;
  factor: number;
}

export interface BurnInput {
  day: DayRecord | undefined;
  types: Record<string, TypeDef>;
  lineBpm: number | null;
  multiplier?: BudgetMultiplier | null;
  /** A finished day. Only the COPY changes: a row that says "so far" about
   *  last Tuesday is describing a day that is still running. */
  past?: boolean;
}

interface Parts {
  activities: number;
  activityMembers: SpendMember[];
  /** Minutes of logged activity that already carried HR above the line. */
  hrCoveredMin: number;
  /** Minutes of logged walking or running, which upright must not re-charge. */
  walkedMin: number;
  credits: number;
  creditMembers: SpendMember[];
}

function activityParts(day: DayRecord | undefined, types: Record<string, TypeDef>, lineBpm: number | null): Parts {
  const out: Parts = { activities: 0, activityMembers: [], hrCoveredMin: 0, walkedMin: 0, credits: 0, creditMembers: [] };
  const acts = day?.activities || [];
  acts.forEach((a: Entry) => {
    const def = types[a.type];
    const c: EntryCost = entryCost(a, def, lineBpm);
    const label = def?.label || a.type;
    const m: SpendMember = {
      entryId: String(a.id || ''),
      label,
      minutes: Math.round(c.minutes),
      effortMin: c.effortMin,
      credit: c.credit,
      assumed: c.assumed,
    };
    if (c.credit) {
      out.credits += Math.abs(c.effortMin);
      out.creditMembers.push(m);
      return;
    }
    out.activities += c.effortMin;
    out.activityMembers.push(m);
    if (c.hrBoost > 1) out.hrCoveredMin += c.minutes;
    if (a.type === 'walk' || a.type === 'run' || a.type === 'hike') out.walkedMin += c.minutes;
  });
  return out;
}

/** The upright minutes and where they came from, best source first. */
export function uprightMinutes(load: DayLoad | undefined | null): { min: number; source: 'stand' | 'walk+still' | 'walk' } | null {
  if (!load) return null;
  if (load.standMin != null) return { min: load.standMin, source: 'stand' };
  if (load.walkingMin != null && load.stillUprightMin != null) {
    return { min: load.walkingMin + load.stillUprightMin, source: 'walk+still' };
  }
  if (load.walkingMin != null) return { min: load.walkingMin, source: 'walk' };
  return null;
}

/**
 * The day's total spend in effort minutes, with nothing itemised.
 *
 * This is what the personal baseline medians over 42 days, so it must be
 * cheap and must not need an envelope — which is why the credit cap here is a
 * share of the day's own GROSS spend rather than of the budget. That is also
 * the more defensible rule: lying down gives back a quarter of what the day
 * cost, and it can never manufacture room on a day that cost nothing. Rest is
 * not a currency you can bank.
 */
export function daySpend(input: BurnInput): number {
  return buildBurn(input).effortMin;
}

/**
 * One day's spend, memoized.
 *
 * The ceiling walks 42 days, the accuracy strip walks 42 days and recomputes a
 * ceiling for each of them, and the correction walks 28 more. Without a shared
 * cache that is ~1,800 passes over the same handful of days on the Journal's
 * own render path. Same argument as `makeScoreLookup` in ./outcome, and the
 * two are always created together.
 */
export type SpendLookup = (dk: string) => number;

export function makeSpendLookup(
  days: Record<string, DayRecord | undefined>,
  types: Record<string, TypeDef>,
  lineBpm: number | null,
): SpendLookup {
  const cache = new Map<string, number>();
  return (dk: string) => {
    const hit = cache.get(dk);
    if (hit != null) return hit;
    const d = days[dk];
    const v = d ? daySpend({ day: d, types, lineBpm }) : 0;
    cache.set(dk, v);
    return v;
  };
}

export function buildBurn(input: BurnInput): Burn {
  const { day, types, lineBpm, multiplier, past } = input;
  const load = day?.load;
  const parts = activityParts(day, types, lineBpm);
  const rows: SpendRow[] = [];

  /* --- heart rate above the line --- */
  let hrEffort = 0;
  const hrTrusted = load?.hrAboveMin != null && (load.hrCoverageMin || 0) >= HR_MIN_COVERAGE;
  if (hrTrusted && load) {
    // Minutes a logged workout already paid for are not charged twice.
    const bands = load.hrBands && load.hrBands.length ? hrBandsLess(load.hrBands, parts.hrCoveredMin) : null;
    const net = bands
      ? bands.reduce((a, b) => a + b, 0)
      : Math.max(0, (load.hrAboveMin || 0) - parts.hrCoveredMin);
    // Graded when the day carries bands, flat when it does not. A day stored
    // before bands existed reads as UNKNOWN intensity, which is charged at the
    // line's own rate rather than guessed upward.
    hrEffort = (bands ? (hrBandEffort(bands) ?? net) : net) * HR_PER_MIN;
    if (net >= 1) {
      const stretches = load.hrStretches || 0;
      // The arithmetic has to stay checkable: once minutes and effort minutes
      // can differ, the row says how much of the time was the expensive kind.
      const hardMin = bands ? bands.slice(1).reduce((a, b) => a + b, 0) : 0;
      const base = stretches > 1 ? `In ${stretches} stretches` : 'In one stretch';
      rows.push({
        source: 'hr',
        // The threshold IS the title. "Minutes above your line" made the
        // reader open the row to find out what the line was.
        label: load.lineBpm != null ? `Minutes HR above ${Math.round(load.lineBpm)} bpm` : 'Minutes above your line',
        detail: hardMin >= 5 ? `${base}, ${hm(hardMin)} well above` : base,
        effortMin: hrEffort,
        share: 0,
      });
    }
  }

  /* --- upright time --- */
  let uprightEffort = 0;
  const up = uprightMinutes(load);
  if (up && up.min > 0) {
    // Logged walks are already charged as activities.
    const net = Math.max(0, up.min - parts.walkedMin);
    const detail =
      up.source === 'stand' ? `${hm(net)} standing or walking`
        : up.source === 'walk+still' ? `${hm(net)} walking or standing, estimated`
          : `${hm(net)} walking`;
    uprightEffort = net * UPRIGHT_PER_MIN;
    if (uprightEffort >= 1) {
      rows.push({ source: 'upright', label: 'Upright time', detail, effortMin: uprightEffort, share: 0 });
    }
  }

  /* --- logged activities --- */
  if (parts.activities >= 1) {
    const names = parts.activityMembers.slice(0, 3).map((m) => m.label);
    const extra = parts.activityMembers.length - names.length;
    rows.push({
      source: 'activities',
      label: 'Logged activities',
      detail: names.join(', ') + (extra > 0 ? ` and ${extra} more` : ''),
      effortMin: parts.activities,
      share: 0,
      members: parts.activityMembers,
    });
  }

  /* --- the step floor. A floor, never a sum. --- */
  let gross = hrEffort + uprightEffort + parts.activities;
  if (load?.steps != null) {
    const floor = load.steps * STEP_EFFORT;
    if (floor > gross) {
      const diff = floor - gross;
      rows.push({
        source: 'steps',
        label: 'Steps',
        detail: gross < 1
          ? (past ? `${fmtSteps(load.steps)}, nothing else logged` : `${fmtSteps(load.steps)} so far, nothing else logged yet`)
          : (past
            ? `${fmtSteps(load.steps)}, more than the rest accounts for`
            : `${fmtSteps(load.steps)} so far, more than the rest accounts for`),
        effortMin: diff,
        share: 0,
      });
      gross = floor;
    }
  }

  /* --- a named multiplier from the user's own correlations --- */
  if (multiplier && gross > 0) {
    const f = Math.min(MULTIPLIER_CAP, Math.max(1, multiplier.factor));
    const delta = gross * (f - 1);
    if (delta >= 1) {
      rows.push({ source: 'multiplier', label: multiplier.label, detail: multiplier.detail, effortMin: delta, share: 0 });
      gross += delta;
    }
  }

  /* --- recovery, which REFUNDS --- */
  // Two sources, one row: what the user logged as rest, and the minutes their
  // heart spent settled below their own recovery line while awake.
  const settledMin = hrTrusted && load?.hrBelowMin != null ? load.hrBelowMin : 0;
  const settledEffort = settledMin * Math.abs(RECOVERY_PER_MIN);
  const rawCredit = parts.credits + settledEffort;
  const credited = Math.min(rawCredit, gross * CREDIT_CAP);
  if (credited >= 1) {
    const names = parts.creditMembers.map((m) => `${m.label} ${hm(m.minutes)}`);
    // "resting", not "settled": the reader is being told where minutes came
    // back, and "7m settled" reads as a state of the data rather than as
    // something their body did.
    if (settledMin >= 1) names.push(`${hm(settledMin)} resting`);
    rows.push({
      source: 'credits',
      label: 'Recovery time',
      detail: names.slice(0, 3).join(', '),
      effortMin: -credited,
      share: 0,
      members: parts.creditMembers,
    });
  }

  // Costs first, largest first; the credit row is always last so the reader
  // ends on the good news.
  const costs = rows.filter((r) => r.effortMin > 0).sort((a, b) => b.effortMin - a.effortMin);
  const creditRows = rows.filter((r) => r.effortMin < 0);
  const biggest = costs.length ? costs[0].effortMin : 1;
  const ordered = [...costs, ...creditRows].map((r) => ({ ...r, share: Math.min(1, Math.abs(r.effortMin) / biggest) }));

  const coverage: BurnCoverage =
    hrTrusted && (load?.hrCoverageMin || 0) >= HR_FULL_COVERAGE ? 'full'
      : hrTrusted ? 'partial'
        : (day?.activities?.length || load?.steps != null) ? 'logged-only'
          : 'none';

  return {
    effortMin: Math.max(0, gross - credited),
    rows: ordered,
    coverage,
    creditedMin: credited,
  };
}

/** Type-resolution helper shared with the drill-in: the weight one entry was
 *  charged at, for a sheet that wants to explain a single row. */
export function weightOf(entry: Entry, types: Record<string, TypeDef>) {
  return loadOf(types[entry.type], entry.type);
}
