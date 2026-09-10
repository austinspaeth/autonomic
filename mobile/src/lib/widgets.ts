/**
 * Home-screen widget feed. Builds one JSON payload describing "today" — score,
 * graded day-average metrics, trends, the pacing budget — and pushes it to the
 * platform widgets: on iOS through the widget-bridge module (app-group
 * UserDefaults + WidgetKit reload), on Android through react-native-android-widget
 * re-renders.
 *
 * The builder is pure over an AppState so it can run in a headless Android
 * widget task and in jest. Widgets only ever show REAL data — an empty journal
 * renders the "awaiting data" gauge, never the demo month (a home-screen
 * number reads as fact, so it must never be fiction).
 */
import { ACCENT, CAUTION_GOLD } from '../theme';
import { acReadVals } from './analysis/buckets';
import { buildBudgetAt, clock, hm, type BudgetView } from './budget';
import { DAY_END_MIN } from './budget/pace';
import { addDays, fmtNum, fmtShort, keyOf, todayKey } from './dates';
import { hasOwnData } from './demo';
import { emberStops } from './ember';
import {
  BANDS, SCORE_COLORS, catFromBands, restingHrBands, type ScoreContext,
} from './scoring';
import {
  scoreCat, scoreSet, sleepHours, sleepGrade,
  protocolCriteria, resolveProtocol, type DaysMap,
} from './scoring/day';
import { detectDownturn } from './scoring/downturn';
import { detectStrain } from './scoring/strain';
import { WIDGET_WINDOW_DAYS, trendDirection, type TrendMetricId } from './trends';
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

/**
 * The pacing widgets' states. The first five are the Journal strip's own
 * (`BudgetState`, with 'suppressed' spoken as the word the widget shows);
 * 'locked' is a free install, which gets no number at all, and 'awaiting' is an
 * empty journal or a day the widget has nothing honest to say about.
 */
export type WidgetPacingState = 'healthy' | 'ahead' | 'over' | 'low' | 'paused' | 'locked' | 'awaiting';

export interface WidgetPacingTile { value: string; label: string; color: string }

/** One moment of the pacing widget, fully resolved: the widget only draws. */
export interface WidgetPacingFrame {
  at: string;              // ISO instant this frame is true from
  state: WidgetPacingState;
  figure: string;          // '3h 20m', '45m', 'Paused'
  unit: string;            // 'over' beside an overage, else ''
  /** The figure is a word ("Paused", "Awaiting") rather than a duration: set it
   *  a step smaller so it fits the slot a bare duration fills. */
  soft: boolean;
  figureColor: string;
  sub: string;             // the small widget's line
  subWide: string;         // the medium widget's line, which has room for more
  fill: number;            // 0..1
  fillColor: string;
  /** The pace marker, 0..1. Null when over, paused, locked or awaiting. */
  pace: number | null;
  /** Over budget only: the ember gradient baked static (WidgetKit cannot
   *  animate), left → right. */
  ember: { o: number; c: string }[] | null;
  badge: string;           // '' draws no badge
  badgeColor: string;
  tiles: WidgetPacingTile[];   // medium widget, at most two
}

export interface WidgetPacing {
  /** Ascending by `at`. On iOS each becomes a timeline entry, so the marker
   *  walks across the day between app launches; Android re-renders on its own
   *  periodic tick and draws whichever frame is current. */
  frames: WidgetPacingFrame[];
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
  pacing: WidgetPacing;
}

/** What the pure builder cannot read for itself. The push path fills these
 *  from the store (`liveWidgetOpts`); tests pass them directly. */
export interface WidgetOpts {
  now?: Date;
  /** A free install: the pacing widgets show the Pro line, never a number. */
  locked?: boolean;
  stepsGranted?: boolean;
}

const DIM = '#8a8a92';
const TEXT = '#f2f2f5';
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

/**
 * '▲' / '▼' for a registry metric, from the shared trend engine (src/lib/trends).
 *
 * This replaced a local week-trend helper that compared today against the trailing
 * week's MEAN and fired on any non-zero percentage change with no coverage
 * requirement — so the widget could show a rising arrow on the same day the app
 * showed a downturn warning, and a single artifact reading could set the
 * direction. `trendDirection` uses medians, demands the metric's own minimum
 * coverage in BOTH windows, and only speaks when the move clears a threshold
 * chosen to be worth telling someone about.
 *
 * The visible consequence is intended: rows that used to show an arrow almost
 * always now show none unless something really moved.
 */
