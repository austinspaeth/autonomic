/**
 * Scoring engine — ported VERBATIM from the web app (docs/index.html).
 * Thresholds are the product; do not "fix" or round them. If a threshold
 * looks wrong, it still must match the web app (see README).
 *
 * Pure module: no UI or store imports. Anything needing profile data
 * (height for BMI, sex for QTc) takes it as an argument.
 */
import type { Band, Entry, ScoreCat } from '../types';

export const SCORE_COLORS: Record<ScoreCat, string> = {
  great: '#38bdf8',
  good: '#4ade80',
  ok: '#eab308',
  bad: '#f97316',
  crash: '#ef4444',
  concerning: '#ef4444',
  warning: '#a78bfa',
};

export const SCORE_RANK: Record<ScoreCat, number> = {
  great: 0, good: 1, ok: 2, warning: 2, bad: 3, crash: 4, concerning: 4,
};

export const GRADE_LABEL: Record<ScoreCat, string> = {
  great: 'Great', good: 'Good', ok: 'OK', bad: 'Bad', crash: 'Crash', concerning: 'Concerning', warning: 'Warning',
};

/** Grade -> 0-100 points (day composite). */
export const GRADE_PTS: Record<ScoreCat, number> = {
  great: 95, good: 80, ok: 60, warning: 60, bad: 35, crash: 10, concerning: 10,
};

/** Grade -> points for the per-reading autonomic composite. */
export const CAT_POINTS: Record<ScoreCat, number> = {
  great: 90, good: 75, ok: 55, bad: 38, crash: 18, concerning: 18, warning: 72,
};

export const worstCat = (cats: (ScoreCat | null | undefined)[]): ScoreCat | null => {
  let w: ScoreCat | null = null;
  let wr = -1;
  cats.forEach((c) => {
    if (!c) return;
    const r = SCORE_RANK[c];
    if (r != null && r > wr) { wr = r; w = c; }
  });
  return w;
};

export const numOr = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

/* ---------- per-metric graders (s*) ---------- */
// higher-is-better metrics (terminal category = crash)
export const sRMSSDu = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 34 ? 'great' : n >= 27 ? 'good' : n >= 22 ? 'ok' : n >= 17 ? 'bad' : 'crash'; };
export const sRMSSDs = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 32 ? 'great' : n >= 27 ? 'good' : n >= 22 ? 'ok' : n >= 17 ? 'bad' : 'crash'; };
export const sPNN50 = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 10 ? 'great' : n >= 7 ? 'good' : n >= 4 ? 'ok' : n >= 2 ? 'bad' : 'crash'; };
export const sSDNN = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 60 ? 'great' : n >= 50 ? 'good' : n >= 40 ? 'ok' : n >= 30 ? 'bad' : 'crash'; };
export const sTotalPower = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 3500 ? 'great' : n >= 2200 ? 'good' : n >= 1500 ? 'ok' : n >= 800 ? 'bad' : 'crash'; };
export const sVLF = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n < 200 ? 'great' : n <= 450 ? 'good' : n <= 700 ? 'ok' : n <= 1000 ? 'bad' : 'crash'; }; // lower better
export const sReadiness = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n >= 86) return 'warning'; return n >= 70 ? 'great' : n >= 60 ? 'good' : n >= 50 ? 'ok' : n >= 35 ? 'bad' : 'crash'; };
export const sRestingHr = (v: unknown, pos?: unknown): ScoreCat | null => {
  const n = numOr(v);
  if (n == null) return null;
  const lying = !pos || /lay/i.test(String(pos));
  return lying
    ? (n <= 62 ? 'great' : n <= 68 ? 'good' : n <= 75 ? 'ok' : n <= 85 ? 'bad' : 'concerning')
    : (n <= 68 ? 'great' : n <= 78 ? 'good' : n <= 88 ? 'ok' : n <= 98 ? 'bad' : 'concerning');
};
export const sQRS = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n > 130) return 'concerning'; if (n >= 121) return 'bad'; if (n >= 111) return 'ok'; if (n >= 91) return 'good'; return 'great'; };
export const sPR = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n < 100 || n > 240) return 'concerning'; if (n < 110 || n >= 221) return 'bad'; if (n < 120 || n >= 201) return 'ok'; if (n < 140 || n >= 181) return 'good'; return 'great'; };
export const sEctopic = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n === 0 ? 'great' : n <= 2 ? 'good' : n <= 5 ? 'ok' : n <= 15 ? 'bad' : 'concerning'; };
export const sLfPeak = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n < 0.045) return 'concerning'; if (n < 0.060) return 'bad'; if (n < 0.075) return 'ok'; if (n < 0.090) return 'good'; if (n <= 0.105) return 'great'; return 'good'; };
export const sLfHf = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n < 1.5) return 'great'; if (n <= 3) return 'good'; if (n <= 5) return 'ok'; if (n <= 10) return 'bad'; return 'concerning'; };
export const expectedHf = (style?: unknown): [number, number] | null =>
  (({ '4/4': [0.18, 0.21], '4/5': [0.17, 0.2], '4/6': [0.15, 0.18], '5/5': [0.16, 0.18] } as Record<string, [number, number]>)[String(style)] || null);
