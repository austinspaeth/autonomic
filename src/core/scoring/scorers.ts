// Metric scorer functions ported verbatim from legacy docs/index.html
// (legacy ~lines 3040-3076: the s* scorers, expectedHf, and totalPower).
// Pure TypeScript: no react/react-native/expo or DOM globals.

import { numOr, worstCat } from '@core/scoring/colors';
import type { ScoreCategory, Reading } from '@core/types';

/** Raw field value as passed by the legacy callers. */
type Raw = number | string | null | undefined;

export const sRMSSDu = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 34 ? 'great' : n >= 27 ? 'good' : n >= 22 ? 'ok' : n >= 17 ? 'bad' : 'crash';
};

export const sRMSSDs = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 32 ? 'great' : n >= 27 ? 'good' : n >= 22 ? 'ok' : n >= 17 ? 'bad' : 'crash';
};

export const sPNN50 = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 10 ? 'great' : n >= 7 ? 'good' : n >= 4 ? 'ok' : n >= 2 ? 'bad' : 'crash';
};

export const sSDNN = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 60 ? 'great' : n >= 50 ? 'good' : n >= 40 ? 'ok' : n >= 30 ? 'bad' : 'crash';
};

export const sTotalPower = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 3500 ? 'great' : n >= 2200 ? 'good' : n >= 1500 ? 'ok' : n >= 800 ? 'bad' : 'crash';
};

// lower better
export const sVLF = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n < 200 ? 'great' : n <= 450 ? 'good' : n <= 700 ? 'ok' : n <= 1000 ? 'bad' : 'crash';
};

export const sReadiness = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n >= 86) return 'warning';
  return n >= 70 ? 'great' : n >= 60 ? 'good' : n >= 50 ? 'ok' : n >= 35 ? 'bad' : 'crash';
};

export const sSpo2 = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 98 ? 'great' : n >= 96 ? 'good' : n >= 94 ? 'ok' : n >= 92 ? 'bad' : 'concerning';
};

export const sRestingHr = (v: Raw, pos?: string | null): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  const lying = !pos || /lay/i.test(pos);
  return lying
    ? (n <= 62 ? 'great' : n <= 68 ? 'good' : n <= 75 ? 'ok' : n <= 85 ? 'bad' : 'concerning')
    : (n <= 68 ? 'great' : n <= 78 ? 'good' : n <= 88 ? 'ok' : n <= 98 ? 'bad' : 'concerning');
};

export const sQRS = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n > 130) return 'concerning';
  if (n >= 121) return 'bad';
  if (n >= 111) return 'ok';
  if (n >= 91) return 'good';
  return 'great';
};

export const sPR = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n < 100 || n > 240) return 'concerning';
  if (n < 110 || n >= 221) return 'bad';
  if (n < 120 || n >= 201) return 'ok';
  if (n < 140 || n >= 181) return 'good';
  return 'great';
};

export const sEctopic = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n === 0 ? 'great' : n <= 2 ? 'good' : n <= 5 ? 'ok' : n <= 15 ? 'bad' : 'concerning';
};

export const sCoherence = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 7 ? 'great' : n >= 4 ? 'good' : n >= 2 ? 'ok' : n >= 1 ? 'bad' : 'crash';
};

export const sLfPeak = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n < 0.045) return 'concerning';
  if (n < 0.06) return 'bad';
  if (n < 0.075) return 'ok';
  if (n < 0.09) return 'good';
  if (n <= 0.105) return 'great';
  return 'good';
};

export const sLfHf = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n < 1.5) return 'great';
  if (n <= 3) return 'good';
  if (n <= 5) return 'ok';
  if (n <= 10) return 'bad';
  return 'concerning';
};

export const expectedHf = (style?: string | null): [number, number] | null => {
  const table: Record<string, [number, number]> = {
    '4/4': [0.18, 0.21],
    '4/5': [0.17, 0.2],
    '4/6': [0.15, 0.18],
    '5/5': [0.16, 0.18],
  };
  return (style != null && table[style]) || null;
};

export const sHfPeak = (v: Raw, style?: string | null): ScoreCategory | null => {
  const n = numOr(v);
  const e = expectedHf(style);
  if (n == null || !e) return null;
  if (n >= e[0] && n <= e[1]) return 'great';
  const d = n < e[0] ? e[0] - n : n - e[1];
  return d <= 0.02 ? 'good' : d <= 0.04 ? 'ok' : 'bad';
};

// lower better
export const sHR = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n <= 62 ? 'great' : n <= 68 ? 'good' : n <= 75 ? 'ok' : n <= 85 ? 'bad' : 'concerning';
};

export const sRrMode = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  if (n == null) return null;
  if (n < 720 || n > 1090) return 'concerning';
  if (n >= 950) return 'great';
  if (n >= 870) return 'good';
  if (n >= 790) return 'ok';
  return 'bad';
};

// seconds
export const sMxDMn = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 0.35 ? 'great' : n >= 0.25 ? 'good' : n >= 0.18 ? 'ok' : n >= 0.12 ? 'bad' : 'crash';
};

// lower better
export const sAMo50 = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n < 30 ? 'great' : n < 40 ? 'good' : n < 50 ? 'ok' : n < 60 ? 'bad' : 'concerning';
};

export const sCV = (v: Raw): ScoreCategory | null => {
  const n = numOr(v);
  return n == null ? null : n >= 7 ? 'great' : n >= 5.5 ? 'good' : n >= 4.5 ? 'ok' : n >= 3 ? 'bad' : 'crash';
};

export const sRhythm = (r: Reading): ScoreCategory | null =>
  (r.svt || r.otherArrhythmia) ? 'concerning' : r.sinus ? 'great' : null;

export const sSys = (s: Raw): ScoreCategory | null => {
  const n = numOr(s);
  if (n == null) return null;
  if (n >= 150) return 'concerning';
  if (n >= 136) return 'bad';
  if (n >= 129) return 'ok';
  if (n >= 119) return 'good';
  if (n >= 108) return 'great';
  if (n >= 100) return 'ok';
  return 'bad';
};

export const sDia = (d: Raw): ScoreCategory | null => {
  const n = numOr(d);
  if (n == null) return null;
  if (n >= 95) return 'concerning';
  if (n >= 88) return 'bad';
  if (n >= 83) return 'ok';
  if (n >= 79) return 'good';
  if (n >= 65) return 'great';
  if (n >= 60) return 'ok';
  return 'bad';
};

export const sBP = (sys: Raw, dia: Raw): ScoreCategory | null => {
  const a = sSys(sys);
  const b = sDia(dia);
  return a || b ? worstCat([a, b].filter(Boolean) as ScoreCategory[]) : null;
};

export const totalPower = (r: Reading): number | null => {
  const a = (['vlowPower', 'lowPower', 'highPower'] as const)
    .map((k) => parseFloat(r[k] as string))
    .filter((n) => !isNaN(n));
  return a.length ? a.reduce((x, y) => x + y, 0) : null;
};
