/**
 * Insights — what the app found in your own log, computed on device.
 *
 * This screen used to be twelve AI-prompt buttons behind a Day/Week/Month/Year
 * control: it answered nothing itself, and every insight required copying a prompt
 * into somebody else's chatbot. It now runs src/lib/insights over the journal and
 * reports the findings directly, with the three AI reports behind one floating
 * button. Layout follows the Claude Design comp "Insights View" (25a).
 *
 * HOW THE TRANSITION STAYS SMOOTH, which is the hardest part of this file and the
 * same shape app/(tabs)/analysis.tsx uses:
 *
 * Tab scenes stay mounted, so a naive version does its work during the slide and
 * janks it. Three rules keep that from happening.
 *   1. `report` is null until it has been BUILT, never seeded synchronously from
 *      the cache during render. The first paint of this screen is always a
 *      skeleton, on launch and on first tab-in.
 *   2. A LAUNCH PRE-WARM builds the report in the background while the user is
 *      still on the Journal, so tabbing in finds a cache hit and the only work
 *      left is mounting the tree.
 *   3. `settled` gates the real content behind the tab transition. Even with the
 *      report already in hand, mounting a dozen cards mid-slide drops frames, so
 *      the skeleton holds until interactions finish AND a short settle timer
 *      fires. It latches on: once the content is up it never reverts, because a
 *      skeleton flashing on a later visit reads as a bug.
 * The render path never touches the engine at all: every build happens inside an
 * effect, behind InteractionManager.
 *
 * The header carries STATE, not a picker: days logged, a data-confidence ring, and
 * a pulsing dot when the findings changed since the last visit. There is no range
 * control because there is no range; the engine owns its own windows.
 *
 * Gating mirrors Progress exactly, via `<LockedOverlay/>`. A free tier gets the
 * real document built and laid out, then masked, with one upgrade card over the
 * top. The AI button is not rendered at all in that state: offering a Pro action
 * inside a locked view is a dead end, not an upsell.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, Text, View } from 'react-native';
import Animated, { Easing as REasing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, headerHeight } from '../../src/components/Header';
import { Icon } from '../../src/components/Icon';
import { useSheets } from '../../src/components/Sheet';
import { usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { useTier } from '../../src/store/tier';
import { requestProgressRange } from '../../src/store/nav';
import { usePaywall } from '../../src/features/Paywall';
import { LockedOverlay } from '../../src/features/LockedOverlay';
import { DemoBanner, DEMO_INSIGHTS_TEXT } from '../../src/features/DemoBanner';
import { METRIC_SECTION } from '../../src/features/TrendCard';
import { AskAiPill } from '../../src/features/insights/AskAi';
import { InsightsEmpty, InsightsSkeleton } from '../../src/features/insights/InsightsSkeleton';
import {
  BiggestChangeCard, ConfidenceRing, ConfidenceSheet, Correlations, InsightsFooter, TrendWatch, WorthALook,
} from '../../src/features/insights/Sections';
import { todayKey } from '../../src/lib/dates';
import { demoDays, hasOwnData } from '../../src/lib/demo';
import { resolveProtocol } from '../../src/lib/scoring/day';
import type { AppState } from '../../src/lib/types';
import type { InsightReport } from '../../src/lib/insights';
import { computeInsights } from '../../src/lib/insights/cache';
import { EMPTY_SHAPE, insightsShape, noteInsightsShape } from '../../src/lib/insights/shape';
import { insightsAreNew, markInsightsSeen } from '../../src/lib/insights/seen';

/**
 * How long after interactions finish before the real content mounts.
 *
 * Matched to Progress's TAB_SETTLE_MS. `runAfterInteractions` fires when the
 * gesture and animation handles are released, which on a tab slide is a few frames
 * before the scene has actually come to rest; committing a large tree in that gap
 * still shows as a stutter at the end of the transition.
 */
const TAB_SETTLE_MS = 350;

/** How long the findings stay marked new after the screen is opened. Long enough
 *  to be noticed, short enough that leaving and returning doesn't re-flag them. */
const SEEN_AFTER_MS = 1200;

