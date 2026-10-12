/**
 * Best weeks against the hardest ones: what did each kind of week look like?
 *
 * A DESCRIPTION, and deliberately not a test. Everything else in this module asks
 * "is X linked to Y" and corrects for having asked six hundred times; this asks
 * the plainer question a person asks of their own summer — "what was different
 * about the weeks I felt well" — and answers it with the weeks themselves, dated,
 * so the reader can see WHEN they were. That is the honest form of it: on a
 * journal with a long arc the best weeks are neighbours and so are the hardest,
 * and everything that changed between the two stretches shows up here together.
 * Nothing on the card says why, and the copy must never imply it.
 *
 * The rules:
 *
 * - WEEKS ARE BLOCKS OF SEVEN COUNTED BACK FROM THE LAST COMPLETE DAY, so the
 *   newest block is a whole week and no block is a partial one. A block needs
 *   `MIN_WEEK_DAYS` scored days to be ranked at all.
 * - MEDIANS, like everything in ../trends: one crash day does not make a hard week.
 * - THE TWO SETS HAVE TO BE DIFFERENT. Under `MIN_GAP` points between them the
 *   weeks were much alike, and a table of near-identical columns is noise.
 * - A ROW HAS TO BE WORTH READING: enough known days on BOTH sides, and a gap past
 *   the metric's own `minDelta` (the registry's "worth telling someone about").
 * - UNKNOWN IS NOT ZERO. A factor column is null before its category was ever
 *   logged (./matrix), so a supplement is never "not taken" in weeks that predate
 *   the supplements log.
 *
 * Pure: reads the matrix the sweep already built.
 */
import { hm } from '../budget/format';
import { TREND_METRICS, type TrendMetricId } from '../trends';
import type { DayMatrix } from './matrix';

export const WEEK_DAYS = 7;
/** Scored days a block needs before it can be called a good or a hard week. */
export const MIN_WEEK_DAYS = 4;
/** Ranked weeks needed before picking any: two a side with something between. */
export const MIN_WEEKS = 6;
/** From here on there is room for three a side. */
export const WEEKS_FOR_THREE = 9;
/** Points of daily score between the two sets, or they are not two kinds of week. */
export const MIN_GAP = 8;
/** Known days a row needs on each side. */
export const MIN_ROW_DAYS = 5;
/** Days a week of difference before a habit row is shown. */
export const MIN_RATE_GAP = 1;
/** Entries a week of difference before the symptoms row is shown. */
export const MIN_SYMPTOM_GAP = 2;
/** Share of known days that counts as "was taking it" / "was not". */
export const TAKING_ON = 0.6;
export const TAKING_OFF = 0.2;
export const MAX_ACTIVITY_ROWS = 2;

export type WeekSideKey = 'best' | 'worst';

export interface WeekBlock {
  startKey: string;
  endKey: string;
  /** Median daily score, or null when the block had too few scored days. */
  score: number | null;
  side: WeekSideKey | null;
}

export interface WeekRow {
  id: string;
  group: 'body' | 'habits';
  label: string;
  best: string;
  worst: string;
  /** Shared by both columns, drawn once beside the label. */
  unit: string;
}

export interface WeeksReport {
  /** Every block in the window, oldest first, for the strip. */
  weeks: WeekBlock[];
  best: { score: number; count: number };
  worst: { score: number; count: number };
  rows: WeekRow[];
  /** Things taken through one set of weeks and hardly at all in the other. */
  taking: { best: string[]; worst: string[]; medication: boolean };
}

const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const known = (col: (number | null)[] | undefined, idx: number[]): number[] => {
  const out: number[] = [];
  if (!col) return out;
  idx.forEach((i) => { const v = col[i]; if (v != null) out.push(v); });
  return out;
};
const round1 = (v: number) => Math.round(v * 10) / 10;
const perWeek = (v: number) => String(round1(v)).replace(/\.0$/, '');

