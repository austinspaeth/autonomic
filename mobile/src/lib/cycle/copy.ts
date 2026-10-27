/**
 * The cycle feature's words, in one place and pure so the rules about what may
 * be SAID are tested: a forecast is never presented as a measurement, a mode
 * that claims no phases never names one, and nothing here diagnoses.
 */
import type { CycleFlow, CycleMode } from '../types';
import { PHASE_LABEL, type CycleModel } from './model';
import { CYCLE_SYMPTOMS } from '../registry';

export const MODE_LABEL: Record<CycleMode, string> = {
  regular: 'Regular periods',
  irregular: 'Irregular or PCOS',
  contraception: 'Hormonal contraception',
  perimenopause: 'Perimenopause',
  pregnant: 'Pregnant',
};

/** What each mode will do, said before it is chosen. */
export const MODE_SUB: Record<CycleMode, string> = {
  regular: 'Predicts your next period and reads by phase',
  irregular: 'Counts days since your period, no predictions',
  contraception: 'Logs bleeding days only, no phase estimates',
  perimenopause: 'Tracks bleeding and symptoms as cycles change',
  pregnant: 'Pauses phase adjustments',
};

export const MODES: CycleMode[] = ['regular', 'irregular', 'contraception', 'perimenopause', 'pregnant'];

export const FLOW_LABEL: Record<CycleFlow, string> = {
  spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy',
};
export const FLOWS: CycleFlow[] = ['spotting', 'light', 'medium', 'heavy'];

/** "Medium flow", "Spotting". */
export const flowRowLabel = (f: CycleFlow) => (f === 'spotting' ? 'Spotting' : `${FLOW_LABEL[f]} flow`);

/**
 * The chip beside the Journal's date, or null for no chip. Regular and
 * perimenopause name a phase when one is known; irregular counts days; with
 * hormonal contraception there are no phases, so the chip appears only on a
 * bleeding day; pregnancy shows nothing.
 */
export function chipLabel(model: CycleModel | null, dk: string): string | null {
  if (!model || model.mode === 'pregnant') return null;
  const ph = model.phaseOn(dk);
  if (!ph) return null;
  if (model.mode === 'contraception') return ph.phase === 'menstrual' ? `Bleeding day ${ph.day}` : null;
  if (ph.phase) return `Day ${ph.day} · ${PHASE_LABEL[ph.phase]}`;
  return `Day ${ph.day} since period`;
}

/** "Oct 29" from a day key, without a time zone in the way. */
export function shortDay(dk: string): string {
  const [y, m, d] = dk.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The history sheet's status line under the chip. */
export function forecastLine(model: CycleModel): string {
  if (model.mode === 'irregular' || model.mode === 'perimenopause') return MODE_LABEL[model.mode];
  if (model.mode === 'contraception') return 'Bleeding days only';
  if (model.mode === 'pregnant') return 'Paused while pregnant';
  if (model.lateBy > 0) return `Period is ${model.lateBy} day${model.lateBy === 1 ? '' : 's'} later than predicted`;
  if (model.prediction) {
    const range = `Next period predicted ${shortDay(model.prediction.early)} to ${shortDay(model.prediction.late)}`;
    return model.prediction.basis === 'typical' ? `${range}, from your typical length` : range;
  }
  const n = Math.min(model.completeCycles, 3);
  return `Learning · ${n} of 3 cycles`;
}

/** Logging the day through the entry card answers the question too: a flow
 *  is a yes, and cycle symptoms with no flow are a "not yet" for today. */
export function answeredToday(days: Record<string, { cycle?: unknown; symptoms?: { type: string }[] } | undefined>, dk: string): boolean {
  const d = days[dk];
  if (!d) return false;
  if (d.cycle) return true;
  return (d.symptoms || []).some((e) => (CYCLE_SYMPTOMS as readonly string[]).includes(e.type));
}

/**
 * "Period started?" — asked only on TODAY, inside the predicted range, with
 * nothing logged today, and before any period has been logged since the range
 * opened. Once somebody answers Yes, that day is a period start: the cycle
 * rolls over, the forecast moves a cycle on, and the question is gone. Returns
 * the subtext, or null for no question.
 */
export function periodPromptLine(model: CycleModel | null, days: Record<string, { cycle?: unknown; symptoms?: { type: string }[] } | undefined>, dk: string): string | null {
  if (!model?.prediction || dk !== model.today) return null;
  const pr = model.prediction;
  if (dk < pr.early || answeredToday(days, dk)) return null;
  const last = model.periods[model.periods.length - 1];
  if (last && last.end >= pr.early) return null;
  return model.lateBy > 0 ? `Predicted ${model.lateBy} day${model.lateBy === 1 ? '' : 's'} ago` : 'Predicted for around today';
}