export default function InsightsScreen() {
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const focused = useIsFocused();
  const locked = useTier() === 'free';
  const openPaywall = usePaywall();

  const dk = todayKey();

  /**
   * Everything the report is built from, as ONE identity.
   *
   * Memoized because it is the effect's dependency, and because the demo branch
   * builds a new state object: without this, every render produced a new `source`,
   * re-ran the effect, and called back into the engine on a loop.
   */
  const buildArgs = useMemo(() => {
    const demo = !hasOwnData(state.days);
    // `demoDays()` is itself cached per day key, so this stays referentially
    // stable across renders.
    const source: AppState = demo ? { ...state, days: demoDays() } : state;
    return {
      demo,
      source,
      ctx: {
        sex: source.profile.sex,
        height: source.profile.height,
        protocol: resolveProtocol(source.settings.protocol),
        customTypes: source.customTypes,
      },
    };
  }, [state]);

  // Seeded to the header's exact height (see Screen) so overlays anchored to it
  // aren't positioned at the top of the window on the first paint.
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(() => headerHeight(insets.top));
  // Null until BUILT. Never seeded from the cache during render, so the first
  // paint is always the skeleton rather than a synchronous cache lookup that
  // might miss and jank.
  const [report, setReport] = useState<InsightReport | null>(null);
  // Held so a rebuild after a journal edit keeps the old findings on screen
  // instead of flashing the skeleton.
  const shown = useRef<InsightReport | null>(null);
  if (report) shown.current = report;

  const argsRef = useRef(buildArgs);
  argsRef.current = buildArgs;
  // Which args the report on screen was built from, so a journal edit is noticed
  // without making `report` a function of render-time identity.
  const builtFor = useRef<typeof buildArgs | null>(null);

  /**
   * Launch pre-warm: build in the background while the user is still elsewhere.
   *
   * Runs once per mount regardless of focus. By the time the Insights tab is
   * tapped, `computeInsights` is a cache hit and the transition has nothing to do
   * but mount. Deliberately not gated on `focused`.
   */
  useEffect(() => {
    if (builtFor.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      const args = argsRef.current;
      if (builtFor.current === args) return;
      builtFor.current = args;
      setReport(computeInsights(args.source, dk, { demo: args.demo, ctx: args.ctx }));
    });
    return () => task.cancel();
  }, [dk]);

  /**
   * Catch-up: the journal changed, or the day rolled over.
   *
   * Only while focused. An edit made on another tab leaves this scene stale rather
   * than rebuilding a screen nobody is looking at, and the next focus picks it up.
   */
  useEffect(() => {
    if (!focused || builtFor.current === buildArgs) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      builtFor.current = buildArgs;
      setReport(computeInsights(buildArgs.source, dk, { demo: buildArgs.demo, ctx: buildArgs.ctx }));
    });
    return () => { cancelled = true; task.cancel(); };
  }, [focused, buildArgs, dk]);

  /**
   * Has the tab transition finished? Latches true and stays there.
   *
   * This is the gate that actually fixes the stutter: the report can be ready and
   * the content still must not mount until the slide is over.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!focused || settled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setSettled(true), TAB_SETTLE_MS);
    });
    return () => { task.cancel(); if (timer) clearTimeout(timer); };
  }, [focused, settled]);

  // The NEW badge, resolved once per report rather than on render so it can't
  // flicker, and cleared a beat after the user has actually had it on screen.
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    if (!report || !focused || !settled) return;
    setIsNew(insightsAreNew(report.fingerprint));
    const t = setTimeout(() => markInsightsSeen(report.fingerprint), SEEN_AFTER_MS);
    return () => clearTimeout(t);
  }, [report, focused, settled]);

  /**
   * The skeleton's shape, read ONCE per mount.
   *
   * Read into state rather than called at render time so it can't change under a
   * mounted skeleton: `noteInsightsShape` writes the new shape the moment the real
   * content appears, and a skeleton that re-sized itself on the way out would be
   * the very jump this is here to prevent.
   */
  const [shape] = useState(insightsShape);

  // Remember what actually rendered, for the next cold launch's skeleton.
  useEffect(() => {
    if (!report || !settled) return;
    noteInsightsShape({
      change: !!report.change,
      correlations: report.correlations.length,
      observations: report.observations.length,
      watch: report.watch.length,
    });
  }, [report, settled]);

  const openConfidence = useCallback(() => {
    const r = shown.current;
    if (!r) return;
    openSheet(() => <ConfidenceSheet confidence={r.confidence} />, { fitContent: true });
  }, [openSheet]);

  const view = settled ? shown.current : null;
  const hasFindings = !!view && (!!view.change || view.correlations.length > 0 || view.observations.length > 0 || view.watch.length > 0);
  // The header's count comes from the report, but the ring shouldn't sit at zero
  // through the whole skeleton; both simply wait, which reads as loading.
  const head = shown.current;

  return (
    <Screen
      // Clears the tab bar plus the AI button above it.
      bottomPad={200}
      // The skeleton is a promise about a layout that doesn't exist yet, so
      // scrolling it would land the user at an offset the real content may not
      // reach, and throw them when it arrives.
      scrollEnabled={!!view}
      onHeaderHeight={setHeaderH}
      header={
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
            {isNew ? <PulsingDot /> : null}
            {isNew ? <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>NEW</Text> : null}
            <Trend head={head} />
          </View>
          <Pressable
            onPress={openConfidence}
            disabled={!head}
            accessibilityRole="button"
            accessibilityLabel={head ? `Data confidence ${head.confidence.pct} percent` : 'Data confidence'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border, borderRadius: 999, paddingVertical: 6, paddingLeft: 8, paddingRight: 12 }}
          >
            <ConfidenceRing pct={head ? head.confidence.pct : 0} />
            <Text style={{ color: p.text, fontSize: 12.5, fontWeight: '700' }}>Data confidence</Text>
          </Pressable>
        </View>
      }
      footer={
        <>
          {/* Mounted before the overlay so the mask covers it too, and held back
              until the content is up so it can't float over a skeleton. */}
          {!locked && view ? <AskAiPill /> : null}
          <LockedOverlay
            visible={locked}
            top={headerH}
            title="Insights are locked"
            body="Pro finds the patterns in your own log: what changed, what moves with what, and the trends worth watching. All computed on your device."
            onUpgrade={openPaywall}
          />
        </>
      }
    >
      {/* Outside the branch on purpose: `demo` is known synchronously, so the
          banner can be up during the skeleton and never moves when content lands. */}
      {buildArgs.demo ? <DemoBanner text={DEMO_INSIGHTS_TEXT} /> : null}
      {!view ? (
        // A locked view has no findings to shape a skeleton from, and the mask
        // goes over the top of it regardless.
        <InsightsSkeleton shape={locked ? EMPTY_SHAPE : shape} />
      ) : (
        <>
          {view.change ? <BiggestChangeCard change={view.change} isNew={isNew} /> : null}
          <Correlations list={view.correlations} change={view.change} />
          <WorthALook list={view.observations} />
          <TrendWatch
            list={view.watch}
            // Lands on the Progress chart the claim was computed from, the same
            // hand-off the Journal's Trend card makes.
            onPress={(item) => requestProgressRange('month', METRIC_SECTION[item.metric])}
          />
          {hasFindings ? <InsightsFooter /> : <InsightsEmpty daysLogged={view.daysLogged} />}
        </>
      )}
    </Screen>
  );
}

