import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, InteractionManager, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing as REasing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { BottomFade, Screen } from '../../src/components/Header';
import { Icon } from '../../src/components/Icon';
import { HelpDot, ScoreDot, Segmented } from '../../src/components/ui';
import { Bars, BpDumbbell, LineChart, StackedBars, ZonesToggle, useChartsBlur } from '../../src/components/charts';
import { fonts, radius, usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { useTier } from '../../src/store/tier';
import { usePaywall } from '../../src/features/Paywall';
import { buildCategories, type AnalysisCard, type BpPeriod, type OrthoTransition } from '../../src/lib/analysis/categories';
import { resolveProtocol, type DaysMap } from '../../src/lib/scoring/day';
import { catFromBands, type Mode } from '../../src/lib/analysis/buckets';
import { HrvFilterLinks, HrvProgress, type Filt } from '../../src/features/HrvProgress';
import { demoDays, hasOwnData } from '../../src/lib/demo';
import { DemoBanner, DEMO_PROGRESS_TEXT } from '../../src/features/DemoBanner';

export default function AnalysisScreen() {
  const p = usePalette();
  const state = useAppState();
  // Nothing logged yet: chart the sample month behind a "demo data" banner
  // rather than an empty view. Swaps to their own data on the first entry.
  const demo = !hasOwnData(state.days);
  const days = demo ? demoDays() : state.days;
  // Freemium: free tier keeps the Day view; the longer ranges are Pro. Locked
  // segments render a lock glyph and raise the paywall instead of switching.
  const locked = useTier() === 'free';
  const openPaywall = usePaywall();
  // HRV filter lives here (not inside HrvProgress) so the same All/Morning/Evening
  // toggle can appear both inline beside the section title and in the pinned bar.
  const [hrvFilt, setHrvFilt] = useState<Filt>('all');
  const sex = state.profile.sex;
  const height = state.profile.height;

  const scrollRef = useRef<ScrollView>(null);
  const [headerH, setHeaderH] = useState(0);

  // Pinned-section tracking runs as a Reanimated worklet: the per-frame scan
  // (which section header has scrolled up to the bottom of the top bar) stays
  // on the UI thread, so scrolling never contends with the chart trees for JS
  // time. JS only hears runOnJS(setPinned) on an actual handoff — as one title
  // slides behind the blur the pinned bar adopts it, and the next section takes
  // over when its title reaches the line.
  const offsetsSv = useSharedValue<Record<string, number>>({});  // section id -> y in the scroll content
  const headerSv = useSharedValue(0);
  const lastYSv = useSharedValue(0);
  const dirSv = useSharedValue(1);                               // +1 = scrolling down, -1 = up
  const activeSv = useSharedValue<string | null>(null);
  const [pinned, setPinnedState] = useState<{ id: string; dir: number } | null>(null);
  const pinnedRef = useRef<string | null>(null);
  const setPinned = useCallback((id: string | null, dir: number) => {
    pinnedRef.current = id;
    setPinnedState(id ? { id, dir } : null);
  }, []);

  /* ── Range switching ──────────────────────────────────────────────────────
   * `mode` is what the control shows and flips the instant a segment is
   * tapped; `chartMode` is what's actually rendered. They have to be separate
   * because committing a range rebuilds every category and mounts a screenful
   * of charts — work that blocks the JS *and* UI threads, so an animation
   * running through it stalls whichever driver it's on. Earlier attempts here
   * (defer the swap by a fixed delay; slide the old content out first) all had
   * the pill and the commit sharing a window, or left the viewport empty while
   * they didn't.
   *
   * So instead: the pill moves on the UI thread the moment it's pressed (see
   * `Segmented`, which owes nothing to React), a skeleton veil fades over the
   * document in ~110ms, and the commit happens only once that veil is opaque —
   * where a dropped frame costs nothing. The veil carries the *same section
   * titles*, so it reads as the page recalculating rather than a new screen
   * loading, and it hides the scroll reposition that used to dump you back at
   * the top. It lifts as soon as the new tree has laid out, with a floor so a
   * cheap switch can't blink and a ceiling so a slow one can't strand you. */
  const [mode, setMode] = useState<Mode>('day');
  const [chartMode, setChartMode] = useState<Mode>('day');
  const modeRef = useRef<Mode>('day');
  const chartModeRef = useRef<Mode>('day');
  // The veil's contents are snapshotted at tap time (`items`) and start at the
  // section we'll restore the scroll to, so what it shows lines up with what's
  // underneath when it lifts.
  const [veil, setVeil] = useState<{ from: number; items: VeilItem[] } | null>(null);
  const veilOp = useSharedValue(0);
  const stage = useRef<'idle' | 'in' | 'opaque' | 'out'>('idle');
  const fadeStarted = useRef(false);
  const pending = useRef<Mode | null>(null);
  const anchor = useRef<{ id: string; index: number } | null>(null);
  const awaitingBody = useRef(false);
  const floorAt = useRef(0);
  const timers = useRef<{ ceiling?: ReturnType<typeof setTimeout>; lift?: ReturnType<typeof setTimeout> }>({});
  const sectionsRef = useRef<Section[]>([]);
  useEffect(() => () => {
    if (timers.current.ceiling) clearTimeout(timers.current.ceiling);
    if (timers.current.lift) clearTimeout(timers.current.lift);
  }, []);

  // Put the scroll where the new range should open — the section the user was
  // reading, or the top. Always runs while the veil is opaque, so it's unseen.
  const restore = useCallback(() => {
    if (!awaitingBody.current) return;
    awaitingBody.current = false;
    const a = anchor.current;
    const off = a ? offsetsSv.value[a.id] : null;
    const y = off != null ? Math.max(0, off - headerSv.value - CONTENT_PAD) : 0;
    scrollRef.current?.scrollTo({ y, animated: false });
    lastYSv.value = y;
    // That landing spot is inside the handoff zone, so the anchored section is
    // pinned on arrival — say so now rather than waiting for the scroll event,
    // so the pinned bar's fade-in also happens under the veil.
    if (a && off != null) { activeSv.value = a.id; setPinned(a.id, 1); }
  }, [offsetsSv, headerSv, lastYSv, activeSv, setPinned]);

  const clearVeil = useCallback(() => {
    if (stage.current !== 'out') return;   // a new tap caught it on the way down
    stage.current = 'idle';
    fadeStarted.current = false;
    anchor.current = null;
    setVeil(null);
  }, []);

  const lift = useCallback(() => {
    if (timers.current.ceiling) { clearTimeout(timers.current.ceiling); timers.current.ceiling = undefined; }
    if (timers.current.lift) { clearTimeout(timers.current.lift); timers.current.lift = undefined; }
    if (stage.current !== 'opaque') return;
    restore();                             // no-op unless the ceiling beat the layout
    stage.current = 'out';
    veilOp.value = withTiming(0, VEIL_OUT, (fin) => { if (fin) runOnJS(clearVeil)(); });
  }, [restore, veilOp, clearVeil]);

  const raiseCeiling = useCallback(() => {
    if (timers.current.ceiling) clearTimeout(timers.current.ceiling);
    timers.current.ceiling = setTimeout(lift, VEIL_CEILING_MS);
  }, [lift]);

  const scheduleLift = useCallback(() => {
    if (timers.current.lift) clearTimeout(timers.current.lift);
    timers.current.lift = setTimeout(lift, Math.max(0, floorAt.current - Date.now()));
  }, [lift]);

  // The actual swap. Only ever called with the veil opaque.
  const commitPending = useCallback(() => {
    const to = pending.current;
    if (to == null) return;
    pending.current = null;
    if (to === chartModeRef.current) {
      // Rapid taps landed back on the range already rendered — nothing to
      // rebuild (and no re-render to wait on), so just take the veil down.
      scheduleLift();
      return;
    }
    chartModeRef.current = to;
    // The old range's section offsets mean nothing for the new one. Cleared
    // here rather than in an effect keyed on chartMode, so a late reset can't
    // wipe the offsets the incoming tree seeds during its first layout pass.
    activeSv.value = null;
    offsetsSv.value = {};
    setPinned(null, 1);
    awaitingBody.current = true;
    raiseCeiling();
    setChartMode(to);
  }, [activeSv, offsetsSv, setPinned, raiseCeiling, scheduleLift]);

  const onVeilOpaque = useCallback(() => {
    if (stage.current !== 'in') return;
    stage.current = 'opaque';
    floorAt.current = Date.now() + VEIL_HOLD_MS;
    commitPending();
  }, [commitPending]);

  const fadeUp = useCallback(() => {
    fadeStarted.current = true;
    veilOp.value = withTiming(1, VEIL_IN, (fin) => { if (fin) runOnJS(onVeilOpaque)(); });
  }, [veilOp, onVeilOpaque]);

  // Start the fade only once the veil is mounted and measured: a timing kicked
  // off in the same commit that mounts it would play against a view that isn't
  // on screen yet, and the veil would appear already half-way up.
  const onVeilLayout = useCallback(() => {
    if (stage.current === 'in' && !fadeStarted.current) fadeUp();
  }, [fadeUp]);

  const changeMode = useCallback((m: Mode) => {
    if (m === modeRef.current) return;
    modeRef.current = m;
    setMode(m);            // the pill has already moved itself; this is bookkeeping
    pending.current = m;
    if (stage.current === 'idle') {
      // Where to reopen: whatever section the user was reading. Flipping
      // Day→Week to see the same metric at a coarser resolution shouldn't
      // throw you back to the top of the page.
      const id = pinnedRef.current;
      const i = id ? sectionsRef.current.findIndex((s) => s.id === id) : -1;
      anchor.current = id && i > 0 ? { id, index: i } : null;
      stage.current = 'in';
      fadeStarted.current = false;
      const from = anchor.current ? anchor.current.index : 0;
      setVeil({ from, items: veilItems(sectionsRef.current, from) });
    } else if (stage.current === 'opaque') {
      commitPending();       // already hidden — swap straight through
    } else if (stage.current === 'out') {
      stage.current = 'in';  // caught the veil on the way down; back up it goes
      fadeUp();
    }
    // stage === 'in': the fade is already running and will pick up `pending`.
  }, [commitPending, fadeUp]);

  // Time-based downgrade (trial expires while parked on Week/Month/Year).
  useEffect(() => { if (locked && mode !== 'day') changeMode('day'); }, [locked, mode, changeMode]);

  // First layout of the freshly committed range. Children lay out before their
  // parent, so every mounted section has already reported its offset by now.
  const onBodyLayout = useCallback(() => {
    if (!awaitingBody.current) return;
    restore();
    scheduleLift();
  }, [restore, scheduleLift]);

  // Building a range walks the whole journal, so keep the last build per range
  // and pre-warm the rest while the screen is idle. Switching back to a range
  // you've already seen then costs nothing and the veil is pure courtesy. The
  // cache is dropped wholesale whenever any build input changes.
  const buildArgs = useMemo(
    () => ({ days, sex, height, protocol: resolveProtocol(state.settings.protocol), customTypes: state.customTypes }),
    [days, sex, height, state.settings.protocol, state.customTypes],
  );
  const cache = useRef<{ args: typeof buildArgs; byMode: Map<Mode, Section[]> }>({ args: buildArgs, byMode: new Map() });
  if (cache.current.args !== buildArgs) cache.current = { args: buildArgs, byMode: new Map() };
  const build = useCallback((m: Mode): Section[] => {
    const hit = cache.current.byMode.get(m);
    if (hit) return hit;
    const { days: d, ...ctx } = buildArgs;
    const cats = buildCategories(d, m, ctx);
    const built = cats.map((c) => ({ id: c.id, title: c.title, buckets: c.buckets, cards: c.build(), hasOwn: c.hasData?.() ?? false }));
    cache.current.byMode.set(m, built);
    return built;
  }, [buildArgs]);
  const sections = useMemo(() => build(chartMode), [build, chartMode]);
  sectionsRef.current = sections;

  // One range per idle tick, so the warm-up never lands in the middle of a
  // gesture. Skipped on the free tier, where the other ranges aren't reachable.
  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    const todo = MODE_ORDER.filter((m) => m !== chartMode);
    const task = InteractionManager.runAfterInteractions(() => {
      const step = (i: number) => {
        if (cancelled || i >= todo.length) return;
        build(todo[i]);
        requestAnimationFrame(() => step(i + 1));
      };
      step(0);
    });
    return () => { cancelled = true; task.cancel(); };
  }, [build, chartMode, locked]);

  // Outlook always synthesizes a score, so it isn't proof of real data. Treat the
  // whole view as empty unless some *other* category has something logged — that's
  // when the progress charts are actually meaningful. HRV builds no cards (it draws
  // itself), so it answers through `hasOwn` instead.
  const hasData = sections.some((s) => s.id !== 'outlook' && (s.cards.length > 0 || s.hasOwn));

  // Outlook renders untitled at the very top, so it never pins — the sticky
  // bar starts with HRV.
  const pinIds = useMemo(() => sections.filter((s) => s.id !== 'outlook').map((s) => s.id), [sections]);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - lastYSv.value;
      lastYSv.value = y;
      if (Math.abs(dy) > 0.5) dirSv.value = dy > 0 ? 1 : -1;
      let active: string | null = null;
      for (const id of pinIds) {
        const off = offsetsSv.value[id];
        if (off == null) continue;
        if (off - y <= headerSv.value + HANDOFF_LEAD) active = id;
        else break;
      }
      if (active !== activeSv.value) {
        activeSv.value = active;
        runOnJS(setPinned)(active, dirSv.value);
      }
    },
  }, [pinIds, setPinned]);

  // Sections seed their y-offsets from layout (JS side) into the shared map the
  // worklet scans; onLayout re-fires whenever mounting sections shift the list.
  const onSectionLayout = useCallback((id: string, y: number) => {
    offsetsSv.value = { ...offsetsSv.value, [id]: y };
  }, [offsetsSv]);
  const onHeaderHeight = useCallback((h: number) => { setHeaderH(h); headerSv.value = h; }, [headerSv]);

  // Charts are expensive, so sections mount progressively (see the hook below);
  // until a section's turn comes it renders its real title over skeleton cards.
  // While the veil is up we mount straight through to the anchored section
  // instead, so its offset is real before we scroll to it — one bigger commit,
  // entirely hidden, beats waiting several reveal frames with the veil held up.
  const revealed = useProgressiveReveal(sections, veil ? veil.from + INITIAL_SECTIONS : INITIAL_SECTIONS);

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const activeSection = pinned ? sections.find((s) => s.id === pinned.id) : null;
  const active = activeSection ? { id: activeSection.id, title: activeSection.title } : null;

  return (
    <Screen
      scrollRef={scrollRef}
      onScroll={onScroll}
      onHeaderHeight={onHeaderHeight}
      header={
        <View style={{ paddingHorizontal: 16 }}>
          <Segmented
            options={[
              { val: 'day', label: 'Day' },
              { val: 'week', label: 'Week', locked },
              { val: 'month', label: 'Month', locked },
              { val: 'year', label: 'Year', locked },
            ]}
            value={mode}
            onChange={changeMode}
            onLockedPress={openPaywall}
          />
        </View>
      }
      footer={
        <>
          <StickyBar
            headerH={headerH}
            active={active}
            dir={pinned?.dir ?? 1}
            onUp={scrollToTop}
            hrvFilt={hrvFilt}
            setHrvFilt={setHrvFilt}
          />
          {/* Last in the overlay layer, so it covers the pinned bar too — the
              pinned section is one of the things a range change invalidates. */}
          {veil ? (
            <RangeVeil top={headerH} op={veilOp} items={veil.items} banner={demo && veil.from === 0} onLayout={onVeilLayout} />
          ) : null}
        </>
      }
    >
      <View key={chartMode} onLayout={onBodyLayout}>
        {!hasData ? (
          <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 }}>
            Nothing to show yet. Record readings, sleep, activities and more in your Journal and your progress will start populating here.
          </Text>
        ) : (
          <SectionsBody
            sections={sections}
            demo={demo}
            days={days}
            mode={chartMode}
            sex={sex}
            height={height}
            hrvFilt={hrvFilt}
            setHrvFilt={setHrvFilt}
            revealed={revealed}
            onSectionLayout={onSectionLayout}
          />
        )}
      </View>
    </Screen>
  );
}