const BODY: TrendMetricId[] = ['rmssd', 'restingHr', 'sleepingHr'];
const BODY_LABEL: Partial<Record<TrendMetricId, string>> = { rmssd: 'HRV (RMSSD)', restingHr: 'Resting HR', sleepingHr: 'Sleeping HR' };

/** Binary factors read as days a week, in the order the card lists them. */
const RATES: { id: string; label: string }[] = [
  { id: 'activity:any', label: 'Any activity' },
  { id: 'trigger:any', label: 'Any trigger' },
  { id: 'bm:loose', label: 'Loose stool' },
  { id: 'protocol:clean', label: 'Clean protocol' },
];
const ACTIVITY_ROLLUPS = new Set(['activity:any', 'activity:hard', 'activity:minutes']);

export function findWeeks(matrix: DayMatrix): WeeksReport | null {
  const score = matrix.outcomes.score;
  const total = matrix.keys.length;
  if (!score) return null;

  // Blocks, newest first, then flipped so the strip reads left to right.
  const blocks: { from: number; to: number; score: number | null }[] = [];
  for (let end = total; end - WEEK_DAYS >= 0; end -= WEEK_DAYS) {
    const from = end - WEEK_DAYS;
    const vals: number[] = [];
    for (let i = from; i < end; i++) { const v = score[i]; if (v != null) vals.push(v); }
    blocks.push({ from, to: end, score: vals.length >= MIN_WEEK_DAYS ? median(vals) : null });
  }
  blocks.reverse();
  // Drop the empty run before the journal began; gaps inside it stay, as gaps.
  const first = blocks.findIndex((b) => b.score != null);
  if (first < 0) return null;
  const used = blocks.slice(first);

  const ranked = used.map((b, i) => ({ b, i })).filter((x) => x.b.score != null)
    .sort((a, z) => (z.b.score as number) - (a.b.score as number) || z.i - a.i);
  if (ranked.length < MIN_WEEKS) return null;
  const n = ranked.length >= WEEKS_FOR_THREE ? 3 : 2;
  const bestSet = new Set(ranked.slice(0, n).map((x) => x.i));
  const worstSet = new Set(ranked.slice(-n).map((x) => x.i));

  const daysOf = (set: Set<number>): number[] => {
    const out: number[] = [];
    used.forEach((b, i) => { if (set.has(i)) for (let d = b.from; d < b.to; d++) out.push(d); });
    return out;
  };
  const bestDays = daysOf(bestSet), worstDays = daysOf(worstSet);
  const bestScore = median(known(score, bestDays)), worstScore = median(known(score, worstDays));
  if (bestScore - worstScore < MIN_GAP) return null;

  const rows: WeekRow[] = [];

  // What the body read: registry metrics, each held to its own minDelta.
  const metricRow = (id: TrendMetricId, group: WeekRow['group'], label: string, fmt?: (v: number) => string, unit?: string) => {
    const def = TREND_METRICS[id];
    const a = known(matrix.outcomes[id], bestDays), b = known(matrix.outcomes[id], worstDays);
    if (a.length < MIN_ROW_DAYS || b.length < MIN_ROW_DAYS) return;
    const ma = median(a), mb = median(b);
    const gap = Math.abs(ma - mb);
    const bar = def.deltaKind === 'relative' ? def.minDelta * Math.max(Math.abs(ma), Math.abs(mb)) : def.minDelta;
    if (gap < bar) return;
    const f = fmt || def.fmt;
    if (f(ma) === f(mb)) return;
    rows.push({ id, group, label, best: f(ma), worst: f(mb), unit: unit ?? def.unit });
  };
  BODY.forEach((id) => metricRow(id, 'body', BODY_LABEL[id] as string));

  // What the weeks held.
  metricRow('sleepDuration', 'habits', 'Sleep a night', (h) => hm(h * 60), '');

  const rate = (col: (number | null)[] | undefined, idx: number[]): number | null => {
    const v = known(col, idx);
    return v.length >= MIN_ROW_DAYS ? (v.filter((x) => x > 0).length / v.length) * WEEK_DAYS : null;
  };
  const rateRow = (id: string, label: string): number => {
    const a = rate(matrix.factors[id], bestDays), b = rate(matrix.factors[id], worstDays);
    if (a == null || b == null || Math.abs(a - b) < MIN_RATE_GAP) return 0;
    rows.push({ id, group: 'habits', label, best: perWeek(a), worst: perWeek(b), unit: 'days a week' });
    return Math.abs(a - b);
  };
  rateRow(RATES[0].id, RATES[0].label);

  // The named activities that differ most, so "active days" has a face.
  matrix.defs
    .filter((f) => f.kind === 'binary' && f.id.startsWith('activity:') && !ACTIVITY_ROLLUPS.has(f.id))
    .map((f) => {
      const a = rate(matrix.factors[f.id], bestDays), b = rate(matrix.factors[f.id], worstDays);
      return { f, a, b, gap: a == null || b == null ? 0 : Math.abs(a - b) };
    })
    .filter((x) => x.gap >= MIN_RATE_GAP)
    .sort((x, y) => y.gap - x.gap)
    .slice(0, MAX_ACTIVITY_ROWS)
    .forEach((x) => rows.push({ id: x.f.id, group: 'habits', label: x.f.driver, best: perWeek(x.a as number), worst: perWeek(x.b as number), unit: 'days a week' }));

  // Symptoms are a count, so a week's worth is the mean day times seven.
  const sa = known(matrix.outcomes.symptomLoad, bestDays), sb = known(matrix.outcomes.symptomLoad, worstDays);
  if (sa.length >= MIN_ROW_DAYS && sb.length >= MIN_ROW_DAYS) {
    const wa = (sa.reduce((x, y) => x + y, 0) / sa.length) * WEEK_DAYS;
    const wb = (sb.reduce((x, y) => x + y, 0) / sb.length) * WEEK_DAYS;
    if (Math.abs(wa - wb) >= MIN_SYMPTOM_GAP) rows.push({ id: 'symptomLoad', group: 'habits', label: 'Symptoms logged', best: String(Math.round(wa)), worst: String(Math.round(wb)), unit: 'a week' });
  }
  RATES.slice(1).forEach((r) => rateRow(r.id, r.label));
  metricRow('waterIntake', 'habits', 'Water a day');

  // What was being taken: through one set of weeks, hardly at all in the other.
  const taking = { best: [] as string[], worst: [] as string[], medication: false };
  matrix.defs.forEach((f) => {
    if (f.kind !== 'binary' || !f.id.startsWith('med:')) return;
    const a = known(matrix.factors[f.id], bestDays), b = known(matrix.factors[f.id], worstDays);
    if (a.length < MIN_ROW_DAYS || b.length < MIN_ROW_DAYS) return;
    const sa2 = a.filter((x) => x > 0).length / a.length, sb2 = b.filter((x) => x > 0).length / b.length;
    const side = sa2 >= TAKING_ON && sb2 <= TAKING_OFF ? 'best' : sb2 >= TAKING_ON && sa2 <= TAKING_OFF ? 'worst' : null;
    if (!side) return;
    taking[side].push(f.driver);
    if (f.group === 'medication') taking.medication = true;
  });

  if (!rows.length && !taking.best.length && !taking.worst.length) return null;

  return {
    weeks: used.map((b, i) => ({
      startKey: matrix.keys[b.from], endKey: matrix.keys[b.to - 1], score: b.score,
      side: bestSet.has(i) ? 'best' : worstSet.has(i) ? 'worst' : null,
    })),
    best: { score: bestScore, count: n },
    worst: { score: worstScore, count: n },
    rows,
    taking,
  };
}
