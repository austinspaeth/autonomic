/* The one screen. A sticky date header picks the day, the bottom bar picks
   the view. On a wide screen (an iPad, a Mac window) nothing is picked: every
   view is on one board, in columns, under the one date and filter (`Board`).
   The rest of this note is about what the views read. At a glance reads the store funnel over a range ending on that
   day; the other views read that one day. Every ping counter is per US
   Eastern day. While the selected day is today it is still filling, so the
   ping views give it neutral reference numbers rather than a red/green delta
   against whole days; a past day is complete and gets the delta. */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { BottomBar } from '../components/BottomBar';
import { AlertHistory, ToastStack } from '../components/AlertViews';
import { BarChart, Chips, WeekdayChart } from '../components/charts';
import { DateHeader } from '../components/DateHeader';
import { FILTER_BAR_GAP, FILTER_BAR_HEIGHT, FilterBar } from '../components/FilterBar';
import { BOTTOM_CHROME, Card, KEYBOARD_SCROLL, Screen, Segmented } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { glanceSpecs } from '../features/specs';
import { UsageView } from '../features/UsageView';
import { SalesView } from '../features/SalesView';
import { ForecastView, HORIZONS, type Horizon } from '../features/ForecastView';
import { ErrorsView } from '../features/ErrorsView';
import { PingsView } from '../features/PingsView';
import { LinksView } from '../features/LinksView';
import { CodesView } from '../features/CodesView';
import { Glide, MetricTiles } from '../components/MetricTiles';
import { useData } from '../lib/data';
import { useZoom } from '../lib/zoom';
import { CrispZoomView } from '../../modules/crisp-zoom';
import { addDays, ago, easternDay, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import { pingRows } from '../lib/metrics';
import { buildIndex } from '../lib/usage';
import { buildBase, downloadBuckets, summarize, weekdayStats, type Field, type StoreFilter } from '../lib/store';
import { BOARD, BOARD_GROUPS, openPanel, usePanel, useView, VIEWS, type ViewKey } from '../lib/views';
import { ALERTS_PANEL_W, BOARD_COLUMN_MIN, BOARD_GAP_X, BOARD_GAP_Y, BOARD_GUTTER, BoardTitle, BoardWidth, CardWidth, LANDSCAPE_COLS, LANDSCAPE_GAP, NAV_H, useLandscape, useWide, WIDE_FILTER_H, WIDE_FILTER_MARGIN } from '../lib/wide';
import { C } from '../theme';


export default function Main() {
  const { snap, loading, error, refresh } = useData();
  const view = useView();
  const today = easternDay();
  const [picked, setPicked] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [glance, setGlance] = useState<GlanceState>({ range: '30', mode: 'period', metric: 'downloads', platform: 'all' });
  const [horizon, setHorizon] = useState<Horizon>('12');
  const patchGlance = useCallback((p: Partial<GlanceState>) => setGlance((g) => ({ ...g, ...p })), []);
  /* A phone on its side always reads today: it is a glance, with no room
     for the date control. */
  const landscape = useLandscape();
  const dk = !landscape && picked && picked < today ? picked : today;
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
  const filtered = dated || view === 'forecast';
  const title = VIEWS.find((v) => v.key === view)?.label;
  /* Wide: the filter bar floats clear of the bottom edge on its own, always
     there, and carries the date control. */
  const wide = useWide();
  const panel = usePanel();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const dateEl = dated && !wide ? <DateHeader dk={dk} today={today} earliest={earliest} intensity={intensity} onChange={onChange} /> : null;
  const filterRoom = wide ? WIDE_FILTER_H + WIDE_FILTER_MARGIN + 10 : !filtered ? 0 : FILTER_BAR_HEIGHT + FILTER_BAR_GAP;

  /* One view's cards. A phone shows one of these; the board shows them all. */
  const body = (key: ViewKey) =>
    key === 'usage' ? (
      <UsageView dk={dk} isToday={isToday} range={glance.range} platform={glance.platform} />
    ) : key === 'sales' ? (
      <SalesView dk={dk} range={glance.range} platform={glance.platform} />
    ) : key === 'errors' ? (
      <ErrorsView dk={dk} range={glance.range} platform={glance.platform} />
    ) : key === 'glance' ? (
      <Glance dk={dk} st={glance} set={patchGlance} />
    ) : key === 'forecast' ? (
      <ForecastView platform={glance.platform} horizon={horizon} />
    ) : key === 'pings' ? (
      <PingsView />
    ) : key === 'codes' ? (
      <CodesView />
    ) : (
      <LinksView />
    );
  const statusEl = (
    /* A fixed-height row: a spinner slot, the text, and an empty slot of
       the same width, so the text stays centred and nothing moves when
       the spinner comes and goes. */
    <View style={s.status}>
      <View style={s.statusSlot}>{loading ? <ActivityIndicator size="small" color={C.dim} /> : null}</View>
      <Text style={s.statusText}>{loading ? 'Updating…' : snap ? `Updated ${ago(snap.at)}` : 'Loading…'}</Text>
      <View style={s.statusSlot} />
    </View>
  );
  const errorEl = error ? (
    <Card>
      <Text style={{ color: C.down, fontSize: 14 }}>{error}</Text>
    </Card>
  ) : null;

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Screen
          onRefresh={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            refresh();
          }}
          refreshing={false}
          bottomExtra={filterRoom}
        >
          {errorEl}
          {!snap ? (
            <Card>
              <ActivityIndicator color={C.dim} />
            </Card>
          ) : (
            <Board body={body} bottomRoom={filterRoom} reflow={`${dk}|${glance.range}|${glance.platform}|${snap.pingsFullAt ?? 0}`} taken={error ? 70 : 0} />
          )}
        </Screen>
        <FilterBar
          platform={glance.platform}
          onPlatform={(platform) => patchGlance({ platform })}
          ranges={RANGES}
          range={glance.range}
          onRange={(range) => patchGlance({ range })}
          date={<DateHeader bare dk={dk} today={today} earliest={earliest} intensity={intensity} onChange={onChange} />}
        />
        {/* The visited views, each a panel over the board. */}
        <Sheet visible={!!panel} onClose={() => openPanel(null)} title={VIEWS.find((v) => v.key === panel)?.label} full bleed>
          {() =>
            panel ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator={false} {...KEYBOARD_SCROLL}>
                {/* The forecast looks forward, so it has its own span, not the range. */}
                {panel === 'forecast' ? <Segmented compact options={HORIZONS} value={horizon} onChange={setHorizon} /> : null}
                {body(panel)}
              </ScrollView>
            ) : null
          }
        </Sheet>
        <ToastStack raisedBy={filterRoom} />
        <BottomBar />
      </View>
    );
  }

  /* A phone on its side. One band at the bottom holds the view and its
     filter (it always reads today); today's alerts stand in a panel on the
     right, always open; and
     the four board views are a strip of three columns that scrolls sideways
     and never down (`Strip`). The visited views keep a plain list. */
  if (landscape) {
    const panelW = ALERTS_PANEL_W + insets.right;
    const above = insets.bottom + BOTTOM_CHROME;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.sideMain, { right: panelW, bottom: above }]}>
          {!snap ? (
            <View style={s.sideCenter}>{errorEl ?? <ActivityIndicator color={C.dim} />}</View>
          ) : BOARD.includes(view) ? (
            <Animated.View key={`${view}|${dk}`} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(220)} style={{ flex: 1 }}>
              <Strip>
                {errorEl}
                {body(view)}
              </Strip>
            </Animated.View>
          ) : (
            <ScrollView
              {...KEYBOARD_SCROLL}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24, paddingLeft: 16 + insets.left, paddingRight: 16, gap: 12 }}
            >
              {errorEl}
              <Animated.View key={view} entering={FadeIn.duration(180)} style={{ gap: 12 }}>
                {body(view)}
              </Animated.View>
            </ScrollView>
          )}
        </View>
        {/* Runs to the right edge: a panel of rows can sit under the
            rounded corner, so it does not keep the safe inset clear. */}
        <View style={[s.alerts, { width: panelW, bottom: above, paddingTop: insets.top + 12 }]}>
          <AlertHistory compact />
        </View>
        <ToastStack area={{ left: 0, width: winW - panelW }} />
        <BottomBar
          filter={
            view === 'forecast' ? (
              <FilterBar platform={glance.platform} onPlatform={(platform) => patchGlance({ platform })} ranges={HORIZONS} range={horizon} onRange={setHorizon} />
            ) : filtered ? (
              <FilterBar platform={glance.platform} onPlatform={(platform) => patchGlance({ platform })} ranges={RANGES} range={glance.range} onRange={(range) => patchGlance({ range })} />
            ) : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen
        onRefresh={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          refresh();
        }}
        refreshing={false}
        bottomExtra={filterRoom}
        topBar={dateEl ?? undefined}
        title={dated || view === 'forecast' || view === 'pings' ? undefined : title}
      >
        {dated ? statusEl : null}

        {errorEl}

        {!snap ? (
          <Card>
            <ActivityIndicator color={C.dim} />
          </Card>
        ) : !dated ? (
          <Animated.View key={view} entering={FadeIn.duration(180)} style={{ gap: 12 }}>
            {body(view)}
          </Animated.View>
        ) : (
          <Animated.View key={`${view}|${dk}`} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(220)} style={{ gap: 12 }}>
            {body(view)}
          </Animated.View>
        )}
      </Screen>
      {view === 'forecast' ? (
        <FilterBar platform={glance.platform} onPlatform={(platform) => patchGlance({ platform })} ranges={HORIZONS} range={horizon} onRange={setHorizon} />
      ) : filtered ? (
        <FilterBar
          platform={glance.platform}
          onPlatform={(platform) => patchGlance({ platform })}
          ranges={RANGES}
          range={glance.range}
          onRange={(range) => patchGlance({ range })}
        />
      ) : null}
      <ToastStack raisedBy={filterRoom} />
      <BottomBar />
    </View>
  );
}