const MODE_ORDER: Mode[] = ['day', 'week', 'month', 'year'];
// `Screen`'s default contentPadding — the gap an anchored section should keep
// below the header when the veil lifts, matching the veil's own top padding.
const CONTENT_PAD = 16;
/** Veil timings. The fade-in is short enough that the tap still reads as
 *  instantaneous; the hold guarantees a cheap switch can't blink; the ceiling
 *  caps a pathological one (a Year rebuild over a long journal) so the veil can
 *  never be the thing you're waiting on. */
const VEIL_IN = { duration: 110, easing: REasing.out(REasing.quad) };
const VEIL_OUT = { duration: 170, easing: REasing.out(REasing.cubic) };
const VEIL_HOLD_MS = 140;
const VEIL_CEILING_MS = 700;

type Section = { id: string; title: string; buckets: { label: string }[]; cards: AnalysisCard[]; hasOwn: boolean };

/** How many sections mount with real charts on first render — enough to fill
 *  the viewport (Outlook + HRV). */
const INITIAL_SECTIONS = 2;

/** Progressive section mount: the chart trees are expensive, so instead of
 *  mounting all of them in one frame (a visible hitch on tab switch and range
 *  change), the screen renders `initial` sections for real and then reveals one
 *  more per frame until every section is live. Sections never unmount. The
 *  count resets during render whenever `sections` is rebuilt, so the remount
 *  cost of a range change spreads across frames too — resetting in an effect
 *  instead would let one full-mount frame slip through first. A range change
 *  raises `initial` to cover the section it will scroll to (see the caller);
 *  that whole commit happens under the veil, where its cost is invisible. */
