/* App usage: the web dashboard's App usage page, rebuilt for a phone.
 *
 * Three sections, kept apart because they answer questions about different
 * spans of time, and mixing them is how a 30-day average once sat beside a
 * one-day count with nothing but a date in a label to tell them apart:
 *
 *   ON <DAY>      the selected day (the date header)
 *   THIS RANGE    the filter bar's range, ending on that day
 *   ALL INSTALLS  cohorts born in the range, aged against that day
 *
 * The maths is lib/usage.ts, a port of the web's analytics.js. The platform
 * filter slices every route by store, except the cards that ARE the store
 * split (they would have nothing left to compare).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Chips, WeekdayChart, BarChart } from '../components/charts';
import { Lines, OverlayBars, StackedBars, type Key } from '../components/series';
import { MetricTiles, type Change, type Comparison, type MetricSpec } from '../components/MetricTiles';
import { Card, Divider, Segmented } from '../components/ui';
import { useData } from '../lib/data';
import { addDays, shortDate } from '../lib/dates';
import { int } from '../lib/format';
import type { PingKind } from '../lib/types';
import {
  activation,
  activeByCohort,
  activeOn,
  boundaryTransition,
  buildIndex,
  buildsOver,
  captureFunnel,
  cohortHeat,
  cohortSize,
  compareVersions,
  conversion,
  curve,
  entry,
  eventAges,
  faultDay,
  known,
  knownTotal,
  lifecycleActive,
  measureRate,
  measuringCurve,
  MILESTONES,
  SMALL_COHORT,
  newOn,
  offerFunnel,
  pctChange,
  platformsOver,
  presenceAt,
  presenceByWeek,
  presenceCurve,
  rangeDays,
  retentionAt,
  retentionByInstallWeekday,
  returningOn,
  sensorMixByAge,
  slotOn,
  slotsOver,
  splitFor,
  tiersOver,
  totalOn,
  type PlatformKey,
  type UsageIndex,
} from '../lib/usage';
import { C, num } from '../theme';

/* ------------------------------------------------------------ labels */

const SENSORS: Key[] = [
  { key: 'W', label: 'Apple Watch', color: '#3987e5' },
  { key: 'G', label: 'Garmin', color: '#d55181' },
  { key: 'B', label: 'Chest strap', color: '#199e70' },
  { key: 'F', label: 'Camera', color: '#d95926' },
  { key: '?', label: 'Unknown', color: C.unknown },
];
const WALLS: Key[] = [
  { key: 'R', label: 'Progress range', color: '#3987e5' },
  { key: 'I', label: 'Insights', color: '#d95926' },
  { key: 'P', label: 'POTS', color: '#199e70' },
  { key: 'B', label: 'Pacing', color: '#c98500' },
  { key: 'O', label: 'Outlook AI', color: '#d55181' },
  { key: 'M', label: 'Metric AI', color: '#008300' },
  { key: 'N', label: 'Insights AI', color: '#e66767' },
  { key: 'S', label: 'Settings (went looking)', color: '#8a8a90' },
  { key: '?', label: 'Unknown', color: C.unknown },
];
const TIERS: Key[] = [
  { key: 'P', label: 'Pro', color: '#c98500' },
  { key: 'T', label: 'Trial', color: '#199e70' },
  { key: 'F', label: 'Free', color: '#8a8a90' },
  { key: '?', label: 'Not stated', color: C.unknown },
];
const STORES: Key[] = [
  { key: 'I', label: 'iOS', color: C.ios },
  { key: 'A', label: 'Android', color: C.android },
  { key: 'U', label: 'No store', color: C.unknown },
];
const WHO: Key[] = [
  { key: 'back', label: 'Returning', color: C.series },
  { key: 'fresh', label: 'First run', color: '#199e70' },
];
const OUTCOMES: Key[] = [
  { key: 'acc', label: 'Accepted', color: '#199e70' },
  { key: 'dis', label: 'Dismissed', color: '#d95926' },
  { key: 'ign', label: 'Ignored', color: '#8a8a90' },
];
const VERSION_RING = ['#2563eb', '#199e70', '#c98500', '#d95926', '#d55181', '#8b5cf6', '#e66767', '#008300'];

