/**
 * Result math for the in-app (phone + Bluetooth strap) POTS captures — a
 * direct port of the watch companion's controllers so a test run on the phone
 * produces the exact same reading fields as one run on the wrist:
 *   targets/watch/StandTestController.swift  → buildStandTestFields
 *   targets/watch/OrthostaticController.swift → (baseline/mean helpers)
 * Pure functions, no store or native imports — unit-tested directly.
 */

/** One 1 Hz heart-rate sample: `t` seconds since the test began. Matches the
 *  waveform sidecar's `sampledHr` shape, so the series stores as-is. */
export interface HrPoint { t: number; bpm: number }

export const meanBpm = (pts: HrPoint[]): number | null =>
  pts.length ? pts.reduce((a, s) => a + s.bpm, 0) / pts.length : null;

/** Supine baseline = mean HR over the last `windowSec` of rest, or whatever
 *  rest data exists when the user skipped ahead of the window. */
export function restingBaseline(series: HrPoint[], endT: number, windowSec = 120): number | null {
  const window = series.filter((s) => s.t > endT - windowSec);
  return meanBpm(window.length ? window : series);
}

/** Tanaka (208 − 0.7×age); Gulati (206 − 0.88×age) for female profiles. */
export function computedMaxHr(age: number | null, sex?: string | null): number | null {
  if (age == null || age <= 0) return null;
  if (sex && sex.toLowerCase().startsWith('f')) return 206 - 0.88 * age;
  return 208 - 0.7 * age;
}

/** Adolescents (12–19) use the ≥40 bpm POTS-range criterion; adults ≥30. */
export const potsThresholdFor = (age: number | null): number =>
  age != null && age >= 12 && age <= 19 ? 40 : 30;

export interface StandTestInput {
  series: HrPoint[];
  baseline: number | null;
  /** Test-elapsed second the user stood (null = the test never got there). */
  standAt: number | null;
  /** Test-elapsed second the test ended. */
  endT: number;
  /** Seconds of rest-stage samples actually captured (baseline stability). */
  restSeconds: number;
  endedEarly: boolean;
  age: number | null;
  sex?: string | null;
}

/**
 * The `standTest` reading fields (shared contract, schema v1): supine
 * baseline, standing peak + peak Δ, sustained Δ (mean over the final minute
 * of standing), threshold verdict, and the quality flags.
 */
export function buildStandTestFields(input: StandTestInput): Record<string, number | boolean> {
  const { series, baseline, endT, restSeconds, endedEarly, age, sex } = input;
  const standMark = input.standAt ?? endT;
  const standing = series.filter((s) => s.t > standMark);

  const lastMinute = standing.filter((s) => s.t > endT - 60);
  let sustained: number | null = null;
  if (baseline != null && lastMinute.length) {
    sustained = lastMinute.reduce((a, s) => a + (s.bpm - baseline), 0) / lastMinute.length;
  }

  const out: Record<string, number | boolean> = {
    metThreshold: (sustained ?? 0) >= potsThresholdFor(age),
    standAt: standMark,
  };
  if (baseline != null) out.baselineHr = Math.round(baseline);
  if (standing.length) {
    const peak = Math.max(baseline ?? 0, ...standing.map((s) => s.bpm));
    out.peakHr = Math.round(peak);
    if (baseline != null) out.peakDelta = Math.round(peak - baseline);
  }
  if (sustained != null) out.sustainedDelta = Math.round(sustained);
  if (series.length) out.maxHrReached = Math.round(Math.max(...series.map((s) => s.bpm)));
  const maxHr = computedMaxHr(age, sex);
  if (maxHr != null) out.maxHrComputed = Math.round(maxHr);
  if (endedEarly) out.endedEarly = true;
  if (restSeconds < 120) out.baselineUnstable = true;
  return out;
}
