/**
 * Home-screen widget feed. Builds one JSON payload describing "today" — score,
 * graded day-average metrics, trends — and pushes it to the platform widgets:
 * on iOS through the widget-bridge module (app-group UserDefaults + WidgetKit
 * reload), on Android through react-native-android-widget re-renders.
 *
 * The builder is pure over an AppState so it can run in a headless Android
 * widget task and in jest. Widgets only ever show REAL data — an empty journal
 * renders the "awaiting data" gauge, never the demo month (a home-screen
 * number reads as fact, so it must never be fiction).
 */
import { acReadVals } from './analysis/buckets';
import { fmtNum, fmtShort, keyOf, todayKey } from './dates';
import {
  BANDS, SCORE_COLORS, catFromBands, restingHrBands, type ScoreContext,
} from './scoring';
import {
  scoreCat, scoreSet, sleepHours, sleepGrade,
  protocolCriteria, resolveProtocol, type DaysMap,
} from './scoring/day';
import type { AppState, DayRecord } from './types';

/* ---------- payload shape (decoded verbatim by the Swift widgets) ---------- */

export interface WidgetMetricRow {
  name: string;
  value: string;       // '–' when the day has no data for it
  unit: string;
  color: string;       // grade dot; dim grey when ungraded
  trend: string | null;      // '▲' / '▼' vs the trailing week, null when unknowable
  trendColor: string | null;
}
export interface WidgetGridItem { name: string; value: string; unit: string }
/** One of today's protocol requirements (the "clean day" checklist). */
export interface WidgetProtocolItem {
  key: string;
  label: string;
  done: boolean;       // requirement met today
  broken: boolean;     // hard-failed and can't be undone (e.g. a trigger logged)
}
/** The large widget's chart, precomputed to render exactly like the app's
 *  Sparkline card (grade-gradient stroke, graded dots, min/mid/max ticks). */
export interface WidgetSpark {
  values: (number | null)[];         // day-average RMSSD, oldest → today
  colors: (string | null)[];         // grade color per present point
  stops: { o: number; c: string }[]; // vertical gradient stops, top → bottom
  ticks: [string, string, string];   // y labels: min · mid · max
  start: string;                     // x labels (fmtShort)
  end: string;
}
export interface WidgetPayload {
  date: string;        // day key the payload describes
  updatedAt: string;
  hasScore: boolean;
  score: number;       // 0 while unscored
  label: string;       // SCORE_CATS short label ('Good'), or 'Awaiting data'
  color: string;
  rows: WidgetMetricRow[];       // SDNN · RMSSD · Sleep (gauge companions)
  grid: WidgetGridItem[];        // Today's numbers (2 × 3)
  spark: WidgetSpark | null;     // RMSSD · 14 days (null under 2 points)
  protocol: WidgetProtocolItem[];    // today's clean-day checklist
  protocolDone: number;              // count met (convenience for the widget)
}

const DIM = '#8a8a92';
const TREND_UP = '▲', TREND_DOWN = '▼';

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (vals: number[]): number | null =>
  vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;

/** Day key `n` days before `dk`. */
function dayBefore(dk: string, n: number): string {
  const [y, m, d] = dk.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d - n));
}

/** Day-average of a numeric reading field across both HRV reading types. */
function hrvDayAvg(d: DayRecord | undefined, key: string, unstructuredKey = key): number | null {
  if (!d) return null;
  return mean([...acReadVals(d, 'breathHrv', key), ...acReadVals(d, 'hrv', unstructuredKey)]);
}

/** Day-average resting HR, mirroring the day score's source preference:
 *  dedicated resting-HR readings, else training HR, else baseline avg. */
function restingHrDay(d: DayRecord | undefined): { value: number; color: string } | null {
  if (!d) return null;
  const dedicated = (d.readings || []).filter((r) => r.type === 'restingHr');
  const fromDedicated = mean(acReadVals(d, 'restingHr', 'hr'));
  if (fromDedicated != null) {
    const cat = catFromBands(fromDedicated, restingHrBands(dedicated[0]?.position));
    return { value: fromDedicated, color: cat ? SCORE_COLORS[cat] : DIM };
  }
  const fallback = mean(acReadVals(d, 'breathHrv', 'hr')) ?? mean(acReadVals(d, 'hrv', 'avgHr'));
  if (fallback == null) return null;
  const cat = catFromBands(fallback, BANDS.hrBreath);
  return { value: fallback, color: cat ? SCORE_COLORS[cat] : DIM };
}