/* Growing the board (another column, or more height) is only allowed for this
   long after something that legitimately re-flows it. Past that, an overflow
   is a card the reader just opened, and re-columning the whole board under
   their finger would be worse than letting it run off the edge. */
const SETTLE_MS = 2500;

/**
 * The wide screen's one page: the day's views as ONE flow of cards that runs
 * down a column and wraps into the next, in a box exactly as tall as the
 * window has to give, so nothing is below the fold while the window can hold
 * it (or, failing that, STACKED: see below). It fits itself: it starts at two columns and, while the flow still runs
 * off the right edge, adds a column (narrowing them all) down to the
 * narrowest a card can be; only then does it give up on one screen and grow
 * taller, which is the one case that scrolls.
 *
 * The cards are the views' own top-level cards, unwrapped: a view returns a
 * fragment, so its cards land directly in the flow and can wrap one by one.
 * Each is told the column width through `BoardWidth`.
 *
 * Every GROUP of sections (`BOARD_GROUPS`) starts its own column: a group is its own wrapping flow, as
 * tall as the board, and the sections stand side by side. So a section's
 * title is always at the top of a column and its cards wrap into as many
 * columns as they need without running off the bottom. That costs the tail of
 * each section's last column, so it is only done while the window can give
 * every section a column of its own; narrower than that, the board falls back
 * to one continuous flow.
 */