function metricArrow(days: DaysMap, dk: string, id: TrendMetricId, ctx: ScoreContext): { trend: string | null; trendColor: string | null } {
  const dirn = trendDirection(days, dk, id, WIDGET_WINDOW_DAYS, ctx);
  if (dirn === 'improving') return { trend: TREND_UP, trendColor: SCORE_COLORS.good };
  if (dirn === 'declining') return { trend: TREND_DOWN, trendColor: SCORE_COLORS.crash };
  return { trend: null, trendColor: null };   // 'flat' and 'unknown' both stay quiet
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

/* ---------- pacing ---------- */

/** Spacing of the iOS timeline. The marker crosses a waking day in ~58 steps
 *  at this interval, under two percent of the bar each, which reads as still. */
export const PACING_FRAME_MIN = 15;

/** The payload is decoded by Swift's six-digit hex parser, and `mixHex` (under
 *  the ember stops) answers in `rgb()`. */
function toHex(c: string): string {
  if (c.startsWith('#')) return c.slice(0, 7);
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (!m) return DIM;
  return `#${[m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('')}`;
}

/** One cycle of the drifting ember, stretched across the bar. `emberStops`
 *  describes a doubled shape (period 0.5), so the first half IS one cycle. */
function staticEmber(base: string): { o: number; c: string }[] {
  return emberStops(base)
    .filter((s) => s.offset <= 0.5)
    .map((s) => ({ o: Math.round(s.offset * 2 * 1000) / 1000, c: toHex(s.color) }));
}

/** `now`, then every PACING_FRAME_MIN on the quarter hour until the waking day
 *  ends. Past DAY_END_MIN the marker sits at the end and nothing moves. */
function frameTimes(now: Date): Date[] {
  const out = [now];
  const end = new Date(now);
  end.setHours(0, DAY_END_MIN, 0, 0);
  const t = new Date(now);
  t.setSeconds(0, 0);
  t.setMinutes((Math.floor(t.getMinutes() / PACING_FRAME_MIN) + 1) * PACING_FRAME_MIN);
  while (t <= end) {
    out.push(new Date(t));
    t.setMinutes(t.getMinutes() + PACING_FRAME_MIN);
  }
  return out;
}

const blankFrame = (at: Date): Omit<WidgetPacingFrame, 'state' | 'figure' | 'sub' | 'subWide' | 'badge' | 'badgeColor'> => ({
  at: at.toISOString(),
  unit: '', soft: false, figureColor: TEXT,
  fill: 0, fillColor: DIM, pace: null, ember: null, tiles: [],
});

function lockedFrame(at: Date): WidgetPacingFrame {
  return {
    ...blankFrame(at), state: 'locked',
    figure: 'Locked', soft: true, figureColor: DIM,
    sub: 'Included with Pro', subWide: 'Your daily budget is included with Pro',
    badge: 'PRO', badgeColor: DIM,
  };
}

function awaitingFrame(at: Date): WidgetPacingFrame {
  return {
    ...blankFrame(at), state: 'awaiting',
    figure: 'Awaiting', soft: true, figureColor: DIM,
    sub: 'Open Autonomic to update', subWide: 'Open Autonomic to update your budget',
    badge: '', badgeColor: DIM,
  };
}

/**
 * The widget's own figure and sub, without the strip's "About" hedge.
 *
 * The strip softens a not-yet-fitted estimate ("About 3h 30m") because it sits
 * beside the words that explain what is still being learned. A widget has no
 * room for that explanation, so the hedge arrives as a bare qualifier on a
 * number and reads as the app being unsure of its own arithmetic. It also
 * rounds to the half hour, which puts a different figure on the home screen
 * from the one in the app. So the widget says the budget: exact minutes, the
 * same `hm()` every other figure here uses.
 */
function hardFigure(v: BudgetView): { figure: string; sub: string } {
  const env = v.envelope.effortMin ?? 0;
  const spent = v.burn.effortMin;
  if (spent < 1) return { figure: hm(env), sub: 'to spend today' };
  return { figure: hm(Math.max(0, env - spent)), sub: `left of ${hm(env)}` };
}

/**
 * The medium widget's two tiles, and they are the same two in every state.
 *
 * Spent, then Budget. The second slot used to be given to the minutes the
 * heart sat above the user's own exertion line whenever there were any, which
 * meant the widget stopped answering "out of how much" on exactly the days it
 * mattered: an ahead-of-pace afternoon read "1h 41m Spent · 38m HR above 94"
 * and the ceiling was nowhere on the home screen or the wrist. A tile whose
 * SUBJECT changes with the state is not a readout, it is two different widgets
 * wearing one layout. The exertion minutes are still a row in the spend
 * drill-in, which is where a number that needs a sentence belongs.
 */
function liveTiles(v: BudgetView): WidgetPacingTile[] {
  return [
    { value: hm(v.burn.effortMin), label: 'Spent', color: TEXT },
    { value: hm(v.envelope.effortMin ?? 0), label: 'Budget', color: DIM },
  ];
}

/** A paused day shows the two morning readings the budget reads first, so the
 *  pause sits beside evidence rather than being asserted. Coloured only when
 *  the reading really is off the user's own usual. */
function pausedTiles(v: BudgetView): WidgetPacingTile[] {
  const pick = (id: 'hrv' | 'restingHr', label: string): WidgetPacingTile | null => {
    const i = v.envelope.inputs.find((x) => x.id === id);
    if (!i || !i.known || i.value == null) return null;
    return { value: i.value, label, color: i.vsCat === 'bad' ? CAUTION_GOLD : TEXT };
  };
  return [pick('hrv', 'HRV, ms'), pick('restingHr', 'Resting HR')].filter((t): t is WidgetPacingTile => t != null);
}

export function pacingFrame(v: BudgetView, at: Date): WidgetPacingFrame {
  const base = blankFrame(at);

  if (v.state === 'suppressed') {
    return {
      ...base, state: 'paused',
      figure: 'Paused', soft: true,
      sub: 'Take it easy today', subWide: v.sub,
      badge: 'PAUSED', badgeColor: CAUTION_GOLD,
      tiles: pausedTiles(v),
    };
  }
  // Finished days and days the app never saw have no live reading to give.
  if (v.state === 'unknown' || v.state === 'final-under' || v.state === 'final-over') return awaitingFrame(at);

  const state = v.state as WidgetPacingState;
  const hard = hardFigure(v);
  const pace = v.pace && state !== 'over' ? Math.max(0, Math.min(1, v.pace.expected)) : null;

  if (state === 'over') {
    return {
      ...base, state,
      figure: hm(v.overByMin ?? 0), unit: 'over', figureColor: ACCENT,
      sub: 'Resting brings this down', subWide: v.sub,
      fill: 1, fillColor: ACCENT, ember: staticEmber(ACCENT),
      badge: 'OVER', badgeColor: ACCENT,
      tiles: liveTiles(v),
    };
  }

  const fill = Math.max(0, Math.min(1, v.fill));
  const tiles = liveTiles(v);

  if (state === 'ahead') {
    const runsOut = v.pace?.runsOutMin;
    return {
      ...base, state, figure: hard.figure,
      sub: v.burn.effortMin < 1 ? hard.sub : 'left, running ahead',
      subWide: runsOut != null ? `Runs out around ${clock(runsOut)}` : 'Running ahead of an even day',
      fill, fillColor: CAUTION_GOLD, pace,
      badge: 'AHEAD', badgeColor: CAUTION_GOLD,
      tiles,
    };
  }

  if (state === 'low') {
    // The one Todo is the most useful thing a low-confidence widget can say,
    // and it is what the strip says in the same state.
    const line = v.recommendation?.actionable ? v.recommendation.title : hard.sub;
    return {
      ...base, state, figure: hard.figure,
      sub: line, subWide: line,
      fill, fillColor: DIM, pace,
      badge: 'LOW CONFIDENCE', badgeColor: DIM,
      tiles,
    };
  }

  return {
    ...base, state, figure: hard.figure,
    sub: hard.sub,
    subWide: hard.sub.startsWith('left of') ? `${hard.sub} today` : hard.sub,
    fill, fillColor: SCORE_COLORS.good, pace,
    badge: 'ON TRACK', badgeColor: SCORE_COLORS.good,
    tiles,
  };
}

function buildPacing(state: AppState, days: DaysMap, dk: string, ctx: ScoreContext, opts: WidgetOpts): WidgetPacing {
  const now = opts.now ?? new Date();
  if (opts.locked) return { frames: [lockedFrame(now)] };
  // The widgets' one rule: an empty journal is awaiting, never a prior. A
  // health read that landed today counts, since that is a real day's steps.
  if (!hasOwnData(days) && !days[dk]?.load?.readAt) return { frames: [awaitingFrame(now)] };

  const isToday = dk === keyOf(now);
  const downturn = detectDownturn(days, dk, ctx, resolveProtocol(state.settings?.protocol), state.customTypes);
  const strain = downturn ? null : detectStrain(days, dk, ctx);
  const nows = isToday ? frameTimes(now) : [new Date(`${dk}T23:59:00`)];
  const views = buildBudgetAt(state, dk, ctx, {
    now, addDays,
    downturn: !!downturn,
    strain: strain ? strain.severity : null,
    past: !isToday,
    stepsGranted: opts.stepsGranted,
    brief: true,
  }, nows);

  const frames: WidgetPacingFrame[] = [];
  let last = '';
  views.forEach((v, i) => {
    const f = pacingFrame(v, nows[i]);
    // Before wake and after the day ends the marker does not move, so those
    // frames are identical to their neighbour and would only pad the payload.
    const sig = JSON.stringify({ ...f, at: '' });
    if (sig === last) return;
    last = sig;
    frames.push(f);
  });
  return { frames };
}

/** The frame a renderer should draw at `now`: the latest that has started. */
export function currentPacingFrame(p: WidgetPacing, now: Date = new Date()): WidgetPacingFrame {
  const t = now.getTime();
  let pick = p.frames[0];
  for (const f of p.frames) {
    if (new Date(f.at).getTime() <= t) pick = f;
    else break;
  }
  return pick ?? awaitingFrame(now);
}

export function buildWidgetPayload(state: AppState, dk = todayKey(), opts: WidgetOpts = {}): WidgetPayload {
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
  const rows: WidgetMetricRow[] = [
    {
      // SDNN carries no arrow: it has no entry in the trend registry, and a
      // metric without declared thresholds and coverage rules has no business
      // asserting a direction. Adding one is a single row in
      // src/lib/trends/metrics.ts, never a comparison written here.
      name: 'SDNN', value: fmt(sdnn), unit: 'ms', color: gradeColor(sdnn, BANDS.sdnn),
      trend: null, trendColor: null,
    },
    {
      name: 'RMSSD', value: fmt(rmssd), unit: 'ms', color: gradeColor(rmssd, rmssdBands),
      ...metricArrow(days, dk, 'rmssd', ctx),
    },
    {
      name: 'Sleep', value: fmt(sleep, 1), unit: 'h',
      color: sleepCat ? SCORE_COLORS[sleepCat] : DIM,
      ...metricArrow(days, dk, 'sleepDuration', ctx),
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
    pacing: buildPacing(state, days, dk, ctx, opts),
  };
}

/* ---------- push to the platform widgets ---------- */

/**
 * The store-backed half of `WidgetOpts`. An answer that cannot be read locks
 * the pacing widgets rather than unlocking them: a Pro user briefly seeing the
 * Pro line is a smaller wrong than a free install being shown the budget. The
 * question is `isPacingUnlocked`, not the tier — a free install inside its
 * seven-day pacing window gets the real widget, or the phone would be showing
 * the budget on the Journal and a lock on the home screen.
 */
export function liveWidgetOpts(): WidgetOpts {
  let locked = true;
  let stepsGranted: boolean | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    locked = !(require('../store/pacingTrial') as typeof import('../store/pacingTrial')).isPacingUnlocked();
  } catch { /* stays locked */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    stepsGranted = !(require('../store/budget') as typeof import('../store/budget')).stepsMissing();
  } catch { /* unknown: the engine treats undefined as granted */ }
  return { locked, stepsGranted };
}

/** The payload for right now, from the live store. */
export function buildLiveWidgetPayload(): WidgetPayload {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getState } = require('../store/store') as typeof import('../store/store');
  return buildWidgetPayload(getState(), todayKey(), liveWidgetOpts());
}