function useProgressiveReveal(sections: Section[], initial: number): number {
  const [state, setState] = useState({ key: sections as Section[], shown: initial });
  if (state.key !== sections) setState({ key: sections, shown: initial });
  const shown = state.key === sections ? state.shown : initial;
  useEffect(() => {
    if (shown >= sections.length) return;
    const id = requestAnimationFrame(() =>
      setState((s) => (s.key === sections ? { key: s.key, shown: s.shown + 1 } : s)));
    return () => cancelAnimationFrame(id);
  }, [shown, sections]);
  return shown;
}

type VeilItem = { title: string; cards: number };

/** Snapshot of the on-screen document's shape, from `from` down — section
 *  titles are identical across ranges, so the veil can keep them. */
function veilItems(sections: Section[], from: number): VeilItem[] {
  return sections.slice(from).map((s) => ({
    // Outlook renders untitled at the very top.
    title: s.id === 'outlook' ? '' : s.title,
    cards: s.id === 'hrv' ? 2 : Math.max(1, Math.min(s.cards.length, 3)),
  }));
}

/** The skeleton veil raised over the document while a new range commits: the
 *  same headings over ghost cards, so the page reads as recalculating rather
 *  than as a new screen loading. Opaque by the time anything happens beneath
 *  it, which is what lets the rebuild — and the scroll reposition that goes
 *  with it — be free. Touches are swallowed while it's up; the header (and so
 *  the range control) sits in a layer above it and stays live. */