export const sHfPeak = (v: unknown, style?: unknown): ScoreCat | null => {
  const n = numOr(v);
  const e = expectedHf(style);
  if (n == null || !e) return null;
  if (n >= e[0] && n <= e[1]) return 'great';
  const d = n < e[0] ? e[0] - n : n - e[1];
  return d <= 0.02 ? 'good' : d <= 0.04 ? 'ok' : 'bad';
};
export const sHR = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n <= 62 ? 'great' : n <= 68 ? 'good' : n <= 75 ? 'ok' : n <= 85 ? 'bad' : 'concerning'; }; // lower better
export const sRrMode = (v: unknown): ScoreCat | null => { const n = numOr(v); if (n == null) return null; if (n < 720 || n > 1090) return 'concerning'; if (n >= 950) return 'great'; if (n >= 870) return 'good'; if (n >= 790) return 'ok'; return 'bad'; };
export const sMxDMn = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 0.35 ? 'great' : n >= 0.25 ? 'good' : n >= 0.18 ? 'ok' : n >= 0.12 ? 'bad' : 'crash'; }; // seconds
export const sAMo50 = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n < 30 ? 'great' : n < 40 ? 'good' : n < 50 ? 'ok' : n < 60 ? 'bad' : 'concerning'; }; // lower better
export const sCV = (v: unknown): ScoreCat | null => { const n = numOr(v); return n == null ? null : n >= 7 ? 'great' : n >= 5.5 ? 'good' : n >= 4.5 ? 'ok' : n >= 3 ? 'bad' : 'crash'; };
export const sRhythm = (r: Entry): ScoreCat | null => ((r.svt || r.otherArrhythmia) ? 'concerning' : r.sinus ? 'great' : null);
export const sSys = (s: unknown): ScoreCat | null => { const n = numOr(s); if (n == null) return null; if (n >= 150) return 'concerning'; if (n >= 136) return 'bad'; if (n >= 129) return 'ok'; if (n >= 119) return 'good'; if (n >= 108) return 'great'; if (n >= 100) return 'ok'; return 'bad'; };
export const sDia = (d: unknown): ScoreCat | null => { const n = numOr(d); if (n == null) return null; if (n >= 95) return 'concerning'; if (n >= 88) return 'bad'; if (n >= 83) return 'ok'; if (n >= 79) return 'good'; if (n >= 65) return 'great'; if (n >= 60) return 'ok'; return 'bad'; };
export const sBP = (sys: unknown, dia: unknown): ScoreCat | null => {
  const a = sSys(sys), b = sDia(dia);
  return a || b ? worstCat([a, b].filter(Boolean) as ScoreCat[]) : null;
};

