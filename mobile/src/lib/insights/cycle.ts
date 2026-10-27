/**
 * "Your cycle" — what each measurement does across this person's cycle. Pure.
 *
 * A DESCRIPTION, like Best vs hardest weeks, never a test: the luteal side of
 * finished cycles (luteal + premenstrual) against the follicular side
 * (follicular + ovulatory), as the gap between the two medians in the metric's
 * own unit. It says where the numbers sat, never why, and the copy says so.
 *
 * Built only from FINISHED cycles (src/lib/cycle/pattern `phaseProfile`), so a
 * forecast phase never feeds a pattern, and only once `PATTERN_MIN_CYCLES` are
 * in; before that it reports how far it has got, which the card shows as its
 * learning state. A row needs `MIN_SIDE_DAYS` days on each side, so a
 * measurement taken twice a month is left out rather than read off two days.
 *
 * HRV is the day's FIRST BASELINE reading (scoring/baseline), never the trend
 * registry's `rmssd`, which averages training and baseline into one figure —
 * the same reason the pacing envelope and the score avoid it.
 */
import { phaseProfile, PATTERN_MIN_CYCLES, type CycleModel, type CyclePhase, type PhaseStat } from '../cycle';
import { shiftDay } from '../cycle/periods';
import { firstBaselineRmssd } from '../scoring/baseline';
import { TREND_METRICS } from '../trends/metrics';
import type { DaysMap } from '../scoring/day';
import type { ScoreContext } from '../scoring';

export const MIN_SIDE_DAYS = 5;

export type CycleRowId = 'baseline' | 'restingHr' | 'orthoDelta' | 'symptoms' | 'score' | 'sleepingHr' | 'standRise';

export interface CycleRow {
  id: CycleRowId;
  label: string;
  unit: string;
  /** Luteal side minus follicular side, in `unit`. */
  delta: number;
  /** "-9 ms", "+4 bpm". */
  text: string;
  /** Per-phase medians, for the row's sheet. */
  phases: Record<CyclePhase, PhaseStat>;
  luteal: number;
  follicular: number;
}

export type CycleInsight =
  | { kind: 'ready'; cycles: number; rows: CycleRow[] }
  | { kind: 'learning'; have: number; need: number };

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const ROWS: { id: CycleRowId; label: string; unit: string; dp: number }[] = [
  { id: 'baseline', label: 'RMSSD', unit: 'ms', dp: 0 },
  { id: 'restingHr', label: 'Resting HR', unit: 'bpm', dp: 0 },
  { id: 'orthoDelta', label: 'Standing HR rise', unit: 'bpm', dp: 0 },
  { id: 'symptoms', label: 'Symptoms', unit: 'a day', dp: 1 },
  { id: 'score', label: 'Day score', unit: 'pts', dp: 0 },
];

/** One day's value of a cycle measurement. Shared with the Progress chart
 *  that lays the same measurements out by cycle day, so the two agree. */
export function cycleMetricValue(id: CycleRowId, days: DaysMap, ctx: ScoreContext) {
  return (dk: string): number | null => {
    const d = days[dk];
    if (!d) return null;
    switch (id) {
      case 'baseline': return firstBaselineRmssd(d);
      case 'restingHr': return TREND_METRICS.restingHr.value(d, dk, days, ctx);
      case 'orthoDelta': return TREND_METRICS.orthoDelta.value(d, dk, days, ctx);
      // Only days with a record count, so a day nobody opened the app is not a
      // symptom-free day.
      case 'symptoms': return (d.symptoms || []).length;
      case 'score': return TREND_METRICS.score.value(d, dk, days, ctx);
      case 'sleepingHr': return TREND_METRICS.sleepingHr.value(d, dk, days, ctx);
      // A stand test's sustained rise (its peak when no sustained figure was
      // kept), averaged over the day's tests.
      case 'standRise': {
        const xs = (d.readings || []).filter((r) => r.type === 'standTest')
          .map((r) => parseFloat((r.sustainedDelta ?? r.peakDelta) as string)).filter((v) => Number.isFinite(v));
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      }
    }
  };
}

const NOTE_PHASES: CyclePhase[] = ['menstrual', 'luteal', 'premenstrual'];

/**
 * How `dk`'s phase compares with the follicular side for one measurement, from
 * the user's own finished cycles, or null when there is nothing honest to say:
 * no pattern yet, the day's phase unknown or follicular (that side IS the
 * reference), too few days on either side, or no visible difference.
 */