function RangeVeil({ top, op, items, banner, onLayout }: {
  top: number; op: SharedValue<number>; items: VeilItem[]; banner: boolean; onLayout: () => void;
}) {
  const p = usePalette();
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View
      onLayout={onLayout}
      style={[{
        position: 'absolute', top, left: 0, right: 0, bottom: 0,
        backgroundColor: p.bg, paddingHorizontal: CONTENT_PAD, paddingTop: CONTENT_PAD, overflow: 'hidden',
      }, style]}
    >
      {/* Only when the document below starts at the top, where the banner is. */}
      {banner ? <DemoBanner text={DEMO_PROGRESS_TEXT} /> : null}
      {items.map((it, i) => (
        <View key={i} style={{ marginTop: i === 0 ? 0 : 22 }}>
          {it.title ? (
            <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>{it.title}</Text>
          ) : null}
          <SectionSkeleton cards={it.cards} />
        </View>
      ))}
      <BottomFade />
    </Animated.View>
  );
}

/** The whole document of category sections, memoized as one unit so pinned-bar
 *  handoffs (parent state flipping mid-scroll) never touch the chart trees. */
const SectionsBody = React.memo(function SectionsBody({ sections, demo, days, mode, sex, height, hrvFilt, setHrvFilt, revealed, onSectionLayout }: {
  sections: Section[];
  demo: boolean;
  days: DaysMap;
  mode: Mode;
  sex?: string;
  height?: string;
  hrvFilt: Filt;
  setHrvFilt: (f: Filt) => void;
  revealed: number;
  onSectionLayout: (id: string, y: number) => void;
}) {
  const p = usePalette();
  // Stable identity — HrvProgress keys its aggregation memo on `ctx`.
  const ctx = useMemo(() => ({ sex, height }), [sex, height]);
  return (
    <>
      {demo ? <DemoBanner text={DEMO_PROGRESS_TEXT} /> : null}
      {/* Every category inline as one long document with a titled section. */}
      {sections.map((s, si) => (
        <View key={s.id} onLayout={(e) => onSectionLayout(s.id, e.nativeEvent.layout.y)} style={{ marginTop: si === 0 ? 0 : 22 }}>
          {s.id === 'outlook' ? null : s.id === 'hrv' ? (
            // HRV keeps its All/Morning/Evening pills inline with the title —
            // small and right-aligned so they never overrun the container;
            // the same toggle also rides in the pinned bar once this section pins.
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 34 }}>
              <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text }}>{s.title}</Text>
              <View style={{ flexShrink: 1, marginLeft: 12, alignItems: 'flex-end' }}>
                <HrvFilterLinks value={hrvFilt} onChange={setHrvFilt} />
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>{s.title}</Text>
          )}
          {si >= revealed ? (
            <SectionSkeleton cards={s.id === 'hrv' ? 2 : Math.max(1, Math.min(s.cards.length, 3))} />
          ) : s.id === 'hrv' ? (
            <HrvProgress days={days} mode={mode} ctx={ctx} filt={hrvFilt} />
          ) : s.cards.length === 0 ? (
            <Text style={{ color: p.textDim }}>No data logged yet for this category.</Text>
          ) : (
            s.cards.map((card, i) => <CardView key={i} card={card} buckets={s.buckets} />)
          )}
        </View>
      ))}
    </>
  );
});