/** '▲' / '▼' direction of today vs the trailing week's mean (higher-is-better). */
function weekTrend(today: number | null, prior: (number | null)[]): { trend: string | null; trendColor: string | null } {
  const base = mean(prior.filter((v): v is number => v != null));
  if (today == null || base == null || base === 0) return { trend: null, trendColor: null };
  const pct = Math.round(((today - base) / Math.abs(base)) * 100);
  if (pct === 0) return { trend: null, trendColor: null };
  return {
    trend: pct > 0 ? TREND_UP : TREND_DOWN,
    trendColor: pct > 0 ? SCORE_COLORS.good : SCORE_COLORS.crash,
  };
}

function fmt(v: number | null, dp = 0): string {
  return v == null ? '–' : dp ? round1(v).toFixed(dp) : String(Math.round(v));
}

const SPARK_DAYS = 14;

/** RMSSD day averages over the trailing two weeks, packaged with the exact
 *  scale + grade-gradient stops the app's Sparkline computes (charts.tsx), so
 *  the widget chart is the Progress card's chart. Graded on the training
 *  bands, matching the Progress RMSSD card. */
function buildSpark(days: DaysMap, dk: string): WidgetSpark | null {
  const keys = Array.from({ length: SPARK_DAYS }, (_, i) => dayBefore(dk, SPARK_DAYS - 1 - i));
  const values = keys.map((k) => {
    const v = hrvDayAvg(days[k], 'rmssd');
    return v == null ? null : round1(v);
  });
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const bands = BANDS.rmssdS;
  const color = (v: number) => {
    const c = catFromBands(v, bands);
    return c ? SCORE_COLORS[c] : DIM;
  };
  // Data min/max plus the same 5% cushion the app uses, then hard gradient
  // stops at each band boundary inside the range.
  const dataMin = Math.min(...present), dataMax = Math.max(...present);
  const span = dataMax - dataMin || Math.abs(dataMax) || 1;
  const min = dataMin - span * 0.05, max = dataMax + span * 0.05;
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
  const stops: { o: number; c: string }[] = [{ o: 0, c: color(max - 1e-9) }];
  bands.map((b) => b.max).filter((m) => m > min && m < max).sort((a, b) => b - a).forEach((bv) => {
    stops.push({ o: offAt(bv), c: color(bv + 1e-9) });
    stops.push({ o: offAt(bv), c: color(bv - 1e-9) });
  });
  stops.push({ o: 1, c: color(min + 1e-9) });
  return {
    values,
    colors: values.map((v) => (v == null ? null : color(v))),
    stops,
    ticks: [fmtNum(min), fmtNum((min + max) / 2), fmtNum(max)],
    start: fmtShort(keys[0]),
    end: fmtShort(dk),
  };
}

