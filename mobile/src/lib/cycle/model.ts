/**
 * The cycle model: what phase a day was (or is) in, how sure that is, and when
 * the next period is expected. Pure — a days map, the temperatures, the mode
 * and today in; a model out. Build it once per journal change and ask it
 * questions (`phaseOn`), the way the insights cache is used.
 *
 * THE PHASES, and the one physiological fact everything rests on: the luteal
 * phase (ovulation → next period) is close to a constant ~14 days, while the
 * follicular phase is what varies. So the reliable way to place ovulation is
 * to count BACK from the next period, which is only possible once that period
 * has arrived. Hence the bases, best first:
 *
 *   logged        — a period day. Known.
 *   temperature   — ovulation from the overnight shift (./temperature).
 *   retrospective — a finished cycle: ovulation = next start - LUTEAL_DAYS.
 *   calendar      — the cycle in progress, counted back from the PREDICTED
 *                   next period. The only basis that is a forecast, and it is
 *                   marked `predicted` so nothing presents it as measured.
 *
 * THE MODES are promises the user made in setup, and each limits what may be
 * claimed (`CycleMode` in ../types):
 *   regular       — everything above.
 *   irregular /
 *   perimenopause — finished cycles get retrospective phases (counting back
 *                   is valid whatever the length); the cycle in progress gets
 *                   only its period days and a temperature-confirmed luteal
 *                   phase. No prediction: a forecast of an irregular cycle is
 *                   a guess with a date on it.
 *   contraception — hormonal contraception suppresses ovulation, so there are
 *                   no natural phases. Bleeding days are still bleeding days.
 *   pregnant      — nothing. Heart rate and HRV change for nine months for a
 *                   reason that is not a cycle.
 *
 * And an unknown day is null. Before the first logged period, past the end of
 * a prediction, or inside an implausible cycle (a logging gap), `phaseOn`
 * answers null rather than a best guess, because every consumer of this model
 * — the downturn card, the personal baselines, the Insights sweep — would turn
 * a guess into a claim about somebody's body.
 */
import type { BodyTempMap, CycleMode, DayRecord } from '../types';
import {
  cycleStats, dayDiff, findCycles, findPeriods, shiftDay,
  type Cycle, type CycleStats, type Period,
} from './periods';
import { detectOvulation, type TempSource } from './temperature';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'premenstrual';
export type PhaseBasis = 'logged' | 'temperature' | 'retrospective' | 'calendar';

/** The luteal phase, ovulation → the day before the next period. */
export const LUTEAL_DAYS = 14;
/** The last days before a period, split out of luteal because that is where
 *  the symptoms, the heart-rate rise and the HRV dip concentrate. */
export const PREMENSTRUAL_DAYS = 5;
/** Ovulation day ± this many days reads as ovulatory. */
export const OVULATORY_HALF_WIDTH = 1;
/** Finished cycles needed before the next period is forecast. */
export const MIN_CYCLES_TO_PREDICT = 2;
/** Finished cycles needed before a PATTERN is claimed — the Insights card, the
 *  downturn's "in line with your last cycles", the phase-matched baselines. */
export const PATTERN_MIN_CYCLES = 3;
/** A spread wider than this (shortest to longest, recent cycles) is too wide
 *  to forecast honestly, whatever mode was chosen. */
export const MAX_PREDICT_SPREAD = 14;
/** Days either side of a forecast counted from the typical length entered. */
export const TYPICAL_HALF_WIDTH = 3;
/** The range the typical-length stepper offers. */
export const TYPICAL_MIN = 21;
export const TYPICAL_MAX = 45;
/** A temperature-confirmed luteal phase in an irregular cycle is held for at
 *  most this long without a period to close it. */
const OPEN_LUTEAL_MAX = 17;

export interface PhaseInfo {
  /** Cycle day, 1 = first day of the period. */
  day: number;
  phase: CyclePhase | null;
  basis: PhaseBasis | null;
  /** The phase rests on a forecast (the cycle in progress, calendar basis). */
  predicted: boolean;
  /** Day 1 of the cycle this day sits in. */
  cycleStart: string;
}

export interface Prediction {
  /** Most likely first day. */
  start: string;
  /** Counted from logged cycles, or from the typical length the user entered
   *  (only until two cycles are logged). */
  basis: 'history' | 'typical';
  /** The range, inclusive. */
  early: string;
  late: string;
  /** The cycle length it was counted from. */
  cycleLength: number;
}

export interface CycleModel {
  mode: CycleMode;
  today: string;
  periods: Period[];
  cycles: Cycle[];
  stats: CycleStats;
  /** Finished, plausible cycles in the whole history. */
  completeCycles: number;
  /** Null outside `regular` mode, below `MIN_CYCLES_TO_PREDICT`, or when the
   *  recent cycles spread too wide. */
  prediction: Prediction | null;
  /** Days past the latest expected start with no period logged. */
  lateBy: number;
  /** Ovulation per cycle start, where one could be placed. */
  ovulation: Record<string, { dk: string; basis: PhaseBasis; source?: TempSource }>;
  /** Enough finished cycles for a per-phase pattern. */
  patternReady: boolean;
  phaseOn(dk: string): PhaseInfo | null;
}