/** Placeholder cards shown for the few frames before a section's charts mount:
 *  real card chrome (surface, border, ghost blocks), so a hard fling lands on
 *  skeleton cards rather than blank space. Mounting is top-down, so the swap to
 *  real content happens below the viewport and never reads as a shift. */
function SectionSkeleton({ cards }: { cards: number }) {
  const p = usePalette();
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, height: 280, marginBottom: 12 }}>
          <View style={{ width: 130, height: 11, borderRadius: 6, backgroundColor: p.surface2 }} />
          <View style={{ width: 62, height: 22, borderRadius: 6, backgroundColor: p.surface2, marginTop: 18 }} />
          <View style={{ flex: 1, borderRadius: radius.control, backgroundColor: p.surface2, opacity: 0.55, marginTop: 18 }} />
        </View>
      ))}
    </>
  );
}

type Active = { id: string; title: string } | null;

// One size for section titles everywhere — the inline headers in the document
// and the pinned bar's title must read as the *same* element trading places.
const SECTION_TITLE_SIZE = 20;
// The pin handoff fires as the inline title *touches* the bar (roughly one
// title-height early) instead of after it has fully slid under.
const HANDOFF_LEAD = 28;
// Height of the pinned section bar.
const STICKY_BAR_H = 52;

/**
 * The pinned section bar under the top header. Always mounted (it fades in/out
 * rather than mounting/unmounting a BlurView — the old toggle thrash was the
 * likely source of the occasional crash on range change while scrolled).
 *
 * When the pinned section changes, its title (and, for HRV, the filter pills)
 * cross-fades: the outgoing content slides out opposite the scroll direction and
 * fades away while the incoming content slides in from the direction of travel
 * with a fade-up push — so pinning a later section pushes content up, pinning an
 * earlier one pushes it down.
 */
