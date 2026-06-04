// Ported verbatim from legacy docs/index.html ~lines 3081-3094 (BMI grading).
// DECOUPLED: legacy bmiFor(weightLbs) read state.profile.height; height is now
// an explicit parameter.
import type { ScoreCategory } from '@core/types';

// BMI from a logged weight (lbs) + the profile height (inches). Returns
// null when either is missing or invalid.
export function bmiFor(
  weightLbs: number | string | null | undefined,
  heightInches: number | string | null | undefined,
): number | null {
  const w = weightLbs == null || weightLbs === '' ? null : +weightLbs;
  const h = heightInches != null && heightInches !== '' ? +heightInches : null;
  if (w == null || isNaN(w) || !h || isNaN(h) || h <= 0) return null;
  return (703 * w) / (h * h);
}

// Standard adult BMI zones (sex-independent) → a grade category for tinting.
export const BMI_ZONES: { max: number; zone: string; cat: ScoreCategory }[] = [
  { max: 18.5, zone: 'Underweight', cat: 'warning' },
  { max: 25, zone: 'Healthy', cat: 'great' },
  { max: 30, zone: 'Overweight', cat: 'ok' },
  { max: Infinity, zone: 'Obese', cat: 'bad' },
];

export function bmiZone(bmi: number): { max: number; zone: string; cat: ScoreCategory } {
  return BMI_ZONES.find((z) => bmi < z.max) || BMI_ZONES[BMI_ZONES.length - 1];
}