export function phaseContrast(model: CycleModel | null, value: (dk: string) => number | null, dk: string, dp = 0):
  { phase: CyclePhase; delta: number } | null {
  if (!model?.patternReady) return null;
  const ph = model.phaseOn(dk)?.phase;
  if (!ph || !NOTE_PHASES.includes(ph)) return null;
  const prof = phaseProfile(model, value);
  if (prof[ph].n < MIN_SIDE_DAYS || prof.follicular.n + prof.ovulatory.n < MIN_SIDE_DAYS) return null;
  const here = sideMedian(model, value, [ph]);
  const ref = sideMedian(model, value, ['follicular', 'ovulatory']);
  if (here == null || ref == null) return null;
  const delta = here - ref;
  if (Number(Math.abs(delta).toFixed(dp)) === 0) return null;
  return { phase: ph, delta };
}

/** The days a measurement's plain "usual" is taken over, and the readings it
 *  needs before it is stated. */
export const USUAL_DAYS = 30;
export const USUAL_MIN = 5;

export interface PhaseDetail {
  phase: CyclePhase;
  /** This phase's median against the follicular side. */
  delta: number;
  /** This phase's median across finished cycles, and how many fed it. */
  phaseUsual: number;
  cycles: number;
  /** The median over the last `USUAL_DAYS` before the day, when enough exist. */
  usual: number | null;
  /** This reading's own value, and its gap to `usual` and to `phaseUsual`. */
  current: number | null;
  vsUsual: number | null;
  vsPhase: number | null;
}

/**
 * Everything the expandable phase note shows, from the user's own log: the
 * phase's usual against the follicular side (the same gate as `phaseContrast`,
 * so it says nothing it cannot back), the plain 30-day usual, and where this
 * reading sat against both.
 */
export function phaseDetail(model: CycleModel | null, value: (dk: string) => number | null, dk: string, current: number | null, dp = 0): PhaseDetail | null {
  const c = phaseContrast(model, value, dk, dp);
  if (!c || !model) return null;
  const prof = phaseProfile(model, value);
  const phaseUsual = sideMedian(model, value, [c.phase]);
  if (phaseUsual == null) return null;
  const recent: number[] = [];
  for (let i = 1; i <= USUAL_DAYS; i++) {
    const v = value(shiftDay(dk, -i));
    if (v != null && Number.isFinite(v)) recent.push(v);
  }
  const usual = recent.length >= USUAL_MIN ? median(recent) : null;
  const cur = current != null && Number.isFinite(current) ? current : null;
  return {
    phase: c.phase, delta: c.delta, phaseUsual, cycles: prof[c.phase].cycles, usual,
    current: cur,
    vsUsual: cur != null && usual != null ? cur - usual : null,
    vsPhase: cur != null ? cur - phaseUsual : null,
  };
}

export function findCycleInsight(model: CycleModel | null, days: DaysMap, ctx: ScoreContext): CycleInsight | null {
  if (!model || model.mode === 'contraception' || model.mode === 'pregnant') return null;
  if (!model.patternReady) return { kind: 'learning', have: model.completeCycles, need: PATTERN_MIN_CYCLES };

  const valueOf = (id: CycleRowId) => cycleMetricValue(id, days, ctx);

  const rows: CycleRow[] = [];
  for (const r of ROWS) {
    const phases = phaseProfile(model, valueOf(r.id));
    if (phases.luteal.n + phases.premenstrual.n < MIN_SIDE_DAYS
      || phases.follicular.n + phases.ovulatory.n < MIN_SIDE_DAYS) continue;
    // Each side's median is taken over its days afresh, never as a blend of
    // the two phase medians, which would weight a short phase like a long one.
    const lutMed = sideMedian(model, valueOf(r.id), ['luteal', 'premenstrual']);
    const folMed = sideMedian(model, valueOf(r.id), ['follicular', 'ovulatory']);
    if (lutMed == null || folMed == null) continue;
    const delta = lutMed - folMed;
    const shown = Number(delta.toFixed(r.dp));
    rows.push({
      id: r.id, label: r.label, unit: r.unit, delta, phases, luteal: lutMed, follicular: folMed,
      text: `${shown > 0 ? '+' : shown < 0 ? '-' : ''}${Math.abs(shown).toFixed(r.dp)} ${r.unit}`,
    });
  }
  const cycles = model.cycles.filter((c) => c.next && c.plausible).length;
  return { kind: 'ready', cycles, rows };
}

/** The median of every value on one side of finished cycles. */
function sideMedian(model: CycleModel, value: (dk: string) => number | null, phases: CyclePhase[]): number | null {
  const xs: number[] = [];
  const want = new Set(phases);
  for (const c of model.cycles) {
    if (!c.next || !c.plausible) continue;
    for (let dk = c.start; dk < c.next; dk = shiftDay(dk, 1)) {
      const ph = model.phaseOn(dk);
      if (!ph?.phase || ph.predicted || !want.has(ph.phase)) continue;
      const v = value(dk);
      if (v != null && Number.isFinite(v)) xs.push(v);
    }
  }
  return median(xs);
}