function StickyBar({ headerH, active, dir, onUp, hrvFilt, setHrvFilt }: {
  headerH: number; active: Active; dir: number; onUp: () => void; hrvFilt: Filt; setHrvFilt: (f: Filt) => void;
}) {
  const p = usePalette();
  const BAR_H = STICKY_BAR_H, SLIDE = 16;
  const shown = active != null;

  // Container fade — presence of any pinned section.
  const containerOp = useRef(new RNAnimated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    RNAnimated.timing(containerOp, { toValue: shown ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [shown, containerOp]);

  // Content swap — two stacked layers driven by one 0→1 phase per transition.
  const [layers, setLayers] = useState<{ out: Active; in: Active }>({ out: null, in: active });
  const phase = useRef(new RNAnimated.Value(1)).current;
  const slideDir = useRef(1);
  const prevId = useRef<string | null>(active?.id ?? null);
  useEffect(() => {
    const id = active?.id ?? null;
    if (id === prevId.current) return;   // same section (dir/title-object churn) — ignore
    prevId.current = id;
    slideDir.current = dir >= 0 ? 1 : -1;
    setLayers((l) => ({ out: l.in, in: active }));
    phase.setValue(0);
    RNAnimated.timing(phase, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [active, dir, phase]);

  const d = slideDir.current;
  const outStyle = {
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -d * SLIDE] }) }],
  };
  const inStyle = {
    opacity: phase,
    transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [d * SLIDE, 0] }) }],
  };

  const layer = (a: Active, style: object, live: boolean) => (
    <RNAnimated.View
      pointerEvents={live ? 'box-none' : 'none'}
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}
    >
      {a ? (
        <>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text }}>{a.title}</Text>
          {a.id === 'hrv' ? (
            <View style={{ flexShrink: 1, marginLeft: 12, alignItems: 'flex-end' }}>
              <HrvFilterLinks value={hrvFilt} onChange={setHrvFilt} />
            </View>
          ) : null}
        </>
      ) : null}
    </RNAnimated.View>
  );

  return (
    <RNAnimated.View pointerEvents={shown ? 'box-none' : 'none'} style={{ position: 'absolute', top: headerH, left: 0, right: 0, opacity: containerOp }}>
      <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', alignItems: 'center', height: BAR_H, paddingHorizontal: 16, backgroundColor: 'rgba(4,4,7,0.97)', borderBottomWidth: 0.5, borderBottomColor: p.border }}>
        <Pressable onPress={onUp} hitSlop={10} style={{ marginLeft: -4, marginRight: 8 }}>
          <Icon name="arrowUp" size={22} color={p.text} />
        </Pressable>
        <View style={{ flex: 1, height: '100%' }}>
          {layer(layers.out, outStyle, false)}
          {layer(layers.in, inStyle, true)}
        </View>
      </BlurView>
    </RNAnimated.View>
  );
}

/**
 * Card container holding the flat section design: an uppercase title + "?" help
 * dot, big flat stat values, a one-line description, then the charts — all on a
 * surface card.
 */
const BP_PERIODS: { val: BpPeriod; label: string }[] = [
  { val: 'all', label: 'All' }, { val: 'morning', label: 'Morning' }, { val: 'evening', label: 'Evening' },
];
const ORTHO_TRANSITIONS: { val: OrthoTransition; label: string }[] = [
  { val: 'all', label: 'All' }, { val: 'lay', label: 'Lay→stand' }, { val: 'sit', label: 'Sit→stand' }, { val: 'stairs', label: 'Stairs' },
];

/** Text-link filter toggle (matching the HRV structured/unstructured/both
 *  style): the active option in bright white with a short underline beneath.
 *  Shared by the BP period filter and the orthostatic transition filter. */