export const totalPower = (r: Entry): number | null => {
  const a = ['vlowPower', 'lowPower', 'highPower'].map((k) => parseFloat(r[k] as string)).filter((n) => !isNaN(n));
  return a.length ? a.reduce((x, y) => x + y, 0) : null;
};

/* ---------- BANDS registry (sparkline grade zones) ---------- */
export const BANDS: Record<string, Band[]> = {
  rmssdU: [{ max: 17, cat: 'crash' }, { max: 22, cat: 'bad' }, { max: 27, cat: 'ok' }, { max: 34, cat: 'good' }, { max: Infinity, cat: 'great' }],
  rmssdS: [{ max: 17, cat: 'crash' }, { max: 22, cat: 'bad' }, { max: 27, cat: 'ok' }, { max: 32, cat: 'good' }, { max: Infinity, cat: 'great' }],
  pnn50: [{ max: 2, cat: 'crash' }, { max: 4, cat: 'bad' }, { max: 7, cat: 'ok' }, { max: 10, cat: 'good' }, { max: Infinity, cat: 'great' }],
  sdnn: [{ max: 30, cat: 'crash' }, { max: 40, cat: 'bad' }, { max: 50, cat: 'ok' }, { max: 60, cat: 'good' }, { max: Infinity, cat: 'great' }],
  totalPower: [{ max: 800, cat: 'crash' }, { max: 1500, cat: 'bad' }, { max: 2200, cat: 'ok' }, { max: 3500, cat: 'good' }, { max: Infinity, cat: 'great' }],
  vlf: [{ max: 200, cat: 'great' }, { max: 450, cat: 'good' }, { max: 700, cat: 'ok' }, { max: 1000, cat: 'bad' }, { max: Infinity, cat: 'crash' }],
  lfPeak: [{ max: 0.045, cat: 'concerning' }, { max: 0.060, cat: 'bad' }, { max: 0.075, cat: 'ok' }, { max: 0.090, cat: 'good' }, { max: 0.105, cat: 'great' }, { max: Infinity, cat: 'good' }],
  // Respiratory (HF) peak: a peak inside the HF band (0.15–0.40 Hz) reflects
  // normal respiratory sinus arrhythmia; ~0.20–0.30 Hz (12–18 breaths/min) is
  // the relaxed-breathing sweet spot. Used to give HF peak grade zones even for
  // unstructured readings, where there's no target pace to compare against.
  hfPeak: [{ max: 0.12, cat: 'bad' }, { max: 0.15, cat: 'ok' }, { max: 0.20, cat: 'good' }, { max: 0.32, cat: 'great' }, { max: 0.40, cat: 'good' }, { max: Infinity, cat: 'ok' }],
  lfhf: [{ max: 1.5, cat: 'great' }, { max: 3, cat: 'good' }, { max: 5, cat: 'ok' }, { max: 10, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  readiness: [{ max: 35, cat: 'crash' }, { max: 50, cat: 'bad' }, { max: 60, cat: 'ok' }, { max: 70, cat: 'good' }, { max: 86, cat: 'great' }, { max: Infinity, cat: 'warning' }],
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
  pns: [{ max: -1.5, cat: 'crash' }, { max: -0.5, cat: 'bad' }, { max: 0.3, cat: 'ok' }, { max: 1.5, cat: 'good' }, { max: Infinity, cat: 'great' }],
  sns: [{ max: -0.5, cat: 'great' }, { max: 0.6, cat: 'good' }, { max: 1.6, cat: 'ok' }, { max: 3.01, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  stressIndex: [{ max: 100, cat: 'great' }, { max: 201, cat: 'good' }, { max: 351, cat: 'ok' }, { max: 601, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  ecgHrv: [{ max: 15, cat: 'crash' }, { max: 25, cat: 'bad' }, { max: 35, cat: 'ok' }, { max: 50, cat: 'good' }, { max: Infinity, cat: 'great' }],
  orthoIncrease: [{ max: 15, cat: 'great' }, { max: 25, cat: 'good' }, { max: 30, cat: 'ok' }, { max: 40, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  orthoRecovery: [{ max: 0, cat: 'concerning' }, { max: 6, cat: 'bad' }, { max: 12, cat: 'ok' }, { max: 20, cat: 'good' }, { max: Infinity, cat: 'great' }],
};

/** Resting-HR zones depend on body position. */
export const restingHrBands = (pos?: unknown): Band[] =>
  (!pos || /lay/i.test(String(pos)))
    ? [{ max: 63, cat: 'great' }, { max: 69, cat: 'good' }, { max: 76, cat: 'ok' }, { max: 86, cat: 'bad' }, { max: Infinity, cat: 'concerning' }]
    : [{ max: 69, cat: 'great' }, { max: 79, cat: 'good' }, { max: 89, cat: 'ok' }, { max: 99, cat: 'bad' }, { max: Infinity, cat: 'concerning' }];

/** QTc norms run a little longer for females; shift the high-side thresholds. */
export const qtcBands = (sex?: string): Band[] =>
  sex === 'Female'
    ? BANDS.qtc.map((b) => ({ max: b.max > 350 && isFinite(b.max) ? b.max + 10 : b.max, cat: b.cat }))
    : BANDS.qtc;

export function bandsFor(type: string, key: string): Band[] | null {
  const map: Record<string, Record<string, string>> = {
    hrv: { rmssd: 'rmssdU', sdnn: 'sdnn', avgHr: 'hrBreath', pnn50: 'pnn50', vlowPower: 'vlf', lfPeak: 'lfPeak', hfPeak: 'hfPeak', meanRr: 'rrMode', mode: 'rrMode', mxdmn: 'mxdmn', amo50: 'amo50', cv: 'cv', pns: 'pns', sns: 'sns', stressIndex: 'stressIndex' },
    breathHrv: { sdnn: 'sdnn', rmssd: 'rmssdS', pnn50: 'pnn50', vlowPower: 'vlf', lfPeak: 'lfPeak', hfPeak: 'hfPeak', hr: 'hrBreath', meanRr: 'rrMode', mode: 'rrMode', mxdmn: 'mxdmn', amo50: 'amo50', cv: 'cv', pns: 'pns', sns: 'sns', stressIndex: 'stressIndex' },
    bp: { sys: 'sys', dia: 'dia' },
    ecg: { qtc: 'qtc', qrs: 'qrs', pr: 'pr', ectopic: 'ectopic' },
  };
  const name = map[type] && map[type][key];
  return name ? BANDS[name] : null;
}

export const catFromBands = (v: number, bands?: Band[] | null): ScoreCat | null => {
  if (!bands) return null;
  for (const b of bands) if (v < b.max) return b.cat;
  return bands[bands.length - 1].cat;
};

/* ---------- computeScores ---------- */
export interface ScoreContext {
  sex?: string;
  height?: string | number;
}

export function computeScores(r: Entry, ctx: ScoreContext = {}): Record<string, ScoreCat> {
  const s: Record<string, ScoreCat> = {};
  const put = (k: string, c: ScoreCat | null) => { if (c) s[k] = c; };
  switch (r.type) {
    case 'hrv': {
      put('rmssd', sRMSSDu(r.rmssd));
      put('sdnn', sSDNN(r.sdnn));
      put('avgHr', sHR(r.avgHr));
      put('pnn50', sPNN50(r.pnn50));
      put('totalPower', sTotalPower(totalPower(r)));
      put('vlf', sVLF(r.vlowPower));
      put('lfPeak', sLfPeak(r.lfPeak));
      { const h = numOr(r.hfPeak); if (h != null) put('hfPeak', catFromBands(h, BANDS.hfPeak)); }
      put('meanRr', sRrMode(r.meanRr));
      put('mode', sRrMode(r.mode));
      put('mxdmn', sMxDMn(r.mxdmn));
      put('amo50', sAMo50(r.amo50));
      put('cv', sCV(r.cv));
      const band = (k: string, b: Band[]) => { const v = numOr(r[k]); if (v != null) put(k, catFromBands(v, b)); };
      band('pns', BANDS.pns); band('sns', BANDS.sns); band('stressIndex', BANDS.stressIndex);
      const lf = parseFloat(r.lowPower as string), hf = parseFloat(r.highPower as string);
      if (!isNaN(lf) && !isNaN(hf) && hf !== 0) put('lfhf', catFromBands(lf / hf, BANDS.lfhf));
      put('overall', worstCat([s.rmssd, s.pnn50, s.totalPower].filter(Boolean)));
      break;
    }
    case 'breathHrv': {
      put('sdnn', sSDNN(r.sdnn));
      put('rmssd', sRMSSDs(r.rmssd));
      put('pnn50', sPNN50(r.pnn50));
      put('totalPower', sTotalPower(totalPower(r)));
      put('vlf', sVLF(r.vlowPower));
      put('lfPeak', sLfPeak(r.lfPeak));
      put('hfPeak', sHfPeak(r.hfPeak, r.style));
      const lf = parseFloat(r.lowPower as string), hf = parseFloat(r.highPower as string);
      if (!isNaN(lf) && !isNaN(hf) && hf !== 0) put('lfhf', sLfHf(lf / hf));
      put('hr', sHR(r.hr));
      put('meanRr', sRrMode(r.meanRr));
      put('mode', sRrMode(r.mode));
      put('mxdmn', sMxDMn(r.mxdmn));
      put('amo50', sAMo50(r.amo50));
      put('cv', sCV(r.cv));
      // Autonomic-balance indices are captured/computed for both HRV kinds now.
      const band = (k: string, b: Band[]) => { const v = numOr(r[k]); if (v != null) put(k, catFromBands(v, b)); };
      band('pns', BANDS.pns); band('sns', BANDS.sns); band('stressIndex', BANDS.stressIndex);
      put('overall', worstCat([s.rmssd, s.pnn50, s.totalPower].filter(Boolean)));
      break;
    }
    case 'bp':
      put('sys', sSys(r.sys)); put('dia', sDia(r.dia)); put('bp', sBP(r.sys, r.dia));
      break;
    case 'restingHr':
      put('hr', sRestingHr(r.hr, r.position));
      break;
    case 'ecg': {
      const q = numOr(r.qtc);
      if (q != null) put('qtc', catFromBands(q, qtcBands(ctx.sex)));
      put('qrs', sQRS(r.qrs));
      put('pr', sPR(r.pr));
      put('ectopic', sEctopic(r.ectopic));
      put('rhythm', sRhythm(r));
      const h = numOr(r.hrv);
      if (h != null) put('hrv', catFromBands(h, BANDS.ecgHrv));
      put('overall', worstCat([s.qtc, s.qrs, s.pr, s.ectopic, s.rhythm].filter(Boolean)));
      break;
    }
    case 'orthostatic': {
      const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
      if (before != null && after != null) put('increase', catFromBands(after - before, BANDS.orthoIncrease));
      if (after != null && min1 != null) put('recovery', catFromBands(after - min1, BANDS.orthoRecovery));
      if (s.increase) s.overall = s.increase; // the event is rated on the standing rise
      break;
    }
  }
  return s;
}

/** Category used to tint the single value shown on a reading row. */
export function rowScoreCategory(r: Entry, ctx: ScoreContext = {}): ScoreCat | null {
  const s = computeScores(r, ctx);
  switch (r.type) {
    case 'hrv': return s.overall || s.sdnn || null;
    case 'breathHrv': return s.overall || s.sdnn || null;
    case 'bp': return s.bp || null;
    case 'restingHr': return s.hr || null;
    case 'ecg': return s.overall || null;
    case 'orthostatic': return s.overall || s.increase || null;
    default: return null;
  }
}

export const ecgPattern = (r: Entry) => (r.svt ? 'SVT' : r.otherArrhythmia ? 'Other' : r.sinus ? 'Sinus' : '-');

/* ---------- derived blood-pressure metrics ---------- */
export const bpMap = (rr: Entry) => { const s = +(rr.sys as number), d = +(rr.dia as number); return !isNaN(s) && !isNaN(d) ? (s + 2 * d) / 3 : null; };
export const bpPP = (rr: Entry) => { const s = +(rr.sys as number), d = +(rr.dia as number); return !isNaN(s) && !isNaN(d) ? s - d : null; };
export const bpKerdo = (rr: Entry) => { const d = +(rr.dia as number), p = +(rr.pulse as number); return !isNaN(d) && !isNaN(p) && p ? (1 - d / p) * 100 : null; };
export const bpRobinson = (rr: Entry) => { const s = +(rr.sys as number), p = +(rr.pulse as number); return !isNaN(s) && !isNaN(p) ? (s * p) / 100 : null; };
export const bpKvas = (rr: Entry) => { const s = +(rr.sys as number), d = +(rr.dia as number), p = +(rr.pulse as number); const pp = s - d; return !isNaN(p) && pp > 0 ? (10 * p) / pp : null; };
export const bpBce = (rr: Entry) => { const s = +(rr.sys as number), d = +(rr.dia as number), p = +(rr.pulse as number); return !isNaN(s) && !isNaN(d) && !isNaN(p) ? (s - d) * p : null; };

/* ---------- per-metric explainer strings ---------- */
export const HRV_EXPLAIN: Record<string, string> = {
  rmssd: 'Beat-to-beat parasympathetic activity - your most reliable vagal-tone indicator.',
  pnn50: 'Percent of successive beats differing by 50ms+. Sensitive parasympathetic depth.',
  sdnn: 'Overall heart-rate variability. Reflects total autonomic activity.',
  hr: 'Beats per minute during the reading. Lower usually means more vagal dominance.',
  meanRr: 'Average milliseconds between beats (inverse of HR).',
  mxdmn: 'Longest minus shortest RR interval - the range of variability.',
  mode: 'Most common RR interval - a stability indicator.',
  amo50: 'Stress-index marker. Higher suggests sympathetic dominance.',
  cv: 'Relative variability. Higher is generally better.',
};

/** Autonomic composite weights per reading kind (per the framework). */
export const COMPOSITE_WEIGHTS: Record<'breathHrv' | 'hrv', Record<string, number>> = {
  breathHrv: { rmssd: 25, pnn50: 15, totalPower: 15, lfPeak: 20, hfPeak: 15, lfhf: 10 },
  hrv: { rmssd: 25, pnn50: 20, totalPower: 15, lfPeak: 15, lfhf: 10, sdnn: 15 },
};

/** Weighted 0-100 composite for an HRV reading (hero number). */
export function hrvComposite(r: Entry, ctx: ScoreContext = {}): { score: number | null; overall: ScoreCat | null } {
  const s = computeScores(r, ctx);
  const kind = r.type === 'breathHrv' ? 'breathHrv' : 'hrv';
  const weights = COMPOSITE_WEIGHTS[kind];
  let sum = 0, wsum = 0;
  Object.keys(weights).forEach((k) => {
    const c = s[k];
    if (c && CAT_POINTS[c] != null) { sum += CAT_POINTS[c] * weights[k]; wsum += weights[k]; }
  });
  const overall = worstCat([s.rmssd, s.pnn50, s.totalPower].filter(Boolean));
  return { score: wsum ? Math.round(sum / wsum) : null, overall };
}
