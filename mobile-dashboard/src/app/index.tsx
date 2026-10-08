/* The one screen. A sticky date header picks the day, the bottom bar picks
   the view. At a glance reads the store funnel over a range ending on that
   day; the other views read that one day. Every ping counter is per US
   Eastern day. While the selected day is today it is still filling, so the
   ping views give it neutral reference numbers rather than a red/green delta
   against whole days; a past day is complete and gets the delta. */
import { useCallback, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { BottomBar } from '../components/BottomBar';
import { ToastStack } from '../components/AlertViews';
import { BarChart, Chips, WeekdayChart } from '../components/charts';
import { DateHeader } from '../components/DateHeader';
import { FILTER_BAR_GAP, FILTER_BAR_HEIGHT, FilterBar } from '../components/FilterBar';
import { Card, Screen, Segmented } from '../components/ui';
import { AccountView } from '../features/AccountView';
import { glanceSpecs } from '../features/specs';
import { UsageView } from '../features/UsageView';
import { SalesView } from '../features/SalesView';
import { ForecastView } from '../features/ForecastView';
import { ErrorsView } from '../features/ErrorsView';
import { PingsView } from '../features/PingsView';
import { LinksView } from '../features/LinksView';
import { Glide, MetricTiles } from '../components/MetricTiles';
import { useData } from '../lib/data';
import { addDays, ago, easternDay, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import { pingRows } from '../lib/metrics';
import { buildBase, downloadBuckets, summarize, weekdayStats, type Field, type StoreFilter } from '../lib/store';
import { useView, VIEWS } from '../lib/views';
import { C } from '../theme';


export default function Main() {
  const { snap, loading, error, refresh } = useData();
  const view = useView();
  const today = easternDay();
  const [picked, setPicked] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [glance, setGlance] = useState<GlanceState>({ range: '30', mode: 'period', metric: 'downloads', platform: 'all' });
  const patchGlance = useCallback((p: Partial<GlanceState>) => setGlance((g) => ({ ...g, ...p })), []);
  const dk = picked && picked < today ? picked : today;
  const isToday = dk === today;

  /* How far back the calendar goes. Usage and errors live in the ping report,
     which starts at its own `since`; sales and the store funnel read the
     ledger and the store imports, which go back further, so those views open
     the calendar to the first day either holds. */
  const pingsSince = snap?.pings?.since ?? null;
  const ledgerSince = useMemo(() => {
    let first: string | null = null;
    for (const r of [...(snap?.load?.sales ?? []), ...(snap?.load?.entries ?? [])]) if (r.date && (!first || r.date < first)) first = r.date;
    return first;
  }, [snap]);
  const earliest =
    view === 'sales' || view === 'glance'
      ? [pingsSince, ledgerSince].filter((d): d is string => !!d).sort()[0] ?? null
      : pingsSince;
  const opensByDay = useMemo(() => pingRows(snap?.pings, 'open'), [snap]);
  const maxOpens = useMemo(() => Math.max(1, ...[...opensByDay.values()].map((r) => r.total)), [opensByDay]);
  const intensity = useCallback((d: string) => (opensByDay.get(d)?.total ?? 0) / maxOpens, [opensByDay, maxOpens]);

  const onChange = (next: string, d: 1 | -1) => {
    setDir(d);
    setPicked(next >= today ? null : next);
  };

  /* Views that read a day get the date header; views that read a range of it
     also get the floating range + store filter. */
  const dated = view === 'glance' || view === 'usage' || view === 'sales' || view === 'errors';
  const filtered = dated;
  const title = VIEWS.find((v) => v.key === view)?.label;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen
        onRefresh={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          refresh();
        }}
        refreshing={false}
        bottomExtra={filtered ? FILTER_BAR_HEIGHT + FILTER_BAR_GAP : 0}
        topBar={dated ? <DateHeader dk={dk} today={today} earliest={earliest} intensity={intensity} onChange={onChange} /> : undefined}
        title={dated ? undefined : title}
      >
        {dated ? (
          /* A fixed-height row: a spinner slot, the text, and an empty slot of
             the same width, so the text stays centred and nothing moves when
             the spinner comes and goes. */
          <View style={s.status}>
            <View style={s.statusSlot}>{loading ? <ActivityIndicator size="small" color={C.dim} /> : null}</View>
            <Text style={s.statusText}>{loading ? 'Updating…' : snap ? `Updated ${ago(snap.at)}` : 'Loading…'}</Text>
            <View style={s.statusSlot} />
          </View>
        ) : null}

        {error ? (
          <Card>
            <Text style={{ color: C.down, fontSize: 14 }}>{error}</Text>
          </Card>
        ) : null}

        {!snap ? (
          <Card>
            <ActivityIndicator color={C.dim} />
          </Card>
        ) : !dated ? (
          <Animated.View key={view} entering={FadeIn.duration(180)} style={{ gap: 12 }}>
            {view === 'forecast' ? (
              <ForecastView platform={glance.platform} />
            ) : view === 'pings' ? (
              <PingsView />
            ) : view === 'links' ? (
              <LinksView />
            ) : (
              <AccountView />
            )}
          </Animated.View>
        ) : (
          <Animated.View key={`${view}|${dk}`} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(220)} style={{ gap: 12 }}>
            {view === 'usage' ? (
              <UsageView dk={dk} isToday={isToday} range={glance.range} platform={glance.platform} />
            ) : view === 'sales' ? (
              <SalesView dk={dk} range={glance.range} platform={glance.platform} />
            ) : view === 'errors' ? (
              <ErrorsView dk={dk} range={glance.range} platform={glance.platform} />
            ) : (
              <Glance dk={dk} st={glance} set={patchGlance} />
            )}
          </Animated.View>
        )}
      </Screen>
      {filtered ? (
        <FilterBar
          platform={glance.platform}
          onPlatform={(platform) => patchGlance({ platform })}
          ranges={RANGES}
          range={glance.range}
          onRange={(range) => patchGlance({ range })}
        />
      ) : null}
      <ToastStack raisedBy={filtered ? FILTER_BAR_HEIGHT + FILTER_BAR_GAP : 0} />
      <BottomBar />
    </View>
  );
}