export function buildWidgetPayload(state: AppState, dk = todayKey()): WidgetPayload {
  const days: DaysMap = state.days || {};
  const d = days[dk];
  const ctx: ScoreContext = { sex: state.profile?.sex, height: state.profile?.height };

  const all = scoreSet(d?.readings || [], d || ({} as DayRecord), dk, days, ctx);
  const hasScore = all.score != null;
  const cat = hasScore ? scoreCat(all.score!) : null;

  // SDNN / RMSSD day averages + grade colors. RMSSD grades against the
  // training bands when a training reading exists (same split day.ts uses).
  const sdnn = hrvDayAvg(d, 'sdnn');
  const rmssd = hrvDayAvg(d, 'rmssd');
  const rmssdBands = d && acReadVals(d, 'breathHrv', 'rmssd').length ? BANDS.rmssdS : BANDS.rmssdU;
  const pnn50 = hrvDayAvg(d, 'pnn50');
  const rhr = restingHrDay(d);
  const sleep = sleepHours(days, dk);
  const sleepCat = sleepGrade(days, dk);
  const water = d?.food?.water ?? null;

  const gradeColor = (v: number | null, bands: (typeof BANDS)[string]) => {
    const c = v != null ? catFromBands(v, bands) : null;
    return c ? SCORE_COLORS[c] : DIM;
  };
  const prior = (fn: (day: string) => number | null) =>
    [1, 2, 3, 4, 5, 6, 7].map((n) => fn(dayBefore(dk, n)));

  const rows: WidgetMetricRow[] = [
    {
      name: 'SDNN', value: fmt(sdnn), unit: 'ms', color: gradeColor(sdnn, BANDS.sdnn),
      ...weekTrend(sdnn, prior((k) => hrvDayAvg(days[k], 'sdnn'))),
    },
    {
      name: 'RMSSD', value: fmt(rmssd), unit: 'ms', color: gradeColor(rmssd, rmssdBands),
      ...weekTrend(rmssd, prior((k) => hrvDayAvg(days[k], 'rmssd'))),
    },
    {
      name: 'Sleep', value: fmt(sleep, 1), unit: 'h',
      color: sleepCat ? SCORE_COLORS[sleepCat] : DIM,
      ...weekTrend(sleep, prior((k) => sleepHours(days, k))),
    },
  ];

  const grid: WidgetGridItem[] = [
    { name: 'SDNN', value: fmt(sdnn), unit: 'ms' },
    { name: 'RMSSD', value: fmt(rmssd), unit: 'ms' },
    { name: 'pNN50', value: fmt(pnn50), unit: '%' },
    { name: 'Resting HR', value: fmt(rhr?.value ?? null), unit: 'bpm' },
    { name: 'Sleep', value: fmt(sleep, 1), unit: 'h' },
    { name: 'Water', value: water != null ? String(round1(water)) : '–', unit: 'L' },
  ];

  // Today's clean-day checklist — the same criteria the Progress streak card
  // grades, so the widget's checkmarks mirror the in-app card. Pending items
  // (not yet evaluable) read as still-to-do.
  const criteria = protocolCriteria(days, dk, resolveProtocol(state.settings?.protocol), state.customTypes);
  const protocol: WidgetProtocolItem[] = criteria.map((c) => ({
    key: c.key, label: c.label, done: c.pass, broken: !!c.broken,
  }));

  return {
    date: dk,
    updatedAt: new Date().toISOString(),
    hasScore,
    score: all.score ?? 0,
    label: cat ? cat.short : 'Awaiting data',
    color: cat ? cat.color : DIM,
    rows,
    grid,
    spark: buildSpark(days, dk),
    protocol,
    protocolDone: protocol.filter((p) => p.done).length,
  };
}

/* ---------- push to the platform widgets ---------- */

async function pushWidgetData(): Promise<void> {
  // Lazy requires throughout (react-native included): the pure builder above
  // must stay importable from jest's node environment, the store must not be
  // a dependency of it, and the platform bridges may be missing (web, jest,
  // binaries predating them).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getState } = require('../store/store') as typeof import('../store/store');
  const payload = buildWidgetPayload(getState());
  try {
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { widgetBridge } = require('../../modules/widget-bridge') as typeof import('../../modules/widget-bridge');
      await widgetBridge()?.setWidgetData(JSON.stringify(payload));
    } else if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { updateAndroidWidgets } = require('../widgets/android') as typeof import('../widgets/android');
      await updateAndroidWidgets(payload);
    }
  } catch (e) {
    // Widget refresh is best-effort — never let it break logging. Required
    // lazily so this module stays loadable under jest (buildWidgetPayload is
    // unit-tested and must not drag MMKV in).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { (require('./diagnostics/errorLog') as typeof import('./diagnostics/errorLog')).logError('widgets.push', e); } catch { /* ignore */ }
  }
}

let widgetSyncArmed = false;
/** Launch hook: push once now, then re-push shortly after any journal change
 *  (same trailing-debounce shape as the crash watcher) and whenever the app
 *  foregrounds — that catches the midnight rollover, where "today" moved on
 *  while the stored payload still describes yesterday. */
export function initWidgetSync(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppState: RNAppState, Platform } = require('react-native') as typeof import('react-native');
  if (widgetSyncArmed || Platform.OS === 'web') return;
  widgetSyncArmed = true;
  void pushWidgetData();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { subscribeStore } = require('../store/store') as typeof import('../store/store');
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void pushWidgetData(); }, 2000);
  });
  RNAppState.addEventListener('change', (s) => { if (s === 'active') void pushWidgetData(); });
}