function Board({ body, bottomRoom, reflow, taken }: { body: (key: ViewKey) => ReactNode; bottomRoom: number; /** Changes when the content legitimately re-flows. */ reflow: string; /** Height used above the board. */ taken: number }) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  /* Zoom: the board is laid out for a window 1/zoom the size and then drawn
     at zoom, so zooming out genuinely makes room for more columns and more
     rows rather than just shrinking a layout that still does not fit. */
  const zoom = useZoom();
  const avail = (winW - BOARD_GUTTER * 2) / zoom;
  const maxCols = Math.max(1, Math.floor((avail + BOARD_GAP_X) / (BOARD_COLUMN_MIN + BOARD_GAP_X)));
  const room = Math.max(320, winH - insets.top - NAV_H - 12 - taken - (insets.bottom + BOTTOM_ROOM + bottomRoom)) / zoom;
  const key = `${winW}x${winH}|${zoom}|${reflow}`;
  const split = maxCols >= BOARD_GROUPS.length;
  const start = split ? BOARD_GROUPS.length : Math.min(2, maxCols);
  const [fit, setFit] = useState({ key, cols: start, tall: 1, stacked: false });
  const [inner, setInner] = useState({ w: 0, h: 0 });
  const since = useRef(Date.now());
  // A new window size, zoom or content starts the fitting over.
  const cur = fit.key === key ? fit : { key, cols: start, tall: 1, stacked: false };
  if (cur !== fit) {
    since.current = Date.now();
    setFit(cur);
  }
  /* STACKED is what the board falls back to when even its narrowest columns
     cannot hold everything on one screen: one column per group, as wide as
     they can be, each simply as tall as its cards, and the page scrolls. A
     board that has to scroll anyway is better read as three whole sections
     than as a wrap with a nearly empty last column. Zooming out is how to
     get back to one screen. */
  const stacked = split && cur.stacked;
  const cols = stacked ? BOARD_GROUPS.length : Math.min(cur.cols, maxCols);
  const colW = Math.floor((avail - BOARD_GAP_X * (cols - 1)) / cols);
  const measured = (w: number, h: number) => {
    setInner((cur0) => (cur0.w === w && cur0.h === h ? cur0 : { w, h }));
    if (stacked || w <= avail + 1 || Date.now() - since.current > SETTLE_MS) return;
    setFit((f) => (f.key !== key ? f : f.cols < maxCols ? { ...f, cols: f.cols + 1 } : split ? { ...f, stacked: true } : { ...f, tall: f.tall + 0.25 }));
  };
  const height = Math.round(room * cur.tall);
  const label = (k: ViewKey) => VIEWS.find((v) => v.key === k)?.label ?? null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      {/* The outer box is the board's size on screen; the inner one is its
          size as laid out, scaled from its top left corner. It is a
          CrispZoomView so what is inside is REDRAWN at the zoomed resolution
          rather than stretched, which is what blurred it. */}
      <View style={{ width: Math.ceil(inner.w * zoom), height: Math.ceil((stacked ? inner.h : height) * zoom) }}>
        <CrispZoomView
          zoom={zoom}
          onLayout={(e) => measured(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
          style={[s.sections, { position: 'absolute', left: 0, top: 0, height: stacked ? undefined : height, transform: [{ scale: zoom }], transformOrigin: 'left top' }]}
        >
          <BoardWidth.Provider value={colW}>
            {split ? (
              BOARD_GROUPS.map((group) => (
                <View key={group[0]} style={stacked ? s.stack : [s.board, { height }]}>
                  {group.map((k) => (
                    <BoardTitle.Provider key={k} value={label(k)}>
                      {body(k)}
                    </BoardTitle.Provider>
                  ))}
                </View>
              ))
            ) : (
              <View style={[s.board, { height }]}>
                {BOARD.map((k) => (
                  <BoardTitle.Provider key={k} value={label(k)}>
                    {body(k)}
                  </BoardTitle.Provider>
                ))}
              </View>
            )}
          </BoardWidth.Provider>
        </CrispZoomView>
      </View>
    </ScrollView>
  );
}

