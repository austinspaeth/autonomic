// Ported verbatim from legacy docs/index.html.
// Sources: GRADE_PTS / SCORE_CATS / scoreCat (~lines 1994-2004);
// SCORE_COLORS / SCORE_RANK / worstCat / numOr (~lines 3027-3037).

import type { ScoreCategory } from '@core/types';

export const GRADE_PTS: Record<ScoreCategory, number> = {
  great: 95,
  good: 80,
  ok: 60,
  warning: 60,
  bad: 35,
  crash: 10,
  concerning: 10,
};

interface ScoreCat {
  min: number;
  label: string;
  short: string;
  color: string;
}

// Final-score bands (high → low). `color` tints the hero + chip.
export const SCORE_CATS: ScoreCat[] = [
  { min: 85, label: 'Excellent Autonomic Day', short: 'Excellent', color: '#16a34a' },
  { min: 70, label: 'Good Autonomic Day', short: 'Good', color: '#22c55e' },
  { min: 55, label: 'Moderate Autonomic Day', short: 'Moderate', color: '#eab308' },
  { min: 40, label: 'Compromised Day', short: 'Compromised', color: '#f97316' },
  { min: 25, label: 'Bad Day', short: 'Bad', color: '#ef4444' },
  { min: 0, label: 'Crash Day', short: 'Crash', color: '#b91c1c' },
];

export const scoreCat = (s: number): ScoreCat =>
  SCORE_CATS.find((c) => s >= c.min) || SCORE_CATS[SCORE_CATS.length - 1];

export const SCORE_COLORS: Record<ScoreCategory, string> = {
  great: '#38bdf8',
  good: '#4ade80',
  ok: '#eab308',
  bad: '#f97316',
  crash: '#ef4444',
  concerning: '#ef4444',
  warning: '#a78bfa',
};

export const SCORE_RANK: Record<string, number> = {
  great: 0,
  good: 1,
  ok: 2,
  warning: 2,
  bad: 3,
  crash: 4,
  concerning: 4,
};

export const worstCat = (
  cats: (ScoreCategory | null | undefined | false)[]
): ScoreCategory | null => {
  let w: ScoreCategory | null = null;
  let wr = -1;
  cats.forEach((c) => {
    const r = c ? SCORE_RANK[c] : undefined;
    if (r != null && r > wr) {
      wr = r;
      w = c as ScoreCategory;
    }
  });
  return w;
};

export const numOr = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};