/**
 * Where the journal is heading, in the header.
 *
 * Falls back to the days-logged count rather than inventing a direction. `overall`
 * returns a null label when coverage is too thin to compare two months, and
 * "Trending up" on four days of data would be a claim the data cannot support —
 * whereas "12 days logged" is always true and is itself the reason the verdict is
 * missing.
 *
 * Green up, accent-red down, and neutral for steady. Reporting a decline here is
 * the same deliberate choice Trend Watch makes: this is a screen somebody opened
 * to find out.
 */
function Trend({ head }: { head: InsightReport | null }) {
  const p = usePalette();
  const dir = head ? head.overall.direction : 'unknown';
  const label = head ? head.overall.label : null;

  if (!head) return <Text numberOfLines={1} style={[HEAD_TEXT, { color: p.text }]}>Insights</Text>;
  if (!label) {
    return (
      <Text numberOfLines={1} style={[HEAD_TEXT, { color: p.text, flexShrink: 1 }]}>
        {`${head.daysLogged} ${head.daysLogged === 1 ? 'day' : 'days'} logged`}
      </Text>
    );
  }
  const color = dir === 'up' ? TREND_UP : dir === 'down' ? p.accent : p.text;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}
      accessibilityLabel={`${label}, ${head.overall.detail}`}
    >
      {dir === 'flat' ? null : <Icon name={dir === 'up' ? 'trendUp' : 'trendDown'} size={16} color={color} strokeWidth={2.4} />}
      <Text numberOfLines={1} style={[HEAD_TEXT, { color, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

/** Matches the confidence chip's label beside it. */
const HEAD_TEXT = { fontSize: 14.5, fontWeight: '700' } as const;
/** Same green the findings use for "this is working". */
const TREND_UP = '#3ec46d';

/**
 * The header's "new findings" dot: a solid core with a halo pulsing out of it.
 *
 * Reanimated rather than a looping timer, so it runs on the UI thread and costs
 * nothing while the JS thread is busy building the report, which is exactly when
 * it is on screen.
 */
function PulsingDot() {
  const p = usePalette();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2000, easing: REasing.inOut(REasing.quad) }), -1, false);
  }, [t]);
  const halo = useAnimatedStyle(() => ({
    // 0.8 -> 1.35 while fading out, matching the comp's ivPulse keyframes.
    opacity: 0.7 * (1 - t.value),
    transform: [{ scale: 0.8 + 0.55 * t.value }],
  }));
  return (
    <View style={{ width: 8, height: 8 }}>
      <Animated.View style={[{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 999, backgroundColor: p.accent }, halo]} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: p.accent }} />
    </View>
  );
}