export type RangeKey = '7' | '30' | '90' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7', label: '7D' },
  { key: '30', label: '30D' },
  { key: '90', label: '90D' },
  { key: 'all', label: 'All' },
];
type ChartMode = 'period' | 'cumulative';
const DOW_METRICS: { key: Field; label: string; color: string }[] = [
  { key: 'downloads', label: 'Downloads', color: C.series },
  { key: 'sales', label: 'Paid', color: '#199e70' },
  { key: 'pageViews', label: 'Page views', color: '#3987e5' },
  { key: 'impressions', label: 'Impressions', color: '#d95926' },
  { key: 'revenue', label: 'Revenue', color: '#c98500' },
];
/* Past this many days, the downloads chart buckets by week. */
const WEEKLY_AFTER = 120;

const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/** The view-level choices that must survive a date change (the content
 *  remounts on every new day). */
export type GlanceState = {
  range: RangeKey;
  mode: ChartMode;
  metric: Field;
  platform: StoreFilter;
};

/**
 * At a glance: the web dashboard's Overview, over a range ENDING on the
 * selected date. Store numbers (downloads, impressions, page views) come from
 * the imported store reports and sales from the ledger, both stores combined.
 * A delta is shown only when the previous window is fully covered by data,
 * otherwise "up 391%" just means it predates the first entry.
 */