async function pushWidgetData(): Promise<void> {
  // Lazy requires throughout (react-native included): the pure builder above
  // must stay importable from jest's node environment, the store must not be
  // a dependency of it, and the platform bridges may be missing (web, jest,
  // binaries predating them).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  try {
    const payload = buildLiveWidgetPayload();
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { widgetBridge } = require('../../modules/widget-bridge') as typeof import('../../modules/widget-bridge');
      await widgetBridge()?.setWidgetData(JSON.stringify(payload));
      // The Apple Watch mirrors the same frames. It rides this build rather
      // than running its own: the budget is expensive to compute and a second
      // build could answer differently, which is the one thing a second
      // surface showing the same number must never do.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('./watch/receiver') as typeof import('./watch/receiver')).setWatchPacing(payload);
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        try { (require('./diagnostics/errorLog') as typeof import('./diagnostics/errorLog')).logError('watch.pacing', e); } catch { /* ignore */ }
      }
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

/** Push now, without waiting on the journal debounce. For a background
 *  wake-up, where that timer may never fire before the app is suspended. */
export function syncWidgetsNow(): Promise<void> {
  return pushWidgetData();
}

let widgetSyncArmed = false;
/** Launch hook: push once now, then re-push shortly after any journal change
 *  (same trailing-debounce shape as the crash watcher), whenever the tier
 *  changes (an upgrade unlocks the pacing widgets, a lapsed trial locks them)
 *  and whenever the app foregrounds — that catches the midnight rollover, where
 *  "today" moved on while the stored payload still describes yesterday. */
export function initWidgetSync(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppState: RNAppState, Platform } = require('react-native') as typeof import('react-native');
  if (widgetSyncArmed || Platform.OS === 'web') return;
  widgetSyncArmed = true;
  void pushWidgetData();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { subscribeStore } = require('../store/store') as typeof import('../store/store');
  let t: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void pushWidgetData(); }, 2000);
  };
  subscribeStore(schedule);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('../store/tier') as typeof import('../store/tier')).subscribeTier(schedule);
  } catch { /* tier store unavailable: journal pushes still carry it */ }
  RNAppState.addEventListener('change', (s) => { if (s === 'active') void pushWidgetData(); });
}
