/**
 * Result math for the HAND-ENTERED stand test: the same guided protocol the
 * watch and the strap run (lie down, stand, hold still for ten minutes), with
 * the heart rate typed in at fixed marks instead of streamed.
 *
 * It builds the same `standTest` fields through `buildStandTestFields`, so a
 * hand-entered test grades on the same bands and lands in the same trends. The
 * typed readings become a sparse series: the lying-down figure at the stand
 * moment, each standing figure at its own mark. Two things follow from having
 * a handful of points rather than six hundred, and both are deliberate:
 *  - the SUSTAINED rise is the last standing reading's rise, since "the final
 *    minute of standing" holds exactly one point;
 *  - that series is never stored as `sampledHr`. Five points are not a trace,
 *    and the chart drawn from one would be a picture of a measurement nobody
 *    took. The readings ride on the entry as `standReadings` and the result
 *    card lists them instead.
 * Pure, no store or native imports.
 */
import { buildStandTestFields, type HrPoint } from './live';

/** Minutes after standing at which a reading is asked for. */
export const MANUAL_MARKS_MIN = [1, 3, 5, 10] as const;

export interface ManualStandReading { min: number; hr: number; sys?: number; dia?: number }
export interface Bp { sys: number; dia: number }

/** A typed heart rate, or null when it is empty or not a plausible pulse. */
export function parseHr(text: string): number | null {
  const s = text.trim();
  if (!/^\d{2,3}$/.test(s)) return null;
  const n = +s;
  return n >= 30 && n <= 250 ? n : null;
}

/**
 * A typed blood pressure. Optional, so three answers: `null` when both boxes
 * are empty, the pair when both are plausible, and `'invalid'` for anything in
 * between (one box filled, or a figure that cannot be a pressure) so the form
 * can hold the save rather than quietly drop half an entry.
 */
export function parseBp(sysText: string, diaText: string): Bp | null | 'invalid' {
  const s = sysText.trim(), d = diaText.trim();
  if (!s && !d) return null;
  if (!/^\d{2,3}$/.test(s) || !/^\d{2,3}$/.test(d)) return 'invalid';
  const sys = +s, dia = +d;
  return sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160 && dia < sys ? { sys, dia } : 'invalid';
}

export interface ManualStandInput {
  baselineHr: number;
  baselineBp: Bp | null;
  /** Standing readings in any order; one per mark at most. */
  readings: ManualStandReading[];
  /** Seconds actually spent lying down before the baseline was taken. */
  restSeconds: number;
  age: number | null;
  sex?: string | null;
}

/** The `standTest` entry fields for a hand-entered test, or null when there is
 *  no standing reading (nothing to compare the baseline with, nothing to keep). */
export function buildManualStandFields(input: ManualStandInput): Record<string, unknown> | null {
  const readings = [...input.readings].sort((a, b) => a.min - b.min);
  if (!readings.length) return null;
  const standAt = Math.max(0, Math.round(input.restSeconds));
  const series: HrPoint[] = [
    { t: standAt, bpm: input.baselineHr },
    ...readings.map((r) => ({ t: standAt + r.min * 60, bpm: r.hr })),
  ];
  const lastMark = MANUAL_MARKS_MIN[MANUAL_MARKS_MIN.length - 1];
  const fields = buildStandTestFields({
    series,
    baseline: input.baselineHr,
    standAt,
    endT: series[series.length - 1].t,
    restSeconds: input.restSeconds,
    endedEarly: readings[readings.length - 1].min < lastMark,
    age: input.age,
    sex: input.sex,
  });
  return {
    ...fields,
    standReadings: readings,
    ...(input.baselineBp ? { restSys: input.baselineBp.sys, restDia: input.baselineBp.dia } : {}),
  };
}

/** The readings of a hand-entered test, as rows: lying down first, then each
 *  standing mark. Empty for a test that was streamed (it has a trace instead). */
export function standReadingRows(r: Record<string, unknown>): { label: string; value: string }[] {
  const list = Array.isArray(r.standReadings) ? (r.standReadings as ManualStandReading[]) : [];
  if (!list.length) return [];
  const bp = (sys: unknown, dia: unknown) => (sys != null && dia != null && sys !== '' && dia !== '' ? ` · ${sys}/${dia}` : '');
  const rows: { label: string; value: string }[] = [];
  if (r.baselineHr != null && r.baselineHr !== '') rows.push({ label: 'Lying down', value: `${r.baselineHr} bpm${bp(r.restSys, r.restDia)}` });
  for (const s of list) rows.push({ label: `Standing ${s.min} min`, value: `${s.hr} bpm${bp(s.sys, s.dia)}` });
  return rows;
}
