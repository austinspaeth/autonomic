// Ported verbatim from legacy docs/index.html (~lines 3214-3283):
// BANDS, restingHrBands, qtcBands, bandsFor, catFromBands.
// Sparklines: per-metric history with grade-zone bands.
// Each band list is {max, cat} ascending; the final max is Infinity.
import type { ScoreCategory } from '@core/types';

export type Band = { max: number; cat: ScoreCategory };
export type Bands = Band[];

export const BANDS: Record<string, Bands> = {
  rmssdU: [{ max: 17, cat: 'crash' }, { max: 22, cat: 'bad' }, { max: 27, cat: 'ok' }, { max: 34, cat: 'good' }, { max: Infinity, cat: 'great' }],
  rmssdS: [{ max: 17, cat: 'crash' }, { max: 22, cat: 'bad' }, { max: 27, cat: 'ok' }, { max: 32, cat: 'good' }, { max: Infinity, cat: 'great' }],
  pnn50: [{ max: 2, cat: 'crash' }, { max: 4, cat: 'bad' }, { max: 7, cat: 'ok' }, { max: 10, cat: 'good' }, { max: Infinity, cat: 'great' }],
  sdnn: [{ max: 30, cat: 'crash' }, { max: 40, cat: 'bad' }, { max: 50, cat: 'ok' }, { max: 60, cat: 'good' }, { max: Infinity, cat: 'great' }],
  totalPower: [{ max: 800, cat: 'crash' }, { max: 1500, cat: 'bad' }, { max: 2200, cat: 'ok' }, { max: 3500, cat: 'good' }, { max: Infinity, cat: 'great' }],
  vlf: [{ max: 200, cat: 'great' }, { max: 450, cat: 'good' }, { max: 700, cat: 'ok' }, { max: 1000, cat: 'bad' }, { max: Infinity, cat: 'crash' }],
  lfPeak: [{ max: 0.045, cat: 'concerning' }, { max: 0.060, cat: 'bad' }, { max: 0.075, cat: 'ok' }, { max: 0.090, cat: 'good' }, { max: 0.105, cat: 'great' }, { max: Infinity, cat: 'good' }],
  lfhf: [{ max: 1.5, cat: 'great' }, { max: 3, cat: 'good' }, { max: 5, cat: 'ok' }, { max: 10, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  coherence: [{ max: 1, cat: 'crash' }, { max: 2, cat: 'bad' }, { max: 4, cat: 'ok' }, { max: 7, cat: 'good' }, { max: Infinity, cat: 'great' }],
  readiness: [{ max: 35, cat: 'crash' }, { max: 50, cat: 'bad' }, { max: 60, cat: 'ok' }, { max: 70, cat: 'good' }, { max: 86, cat: 'great' }, { max: Infinity, cat: 'warning' }],
  spo2: [{ max: 92, cat: 'concerning' }, { max: 94, cat: 'bad' }, { max: 96, cat: 'ok' }, { max: 98, cat: 'good' }, { max: Infinity, cat: 'great' }],
  ectopic: [{ max: 1, cat: 'great' }, { max: 3, cat: 'good' }, { max: 6, cat: 'ok' }, { max: 16, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  qtc: [{ max: 350, cat: 'concerning' }, { max: 380, cat: 'ok' }, { max: 420, cat: 'great' }, { max: 440, cat: 'good' }, { max: 450, cat: 'ok' }, { max: 470, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  qrs: [{ max: 91, cat: 'great' }, { max: 111, cat: 'good' }, { max: 121, cat: 'ok' }, { max: 131, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  pr: [{ max: 100, cat: 'concerning' }, { max: 110, cat: 'bad' }, { max: 120, cat: 'ok' }, { max: 140, cat: 'good' }, { max: 181, cat: 'great' }, { max: 201, cat: 'good' }, { max: 221, cat: 'ok' }, { max: 241, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  sys: [{ max: 100, cat: 'bad' }, { max: 108, cat: 'ok' }, { max: 119, cat: 'great' }, { max: 129, cat: 'good' }, { max: 136, cat: 'ok' }, { max: 150, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  dia: [{ max: 60, cat: 'bad' }, { max: 65, cat: 'ok' }, { max: 79, cat: 'great' }, { max: 83, cat: 'good' }, { max: 88, cat: 'ok' }, { max: 95, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  hrBreath: [{ max: 63, cat: 'great' }, { max: 69, cat: 'good' }, { max: 76, cat: 'ok' }, { max: 86, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  rrMode: [{ max: 720, cat: 'concerning' }, { max: 790, cat: 'bad' }, { max: 870, cat: 'ok' }, { max: 950, cat: 'good' }, { max: 1091, cat: 'great' }, { max: Infinity, cat: 'concerning' }],
  mxdmn: [{ max: 0.12, cat: 'crash' }, { max: 0.18, cat: 'bad' }, { max: 0.25, cat: 'ok' }, { max: 0.35, cat: 'good' }, { max: Infinity, cat: 'great' }],
  amo50: [{ max: 30, cat: 'great' }, { max: 40, cat: 'good' }, { max: 50, cat: 'ok' }, { max: 60, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  cv: [{ max: 3, cat: 'crash' }, { max: 4.5, cat: 'bad' }, { max: 5.5, cat: 'ok' }, { max: 7, cat: 'good' }, { max: Infinity, cat: 'great' }],
  map: [{ max: 65, cat: 'concerning' }, { max: 70, cat: 'bad' }, { max: 75, cat: 'ok' }, { max: 80, cat: 'good' }, { max: 96, cat: 'great' }, { max: 101, cat: 'good' }, { max: 106, cat: 'ok' }, { max: 116, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  pp: [{ max: 20, cat: 'concerning' }, { max: 25, cat: 'bad' }, { max: 30, cat: 'ok' }, { max: 35, cat: 'good' }, { max: 51, cat: 'great' }, { max: 56, cat: 'good' }, { max: 61, cat: 'ok' }, { max: 71, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  kerdo: [{ max: -45, cat: 'concerning' }, { max: -30, cat: 'bad' }, { max: -20, cat: 'ok' }, { max: -10, cat: 'good' }, { max: 11, cat: 'great' }, { max: 21, cat: 'good' }, { max: 31, cat: 'ok' }, { max: 46, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  robinson: [{ max: 71, cat: 'great' }, { max: 81, cat: 'good' }, { max: 91, cat: 'ok' }, { max: 101, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  kvas: [{ max: 14, cat: 'great' }, { max: 17, cat: 'good' }, { max: 21, cat: 'ok' }, { max: 26, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  bce: [{ max: 2601, cat: 'great' }, { max: 3001, cat: 'good' }, { max: 3501, cat: 'ok' }, { max: 4001, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  perfusion: [{ max: 1, cat: 'concerning' }, { max: 2, cat: 'bad' }, { max: 4, cat: 'ok' }, { max: 5, cat: 'good' }, { max: Infinity, cat: 'great' }],
  pns: [{ max: -1.5, cat: 'crash' }, { max: -0.5, cat: 'bad' }, { max: 0.3, cat: 'ok' }, { max: 1.5, cat: 'good' }, { max: Infinity, cat: 'great' }],
  sns: [{ max: -0.5, cat: 'great' }, { max: 0.6, cat: 'good' }, { max: 1.6, cat: 'ok' }, { max: 3.01, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  stressIndex: [{ max: 100, cat: 'great' }, { max: 201, cat: 'good' }, { max: 351, cat: 'ok' }, { max: 601, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  ecgHrv: [{ max: 15, cat: 'crash' }, { max: 25, cat: 'bad' }, { max: 35, cat: 'ok' }, { max: 50, cat: 'good' }, { max: Infinity, cat: 'great' }],
  // Orthostatic HR rise on standing (after − before). 10–20 bpm is a normal
  // physiologic response; a sustained ≥30 bpm (adults) is the POTS threshold
  // and ≥40 bpm (teens 12–19) is markedly abnormal. Lower is better.
  orthoIncrease: [{ max: 15, cat: 'great' }, { max: 25, cat: 'good' }, { max: 30, cat: 'ok' }, { max: 40, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  // Recovery: how far HR fell from its standing peak after 1 min (after −
  // hr1min). As BP rebounds HR should settle; a bigger drop is stronger
  // baroreflex/vagal recovery, while little drop (or a further climb,
  // negative) is an attenuated, dysautonomic response. Higher is better.
  orthoRecovery: [{ max: 0, cat: 'concerning' }, { max: 6, cat: 'bad' }, { max: 12, cat: 'ok' }, { max: 20, cat: 'good' }, { max: Infinity, cat: 'great' }],
};

// Resting-HR zones depend on body position.
export const restingHrBands = (pos?: string): Bands => (!pos || /lay/i.test(pos))
  ? [{ max: 63, cat: 'great' }, { max: 69, cat: 'good' }, { max: 76, cat: 'ok' }, { max: 86, cat: 'bad' }, { max: Infinity, cat: 'concerning' }]
  : [{ max: 69, cat: 'great' }, { max: 79, cat: 'good' }, { max: 89, cat: 'ok' }, { max: 99, cat: 'bad' }, { max: Infinity, cat: 'concerning' }];

// QTc norms run a little longer for females; shift the high-side thresholds.
export const qtcBands = (sex?: string): Bands => sex === 'Female'
  ? BANDS.qtc.map((b) => ({ max: (b.max > 350 && isFinite(b.max)) ? b.max + 10 : b.max, cat: b.cat }))
  : BANDS.qtc;

export function bandsFor(type: string, key: string): Bands | null {
  const map: Record<string, Record<string, string>> = {
    hrv: { readiness: 'readiness', rmssd: 'rmssdU', sdnn: 'sdnn', avgHr: 'hrBreath' },
    breathHrv: { sdnn: 'sdnn', rmssd: 'rmssdS', pnn50: 'pnn50', vlowPower: 'vlf', lfPeak: 'lfPeak', coherence: 'coherence', hr: 'hrBreath', meanRr: 'rrMode', mode: 'rrMode', mxdmn: 'mxdmn', amo50: 'amo50', cv: 'cv' },
    bp: { sys: 'sys', dia: 'dia' },
    bloodO2: { value: 'spo2' },
    ecg: { qtc: 'qtc', qrs: 'qrs', pr: 'pr', ectopic: 'ectopic' },
  };
  const name = map[type] && map[type][key];
  return name ? BANDS[name] : null;
}

export const catFromBands = (v: number, bands?: Bands | null): ScoreCategory | null => {
  if (!bands) return null;
  for (const b of bands) if (v < b.max) return b.cat;
  return bands[bands.length - 1].cat;
};
