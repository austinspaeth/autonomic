/**
 * Scoring engine — ported VERBATIM from the web app (docs/index.html).
 * Thresholds are the product; do not "fix" or round them. If a threshold
 * looks wrong, it still must match the web app (see README).
 *
 * Pure module: no UI or store imports. Anything needing profile data
 * (height for BMI, sex for QTc) takes it as an argument.
 */
import type { Band, CustomTypes, Entry, Protocol, ScoreCat } from '../types';
import type { HelpContent } from '../help';

// One unified grade scale shared with the day-score bands (SCORE_CATS in day.ts):
// each ScoreCat maps to the day-scale level with the same color. The internal keys
// are legacy (great/ok/crash) but the DISPLAYED vocabulary is Excellent → Crash.
export const SCORE_COLORS: Record<ScoreCat, string> = {
  great: '#2ee06a',       // Excellent (bright luminous green — the peak tier pops)
  good: '#16a34a',        // Good (deep solid green)
  ok: '#eab308',          // Moderate
  bad: '#f97316',         // Compromised
  crash: '#ef4444',       // Bad
  concerning: '#b91c1c',  // Crash
  warning: '#a78bfa',     // Warning (blue-zone / too-high flag) — kept violet
};

export const SCORE_RANK: Record<ScoreCat, number> = {
  great: 0, good: 1, ok: 2, warning: 2, bad: 3, crash: 4, concerning: 4,
};

export const GRADE_LABEL: Record<ScoreCat, string> = {
  great: 'Excellent', good: 'Good', ok: 'Moderate', bad: 'Compromised', crash: 'Bad', concerning: 'Crash', warning: 'Warning',
};

/** Grade -> 0-100 points (day composite). Great is a full 100 so an
 *  all-great day scores a perfect 100. */