/**
 * A phone on its side: one view's cards as a strip that scrolls SIDEWAYS.
 * The cards are the view's own, unwrapped (a view returns a fragment), told
 * the column width through `BoardWidth`, and they flow down a column exactly
 * as tall as the space above the bottom band, wrapping into the next. Metric
 * tiles and buttons take a third of the visible width each; a card (a chart,
 * a table) takes nearly all of it (`CardWidth`), so a chart is never squeezed
 * into a third of the screen. The rest are a swipe away. Being on the board
 * also means a metric tile opens as a side panel rather than growing in place
 * and shoving the flow around.
 */
function Strip({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const padL = 16 + insets.left;
  const padR = 16;
  const visible = box.w - padL - padR;
  const colW = Math.floor((visible - LANDSCAPE_GAP * (LANDSCAPE_COLS - 1)) / LANDSCAPE_COLS);
  const top = insets.top + STRIP_PAD;
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      }}
    >
      {box.w ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: padL, paddingRight: padR, paddingTop: top }}
        >
          <View style={[s.strip, { height: box.h - top - STRIP_PAD }]}>
            <BoardWidth.Provider value={colW}>
              <CardWidth.Provider value={visible}>{children}</CardWidth.Provider>
            </BoardWidth.Provider>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
const STRIP_PAD = 12;

/** What the Screen pads under its content, besides the floating controls. */
const BOTTOM_ROOM = 24;

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
  /* The conversion cards read the app's own pings. Kept apart from the memo
     below, which re-runs on every chip, so the index is built once per day. */
  const usage = useMemo(
    () => ({
      all: buildIndex(snap?.pings, st.platform, dk),
      ios: st.platform === 'all' ? buildIndex(snap?.pings, 'ios', dk) : null,
      android: st.platform === 'all' ? buildIndex(snap?.pings, 'android', dk) : null,
    }),
    [snap, st.platform, dk],
  );
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
      specs: glanceSpecs(snap ?? null, st.platform, b, { from, to: dk, prevFrom, prevTo, deltaOK }, usage),
      s: summarize(b, from, dk),
      buckets: downloadBuckets(b, from, dk, grain),
      grain,
      storeTo,
      dow: weekdayStats(b, from, ledgerMetric || from > storeTo ? dk : storeTo, st.metric),
    };
  }, [snap, b, usage, dk, st.range, st.metric, st.platform, lastEntry]);
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
  stack: { flexDirection: 'column', rowGap: BOARD_GAP_Y },
  strip: { flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start', columnGap: LANDSCAPE_GAP, rowGap: 12 },
  sideMain: { position: 'absolute', top: 0, left: 0 },
  sideCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  alerts: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingLeft: 12,
    paddingRight: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    backgroundColor: '#0b0b0c',
  },
  board: { flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start', columnGap: BOARD_GAP_X, rowGap: BOARD_GAP_Y },
  sections: { flexDirection: 'row', alignItems: 'flex-start', columnGap: BOARD_GAP_X },
  status: { height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: C.muted, fontSize: 12, lineHeight: 20 },
  heroLabel: { color: C.dim, fontSize: 15, fontWeight: '600' },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  hero: { color: C.text, fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 70 },
  heroSub: { color: C.muted, fontSize: 13 },
  tileSub: { color: C.muted, fontSize: 12 },
  foot: { color: C.muted, fontSize: 12, paddingHorizontal: 4 },
});