export function buildCycleModel(opts: {
  days: Record<string, Pick<DayRecord, 'cycle'> | undefined>;
  temps?: BodyTempMap;
  mode: CycleMode;
  today: string;
  /** settings.cycle.typicalLength: a starting point for the forecast. */
  typicalLength?: number;
}): CycleModel {
  const { days, temps, mode, today, typicalLength } = opts;
  const periods = findPeriods(days).filter((p) => p.start <= today);
  const cycles = findCycles(periods);
  const stats = cycleStats(cycles);
  const completeCycles = cycles.filter((c) => c.length != null && c.plausible).length;

  const prediction = predict(mode, cycles, stats, typicalLength);
  const lateBy = prediction && today > prediction.late ? dayDiff(prediction.late, today) : 0;

  // Ovulation per cycle, best basis first.
  const ovulation: CycleModel['ovulation'] = {};
  for (const c of cycles) {
    if (mode === 'contraception' || mode === 'pregnant') break;
    if (!c.plausible) continue;
    const lastDay = c.next ? shiftDay(c.next, -1) : today;
    const temp = detectOvulation(temps, c.start, lastDay);
    if (temp) { ovulation[c.start] = { dk: temp.dk, basis: 'temperature', source: temp.source }; continue; }
    if (c.next) { ovulation[c.start] = { dk: shiftDay(c.next, -LUTEAL_DAYS), basis: 'retrospective' }; continue; }
    if (prediction) ovulation[c.start] = { dk: shiftDay(prediction.start, -LUTEAL_DAYS), basis: 'calendar' };
  }

  const cache = new Map<string, PhaseInfo | null>();
  const starts = cycles.map((c) => c.start);

  const phaseOn = (dk: string): PhaseInfo | null => {
    if (cache.has(dk)) return cache.get(dk)!;
    const v = resolve(dk);
    cache.set(dk, v);
    return v;
  };

  function resolve(dk: string): PhaseInfo | null {
    if (mode === 'pregnant' || dk > today) return null;
    // The cycle containing dk: the last start at or before it.
    let lo = 0, hi = starts.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= dk) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (idx < 0) return null;
    const c = cycles[idx];
    const day = dayDiff(c.start, dk) + 1;
    const base = { day, cycleStart: c.start };
    if (dk <= c.period.end) return { ...base, phase: 'menstrual', basis: 'logged', predicted: false };
    if (mode === 'contraception' || !c.plausible) return { ...base, phase: null, basis: null, predicted: false };

    const ov = ovulation[c.start];
    const open = !c.next;
    // The cycle in progress outside regular mode: only a temperature shift
    // speaks, and only for the luteal side of it.
    if (open && mode !== 'regular') {
      if (ov?.basis === 'temperature' && dk > shiftDay(ov.dk, OVULATORY_HALF_WIDTH) && dayDiff(ov.dk, dk) <= OPEN_LUTEAL_MAX) {
        return { ...base, phase: 'luteal', basis: 'temperature', predicted: false };
      }
      if (ov?.basis === 'temperature' && Math.abs(dayDiff(ov.dk, dk)) <= OVULATORY_HALF_WIDTH) {
        return { ...base, phase: 'ovulatory', basis: 'temperature', predicted: false };
      }
      return { ...base, phase: null, basis: null, predicted: false };
    }
    if (!ov) return { ...base, phase: null, basis: null, predicted: false };

    // Where this cycle ends: the real next start, or the forecast.
    const end = c.next ?? prediction?.start ?? null;
    const predicted = open;
    if (open && prediction && dk > prediction.late) return { ...base, phase: null, basis: null, predicted: true };

    const fromOv = dayDiff(ov.dk, dk);
    const basis: PhaseBasis = ov.basis;
    if (Math.abs(fromOv) <= OVULATORY_HALF_WIDTH) return { ...base, phase: 'ovulatory', basis, predicted };
    if (fromOv < 0) return { ...base, phase: 'follicular', basis, predicted };
    if (end && dayDiff(dk, end) <= PREMENSTRUAL_DAYS) return { ...base, phase: 'premenstrual', basis: c.next ? basis : 'calendar', predicted };
    return { ...base, phase: 'luteal', basis, predicted };
  }

  return {
    mode, today, periods, cycles, stats, completeCycles, prediction, lateBy, ovulation,
    patternReady: completeCycles >= PATTERN_MIN_CYCLES && mode !== 'contraception' && mode !== 'pregnant',
    phaseOn,
  };
}

function predict(mode: CycleMode, cycles: Cycle[], stats: CycleStats, typicalLength?: number): Prediction | null {
  if (mode !== 'regular') return null;
  const last = cycles[cycles.length - 1];
  if (!last || last.next) return null;
  // Too few logged cycles: the length the user entered stands in, with a
  // wider range than a fitted one, until two real cycles take over. Never a
  // pattern — `patternReady` counts logged cycles only.
  if (stats.n < MIN_CYCLES_TO_PREDICT) {
    if (!typicalLength) return null;
    const start = shiftDay(last.start, typicalLength);
    return { start, early: shiftDay(start, -TYPICAL_HALF_WIDTH), late: shiftDay(start, TYPICAL_HALF_WIDTH), cycleLength: typicalLength, basis: 'typical' };
  }
  if (stats.medianLength == null) return null;
  const spread = (stats.maxLength ?? 0) - (stats.minLength ?? 0);
  if (spread > MAX_PREDICT_SPREAD) return null;
  const len = Math.round(stats.medianLength);
  const half = Math.max(2, Math.ceil(spread / 2));
  const start = shiftDay(last.start, len);
  return { start, early: shiftDay(start, -half), late: shiftDay(start, half), cycleLength: len, basis: 'history' };
}

/** Days until the expected start (negative once it has passed). */
export function daysUntil(model: CycleModel): number | null {
  return model.prediction ? dayDiff(model.today, model.prediction.start) : null;
}

/** Plain-word phase names, for the UI and the reports. */
export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulatory: 'Ovulation',
  luteal: 'Luteal',
  premenstrual: 'Premenstrual',
};