function FilterLinks<T extends string>({ options, value, onChange }: { options: { val: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {options.map((o) => {
        const on = o.val === value;
        return (
          <Pressable key={o.val} onPress={() => onChange(o.val)} hitSlop={6} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : p.textDim }}>{o.label}</Text>
            <View style={{ height: 2, borderRadius: 1, alignSelf: 'stretch', marginTop: 3, backgroundColor: on ? '#fff' : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

const CardView = React.memo(function CardView({ card, buckets }: { card: AnalysisCard; buckets: { label: string }[] }) {
  const p = usePalette();
  // A `selectStat` chart drives the card's first stat: dragging the chart swaps
  // the range average for that bucket's value with its date in parentheses;
  // tapping anywhere outside the chart blurs (null) back to the average.
  const [sel, setSel] = useState<number | null>(null);
  // A selectStat chart hides its own readout/toggle row, so when it has grade
  // zones the card header hosts the "Show zones" link instead.
  const [showZones, setShowZones] = useState(false);
  // Blood-pressure period filter: swaps the dumbbell + avg stats between all,
  // morning-only and evening-only readings. Inert on non-BP cards.
  const [bpFilt, setBpFilt] = useState<BpPeriod>('all');
  const bpSpan = card.bpFilter ? card.bpFilter[bpFilt] : null;
  // Orthostatic transition filter: each variant carries its own charts, stats,
  // insights and grade, so the view swaps them wholesale. Inert elsewhere.
  const [orthoFilt, setOrthoFilt] = useState<OrthoTransition>('all');
  const orthoSpan = card.orthoFilter ? card.orthoFilter[orthoFilt] : null;
  // Bar-row selection (Triggers card): tapping a horizontal bar narrows the
  // bucket chart above the bars to that trigger; any tap elsewhere fires the
  // shared charts-blur and resets it back to the totals.
  const [selBar, setSelBar] = useState<string | null>(null);
  useChartsBlur(useCallback(() => setSelBar(null), []));
  const charts = orthoSpan ? orthoSpan.charts : (card.charts || []);
  const insights = orthoSpan ? orthoSpan.insights : (card.insights || []);
  const orthoEmpty = !!orthoSpan && !charts.some((c) => c.series.some((s) => s.values.some((v) => v != null && !isNaN(v))));
  // selectStat/zones wiring reads the *active* chart list so the ortho variants
  // keep their selection + header zones toggle after a transition-filter swap.
  const selChart = charts.find((c) => c.selectStat);
  const selSeries = selChart?.series.find((s) => !s.dashed) ?? selChart?.series[0];
  const zonesChart = selChart?.zones ? selChart : null;
  // Balance-style readout under the description (POTS cards); ortho carries one
  // per transition variant. When it grades, the "Show zones" link sits top-right.
  const metricsRow = orthoSpan ? orthoSpan.metricsRow : card.metricsRow;
  // A metricsRow card's line chart is tappable like a selectStat chart: the
  // readout metrics map onto the chart series in order, so a selected bucket
  // swaps each value for that bucket's (and the date suffix for its label);
  // any extra metric is the ortho event count. Blur restores the latest entry.
  const metricsChart = metricsRow ? (selChart ?? charts.find((c) => !c.dumbbell)) : null;
  const shownMetrics = useMemo(() => {
    if (!metricsRow || !metricsChart || sel == null || sel < 0) return metricsRow;
    const at = (si: number) => { const v = metricsChart.series[si]?.values[sel]; return v != null && !isNaN(v) ? (metricsChart.integer ? Math.round(v) : Math.round(v * 10) / 10) : null; };
    return {
      ...metricsRow,
      metrics: metricsRow.metrics.map((m, i) => {
        if (i < metricsChart.series.length) {
          const v = at(i);
          return { ...m, value: v, color: v != null && m.regrade ? m.regrade(v) : m.color };
        }
        return orthoSpan ? { ...m, value: orthoSpan.counts[sel] ?? null } : m;
      }),
      suffix: `(${buckets[sel]?.label ?? ''})`,
    };
  }, [metricsRow, metricsChart, sel, orthoSpan, buckets]);
  // Range/data changes rebuild the buckets, so any held selection index no
  // longer points at the same date — drop it.
  useEffect(() => { setSel(null); setSelBar(null); }, [buckets]);
  const showZonesLink = !!zonesChart || !!metricsRow?.zones;
  const stats = useMemo(() => {
    // Ortho: a selected point swaps the whole row to that bucket — the day's
    // average rise/drop and how many events it logged; the row tag beside the
    // stats flips from "avg" to the bucket's date.
    if (orthoSpan) {
      const st = orthoSpan.stats.slice();
      if (selChart && sel != null && sel >= 0) {
        const at = (si: number) => { const v = selChart.series[si]?.values[sel]; return v != null && !isNaN(v) ? Math.round(v) : null; };
        st[0] = { ...st[0], value: at(0) };
        st[1] = { ...st[1], value: at(1) };
        st[2] = { ...st[2], value: orthoSpan.counts[sel] ?? null };
      }
      return st;
    }
    const st = card.stats ? card.stats.slice() : [];
    // BP: the two tiles follow the selected period's latest bucket.
    if (bpSpan && st.length >= 2) {
      const sub = bpSpan.curLabel ? `(${bpSpan.curLabel})` : undefined;
      st[0] = { ...st[0], value: bpSpan.curSys, sub };
      st[1] = { ...st[1], value: bpSpan.curDia, sub };
    }
    if (selChart && selSeries && sel != null && sel >= 0 && st.length) {
      const v = selSeries.values[sel];
      if (v != null && !isNaN(v)) {
        st[0] = {
          ...st[0],
          label: st[0].label.replace(/^avg\s+/i, ''),
          value: selChart.integer ? Math.round(v) : Math.round(v * 10) / 10,
          sub: `(${buckets[sel]?.label ?? ''})`,
        };
      }
    }
    return st;
  }, [card.stats, selChart, selSeries, sel, buckets, bpSpan, orthoSpan]);
  // The ortho stats row ends with a scope tag: "avg" for the range averages, or
  // the selected bucket's date once a chart point is tapped.
  const orthoTag = orthoSpan ? (sel != null && sel >= 0 && buckets[sel] ? buckets[sel].label : 'avg') : null;
  // Grade dot beside the title, like the HRV Progress sections: BP/ortho follow
  // their filter, a dragged selectStat chart re-grades the selected bucket,
  // otherwise the range average's grade from the builder.
  const selVal = selChart && selSeries && sel != null && sel >= 0 ? selSeries.values[sel] : null;
  const cat = orthoSpan ? orthoSpan.cat : bpSpan ? bpSpan.cat : selVal != null && card.catBands ? catFromBands(selVal, card.catBands) : card.cat;
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cat ? <View style={{ marginRight: 7 }}><ScoreDot cat={cat} size={10} /></View> : null}
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{card.title}</Text>
        {card.help ? <HelpDot title={card.title} text={card.help} /> : null}
        {showZonesLink ? (
          <>
            <View style={{ flex: 1 }} />
            <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} />
          </>
        ) : null}
      </View>
      {card.tiles && (card.desc || card.sub) ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{card.desc || card.sub}</Text>
      ) : null}
      {stats.length ? (
        card.tiles ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 6 }}>
            {stats.map((s, i) => (
              <View key={i} style={{ flex: 1, minWidth: 96, backgroundColor: p.bg, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>
                  {s.value == null ? '–' : String(s.value)}
                  {s.sub ? <Text style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{` ${s.sub}`}</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 12, marginTop: 8 }}>
            {stats.map((s, i) => (
              <View key={i}>
                <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>
                  {s.value == null ? '–' : String(s.value)}
                  {s.sub ? <Text style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{` ${s.sub}`}</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
            {orthoTag ? (
              <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: p.textDim }}>{orthoTag}</Text>
              </View>
            ) : null}
          </View>
        )
      ) : null}
      {card.bpFilter ? (
        <View style={{ marginTop: 12 }}>
          <FilterLinks options={BP_PERIODS} value={bpFilt} onChange={setBpFilt} />
        </View>
      ) : null}
      {!card.tiles && (card.desc || card.sub) ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{card.desc || card.sub}</Text>
      ) : null}
      {shownMetrics ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28 }}>
            {shownMetrics.metrics.map((m) => (
              <View key={m.label}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {m.color ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: m.color }} /> : null}
                  <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{m.label}</Text>
                </View>
                <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: m.color || p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>
                  {m.value == null ? '–' : String(m.value)}
                  {m.sub ? <Text style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{` ${m.sub}`}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
          {shownMetrics.suffix ? <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim, marginBottom: 5 }}>{shownMetrics.suffix}</Text> : null}
        </View>
      ) : null}
      {card.orthoFilter ? (
        <View style={{ marginTop: 12 }}>
          <FilterLinks options={ORTHO_TRANSITIONS} value={orthoFilt} onChange={(v) => { setOrthoFilt(v); setSel(null); }} />
        </View>
      ) : null}
      {orthoEmpty ? (
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: 14 }}>
          {`No ${(ORTHO_TRANSITIONS.find((o) => o.val === orthoFilt)?.label || '').toLowerCase()} events in this range.`}
        </Text>
      ) : null}
      {/* Keyed by the transition filter so a variant swap remounts the chart,
          clearing its internal selection cursor along with the card's. */}
      {(orthoEmpty ? [] : charts).map((ch, i) => (
        <View key={`${orthoFilt}-${i}`} style={{ marginTop: 14 }}>
          {ch.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{ch.label}</Text> : null}
          {ch.dumbbell
            ? (bpSpan && !bpSpan.sys.some((v) => v != null) && !bpSpan.dia.some((v) => v != null)
              ? <Text style={{ color: p.textDim, fontSize: 13, marginTop: 4 }}>No {bpFilt} readings in this range.</Text>
              : <BpDumbbell buckets={buckets} sys={bpSpan ? bpSpan.sys : ch.dumbbell.sys} dia={bpSpan ? bpSpan.dia : ch.dumbbell.dia} />)
            : <LineChart buckets={buckets} series={ch.series} zones={ch.zones} integer={ch.integer} target={ch.target} hideHeader={ch.selectStat || !!metricsRow} zonesOn={(ch === zonesChart || metricsRow) ? showZones : undefined} onSelect={ch.selectStat || ch === metricsChart ? setSel : undefined} />}
          {ch.legend ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
              {ch.legend.map(([name, color]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                  <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {(card.bars || []).map((bg, i) => {
        // `barBuckets` rides with the first bars group: a per-bucket totals
        // chart above the rows, narrowed to one row's counts while selected.
        const bb = i === 0 ? card.barBuckets : undefined;
        const selRow = bb && selBar ? bg.rows.find((r) => r.key === selBar) : null;
        return (
          <View key={i} style={{ marginTop: 14 }}>
            {bg.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{selRow ? selRow.name : bg.label}</Text> : null}
            {bb ? (
              <View style={{ marginBottom: 4 }}>
                <StackedBars
                  buckets={buckets}
                  height={124}
                  segments={[{ label: selRow ? selRow.name : bg.label, color: p.accent, values: selRow ? (bb.byKey[selRow.key!] ?? bb.totals) : bb.totals }]}
                />
              </View>
            ) : null}
            <Bars rows={bg.rows} fmt={bg.fmt} selected={bb ? selBar : undefined} onRowPress={bb ? setSelBar : undefined} />
          </View>
        );
      })}
      {insights.map((ins, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginTop: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: ins.strength === 'strong' ? '#16a34a' : ins.strength === 'mod' ? '#eab308' : p.accent }} />
          <Text style={{ flex: 1, fontSize: 14, color: p.text, lineHeight: 18 }}>{ins.text}</Text>
        </View>
      ))}
    </View>
  );
});