/** The per-letter counters, as lines of rows. Each LINE is a headcount; lines must not be summed. */
const DO_LINES: { kind: PingKind; L?: string; label: string }[] = [
  { kind: 'see', L: 'I', label: 'Opened Insights' },
  { kind: 'see', L: 'P', label: 'Opened Progress' },
  { kind: 'see', L: 'B', label: 'Tapped locked pacing' },
  { kind: 'pot', L: 'T', label: 'POTS stand test' },
  { kind: 'pot', L: 'E', label: 'POTS episode' },
  { kind: 'not', L: 'M', label: 'Turned on morning reminder' },
  { kind: 'not', L: 'C', label: 'Turned on crash warning' },
  { kind: 'not', L: 'P', label: 'Turned on pacing alerts' },
  { kind: 'rvw', label: 'Store review asked' },
];
const LOG_LINES: { kind: PingKind; L?: string; label: string }[] = [
  { kind: 'log', L: 'S', label: 'Sleep' },
  { kind: 'log', L: 'A', label: 'Activity' },
  { kind: 'log', L: 'M', label: 'Med or supplement' },
  { kind: 'log', L: 'Y', label: 'Symptom' },
  { kind: 'log', L: 'W', label: 'Water' },
  { kind: 'log', L: 'B', label: 'Bowel movement' },
  { kind: 'log', L: 'P', label: 'Blood pressure' },
  { kind: 'log', L: 'R', label: 'Resting HR' },
  { kind: 'rdg', L: 'M', label: 'Morning baseline' },
  { kind: 'rdg', L: 'B', label: 'Later baseline' },
  { kind: 'rdg', L: 'T', label: 'Training reading' },
];
const DIG_LINES: { kind: PingKind; L?: string; label: string }[] = [
  { kind: 'use', L: 'M', label: 'Milestones opened' },
  { kind: 'use', L: 'P', label: 'Protocol saved' },
  { kind: 'use', L: 'B', label: 'Pacing budget opened' },
  { kind: 'fnd', L: 'E', label: 'Early signal opened' },
  { kind: 'fnd', L: 'U', label: 'Unconfirmed pattern opened' },
  { kind: 'fnd', L: 'C', label: 'Biggest change opened' },
  { kind: 'fnd', L: 'R', label: 'Correlation opened' },
  { kind: 'rpt', L: 'D', label: 'Data-for-prompt report' },
  { kind: 'rpt', L: 'H', label: 'Full health report' },
  { kind: 'rpt', L: 'C', label: 'Doctor summary' },
  { kind: 'mbp', L: 'S', label: 'Morning card shown' },
  { kind: 'mbp', L: 'T', label: 'Morning card: took reading' },
  { kind: 'mbp', L: 'X', label: 'Morning card closed' },
];

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? '–' : `${v.toFixed(digits)}%`);
const pts = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`);
const lettersOf = (keys: Key[], counts: Record<string, number>) => keys.filter((k) => counts[k.key]);

/* ---------------------------------------------------------- scaffolding */

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {note ? <Text style={s.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}

function Rows({ rows }: { rows: { label: string; value: string; sub?: string }[] }) {
  return (
    <View style={s.rows}>
      {rows.map((r, i) => (
        <View key={r.label}>
          {i ? <Divider /> : null}
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{r.label}</Text>
              {r.sub ? <Text style={s.rowSub}>{r.sub}</Text> : null}
            </View>
            <Text style={[s.rowValue, num]}>{r.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- view */

export type UsageRange = '7' | '30' | '90' | 'all';

export function UsageView({ dk, isToday, range, platform }: { dk: string; isToday: boolean; range: UsageRange; platform: PlatformKey }) {
  const { snap } = useData();
  const ix = useMemo(() => buildIndex(snap?.pings, platform, dk), [snap, platform, dk]);
  const [growthMode, setGrowthMode] = useState<'count' | 'share'>('count');
  const [buildMode, setBuildMode] = useState<'count' | 'share'>('count');
  const [curveMode, setCurveMode] = useState<'all' | 'split'>('all');
  const [trendAge, setTrendAge] = useState<'1' | '3' | '7' | '14'>('3');
  const [weekdayMetric, setWeekdayMetric] = useState<'downloads' | 'fresh' | 'back' | 'hrv' | 'ledger' | 'sub'>('fresh');

  const ctx = useMemo(() => {
    const last = ix.last ?? dk;
    const first = ix.first ?? last;
    let from = range === 'all' ? first : addDays(last, -(Number(range) - 1));
    if (from < first) from = first;
    const days = rangeDays(from, last);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days.length - 1));
    const prevDays = range !== 'all' && prevFrom >= first ? rangeDays(prevFrom, prevTo) : null;
    const cohorts = ix.cohorts.filter((c) => c >= from && c <= last);
    return { last, from, days, prevDays, cohorts };
  }, [ix, dk, range]);

  if (!ix.last) {
    return (
      <Card>
        <Note>No usage data yet.</Note>
      </Card>
    );
  }

  return (
    <>
      <TodaySection ix={ix} ctx={ctx} isToday={isToday && ctx.last === dk} />
      <RangeSection ix={ix} ctx={ctx} growthMode={growthMode} setGrowthMode={setGrowthMode} buildMode={buildMode} setBuildMode={setBuildMode} weekdayMetric={weekdayMetric} setWeekdayMetric={setWeekdayMetric} />
      <LifeSection
        ix={ix}
        ctx={ctx}
        curveMode={curveMode}
        setCurveMode={setCurveMode}
        trendAge={trendAge}
        setTrendAge={setTrendAge}
        releases={(snap?.load?.events || []).filter((e) => e.category === 'RELEASE').map((e) => ({ date: e.date, label: e.title }))}
      />
    </>
  );
}

type Ctx = { last: string; from: string; days: string[]; prevDays: string[] | null; cohorts: string[] };

/** The web's three baselines for one day; an unknown baseline drops its row. */
function dayDeltas(ix: UsageIndex, day: string, days: string[], f: (d: string) => number | null, neutral: boolean): Comparison[] {
  const now = f(day);
  if (now === null) return [];
  const vals = days.map(f).filter((v): v is number => v !== null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const wk = addDays(day, -7);
  const row = (label: string, base: number | null): Comparison | null => {
    const p = pctChange(now, base);
    return p === null ? null : { label, change: { value: now, base, neutral } };
  };
  return [
    row('vs the day before', f(addDays(day, -1))),
    row(`vs ${WD[new Date(`${wk}T12:00:00Z`).getUTCDay()]} last week`, f(wk)),
    row('vs the range average', avg),
  ].filter((x): x is Comparison => !!x);
}

/** Headline change for a one-day card: against the day before. */
function vsDayBefore(f: (d: string) => number | null, day: string, neutral: boolean): Change {
  const now = f(day);
  const before = f(addDays(day, -1));
  return now === null || pctChange(now, before) === null ? null : { value: now, base: before, neutral };
}

/** A range total against the previous window of the same length (null if any day is unknown). */
function rangeChange(ctx: Ctx, f: (d: string) => number | null): Change {
  if (!ctx.prevDays) return null;
  const sum = (ds: string[]) => {
    let t = 0;
    for (const d of ds) {
      const v = f(d);
      if (v === null) return null;
      t += v;
    }
    return t;
  };
  const now = sum(ctx.days);
  const before = sum(ctx.prevDays);
  return now === null || pctChange(now, before) === null ? null : { value: now, base: before };
}

const series = (days: string[], f: (d: string) => number | null) => days.map((d) => ({ day: d, value: f(d) ?? 0 }));
const parts = (keys: Key[], counts: Record<string, number>) =>
  keys.filter((k) => counts[k.key]).map((k) => ({ key: k.key, label: k.label, value: counts[k.key], color: k.color }));

/* ============================================================ ON <DAY> */

function TodaySection({ ix, ctx, isToday }: { ix: UsageIndex; ctx: Ctx; isToday: boolean }) {
  const day = ctx.last;
  const specs = useMemo<MetricSpec[]>(() => {
    // Coloured even on today, as asked; the note below says why today reads low.
    const d7 = (f: (d: string) => number | null) => dayDeltas(ix, day, ctx.days, f, false);
    const headline = (f: (d: string) => number | null) => vsDayBefore(f, day, false);
    const active = activeOn(ix, day);
    const fresh = newOn(ix, day);
    const sub = entry(ix, 'sub', day);
    const hrvKnown = known(ix, 'hrv', day);
    const readings = totalOn(ix, 'hrv', day);
    const hrvE = entry(ix, 'hrv', day);
    const share = (d: string) => (known(ix, 'hrv', d) && activeOn(ix, d) ? (totalOn(ix, 'hrv', d) / activeOn(ix, d)) * 100 : null);
    const firstRunReadings = hrvE?.cohorts[day] ?? 0;
    const f = faultDay(ix, day);
    const chart = (title: string, fn: (d: string) => number | null, color?: string) => ({
      title,
      series: series(ctx.days, fn),
      format: int,
      color,
    });
    const V = sub?.evidence.V ?? 0;
    const S = sub?.evidence.S ?? 0;
    return [
      {
        key: 'active',
        label: 'In the app',
        value: int(active),
        change: headline((d) => activeOn(ix, d)),
        wide: true,
        comparisons: d7((d) => activeOn(ix, d)),
        splits: [
          { title: 'Who', parts: parts(WHO, { back: Math.max(0, active - fresh), fresh }), format: int },
          { title: 'Store', parts: parts(STORES, entry(ix, 'open', day)?.platforms ?? {}), format: int },
        ],
        chart: chart('Over the range', (d) => activeOn(ix, d)),
      },
      {
        key: 'installs',
        label: 'Installs',
        value: int(fresh),
        change: headline((d) => newOn(ix, d)),
        note: 'First runs: installs the counter had never seen before.',
        comparisons: d7((d) => newOn(ix, d)),
        splits: [{ title: 'Store', parts: parts(STORES, entry(ix, 'open', day)?.fresh ?? {}), format: int }],
        chart: chart('Over the range', (d) => newOn(ix, d), '#199e70'),
      },
      {
        key: 'subs',
        label: 'Subscriptions reported',
        value: int(sub?.total ?? 0),
        change: headline((d) => totalOn(ix, 'sub', d)),
        note: [
          known(ix, 'rst', day) ? `${int(totalOn(ix, 'rst', day))} restored` : null,
          known(ix, 'lap', day) ? `${int(totalOn(ix, 'lap', day))} lapsed` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
        comparisons: d7((d) => totalOn(ix, 'sub', d)),
        splits: [
          { title: 'Store', parts: parts(STORES, sub?.platforms ?? {}), format: int },
          {
            title: 'How it was known',
            parts: [
              { key: 'V', label: 'Within 1h of a tap', value: V, color: '#199e70' },
              { key: 'S', label: 'No tap', value: S, color: '#c98500' },
              { key: 'O', label: 'Older build', value: Math.max(0, (sub?.total ?? 0) - V - S), color: C.unknown },
            ],
            format: int,
          },
        ],
        chart: chart('Over the range', (d) => totalOn(ix, 'sub', d), '#199e70'),
      },
      {
        key: 'act',
        label: 'First readings',
        value: int(totalOn(ix, 'act', day)),
        change: headline((d) => knownTotal(ix, 'act', d)),
        comparisons: d7((d) => knownTotal(ix, 'act', d)),
        splits: [{ title: 'Sensor', parts: parts(SENSORS, entry(ix, 'act', day)?.slots ?? {}), format: int }],
        chart: chart('Over the range', (d) => knownTotal(ix, 'act', d)),
      },
      {
        key: 'hrv',
        label: 'Measured',
        value: hrvKnown ? int(readings) : '–',
        change: headline((d) => knownTotal(ix, 'hrv', d)),
        note: 'Installs that completed an HRV reading that day.',
        comparisons: d7((d) => knownTotal(ix, 'hrv', d)),
        splits: [
          { title: 'Store', parts: parts(STORES, hrvE?.platforms ?? {}), format: int },
          ...(ix.hrvMethodFirst && day >= ix.hrvMethodFirst ? [{ title: 'Sensor', parts: parts(SENSORS, hrvE?.slots ?? {}), format: int }] : []),
        ],
        chart: { ...chart('Over the range', (d) => knownTotal(ix, 'hrv', d)), unknownBefore: ix.firstDay.hrv },
      },
      {
        key: 'share',
        label: 'Measured of active',
        value: pct(share(day)),
        change: headline(share),
        note: 'A share of people, not of opens: both counters fire once per install per day.',
        comparisons: [
          ...d7(share),
          ...(fresh ? [{ label: 'Of first runs', value: pct((firstRunReadings / fresh) * 100) }] : []),
          ...(returningOn(ix, day) ? [{ label: 'Of returning', value: pct((Math.max(0, readings - firstRunReadings) / returningOn(ix, day)) * 100) }] : []),
        ],
        chart: { title: 'Over the range', series: series(ctx.days, share), format: (v: number) => pct(v) },
      },
      {
        key: 'trial',
        label: 'Active in trial',
        value: int(lifecycleActive(ix, day, true)),
        change: headline((d) => lifecycleActive(ix, d, true)),
        note: 'Installs 14 days old or younger that opened the app.',
        comparisons: d7((d) => lifecycleActive(ix, d, true)),
        chart: chart('Over the range', (d) => lifecycleActive(ix, d, true), '#199e70'),
      },
      {
        key: 'past',
        label: 'Active past the trial',
        value: int(lifecycleActive(ix, day, false)),
        change: headline((d) => lifecycleActive(ix, d, false)),
        note: 'Installs 15 days old or older: the free tier unless they paid.',
        comparisons: d7((d) => lifecycleActive(ix, d, false)),
        chart: chart('Over the range', (d) => lifecycleActive(ix, d, false), '#c98500'),
      },
      {
        key: 'crash',
        label: 'Crashes',
        value: int(f.crashInstalls),
        change: headline((d) => faultDay(ix, d).crashInstalls),
        note: `${int(f.crashOccurrences)} occurrences${active ? ` · ${pct((f.crashInstalls / active) * 100, 1)} of actives` : ''}. Install-days, not phones.`,
        comparisons: d7((d) => faultDay(ix, d).crashInstalls),
        splits: [{ title: 'Store', parts: parts(STORES, f.crashPlatforms), format: int }],
        chart: chart('Over the range', (d) => faultDay(ix, d).crashInstalls, '#e66767'),
      },
      {
        key: 'fail',
        label: 'Failures',
        value: int(f.installs),
        change: headline((d) => faultDay(ix, d).installs),
        note: `${int(f.occurrences)} occurrences across ${f.signatures} distinct failures. Crashes included.`,
        comparisons: d7((d) => faultDay(ix, d).installs),
        splits: [{ title: 'Store', parts: parts(STORES, f.platforms), format: int }],
        chart: chart('Over the range', (d) => faultDay(ix, d).installs, '#e66767'),
      },
    ];
  }, [ix, ctx, day, isToday]);

  const ages = useMemo(() => activeByCohort(ix, day), [ix, day]);

  return (
    <>
      <MetricTiles specs={specs} />
      <Card>
        <StackedBars
          title="Who is using it"
          keys={[
            { key: 'trial', label: 'In trial (D0–14)', color: '#199e70' },
            { key: 'past', label: 'Past trial (D15+)', color: '#c98500' },
          ]}
          rows={ages.map((a) => ({ x: `D${a.age}`, values: a.age <= 14 ? { trial: a.count, past: 0 } : { trial: 0, past: a.count } }))}
          summary={`${int(ages.reduce((t, a) => t + a.count, 0))} by install age`}
        />
        <Note>That day's actives by how old their install is. Dominated by the youngest bars means activity is propped up by acquisition; a long tail means older installs keep coming back.</Note>
      </Card>
    </>
  );
}

/* ========================================================= THIS RANGE */

function RangeSection({
  ix,
  ctx,
  growthMode,
  setGrowthMode,
  buildMode,
  setBuildMode,
  weekdayMetric,
  setWeekdayMetric,
}: {
  ix: UsageIndex;
  ctx: Ctx;
  growthMode: 'count' | 'share';
  setGrowthMode: (m: 'count' | 'share') => void;
  buildMode: 'count' | 'share';
  setBuildMode: (m: 'count' | 'share') => void;
  weekdayMetric: 'downloads' | 'fresh' | 'back' | 'hrv' | 'ledger' | 'sub';
  setWeekdayMetric: (m: 'downloads' | 'fresh' | 'back' | 'hrv' | 'ledger' | 'sub') => void;
}) {
  const { snap } = useData();
  const { days } = ctx;
  const n = days.length;
  const xl = shortDate;

  const specs = useMemo<MetricSpec[]>(() => {
    const avg = (ds: string[], f: (d: string) => number) => (ds.length ? ds.reduce((t, d) => t + f(d), 0) / ds.length : 0);
    const avgChange = (f: (d: string) => number): Change => {
      if (!ctx.prevDays) return null;
      const prev = avg(ctx.prevDays, f);
      return prev ? { value: avg(days, f), base: prev } : null;
    };
    const mr = measureRate(ix, days);
    const mrPrev = ctx.prevDays ? measureRate(ix, ctx.prevDays) : null;
    const subs = days.reduce((t, d) => t + totalOn(ix, 'sub', d), 0);
    const ev = days.reduce((a, d) => {
      const e = entry(ix, 'sub', d);
      a.V += e?.evidence.V ?? 0;
      a.S += e?.evidence.S ?? 0;
      return a;
    }, { V: 0, S: 0 });
    const installs = days.reduce((t, d) => t + newOn(ix, d), 0);
    const chart = (fn: (d: string) => number | null, color?: string) => ({ title: 'Per day', series: series(days, fn), format: int, color });
    return [
      {
        key: 'back',
        label: 'Returning / day',
        value: int(avg(days, (d) => returningOn(ix, d))),
        change: avgChange((d) => returningOn(ix, d)),
        note: 'The line to watch: first runs follow the store, only returning activity means the product is holding anyone.',
        comparisons: ctx.prevDays ? [{ label: `Previous ${n} days`, value: int(avg(ctx.prevDays, (d) => returningOn(ix, d))) }] : [],
        chart: chart((d) => returningOn(ix, d)),
      },
      {
        key: 'installs',
        label: 'Installs in range',
        value: int(installs),
        change: rangeChange(ctx, (d) => newOn(ix, d)),
        splits: [{ title: 'Store', parts: parts(STORES, platformsOver(ix, 'open', days, true)), format: int }],
        chart: chart((d) => newOn(ix, d), '#199e70'),
      },
      {
        key: 'subs',
        label: 'Subscriptions reported',
        value: int(subs),
        change: rangeChange(ctx, (d) => totalOn(ix, 'sub', d)),
        comparisons: [
          { label: 'Restored', value: int(days.reduce((t, d) => t + totalOn(ix, 'rst', d), 0)) },
          { label: 'Lapsed', value: int(days.reduce((t, d) => t + totalOn(ix, 'lap', d), 0)) },
        ],
        splits: [
          { title: 'Store', parts: parts(STORES, platformsOver(ix, 'sub', days)), format: int },
          {
            title: 'How it was known',
            parts: [
              { key: 'V', label: 'Within 1h of a tap', value: ev.V, color: '#199e70' },
              { key: 'S', label: 'No tap', value: ev.S, color: '#c98500' },
              { key: 'O', label: 'Older build', value: Math.max(0, subs - ev.V - ev.S), color: C.unknown },
            ],
            format: int,
          },
        ],
        chart: chart((d) => totalOn(ix, 'sub', d), '#199e70'),
      },
      {
        key: 'active',
        label: 'Active / day',
        value: int(avg(days, (d) => activeOn(ix, d))),
        change: avgChange((d) => activeOn(ix, d)),
        chart: chart((d) => activeOn(ix, d)),
      },
      {
        key: 'act',
        label: 'First readings in range',
        value: int(days.reduce((t, d) => t + totalOn(ix, 'act', d), 0)),
        change: rangeChange(ctx, (d) => knownTotal(ix, 'act', d)),
        splits: [{ title: 'Sensor', parts: parts(SENSORS, slotsOver(ix, 'act', days)), format: int }],
        chart: chart((d) => knownTotal(ix, 'act', d)),
      },
      {
        key: 'rate',
        label: 'Measured per active day',
        value: pct(mr.pct),
        change: null,
        note: `${int(mr.readings)} readings over ${int(mr.active)} active install-days${mr.blind ? `; ${mr.blind} days before the reading counter are left out` : ''}.`,
        comparisons: [{ label: `vs previous ${n} days`, value: mrPrev && mr.pct !== null && mrPrev.pct !== null ? pts(mr.pct - mrPrev.pct) : '–' }],
        chart: {
          title: 'Per day',
          series: series(days, (d) => (known(ix, 'hrv', d) && activeOn(ix, d) ? (totalOn(ix, 'hrv', d) / activeOn(ix, d)) * 100 : null)),
          format: (v: number) => pct(v),
          unknownBefore: ix.firstDay.hrv,
        },
      },
    ];
  }, [ix, ctx, days, n]);

  const growth = days.map((d) => ({ x: d, values: { back: returningOn(ix, d), fresh: newOn(ix, d) } }));
  const actSlots = slotsOver(ix, 'act', days);
  const hrvSlots = slotsOver(ix, 'hrv', days.filter((d) => !!ix.hrvMethodFirst && d >= ix.hrvMethodFirst));
  const mr = measureRate(ix, days);
  const knownHrv = days.filter((d) => known(ix, 'hrv', d));
  const half = Math.ceil(knownHrv.length / 2);
  const halves = knownHrv.length >= 6 ? [measureRate(ix, knownHrv.slice(0, half)), measureRate(ix, knownHrv.slice(half))] : null;
  const funnel = captureFunnel(ix, days);
  const payDays = days.filter((d) => known(ix, 'pay', d));
  const pays = payDays.reduce((t, d) => t + totalOn(ix, 'pay', d), 0);
  const payActive = payDays.reduce((t, d) => t + activeOn(ix, d), 0);
  const walls = slotsOver(ix, 'pay', days);
  const wallTotal = Object.entries(walls).reduce((t, [k, v]) => (k === 'S' ? t : t + v), 0);
  const topWall = WALLS.filter((w) => w.key !== 'S' && w.key !== '?').sort((a, b) => (walls[b.key] || 0) - (walls[a.key] || 0))[0];
  const proShare = (k: PingKind) => {
    const t = tiersOver(ix, k, days);
    const named = (t.P || 0) + (t.T || 0) + (t.F || 0);
    return named ? ((t.P || 0) / named) * 100 : null;
  };
  const builds = buildsOver(ix, days);
  const versions = Object.keys(builds).sort(compareVersions);
  const topVersions = versions.filter((v) => v !== '?').slice(0, 6);
  const vKeys: Key[] = [
    ...topVersions.map((v, i) => ({ key: v, label: `v${v}`, color: VERSION_RING[i % VERSION_RING.length] })),
    { key: 'other', label: 'Older', color: '#6c6c72' },
    { key: '?', label: 'Not stated', color: '#2e2e33' },
  ];
  const offers = offerFunnel(ix, days);
  const fdays = days.map((d) => ({ d, f: faultDay(ix, d) }));
  const lineRows = (lines: { kind: PingKind; L?: string; label: string }[]) =>
    lines
      .map((ln) => {
        const ds = days.filter((d) => known(ix, ln.kind, d));
        const total = ds.reduce((t, d) => t + (ln.L ? slotOn(ix, ln.kind, d, ln.L) : totalOn(ix, ln.kind, d)), 0);
        const act = ds.reduce((t, d) => t + activeOn(ix, d), 0);
        return { label: ln.label, value: int(total), sub: act ? `${pct((total / act) * 100, 1)} of active install-days` : undefined, total };
      })
      .filter((r) => r.total > 0);
  const plat = platformsOver(ix, 'open', days);

  // Weekday pattern: Monday-first averages, with the most recent of each.
  const weekdayValue = (d: string): number | null => {
    switch (weekdayMetric) {
      case 'downloads': {
        const es = (snap?.load?.entries || []).filter((e) => e.date === d && (ix.platform === 'all' || e.platform === ix.platform));
        return es.length ? es.reduce((t, e) => t + (e.downloads || 0), 0) : null;
      }
      case 'fresh':
        return newOn(ix, d);
      case 'back':
        return returningOn(ix, d);
      case 'hrv':
        return knownTotal(ix, 'hrv', d);
      case 'ledger':
        return (snap?.load?.sales || [])
          .filter((x) => x.date === d && !x.refunded && (ix.platform === 'all' || x.platform === ix.platform))
          .reduce((t, x) => t + x.qty, 0);
      default:
        return totalOn(ix, 'sub', d);
    }
  };
  const wd = WD_MON.map(() => ({ sum: 0, count: 0, last: null as number | null, lastDate: null as string | null }));
  days.forEach((d) => {
    const v = weekdayValue(d);
    if (v === null) return;
    const w = wd[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
    w.sum += v;
    w.count += 1;
    w.last = v;
    w.lastDate = d;
  });
  const wdRet = retentionByInstallWeekday(ix, ctx.cohorts, 7);

  return (
    <>
      <Section title="This range" note={`${shortDate(ctx.from)} – ${shortDate(ctx.last)} · ${n} days`} />
      <MetricTiles specs={specs} />

      <Card>
        <Segmented
          options={[
            { key: 'count', label: 'Count' },
            { key: 'share', label: 'Share' },
          ]}
          value={growthMode}
          onChange={setGrowthMode}
        />
        <StackedBars
          title="Growth & usage"
          keys={WHO}
          rows={growth}
          xLabel={xl}
          percent={growthMode === 'share'}
          summary={`avg ${int(growth.reduce((t, r) => t + r.values.back + r.values.fresh, 0) / Math.max(1, n))}/day`}
        />
        <Note>Returning is the line to watch: first runs rise and fall with the store, but only returning activity means the app is holding anyone.</Note>
      </Card>

      <Card>
        <StackedBars
          title="How the first reading is taken"
          keys={lettersOf(SENSORS, actSlots)}
          rows={days.map((d) => ({ x: d, values: known(ix, 'act', d) ? entry(ix, 'act', d)?.slots ?? {} : null }))}
          xLabel={xl}
          summary={`${int(Object.values(actSlots).reduce((a, b) => a + b, 0))} first readings`}
        />
        <Note>Which sensor the activating reading used. Apple Watch exists on iPhone only, so filter to iOS to read its share honestly.</Note>
      </Card>

      <Card>
        <StackedBars
          title="How readings are taken"
          keys={lettersOf(SENSORS, hrvSlots)}
          rows={days.map((d) => ({ x: d, values: ix.hrvMethodFirst && d >= ix.hrvMethodFirst ? entry(ix, 'hrv', d)?.slots ?? {} : null }))}
          xLabel={xl}
          summary={`${int(Object.values(hrvSlots).reduce((a, b) => a + b, 0))} install-days`}
        />
        <Note>Each install counts once a day, under the sensor of that day's first reading.</Note>
      </Card>

      <Card>
        <OverlayBars
          title="Opened vs measured"
          back={{ key: 'open', label: 'Opened', color: C.series }}
          front={{ key: 'hrv', label: 'Measured', color: '#5ac8fa' }}
          rows={days.map((d) => ({ x: d, back: activeOn(ix, d), front: knownTotal(ix, 'hrv', d) }))}
          xLabel={xl}
          summary={pct(mr.pct)}
        />
        <Rows
          rows={[
            { label: 'Measured per active day', value: pct(mr.pct, 1), sub: `${int(mr.readings)} readings / ${int(mr.active)} actives` },
            ...(halves && halves[0].pct !== null && halves[1].pct !== null
              ? [{ label: 'Second half vs first', value: pts(halves[1].pct - halves[0].pct) }]
              : []),
          ]}
        />
        <Note>The gap between the bars is people launching the app without using it, the shape that precedes churn.</Note>
      </Card>

      <Card>
        <OverlayBars
          title="Started vs completed"
          back={{ key: 'cap', label: 'Started', color: '#d95926' }}
          front={{ key: 'hrv', label: 'Completed', color: '#199e70' }}
          rows={days.map((d) => ({ x: d, back: knownTotal(ix, 'cap', d), front: known(ix, 'cap', d) ? knownTotal(ix, 'hrv', d) : null }))}
          xLabel={xl}
          summary={pct(funnel.pct)}
        />
        <Rows
          rows={SENSORS.filter((k) => k.key !== '?')
            .map((k) => ({ k, f: captureFunnel(ix, days, k.key) }))
            .filter((x) => x.f.started > 0)
            .sort((a, b) => b.f.started - a.f.started)
            .map(({ k, f }) => ({ label: k.label, value: pct(f.pct), sub: `${int(f.completed)} of ${int(f.started)} completed` }))}
        />
        <Note>A start with no completion is the app asking for something the person could not give it: a strap that would not pair, a session too long.</Note>
      </Card>

      <Card>
        <OverlayBars
          title="Opened vs paywalled"
          back={{ key: 'open', label: 'Opened', color: C.series }}
          front={{ key: 'pay', label: 'Paywalled', color: '#c98500' }}
          rows={days.map((d) => ({ x: d, back: activeOn(ix, d), front: knownTotal(ix, 'pay', d) }))}
          xLabel={xl}
          summary={payActive ? pct((pays / payActive) * 100, 1) : '–'}
        />
        <Rows
          rows={[
            { label: 'Met the paywall', value: payActive ? pct((pays / payActive) * 100, 1) : '–', sub: `${int(pays)} of ${int(payActive)} active install-days` },
            { label: 'Subscriptions those days', value: int(payDays.reduce((t, d) => t + totalOn(ix, 'sub', d), 0)) },
          ]}
        />
      </Card>

      <Card>
        <StackedBars
          title="Which wall they meet first"
          keys={lettersOf(WALLS, walls)}
          rows={days.map((d) => ({ x: d, values: known(ix, 'pay', d) ? entry(ix, 'pay', d)?.slots ?? {} : null }))}
          xLabel={xl}
          summary={topWall && walls[topWall.key] ? `${topWall.label} ${pct((walls[topWall.key] / Math.max(1, wallTotal)) * 100)}` : ''}
        />
        <Note>The first wall each install met that day: the app's front door to Pro, not how often each feature is locked. Settings is somebody who went looking.</Note>
      </Card>

      <Card>
        <StackedBars title="Who is in the app" keys={lettersOf(TIERS, tiersOver(ix, 'open', days))} rows={days.map((d) => ({ x: d, values: entry(ix, 'open', d)?.tiers ?? null }))} xLabel={xl} />
        <Rows
          rows={[
            { label: 'Pro share of actives', value: pct(proShare('open'), 1) },
            { label: 'Pro share of people measuring', value: pct(proShare('hrv'), 1) },
            { label: 'Pro share of people meeting walls', value: pct(proShare('pay'), 1) },
          ]}
        />
      </Card>

      <Card>
        <Segmented
          options={[
            { key: 'count', label: 'Count' },
            { key: 'share', label: 'Share' },
          ]}
          value={buildMode}
          onChange={setBuildMode}
        />
        <StackedBars
          title={buildMode === 'share' ? 'How fast a release spreads' : 'What they are running'}
          keys={vKeys}
          rows={days.map((d) => {
            const b = entry(ix, 'open', d)?.builds;
            if (!b) return { x: d, values: null };
            const v: Record<string, number> = {};
            Object.entries(b).forEach(([ver, c]) => {
              const k = ver === '?' ? '?' : topVersions.includes(ver) ? ver : 'other';
              v[k] = (v[k] || 0) + c;
            });
            return { x: d, values: v };
          })}
          xLabel={xl}
          percent={buildMode === 'share'}
          summary={topVersions[0] ? `v${topVersions[0]} ${pct(((builds[topVersions[0]] || 0) / Math.max(1, Object.values(builds).reduce((a, b) => a + b, 0))) * 100)}` : ''}
        />
        <Note>Active installs by app version: the difference between shipped and fixed. An OTA update shows as a near-vertical edge in Share.</Note>
      </Card>

      <Card title="Offers">
        <StackedBars
          title="What became of them"
          keys={OUTCOMES}
          rows={days.map((d) => {
            const f = offerFunnel(ix, [d]);
            return { x: d, values: f.shown || f.accepted || f.dismissed ? { acc: f.accepted, dis: f.dismissed, ign: f.ignored } : null };
          })}
          xLabel={xl}
          summary={`${int(offers.shown)} raised`}
        />
        <Rows
          rows={[
            { label: 'Raised', value: int(offers.shown) },
            { label: 'Accepted', value: `${int(offers.accepted)} · ${pct(offers.acceptPct)}`, sub: 'The buy button was tapped, not a purchase' },
            ...(['A', 'F'] as const)
              .map((L) => ({ L, f: offerFunnel(ix, days, L) }))
              .filter((x) => x.f.shown > 0)
              .map(({ L, f }) => ({ label: L === 'A' ? 'Half-off annual' : 'Founding member', value: `${pct(f.acceptPct)} accepted`, sub: `${int(f.shown)} shown · ${int(f.dismissed)} dismissed` })),
          ]}
        />
      </Card>

      <Card title="What people do in there">
        <Rows rows={[...lineRows(DO_LINES), { label: 'Installs reporting a first failure', value: int(days.reduce((t, d) => t + (knownTotal(ix, 'err', d) ?? 0), 0)) }]} />
        <Note>Each line is a headcount for that one thing; somebody who did two of them is in both.</Note>
      </Card>

      <Card title="What they log">
        {lineRows(LOG_LINES).length ? <Rows rows={lineRows(LOG_LINES)} /> : <Note>Nothing logged in this range.</Note>}
        <Note>Logged by hand only: edits, live captures and health imports are not counted.</Note>
      </Card>

      <Card title="What they dig into">
        {lineRows(DIG_LINES).length ? <Rows rows={lineRows(DIG_LINES)} /> : <Note>Nothing in this range.</Note>}
      </Card>

      <Section title="Crashes and failures" note="Install-days, not phones" />
      <Card>
        <StackedBars
          title="Crashes a day"
          keys={STORES}
          rows={fdays.map(({ d, f }) => ({ x: d, values: f.crashPlatforms }))}
          xLabel={xl}
          summary={int(fdays.reduce((t, x) => t + x.f.crashInstalls, 0))}
        />
        <Note>Uncaught failures: the app went down in front of somebody.</Note>
      </Card>
      <Card>
        <StackedBars
          title="Failures a day"
          keys={STORES}
          rows={fdays.map(({ d, f }) => ({ x: d, values: f.platforms }))}
          xLabel={xl}
          summary={int(fdays.reduce((t, x) => t + x.f.installs, 0))}
        />
        <Note>Every reported failure, crashes plus everything the app caught and handled.</Note>
      </Card>

      <Card>
        <StackedBars title="iOS vs Android" keys={STORES} rows={days.map((d) => ({ x: d, values: entry(ix, 'open', d)?.platforms ?? null }))} xLabel={xl} />
        <Rows
          rows={[
            { label: 'iOS share', value: plat.I + plat.A ? pct((plat.I / (plat.I + plat.A)) * 100) : '–' },
            { label: 'Android share', value: plat.I + plat.A ? pct((plat.A / (plat.I + plat.A)) * 100) : '–' },
            { label: 'Named a store', value: plat.I + plat.A + plat.U ? pct(((plat.I + plat.A) / (plat.I + plat.A + plat.U)) * 100) : '–' },
          ]}
        />
        <Note>Always unfiltered: it is what the platform filter is a slice of.</Note>
      </Card>

      <Card title="Weekday pattern">
        <Chips
          options={[
            { key: 'fresh', label: 'First runs' },
            { key: 'back', label: 'Returning' },
            { key: 'hrv', label: 'Readings' },
            { key: 'downloads', label: 'Downloads' },
            { key: 'ledger', label: 'Purchases' },
            { key: 'sub', label: 'Subscribe pings' },
          ]}
          value={weekdayMetric}
          onChange={setWeekdayMetric}
        />
        <WeekdayChart stats={wd.map((w) => ({ avg: w.count ? w.sum / w.count : null, count: w.count, last: w.last, lastDate: w.lastDate }))} />
        <Text style={s.subhead}>D7 retention by install weekday</Text>
        <Rows
          rows={WD_MON.map((w, i) => ({
            label: w,
            value: wdRet[i].available ? pct(wdRet[i].pct) : '–',
            sub: `${int(wdRet[i].installs)} installs${wdRet[i].immature ? ` · ${wdRet[i].immature} too young` : ''}`,
          }))}
        />
      </Card>
    </>
  );
}

/* ======================================================= ALL INSTALLS */

function LifeSection({
  ix,
  ctx,
  curveMode,
  setCurveMode,
  trendAge,
  setTrendAge,
  releases,
}: {
  ix: UsageIndex;
  ctx: Ctx;
  curveMode: 'all' | 'split';
  setCurveMode: (m: 'all' | 'split') => void;
  trendAge: '1' | '3' | '7' | '14';
  setTrendAge: (a: '1' | '3' | '7' | '14') => void;
  releases: { date: string; label: string }[];
}) {
  const { cohorts } = ctx;
  const installs = cohorts.reduce((t, c) => t + cohortSize(ix, c), 0);

  const specs = useMemo<MetricSpec[]>(() => {
    const tile = (key: string, label: string, r: ReturnType<typeof retentionAt>, note: string): MetricSpec => ({
      key,
      label,
      value: r.available ? pct(r.pct) : '–',
      note,
      comparisons: [
        { label: 'Installs counted', value: int(r.of) },
        { label: 'Of them', value: int(r.kept) },
        ...(r.immature ? [{ label: 'Cohorts too young', value: int(r.immature) }] : []),
        ...(r.small && r.available ? [{ label: 'Sample', value: 'small' }] : []),
      ],
    });
    return [
      tile('d1', 'D1 retention', retentionAt(ix, cohorts, 1), 'Opened the app exactly one day after installing.'),
      tile('d7', 'D7 retention', retentionAt(ix, cohorts, 7), 'Opened on exactly day 7.'),
      tile('d14', 'D14 retention', retentionAt(ix, cohorts, 14), 'The last day of the trial.'),
      tile('d30', 'D30 retention', retentionAt(ix, cohorts, 30), 'Opened on exactly day 30.'),
      tile('a0', 'Activated on day 0', activation(ix, cohorts, 0), 'Took a first reading the day they installed.'),
      tile('a7', 'Activated by D7', activation(ix, cohorts, 7), 'Took a first reading within a week.'),
      tile('c7', 'Converted by D7', conversion(ix, cohorts, 7), 'A subscription reported within a week of installing.'),
      tile('c30', 'Converted by D30', conversion(ix, cohorts, 30), 'A subscription reported within 30 days.'),
    ];
  }, [ix, cohorts]);

  /* Curves start at D1 (D0 is 100% by definition and would flatten every
     other day into the floor) and drop any point resting on fewer than
     SMALL_COHORT installs, which is where a tail turns into noise. */
  const curveAll = curve(ix, cohorts, 60);
  const split = cohorts.length >= 4 ? splitFor(cohorts, releases) : null;
  const splitCurves = split ? [curve(ix, split.earlier, 60), curve(ix, split.recent, 60)] : null;
  const curveLen = Math.max(curveAll.length, ...(splitCurves ? splitCurves.map((c) => c.length) : [0]));
  const ages = Array.from({ length: Math.max(0, curveLen - 1) }, (_, i) => i + 1);
  const xs = ages.map((n0) => `D${n0}`);
  const at = (cv: { n: number; pct: number | null; of?: number }[], n0: number) => {
    const p = cv.find((q) => q.n === n0);
    return p && (p.of === undefined || p.of >= SMALL_COHORT) ? p.pct : null;
  };

  const survivalPoints = [0, 1, 7, 14, 15, 30].map((n0) => ({ n: n0, r: retentionAt(ix, cohorts, n0) })).filter((x) => x.r.available);
  const transition = boundaryTransition(ix, cohorts);

  const presence = presenceCurve(ix, cohorts, 45).filter((p) => p.n >= 1 && p.of >= SMALL_COHORT);
  const intensityRows = [1, 8, 15, 22].map((n0) => ({ n: n0, p: presenceAt(ix, cohorts, n0) })).filter((x) => x.p.available);
  const d3 = presenceAt(ix, cohorts, 3);

  const weeks = presenceByWeek(ix, cohorts, Number(trendAge));
  const lastFull = [...weeks].reverse().find((w) => w.pct !== null && !w.partial);
  const ci = lastFull && lastFull.pct !== null && lastFull.of ? 1.96 * Math.sqrt(((lastFull.pct / 100) * (1 - lastFull.pct / 100)) / lastFull.of) * 100 : null;

  const heat = cohortHeat(ix, cohorts);
  const purchaseAges = eventAges(ix, 'sub');
  const actAges = eventAges(ix, 'act');
  const measuring = measuringCurve(ix, cohorts, 60);
  const habitAges = Array.from({ length: Math.max(0, Math.max(curveAll.length, measuring.length) - 1) }, (_, i) => i + 1);
  const mix = sensorMixByAge(ix, cohorts, 30);
  const mixKeys = SENSORS.filter((k) => mix.some((m) => m.slots[k.key]));

  return (
    <>
      <Section title="All installs" note={`${cohorts.length} cohorts born ${shortDate(ctx.from)} – ${shortDate(ctx.last)} · ${int(installs)} installs`} />
      <MetricTiles specs={specs} />

      <Card>
        <Segmented
          options={[
            { key: 'all', label: 'All cohorts' },
            { key: 'split', label: 'Earlier vs recent' },
          ]}
          value={curveMode}
          onChange={setCurveMode}
        />
        <Lines
          title="Retention curve"
          xs={xs}
          guide={{ index: 13, label: 'trial ends' }}
          series={
            curveMode === 'split' && split && splitCurves
              ? [
                  { key: 'e', label: split.earlierLabel, color: '#8a8a90', values: ages.map((n0) => at(splitCurves[0], n0)) },
                  { key: 'r', label: split.recentLabel, color: C.series, values: ages.map((n0) => at(splitCurves[1], n0)) },
                ]
              : [{ key: 'all', label: 'Opened on day N', color: C.series, values: ages.map((n0) => at(curveAll, n0)) }]
          }
        />
        <Note>Share of each cohort opening the app exactly N days after installing, pooled over every cohort old enough to reach that day. Attendance, not survival: a skipped day reads as churn.</Note>
      </Card>

      <Card>
        <BarChart
          title="Crossing the boundary"
          series={survivalPoints.map((x) => ({ day: `D${x.n}`, value: x.r.pct ?? 0 }))}
          summary={transition.points === null ? '' : `D14 → D15 ${pts(transition.points)}`}
          format={(v) => pct(v)}
          xLabel={(k) => k}
        />
        <Rows
          rows={[
            { label: 'D14 (last trial day)', value: pct(transition.before.pct, 1), sub: `${int(transition.before.of)} installs old enough for D15` },
            { label: 'D15 (first free day)', value: pct(transition.after.pct, 1) },
            { label: 'Change across the boundary', value: pts(transition.points) },
          ]}
        />
        <Note>Both sides measured over the same installs, so a change cannot be a shifting denominator.</Note>
      </Card>

      <Card>
        <Lines
          title="Still here, or here today?"
          xs={presence.map((p) => `D${p.n}`)}
          guide={presence.findIndex((p) => p.n === 14) >= 0 ? { index: presence.findIndex((p) => p.n === 14), label: 'trial ends' } : undefined}
          series={[
            { key: 'alive', label: 'Alive that week', color: C.series, values: presence.map((p) => p.alive) },
            { key: 'one', label: 'Opened on exactly day N', color: '#8a8a90', dashed: true, values: presence.map((p) => p.dayOne) },
          ]}
        />
        <Rows
          rows={[
            ...(d3.available ? [{ label: 'At D3', value: `${pct(d3.dayOnePct)} vs ${pct(d3.alivePct)}`, sub: 'here that day vs alive that week' }] : []),
            ...intensityRows.map((x) => ({
              label: `Week from D${x.n}`,
              value: x.p.intensity === null ? '–' : `${(x.p.intensity * 7).toFixed(1)} / 7 days`,
              sub: `how often the ${pct(x.p.alivePct)} still alive opened`,
            })),
          ]}
        />
        <Note>Alive is each cohort's busiest day across the week as a floor on how many were still around. The gap to the dashed line is people who are still here but not every day.</Note>
      </Card>

      <Card title="Is retention improving?">
        <Chips
          options={[
            { key: '1', label: 'D1' },
            { key: '3', label: 'D3' },
            { key: '7', label: 'D7' },
            { key: '14', label: 'D14' },
          ]}
          value={trendAge}
          onChange={setTrendAge}
        />
        <BarChart
          title={`Alive at D${trendAge}, by install week`}
          series={weeks.map((w) => ({ day: w.week, value: w.pct ?? 0 }))}
          summary={lastFull ? `${pct(lastFull.pct)}${ci !== null ? ` ±${ci.toFixed(0)}` : ''}` : ''}
          format={(v) => pct(v)}
          xLabel={(k) => `wk ${shortDate(k)}`}
        />
        <Note>
          {ci !== null && ci > 15
            ? 'The newest complete week is too small to read: its 95% interval is wider than 15 points.'
            : 'One age across every weekly cohort in birth order, so a real gain shows as a step rather than being diluted by history.'}
        </Note>
      </Card>

      <Card title="Cohort retention">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={s.heatRow}>
              <Text style={[s.heatHead, s.heatFirst]}>Week</Text>
              {MILESTONES.map((m) => (
                <Text key={m} style={s.heatHead}>
                  D{m}
                </Text>
              ))}
            </View>
            {heat.slice(0, 16).map((w) => (
              <View key={w.week} style={s.heatRow}>
                <Text style={[s.heatLabel, s.heatFirst]} numberOfLines={1}>
                  {shortDate(w.week)} <Text style={{ color: C.muted }}>{int(w.size)}</Text>
                </Text>
                {w.cells.map((c) => (
                  <View
                    key={c.n}
                    style={[
                      s.heatCell,
                      c.pct === null ? null : { backgroundColor: `rgba(37,99,235,${(0.12 + (c.pct / 100) * 0.88).toFixed(2)})` },
                      c.partial && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed' },
                    ]}
                  >
                    <Text style={[s.heatText, num]}>{c.pct === null ? '' : Math.round(c.pct)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <Note>Weekly cohorts, newest first, with their size. A dashed cell has some of that week too young for the day.</Note>
      </Card>

      <Card>
        <BarChart
          title="Purchase timing"
          series={purchaseAges.buckets.map((b) => ({ day: b.label, value: b.value }))}
          summary={`${int(purchaseAges.buckets.reduce((t, b) => t + b.value, 0))} purchases`}
          xLabel={(k) => k}
          color="#199e70"
        />
        <Rows
          rows={[
            { label: 'Bought by D7', value: pct(conversion(ix, cohorts, 7).pct, 1) },
            { label: 'Bought by D30', value: pct(conversion(ix, cohorts, 30).pct, 1) },
          ]}
        />
        <Note>How old the install was when a subscription was reported. D15 is the first day on the free tier.</Note>
      </Card>

      <Card>
        <BarChart
          title="Activation"
          series={actAges.buckets.map((b) => ({ day: b.label, value: b.value }))}
          summary={`${int(actAges.buckets.reduce((t, b) => t + b.value, 0))} first readings`}
          xLabel={(k) => k}
        />
        <Rows
          rows={[0, 1, 7].map((w) => ({ label: w ? `Activated by D${w}` : 'Activated on day 0', value: pct(activation(ix, cohorts, w).pct, 1) }))}
        />
      </Card>

      <Card>
        <Lines
          title="The habit curve"
          xs={habitAges.map((n0) => `D${n0}`)}
          guide={{ index: 13, label: 'trial ends' }}
          series={[
            { key: 'open', label: 'Opened', color: C.series, values: habitAges.map((n0) => at(curveAll, n0)) },
            { key: 'hrv', label: 'Measured', color: '#5ac8fa', values: habitAges.map((n0) => at(measuring, n0)) },
          ]}
        />
        <Rows
          rows={[1, 7, 14, 30]
            .filter((n0) => habitAges.includes(n0))
            .map((n0) => ({
              label: `D${n0}`,
              value: `${pct(at(curveAll, n0))} · ${pct(at(measuring, n0))}`,
              sub: 'opened · measured',
            }))}
        />
        <Note>Retention and measuring on one axis by install age. The gap between the lines is the finding.</Note>
      </Card>

      <Card>
        <StackedBars
          title="Sensor mix by install age"
          keys={mixKeys}
          rows={mix.map((m) => ({ x: `D${m.n}`, values: m.total ? m.slots : null }))}
          xLabel={(k) => k}
          percent
        />
        <Note>Which sensors readings are taken with as installs get older, as shares of each age's readings.</Note>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 4, gap: 10 },
  sectionTitle: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sectionNote: { color: C.muted, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  subhead: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  rows: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  rowLabel: { color: C.dim, fontSize: 14 },
  rowSub: { color: C.muted, fontSize: 11, marginTop: 1 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  heatFirst: { width: 78, textAlign: 'left' },
  heatHead: { width: 34, color: C.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  heatLabel: { color: C.dim, fontSize: 11 },
  heatCell: { width: 34, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center' },
  heatText: { color: C.text, fontSize: 11, fontWeight: '600' },
});
