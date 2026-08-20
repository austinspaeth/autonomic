/**
 * Fabricated Insights findings for the store scene.
 *
 * The only fixture in the scene set, and it exists because the alternative is
 * worse: the Insights engine is a statistical sweep with false-discovery
 * correction, so the findings it returns depend on the exact journal it was
 * handed. Reverse-engineering a journal that reliably produces a good-looking
 * screenful would be a fiction dressed up as data. This is the fiction, stated
 * plainly, in the shape of the real types — so the real cards render it and any
 * change to them redraws the scene.
 *
 * The claims themselves are modelled on things the app really did find in a
 * real journal: quercetin against RMSSD, and legs up the wall against HRV.
 */
import type { BiggestChange, Correlation, DetailSeries, Observation, WatchItem } from '../../src/lib/insights';

/** Deterministic wobble, so a capture is identical every time. */
const noise = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

const dayKeys = (n: number, end = '2026-08-19'): string[] => {
  const [y, m, d] = end.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
  }
  return out;
};

/* ---------- the biggest change: quercetin, and RMSSD after it ---------- */

const CHANGE_N = 62;
const CHANGE_ONSET = 31;
const changeKeys = dayKeys(CHANGE_N);

export const CHANGE: BiggestChange = {
  id: 'change-quercetin-rmssd',
  kind: 'onset',
  outcome: 'rmssd',
  factorId: 'meds:quercetin',
  onsetIndex: CHANGE_ONSET,
  headline: 'RMSSD is up since you started quercetin',
  body: 'In the 31 days since, RMSSD averaged 7 ms higher than the 31 days before.',
  beforeValue: '25', afterValue: '32', unit: 'ms',
  changeValue: '+28', changeUnit: '%',
  beforeLabel: 'Before', afterLabel: 'After',
  beforeText: '25 ms', afterText: '32 ms',
  before: 25, after: 32,
  good: true, pips: 3, confidence: 'Strong',
};

export const CHANGE_SERIES: DetailSeries = {
  keys: changeKeys,
  values: changeKeys.map((_, i) => {
    const base = i < CHANGE_ONSET ? 25 : 32;
    return Math.round((base + noise(i, 1) * 7) * 10) / 10;
  }),
  on: changeKeys.map((_, i) => (i < CHANGE_ONSET ? 0 : 1)),
  factorKind: 'binary',
  factorLabel: 'Quercetin',
  metric: 'rmssd',
  metricLabel: 'RMSSD',
  unit: 'ms',
  onsetIndex: CHANGE_ONSET,
  lag: 0,
};

/* ---------- correlations ---------- */

const corr = (c: Partial<Correlation> & Pick<Correlation,
  'id' | 'driver' | 'metric' | 'outcome' | 'deltaText' | 'deltaValue' | 'headline' | 'note' | 'detail' | 'good' | 'pips' | 'r' | 'high' | 'low' | 'unit'>): Correlation => ({
  factorId: c.id, driverKey: c.id, lag: 0, rText: c.r.toFixed(2),
  q: 0.01, confidence: c.pips === 3 ? 'Strong' : c.pips === 2 ? 'Moderate' : 'Weak',
  n: 74, highLabel: 'With', lowLabel: 'Without',
  ...c,
} as Correlation);