export const GRADE_PTS: Record<ScoreCat, number> = {
  great: 100, good: 80, ok: 60, warning: 60, bad: 35, crash: 10, concerning: 10,
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
export const sRestingHr = (v: unknown, pos?: unknown): ScoreCat | null => {
  const n = numOr(v);
  if (n == null) return null;
  const lying = !pos || /lay/i.test(String(pos));
  return lying
    ? (n <= 62 ? 'great' : n <= 68 ? 'good' : n <= 75 ? 'ok' : n <= 85 ? 'bad' : 'concerning')
    : (n <= 68 ? 'great' : n <= 78 ? 'good' : n <= 88 ? 'ok' : n <= 98 ? 'bad' : 'concerning');
};
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
  // baseline readings, where there's no target pace to compare against.
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
  // Signed HR change one minute after the episode (min1 - after): negative means
  // HR settled back down (good), positive means it was still climbing (bad). The
  // mirror of orthoRecovery, graded on the signed delta the readout now shows.
  orthoDelta: [{ max: -20, cat: 'great' }, { max: -12, cat: 'good' }, { max: -6, cat: 'ok' }, { max: 0, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  // Heart-rate recovery one minute after a workout, as the SIGNED change from
  // the rate the session ended on (see `lib/hrRecovery.ts`), so a fall reads
  // negative the way orthoDelta does. A drop of 12 bpm or less at one minute is the classic abnormal-HRR
  // threshold, so it sits at the concerning boundary.
  hrRecovery: [{ max: -35, cat: 'great' }, { max: -25, cat: 'good' }, { max: -18, cat: 'ok' }, { max: -12, cat: 'bad' }, { max: Infinity, cat: 'concerning' }],
  // Watch stand test: HR rise on standing (bpm). ≥30 sustained is the adult
  // POTS threshold, so it sits at the bad boundary.
  standDelta: [{ max: 10, cat: 'great' }, { max: 20, cat: 'good' }, { max: 30, cat: 'ok' }, { max: 40, cat: 'bad' }, { max: Infinity, cat: 'crash' }],
  // Sleep duration (hours) — mirrors sleepGrade's duration steps so the Analysis
  // trend colours match how each night is graded (8h+ great, 7 good, 6 ok, 5 bad).
  sleepDur: [{ max: 5, cat: 'crash' }, { max: 6, cat: 'bad' }, { max: 7, cat: 'ok' }, { max: 8, cat: 'good' }, { max: Infinity, cat: 'great' }],
};

/** Resting-HR zones depend on body position. */
export const restingHrBands = (pos?: unknown): Band[] =>
  (!pos || /lay/i.test(String(pos)))
    ? [{ max: 63, cat: 'great' }, { max: 69, cat: 'good' }, { max: 76, cat: 'ok' }, { max: 86, cat: 'bad' }, { max: Infinity, cat: 'concerning' }]
    : [{ max: 69, cat: 'great' }, { max: 79, cat: 'good' }, { max: 89, cat: 'ok' }, { max: 99, cat: 'bad' }, { max: Infinity, cat: 'concerning' }];

export function bandsFor(type: string, key: string): Band[] | null {
  const map: Record<string, Record<string, string>> = {
    hrv: { rmssd: 'rmssdU', sdnn: 'sdnn', avgHr: 'hrBreath', pnn50: 'pnn50', vlowPower: 'vlf', lfPeak: 'lfPeak', hfPeak: 'hfPeak', meanRr: 'rrMode', mode: 'rrMode', mxdmn: 'mxdmn', amo50: 'amo50', cv: 'cv', pns: 'pns', sns: 'sns', stressIndex: 'stressIndex' },
    breathHrv: { sdnn: 'sdnn', rmssd: 'rmssdS', pnn50: 'pnn50', vlowPower: 'vlf', lfPeak: 'lfPeak', hfPeak: 'hfPeak', hr: 'hrBreath', meanRr: 'rrMode', mode: 'rrMode', mxdmn: 'mxdmn', amo50: 'amo50', cv: 'cv', pns: 'pns', sns: 'sns', stressIndex: 'stressIndex' },
    bp: { sys: 'sys', dia: 'dia' },
    standTest: { sustainedDelta: 'standDelta', peakDelta: 'standDelta' },
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
  /** Clean-day protocol used by dayCleanliness/streakInfo (defaults applied). */
  protocol?: Protocol;
  /** state.customTypes, so labels resolve for user-created types too. */
  customTypes?: CustomTypes;
  /** Resolves an entry's sampled HR curve from the waveform sidecar, injected
   *  so the pure scoring/analysis libs never import the store. Used by the POTS
   *  Episodes card to grade each event on its max delta. */
  hrCurve?: (id: string) => { t: number; bpm: number }[] | null;
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
    case 'orthostatic': {
      const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
      if (before != null && after != null) put('increase', catFromBands(after - before, BANDS.orthoIncrease));
      if (after != null && min1 != null) put('recovery', catFromBands(after - min1, BANDS.orthoRecovery));
      if (s.increase) s.overall = s.increase; // the event is rated on the standing rise
      break;
    }
    case 'standTest': {
      const sustained = numOr(r.sustainedDelta), peak = numOr(r.peakDelta);
      if (sustained != null) put('sustainedDelta', catFromBands(sustained, BANDS.standDelta));
      if (peak != null) put('peakDelta', catFromBands(peak, BANDS.standDelta));
      // The test is rated on the sustained rise (last minute of standing);
      // the peak only decides when no sustained figure was captured.
      put('overall', s.sustainedDelta || s.peakDelta || null);
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
    case 'orthostatic': return s.overall || s.increase || null;
    case 'standTest': return s.overall || null;
    default: return null;
  }
}

/* ---------- POTS episode (orthostatic) max delta ---------- */

/**
 * The biggest HR excursion from the pre-episode baseline. With a sampled
 * curve, it's the largest deviation (above or below baseline) from the
 * transition onward — negative when the dominant move was a drop. Without a
 * curve it falls back to the manual afterHr − beforeHr.
 */
export function orthoMaxDelta(r: Entry, curve?: { t: number; bpm: number }[] | null): number | null {
  const before = numOr(r.beforeHr);
  if (before == null) return null;
  const from = numOr(r.transitionAt);
  const post = (curve || []).filter((s) => from == null || s.t >= from);
  if (post.length) {
    const rise = Math.max(...post.map((s) => s.bpm)) - before;
    const drop = before - Math.min(...post.map((s) => s.bpm));
    return Math.round(rise >= drop ? rise : -drop);
  }
  const after = numOr(r.afterHr);
  return after != null ? after - before : null;
}

/** Grade a max delta: rises take the orthoIncrease bands; a drop of 30 bpm
 *  or more below baseline flags the blue warning zone instead. */
export function orthoDeltaCat(d: number | null | undefined): ScoreCat | null {
  if (d == null) return null;
  if (d <= -30) return 'warning';
  return catFromBands(d, BANDS.orthoIncrease);
}

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
  stressIndex: 'Baevsky strain index. Climbs when the rhythm turns rigid under sympathetic load. Lower is calmer.',
};

/** Longer copy for the "?" help sheets — shared by the reading summaries and
 *  the Progress view's HRV cards, so both surfaces explain each metric the
 *  same way. */
export const HRV_HELP: Record<string, HelpContent> = {
  score: {
    what: 'A weighted 0–100 composite of the reading\'s key metrics: vagal tone (RMSSD, pNN50), total power and baroreflex position (LF peak), each graded against the recovery framework\'s thresholds and combined into one number.',
    why: 'It is the fastest read on how much capacity you have today. A score holding at or above your own recent average is a day you can spend; a drop of ten points or more, especially after a flat stretch, usually means pacing before the symptoms arrive.',
    learnMore: '/insights/basics/the-autonomic-score-and-grade-bands/',
  },
  tachogram: {
    what: 'Every beat-to-beat (RR) interval in the reading, plotted in order. A healthy trace looks like rolling waves as breathing speeds and slows the heart. A flat trace means low variability; isolated spikes are usually artifacts rather than real beats.',
    why: 'It is the raw data behind every other number here, so it is worth a glance before you trust a reading. Waves mean the capture was clean and your system was responding; a flat or spiky trace explains an odd score better than any single metric can.',
    learnMore: '/insights/basics/rr-intervals-and-the-tachogram-explained/',
  },
  balance: {
    what: 'PNS and SNS score your two autonomic branches on a z-score scale where zero is the population average. PNS (rest and recover) is built from mean RR, RMSSD and SD1; SNS (fight or flight) from heart rate, the stress index and RMSSD.',
    why: 'They move like a see-saw. When you are recovered PNS sits above SNS and the chart fills green; under load the lines cross to amber, then red as SNS takes over. Red stretches often line up with flare days, so a crossing is an early cue to rest.',
    learnMore: '/insights/basics/pns-index-sns-index-stress-index-explained/',
  },
  pns: {
    what: 'Parasympathetic index: a composite of mean RR, RMSSD and SD1 compared against population norms. Zero is the population average, above zero means more rest-and-recover (vagal) activity than average, below zero means less.',
    why: 'Higher is the good direction. A trend climbing week over week usually tracks real recovery, and tends to show up as steadier upright tolerance and easier mornings. A sustained fall is worth reading next to your sleep, symptoms and recent activity.',
    learnMore: '/insights/basics/pns-index-sns-index-stress-index-explained/',
  },
  sns: {
    what: 'Sympathetic index: a composite of heart rate, the Baevsky stress index and RMSSD compared against population norms. Zero is the population average, negative means below-average fight-or-flight activation, positive means more than average.',
    why: 'Lower and stable is calmer. A climbing SNS often appears before you notice anything, in the days around a push, poor sleep or an infection, and it usually arrives with a racier standing heart rate. Treat a rise as a reason to hold your load flat.',
    learnMore: '/insights/basics/pns-index-sns-index-stress-index-explained/',
  },
  stressIndex: {
    what: 'The Baevsky strain index, computed from AMo50, mode and MxDMn. It rises steeply as the beat-interval distribution narrows, so a rigid rhythm produces a much larger number than a slightly less variable one.',
    why: 'Low and stable is the goal. Spikes typically accompany stress, illness or overreaching, and they often lead symptoms by a day or two, which makes this one of the earliest warnings you have. A rise with no obvious cause is worth pacing around.',
    learnMore: '/insights/basics/pns-index-sns-index-stress-index-explained/',
  },
  power: {
    what: 'Total spectral power of the reading in ms², split into very-low (below 0.04 Hz), low (0.04–0.15 Hz) and high (0.15–0.4 Hz) bands. The total shows how freely the rhythm varies; the split shows which regulatory systems produced that variation.',
    why: 'A higher total spread across the bands is the sign of an adaptable system, and growing power over weeks is a common recovery pattern. VLF dominating with little HF points to poor vagal engagement, stress or poor sleep, or a short or noisy capture.',
    learnMore: '/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/',
  },
  vlf: {
    what: 'Very-low-frequency power, below 0.04 Hz. It reflects slow regulatory waves tied to thermoregulation, hormones and vascular tone, and it needs a longer capture to resolve than the faster bands do.',
    why: 'One high reading means little. A persistent pattern of high VLF with suppressed HF is the one to watch: it tends to accompany stress, poor sleep or inflammation, the same conditions that precede a bad stretch. Check the capture length first.',
    learnMore: '/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/',
  },
  lf: {
    what: 'Low-frequency power, 0.04–0.15 Hz, the baroreflex band around blood-pressure regulation. It carries a mix of both branches but leans sympathetic when you are stressed or standing.',
    why: 'Slow paced breathing deliberately pumps LF up, so a large LF share during a breathing session is the exercise working, not a warning. On a plain resting reading, high LF with little HF usually means your system was working to hold pressure steady.',
    learnMore: '/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/',
  },
  hf: {
    what: 'High-frequency power, 0.15–0.4 Hz, the fast band linked to breathing. It rides almost purely on parasympathetic (vagal) tone, the rest-and-digest branch, so it is the most direct spectral read on vagal activity.',
    why: 'Strong HF is the clearest sign in the spectrum that you are genuinely resting, and it tends to rise with better sleep and lighter days. HF collapsing while your total power holds up is often an early hint of an oncoming crash or infection.',
    learnMore: '/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/',
  },
  lfhf: {
    what: 'The ratio of low-frequency to high-frequency power, a rough sympathetic-versus-vagal balance marker. Being a ratio, it can move because either band changed, so it is worth checking the two band values before reading anything into it.',
    why: 'Judge it on baseline readings and on trends, not single values: slow paced breathing inflates LF and pushes the ratio up by design. A ratio drifting steadily upward across resting readings usually means your load is outrunning your recovery.',
    learnMore: '/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/',
  },
  sdnn: {
    what: 'Standard deviation of all RR intervals in the reading. SDNN captures every rhythm influence (breathing, blood-pressure waves, slower autonomic swings), so it summarizes total variability rather than vagal activity alone.',
    why: 'Use it as your broadest measure of capacity, and compare it only against your own history: short readings run well below the 24-hour figures quoted elsewhere. A slow climb over weeks is one of the more trustworthy signs your baseline is lifting.',
    learnMore: '/insights/basics/what-is-sdnn-in-hrv/',
  },
  rmssd: {
    what: 'Root mean square of successive RR-interval differences, in milliseconds. It reflects parasympathetic (vagal) activity beat to beat, which makes it the workhorse HRV metric, though it is short-term and sensitive to breathing and posture.',
    why: 'Higher generally means more recovery capacity available today. Compare readings taken at the same time of day and in the same position; a consistent morning reading is your most reliable trend line, and a sharp drop below your range is a cue to pace.',
    learnMore: '/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/',
  },
  pnn50: {
    what: 'The percentage of successive beat intervals that differ by more than 50 ms. Like RMSSD it tracks vagal tone, but it saturates at both extremes, so it flattens out when variability is either very low or very high.',
    why: 'Expect it to move with RMSSD, and trust RMSSD when the two disagree. Because it saturates near the bottom, a pNN50 sitting at or near zero across readings says the beat-to-beat variation is genuinely gone, which fits the worst-feeling days.',
    learnMore: '/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/',
  },
  hr: {
    what: 'Mean heart rate across the capture, in beats per minute. Taken seated or lying still it approximates your resting rate, which is one of the simplest autonomic signals you can track.',
    why: 'A falling trend usually accompanies improving recovery. An unexplained sustained rise of five beats or more above your own baseline often turns up alongside poor sleep, infection, dehydration or overreaching, and is worth noting next to symptoms.',
    learnMore: '/insights/basics/resting-heart-rate-and-mean-rr/',
  },
  meanRr: {
    what: 'The mean interval between successive beats. It is the same information as average heart rate seen from the other side (60,000 ÷ HR), but HRV work is done in RR space, so it is shown here in milliseconds.',
    why: 'It moves opposite to heart rate: longer intervals mean a slower, calmer rhythm. Mostly it matters as the scale the other metrics sit on, since RMSSD and SDNN naturally run larger when your intervals are long and smaller when your rate is high.',
    learnMore: '/insights/basics/resting-heart-rate-and-mean-rr/',
  },
  mxdmn: {
    what: 'The difference between the longest and shortest RR interval in the reading. It describes the full range of the variation rather than its average, which also makes it sensitive to a single stray beat.',
    why: 'A wide spread generally reflects a rhythm free to move; a narrow one a rigid rhythm, which is what tends to accompany bad stretches. Because one artifact can inflate it, read the trend across readings rather than any single value.',
    learnMore: '/insights/basics/hrv-histogram-mode-amo50-mxdmn-cv/',
  },
  mode: {
    what: 'The most frequently occurring RR interval, the centre of your beat-interval distribution. With AMo50 it describes that distribution\'s shape: the mode is where it sits, AMo50 is how tightly it clusters.',
    why: 'Shifts in the mode track shifts in your underlying resting rate, so it drifts longer as you recover and shorter as load builds. It holds up better than mean RR against odd beats, which makes it a quieter way to watch the same slow change.',
    learnMore: '/insights/basics/hrv-histogram-mode-amo50-mxdmn-cv/',
  },
  amo50: {
    what: 'The share of beats falling in the busiest 50 ms bin of the distribution. It climbs as the rhythm concentrates around one interval and falls as the distribution spreads out. It also feeds the stress index.',
    why: 'A rising AMo50 means your rhythm is locking into a narrow band, which is what strain looks like before it becomes a symptom. Relaxed, well-recovered readings spread out and pull it down, so a falling trend is good news even if heart rate has not moved.',
    learnMore: '/insights/basics/hrv-histogram-mode-amo50-mxdmn-cv/',
  },
  cv: {
    what: 'Coefficient of variation: SDNN divided by the mean RR, as a percentage. Normalizing by heart rate strips out most of the effect the rate itself has on the raw variability figure.',
    why: 'It makes readings taken at different heart rates comparable, which matters when your rate swings between days. If SDNN falls but CV holds, the drop was mostly a faster heart; if both fall, the variability itself really did shrink.',
    learnMore: '/insights/basics/hrv-histogram-mode-amo50-mxdmn-cv/',
  },
  lfPeak: {
    what: 'The frequency carrying the most power between 0.04 and 0.15 Hz. Under paced breathing it generally mirrors your breathing pace: a 4/6 pattern is one breath every ten seconds, or 0.1 Hz, near the resonance frequency for most people.',
    why: 'An LF peak landing near your pacing frequency means the session found resonance, where each breath swings heart rate hardest and the baroreflex gets the most training. A scattered peak usually means the pace, your posture or the capture drifted.',
    learnMore: '/insights/basics/lf-peak-hf-peak-coherence-resonance/',
  },
  hfPeak: {
    what: 'The frequency carrying the most power between 0.15 and 0.4 Hz. At rest this band is driven by respiration, each breath slightly speeding and slowing the heart, so the peak usually sits at your breathing rate.',
    why: 'Read it as a check that the reading matches how you were actually breathing. A peak high in the band points to fast, shallow breathing, which is common on symptomatic days and tends to suppress HF power along with it.',
    learnMore: '/insights/basics/lf-peak-hf-peak-coherence-resonance/',
  },
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