function Glance({ dk, st, set }: { dk: string; st: GlanceState; set: (patch: Partial<GlanceState>) => void }) {
  const { snap } = useData();
  const b = useMemo(() => buildBase(snap ?? null, st.platform), [snap, st.platform]);
  const cur = snap?.load?.settings?.currency || '$';
  const lastEntry = b.lastReported;
  const m = useMemo(() => {
    /* Store reports arrive by import and lag a day or two. A day after the
       last import is NOT YET REPORTED, not zero, so the store-fed charts stop
       there rather than drawing a collapse (and a weekday reading -100%). */
    const storeTo = lastEntry && lastEntry < dk ? lastEntry : dk;
    const ledgerMetric = st.metric === 'sales' || st.metric === 'revenue';
    let from = st.range === 'all' ? (b.min ?? dk) : addDays(dk, -(Number(st.range) - 1));
    if (b.min && from < b.min) from = b.min;
    if (from > dk) from = dk;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -spanDays(from, dk));
    const deltaOK = st.range !== 'all' && !!b.min && prevFrom >= b.min;
    const grain = spanDays(from, dk) > WEEKLY_AFTER ? 'week' : 'day';
    return {
      from,
      specs: glanceSpecs(snap ?? null, st.platform, b, { from, to: dk, prevFrom, prevTo, deltaOK }),
      s: summarize(b, from, dk),
      buckets: downloadBuckets(b, from, dk, grain),
      grain,
      storeTo,
      dow: weekdayStats(b, from, ledgerMetric || from > storeTo ? dk : storeTo, st.metric),
    };
  }, [snap, b, dk, st.range, st.metric, st.platform, lastEntry]);
  const { s, specs } = m;
  const metric = DOW_METRICS.find((x) => x.key === st.metric) ?? DOW_METRICS[0];
  const dowFormat = st.metric === 'revenue' ? (n: number) => money(n, cur) : (n: number) => (n >= 10 ? int(n) : n.toFixed(1));
  const series = m.buckets.map((x) => ({ day: x.key, value: st.mode === 'cumulative' ? x.cumDownloads : x.downloads }));

  return (
    <>

      <MetricTiles specs={specs} />

      <Glide>
      <Card>
        <Segmented
          options={[
            { key: 'period', label: 'Per period' },
            { key: 'cumulative', label: 'Cumulative' },
          ]}
          value={st.mode}
          onChange={(mode) => set({ mode })}
        />
        <BarChart
          title={st.mode === 'cumulative' ? 'All installs to date' : m.grain === 'week' ? 'Downloads per week' : 'Downloads per day'}
          series={series}
          summary={st.mode === 'cumulative' ? int(series[series.length - 1]?.value ?? 0) : int(s.downloads)}
          color={DOW_METRICS[0].color}
          format={int}
          unknownAfter={m.storeTo < dk ? m.storeTo : null}
        />
        <Text style={s_.foot}>
          First-time downloads from the store reports{lastEntry ? `, recorded through ${shortDate(lastEntry)}` : ''}.
        </Text>
      </Card>
      </Glide>

      <Glide>
      <Card title="By day of week">
        <Chips options={DOW_METRICS.map(({ key, label }) => ({ key, label }))} value={st.metric} onChange={(metric) => set({ metric })} />
        <WeekdayChart stats={m.dow} color={metric.color} format={dowFormat} />
        <Text style={s_.foot}>
          Average per weekday over the range. The white tick is the most recent one, and the figure under each day is how it did
          against that average. Store numbers stop at the last import.
        </Text>
      </Card>
      </Glide>
    </>
  );
}

const s_ = StyleSheet.create({
  foot: { color: C.muted, fontSize: 12 },
});


const s = StyleSheet.create({
  status: { height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: C.muted, fontSize: 12, lineHeight: 20 },
  heroLabel: { color: C.dim, fontSize: 15, fontWeight: '600' },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  hero: { color: C.text, fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 70 },
  heroSub: { color: C.muted, fontSize: 13 },
  tileSub: { color: C.muted, fontSize: 12 },
  foot: { color: C.muted, fontSize: 12, paddingHorizontal: 4 },
  section: { color: C.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, paddingHorizontal: 4 },
});