export const CORRELATIONS: Correlation[] = [
  corr({
    id: 'legs-up', driver: 'Legs up the wall', metric: 'RMSSD', outcome: 'rmssd', unit: 'ms',
    deltaText: '+8 ms', deltaValue: '+8', r: 0.61, pips: 3, good: true,
    high: 46, low: 38, detail: '46 vs 38 ms',
    headline: 'Legs-up days show higher RMSSD',
    note: '29 days with it, 45 without',
  }),
  corr({
    id: 'sleep-8h', driver: 'Sleep over 8h', metric: 'SDNN', outcome: 'sdnn', unit: 'ms',
    deltaText: '+6 ms', deltaValue: '+6', r: 0.47, pips: 2, good: true,
    high: 58, low: 52, detail: '58 vs 52 ms',
    headline: 'Nights over 8 hours show higher SDNN',
    note: '26 nights with it, 48 without',
  }),
  corr({
    id: 'late-caffeine', driver: 'Late caffeine', metric: 'Resting HR', outcome: 'restingHr', unit: 'bpm',
    deltaText: '+4 bpm', deltaValue: '+4', r: -0.43, pips: 2, good: false,
    high: 71, low: 67, detail: '71 vs 67 bpm',
    headline: 'Late caffeine days show a higher resting heart rate',
    note: '17 days with it, 57 without',
  }),
  corr({
    id: 'high-histamine', driver: 'Histamine', metric: 'Symptom load', outcome: 'symptomLoad', unit: '',
    deltaText: '+2', deltaValue: '+2', r: -0.39, pips: 2, good: false,
    high: 5, low: 3, detail: '5 vs 3 symptoms',
    headline: 'High-histamine days show a heavier symptom load',
    note: '21 days with it, 53 without',
  }),
  corr({
    id: 'magnesium', driver: 'Magnesium glycinate', metric: 'Sleep duration', outcome: 'sleepDuration', unit: 'min',
    deltaText: '+11 min', deltaValue: '+11', r: 0.41, pips: 2, good: true,
    high: 458, low: 447, detail: '7h 38m vs 7h 27m',
    headline: 'Magnesium nights run longer',
    note: '44 nights with it, 30 without',
  }),
  corr({
    id: 'legs-up-sdnn', driver: 'Legs up the wall', metric: 'SDNN', outcome: 'sdnn', unit: 'ms',
    deltaText: '+6 ms', deltaValue: '+6', r: 0.52, pips: 3, good: true,
    high: 59, low: 53, detail: '59 vs 53 ms',
    headline: 'Legs-up days show higher SDNN',
    note: '29 days with it, 45 without',
  }),
  corr({
    id: 'compression', driver: 'Compression shorts', metric: 'Standing HR rise', outcome: 'orthoDelta', unit: 'bpm',
    deltaText: '-6 bpm', deltaValue: '-6', r: 0.49, pips: 2, good: true,
    high: 22, low: 28, detail: '22 vs 28 bpm',
    headline: 'Compression days show a smaller standing rise',
    note: '23 days with it, 51 without',
  }),
  corr({
    id: 'salt', driver: 'Salt loading', metric: 'Daily score', outcome: 'score', unit: 'pts',
    deltaText: '+5 pts', deltaValue: '+5', r: 0.44, pips: 2, good: true,
    high: 70, low: 65, detail: '70 vs 65 pts',
    headline: 'Salt-loading days score higher overall',
    note: '34 days with it, 40 without',
  }),
  corr({
    id: 'zyrtec', driver: 'Zyrtec', metric: 'Symptom load', outcome: 'symptomLoad', unit: '',
    deltaText: '-2', deltaValue: '-2', r: 0.42, pips: 2, good: true,
    high: 2, low: 4, detail: '2 vs 4 symptoms',
    headline: 'Zyrtec days show a lighter symptom load',
    note: '31 days with it, 43 without',
  }),
  corr({
    id: 'heavy-day', driver: 'Heavy activity', metric: 'RMSSD', outcome: 'rmssd', unit: 'ms',
    deltaText: '-5 ms', deltaValue: '-5', r: -0.4, pips: 2, good: false, lag: 1,
    high: 37, low: 42, detail: '37 vs 42 ms',
    headline: 'The day after heavy activity shows lower RMSSD',
    note: '19 days with it, 55 without',
  }),
];

export const CORRELATION_DETAIL: Record<string, DetailSeries> = {
  [CHANGE.id]: CHANGE_SERIES,
};

/* ---------- worth a look ---------- */

export const OBSERVATIONS: Observation[] = [
  {
    id: 'obs-morning',
    title: 'Your mornings read better than your evenings',
    body: 'Morning readings averaged 8 ms higher RMSSD than evening ones over the last month. Your baseline is a morning number.',
    tone: 'good', icon: 'sun', importance: 3,
  },
  {
    id: 'obs-water',
    title: 'Water is drifting below your protocol',
    body: 'You hit 3 L on 12 of the last 30 days. The days you did averaged 5 points higher.',
    tone: 'watch', icon: 'droplet', importance: 2,
  },
];

/* ---------- trend watch ---------- */

const watchSeries = (from: number, to: number, seed: number): (number | null)[] =>
  Array.from({ length: 60 }, (_, i) => {
    if (i % 9 === 4) return null; // real journals have gaps
    const base = from + ((to - from) * i) / 59;
    return Math.round((base + noise(i, seed) * (Math.abs(to - from) * 0.5 + 2)) * 10) / 10;
  });

const WATCH_KEYS = dayKeys(60);

export const WATCH: WatchItem[] = [
  {
    metric: 'rmssd', title: 'RMSSD', sub: 'Up 8.1 ms vs the month before', value: '43 ms',
    change: '+8.1 ms', good: true, series: watchSeries(34, 44, 3), keys: WATCH_KEYS, splitIndex: 30,
    beforeValue: '35 ms', afterValue: '43 ms', beforeLabel: 'Month before', afterLabel: 'Last month',
    changeValue: '+8.1', unit: 'ms', recentN: 27, priorN: 24,
  },
  {
    metric: 'restingHr', title: 'Resting HR', sub: 'Down 4.2 bpm vs the month before', value: '64 bpm',
    change: '-4.2 bpm', good: true, series: watchSeries(69, 64, 5), keys: WATCH_KEYS, splitIndex: 30,
    beforeValue: '68 bpm', afterValue: '64 bpm', beforeLabel: 'Month before', afterLabel: 'Last month',
    changeValue: '-4.2', unit: 'bpm', recentN: 28, priorN: 26,
  },
  {
    metric: 'sleepConsistency', title: 'Sleep consistency', sub: 'Much more consistent than last month', value: '±42 min',
    change: 'Much steadier', good: true, series: watchSeries(78, 42, 7), keys: WATCH_KEYS, splitIndex: 30,
    beforeValue: '±74 min', afterValue: '±42 min', beforeLabel: 'Month before', afterLabel: 'Last month',
    changeValue: null, unit: 'min', recentN: 29, priorN: 27,
  },
];
