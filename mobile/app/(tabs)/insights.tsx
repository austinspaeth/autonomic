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
 * Gating shares Progress's `<LockedOverlay/>`, with one measurement of its own. A
 * free tier gets the real document built and laid out, then masked, with one
 * upgrade card over the top — but the TOP CARD is left readable and the mask
 * starts below it (`revealTop`). A screen of blurred ghosts is a promise that the
 * engine found something; one real finding about the reader's own log is the
 * evidence, and it is the most persuasive thing this screen has. Two rules keep
 * that honest:
 *   - The mask appears ONLY when there is a genuine finding to withhold
 *     (`hasFindings`). On a young journal the first card IS the countdown, and
 *     blurring "0 of 14 days" would be charging for a screen that is empty on
 *     every tier. The early tier is treated the same way: it sits above the
 *     countdown, which the user still needs to read.
 *   - The revealed card is a READOUT, not a door. Its rows open FindingSheet,
 *     which is the Pro product, so the whole card is wrapped in one press target
 *     that raises the paywall instead — routed through the same `usePaywall`, so
 *     the wall is counted like any other.
 * The AI button is not rendered in the locked state: offering a Pro action inside
 * a locked view is a dead end, not an upsell.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, headerHeight } from '../../src/components/Header';
import { Icon } from '../../src/components/Icon';
import { useSheets } from '../../src/components/Sheet';
import { usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { useTier } from '../../src/store/tier';
import { usePaywall } from '../../src/features/Paywall';
import { pingViewOpened } from '../../src/store/ping';
import { LockedOverlay } from '../../src/features/LockedOverlay';
import { AskAiPill } from '../../src/features/insights/AskAi';
import { InsightsEmpty, InsightsSkeleton } from '../../src/features/insights/InsightsSkeleton';
import { InsightsFailed } from '../../src/features/insights/BuildFailed';
import {
  BiggestChangeCard, ConfidenceRing, ConfidenceSheet, Correlations, EarlySignals, InsightsFooter, NoImpact, TrendWatch, WorthALook,
} from '../../src/features/insights/Sections';
import { SinceExplain } from '../../src/features/insights/SinceExplain';
import { todayKey } from '../../src/lib/dates';
import { resolveProtocol } from '../../src/lib/scoring/day';
import type { AppState } from '../../src/lib/types';
import { emptyReport, type InsightReport } from '../../src/lib/insights';
import { computeInsights } from '../../src/lib/insights/cache';
import { logError } from '../../src/lib/diagnostics/errorLog';
import { type CardHeights, type RowHeights, type RowKey } from '../../src/lib/insights/shape';
import { insightsShape, noteInsightsShape } from '../../src/lib/insights/shapeMemory';
import { insightsAnchor } from '../../src/lib/insights/anchorMemory';
import { markInsightsSeen } from '../../src/store/insightsBadge';

/**
 * How long after interactions finish before the real content mounts.
 *
 * Matched to Progress's TAB_SETTLE_MS. `runAfterInteractions` fires when the
 * gesture and animation handles are released, which on a tab slide is a few frames
 * before the scene has actually come to rest; committing a large tree in that gap
 * still shows as a stutter at the end of the transition.
 */
const TAB_SETTLE_MS = 350;

/** How long to let the cards finish laying out before their heights are written.
 *  `onLayout` fires per card, and images/fonts can settle a frame or two later. */
const SHAPE_SETTLE_MS = 600;


export default function InsightsScreen() {
  const { openSheet } = useSheets();
  const p = usePalette();
  const state = useAppState();
  const focused = useIsFocused();
  const locked = useTier() === 'free';
  const openPaywall = usePaywall('insights');

  // Someone opened this view. Fired for every tier — for a free user it is the
  // demand side of the question the paywall counter answers from the supply
  // side, and for a paying one it is whether the thing they bought is the thing
  // they use. Capped at once per Eastern day per view inside the store.
  useEffect(() => { if (focused) pingViewOpened('insights'); }, [focused]);

  const dk = todayKey();

  /**
   * Everything the report is built from, as ONE identity.
   *
   * Memoized because it is the effect's dependency: without this, every render
   * produced a new `source`, re-ran the effect, and called back into the engine on
   * a loop.
   *
   * NOTE: unlike Progress, this screen has NO demo fallback. It used to swap in the
   * 60-day sample month on an empty journal, which put "57 days" and a confidence
   * ring in the header of an app that held nothing — a first-person claim about the
   * reader, under a banner that is easy to miss and impossible to reconcile with a
   * journal they had just erased. The honest empty state already exists
   * (`InsightsEmpty`, "0 of 14 days"), and it is what a brand new user needs to see:
   * how far off the first finding is, not what somebody else's findings look like.
   */
  // Bumped when the user picks a new day one, so the anchor re-enters `buildArgs` and
  // the report rebuilds through the normal catch-up path rather than a special case.
  const [anchorSeq, setAnchorSeq] = useState(0);

  /** Bumped by "Try again" on the failed state, to re-enter the build effect. */
  const [retrySeq, setRetrySeq] = useState(0);

  /**
   * Where the one card a locked view leaves readable ENDS, in scroll-content
   * coordinates (its own `y` plus its height, which already includes the header's
   * padding — see Screen's contentContainerStyle).
   *
   * Its BOTTOM rather than its height, so nothing has to assume the card is the
   * first thing in the document; the engine guarantees it today, and a measurement
   * that survives that changing is free. State rather than a ref because the
   * overlay is positioned from it, and taken on the WRAPPER on purpose: a
   * wrapper's frame includes the card's 12pt bottom margin (the trap documented in
   * insights/shape.ts), which is exactly where the seam should fall. Half of that
   * margin is given back below, so the scrim starts in the middle of the gutter
   * rather than flush against the card beneath.
   */
  const [revealBottom, setRevealBottom] = useState(0);

  const buildArgs = useMemo(() => {
    const source: AppState = state;
    return {
      source,
      anchor: insightsAnchor(),
      ctx: {
        sex: source.profile.sex,
        height: source.profile.height,
        protocol: resolveProtocol(source.settings.protocol),
        customTypes: source.customTypes,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, anchorSeq]);

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
   * The one place the report is built.
   *
   * Wrapped, because this runs inside `InteractionManager.runAfterInteractions` and a
   * throw in a queued task takes the QUEUE down with it, not just this screen: every
   * deferred build in the app goes through it, so an Insights failure was showing up
   * as Progress stuck on its skeletons at every range. A screen that finds nothing is
   * a state this view already renders; a poisoned queue is not.
   *
   * It returns an EMPTY REPORT on failure rather than null, and that distinction is
   * the whole point: the skeleton is what renders whenever there is no report, so a
   * null here left the view placeholding forever for content that was never coming.
   * `failed` carries the difference through to the copy, and the callers clear
   * `builtFor` so the next focus tries again instead of pinning the failure.
   */
  const build = useCallback((args: typeof buildArgs): InsightReport => {
    try {
      return computeInsights(args.source, dk, { ctx: args.ctx, anchor: args.anchor });
    } catch (e) {
      logError('insights.build', e);
      return emptyReport(dk, true);
    }
  }, [dk]);

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
      const built = build(args);
      setReport(built);
      // A failure is not a result: leave nothing pinned, so the next focus rebuilds.
      if (built.failed) builtFor.current = null;
    });
    return () => task.cancel();
  }, [build, dk]);

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
      const built = build(buildArgs);
      setReport(built);
      if (built.failed) builtFor.current = null;
    });
    return () => { cancelled = true; task.cancel(); };
    // `retrySeq` is not read in the body: it is here so "Try again" re-enters this
    // effect after clearing `builtFor`, which is a ref and cannot trigger one.
  }, [build, focused, buildArgs, dk, retrySeq]);

  /**
   * "Try again", from the failed state.
   *
   * Drops everything the screen is holding — the report, the copy kept back to
   * survive a rebuild, and the args it was built from — so the effect above sees
   * genuinely nothing built and runs. Clearing `shown` is what puts the skeleton
   * back up while it works: without it the failure stays on screen and a retry
   * that succeeds looks like a retry that did nothing, and one that fails again
   * looks like the button is dead.
   */
  const retry = useCallback(() => {
    builtFor.current = null;
    shown.current = null;
    setReport(null);
    setRetrySeq((n) => n + 1);
  }, []);

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

  /**
   * The skeleton's shape, read ONCE per mount.
   *
   * Read into state rather than called at render time so it can't change under a
   * mounted skeleton: `noteInsightsShape` writes the new shape the moment the real
   * content appears, and a skeleton that re-sized itself on the way out would be
   * the very jump this is here to prevent.
   */
  const [shape] = useState(insightsShape);

  /**
   * Each card's measured height, collected as it lays out.
   *
   * A ref rather than state: these arrive one `onLayout` at a time and nothing on
   * screen depends on them, so storing them in state would re-render the whole
   * document four times for a value only the NEXT cold launch reads.
   */
  const heights = useRef<CardHeights>({ change: 0, correlations: 0, observations: 0, noImpact: 0, watch: 0 });
  const rows = useRef<RowHeights>({ correlations: [], observations: [], noImpact: [], watch: [] });
  const measure = useCallback((key: keyof CardHeights) => (e: LayoutChangeEvent) => {
    heights.current[key] = e.nativeEvent.layout.height;
  }, []);
  /** Every row of a list card, by index, so each skeleton bubble can sit exactly where
   *  its row will. Per row because observation rows differ in height. */
  const measureRow = useCallback((key: RowKey) => (i: number, e: LayoutChangeEvent) => {
    // Defensive about the list: an older build of this screen stored ONE height per
    // card rather than one per row, and under Fast Refresh this ref survives from the
    // component version that seeded it — so it can be a number, and assigning an index
    // on a number is a fatal. A fatal here is expensive out of all proportion: it
    // poisons the InteractionManager queue every deferred screen builds through,
    // which showed up as Progress sitting on its skeletons forever.
    if (!Array.isArray(rows.current[key])) rows.current[key] = [];
    rows.current[key][i] = e.nativeEvent.layout.height;
  }, []);

  // Remember what actually rendered, for the next cold launch's skeleton. Heights
  // are read at this point rather than as they arrive, so one write covers all four.
  useEffect(() => {
    // A failed build rendered no cards, so its shape is not a shape — writing it
    // would teach the next cold launch to draw an empty skeleton for a journal that
    // has plenty to show.
    if (!report || report.failed || !settled) return;
    const copy = (k: RowKey) => (Array.isArray(rows.current[k]) ? rows.current[k].slice() : []);
    const t = setTimeout(() => {
      try {
        noteInsightsShape({
          change: !!report.change,
          correlations: report.correlations.length,
          observations: report.observations.length,
          noImpact: report.noImpact.length,
          watch: report.watch.length,
          heights: { ...heights.current },
          rows: { correlations: copy('correlations'), observations: copy('observations'), noImpact: copy('noImpact'), watch: copy('watch') },
        });
      } catch (e) {
        // A mis-sized skeleton next launch is the whole cost of failing here.
        logError('insights.shape', e);
      }
    }, SHAPE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [report, settled]);

  /** The claim's own breakdown, in the same shape the Outlook's "What powers this"
   *  opens: the two windows, then what moved between them. */
  const openSince = useCallback(() => {
    const r = shown.current;
    if (!r || !r.since) return;
    openSheet(() => <SinceExplain since={r.since!} onAnchorChange={() => setAnchorSeq((n) => n + 1)} />);
  }, [openSheet]);

  const openConfidence = useCallback(() => {
    const r = shown.current;
    if (!r) return;
    openSheet(() => <ConfidenceSheet confidence={r.confidence} />, { fitContent: true });
  }, [openSheet]);

  const view = settled ? shown.current : null;

  // Looking at the screen is what makes its findings "seen": stamp them and
  // clear the tab bar's dot. Keyed on the report so a rebuild that surfaces a
  // new finding WHILE the user is here is stamped too, not left lighting the
  // tab they are already on.
  useEffect(() => {
    if (!focused || !report || report.demo || report.failed) return;
    markInsightsSeen(report);
  }, [focused, report]);
  /**
   * Has this journal produced a REAL finding yet — a strict-tier correlation or a
   * biggest change?
   *
   * This is the gate between the two screens Insights actually has, and it counts
   * only those two things on purpose. Observations and Trend Watch rows arrive
   * almost immediately (the thinnest of them, "Only 8 of the last 30 days are
   * logged", is generated BY the emptiness), and while they counted as findings a
   * user eight days in got a lone "Worth a look" card saying how little they had
   * logged, in place of the countdown that tells them how far off the first real
   * finding is. The countdown holds the screen until the engine genuinely has
   * something; the early tier is the one card allowed to appear above it.
   */
  const hasFindings = !!view && (!!view.change || view.correlations.length > 0);
  /**
   * The weak tier has two homes, because its two variants answer two different
   * screens (see `EarlySignals`). `'early'` is a young journal's only finding and
   * belongs ABOVE the countdown it hedges. `'unconfirmed'` is a long journal where
   * the strict sweep cleared the board but the Biggest change card still has a real
   * answer — and a card of "worth a question, not a conclusion" rows sitting above
   * the one confirmed claim on the screen reads as the headline. So it drops below
   * it, keeping the mature report's order: the confirmed thing first.
   */
  const belowChange = !!view?.change && view.early[0]?.tier === 'unconfirmed';
  const earlyAbove = view && !belowChange ? view.early : [];
  const earlyBelow = view && belowChange ? view.early : [];
  // The header's count comes from the report, but the ring shouldn't sit at zero
  // through the whole skeleton; both simply wait, which reads as loading.
  const head = shown.current;

  /**
   * Is the mask up — and therefore, is there a card being spared from it?
   *
   * Only with a real finding in hand. `hasFindings` is the same gate the screen
   * already uses to choose between the report and the countdown, so a locked young
   * journal sees exactly what a Pro one does: there is nothing to sell yet.
   */
  const gated = locked && hasFindings;
  /**
   * Wraps the top card so it can be read but not opened.
   *
   * `pointerEvents="none"` on the inner view is what makes this work: the card's
   * own rows are Pressables that open FindingSheet, and a press target merely
   * placed on top of them would lose the race on some of them. The card renders
   * exactly as it does for a Pro user; only the touch goes somewhere else.
   */
  const reveal = (node: React.ReactNode) => (!gated ? node : (
    <Pressable
      onPress={openPaywall}
      onLayout={(e) => setRevealBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      accessibilityRole="button"
      accessibilityLabel="Upgrade to Pro to see the rest of your insights"
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}
    >
      <View pointerEvents="none">{node}</View>
    </Pressable>
  ));
  const asIs = (n: React.ReactNode) => n;
  /**
   * Which card the mask spares: the FIRST one in document order, whatever it is.
   *
   * It is not always the Biggest change. `earlyAbove` was assumed to be empty
   * whenever the strict sweep had anything, but the sweep and the change card are
   * different engines: a young journal with a regime change (an onset finding) and
   * no confirmed correlations gets an 'early' card AND a change card, and the mask,
   * anchored to the change card below it, then left BOTH readable. So the choice is
   * made here, in the order the cards are actually rendered, and every other card
   * falls under the mask.
   */
  const topCard: 'early' | 'change' | 'correlations' =
    earlyAbove.length ? 'early' : view?.change ? 'change' : 'correlations';
  /** `reveal` for the one spared card, pass-through for the rest. `reveal` is
   *  already a no-op when the screen isn't gated. */
  const revealIf = (which: typeof topCard) => (gated && topCard === which ? reveal : asIs);

  return (
    <Screen
      // Clears the tab bar plus the AI button above it.
      bottomPad={200}
      // The skeleton is a promise about a layout that doesn't exist yet, so
      // scrolling it would land the user at an offset the real content may not
      // reach, and throw them when it arrives.
      // A masked document has nothing to scroll to, and scrolling one would slide
      // the revealed card out from under a mask anchored to the header.
      scrollEnabled={!!view && !gated}
      onHeaderHeight={setHeaderH}
      header={
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <HeaderClaim head={head} onExplain={openSince} />
          {/* The ring is a status light, not a labelled control: the word
              "Confidence" beside it explained the glyph at the cost of competing
              with the claim on the left, and tapping it opens a card that explains
              it properly. The days count next to it is the one label that earns its
              place, since it names what the whole report was computed from. */}
          <Pressable
            onPress={openConfidence}
            disabled={!head}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              head
                ? `${head.daysLogged} ${head.daysLogged === 1 ? 'day' : 'days'} logged. Data confidence ${head.confidence.pct} percent`
                : 'Data confidence'
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {/* The count sits with the ring rather than with the claim: both are
                measures of how much the report rests on, and the ring alone never
                said how many days it was drawn from. No "logged" under it — the
                word is the sheet's job, and a second line there competed with the
                claim for a label nobody needed to read twice. */}
            {head ? (
              <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 17, fontWeight: '700', letterSpacing: -0.2 }}>
                {head.daysLogged} days
              </Text>
            ) : null}
            <ConfidenceRing pct={head ? head.confidence.pct : 0} size={26} />
          </Pressable>
        </View>
      }
      footer={
        <>
          {/* Under the mask (which claims its own zIndex — see LockedOverlay), and held back
              until the content is up so it can't float over a skeleton. That is
              now the ONLY condition. It used to be hidden from free users and
              from an empty journal, which meant the tab's one permanent piece of
              furniture appeared out of nowhere on the day someone subscribed or
              logged their first entry, and until then nothing said the reports
              existed. The pill states what the tab can do; the tap is where the
              answer lives — the paywall for a free user (`AskAiPill`), and the
              period list for an empty journal, which already shows each range's
              day count and refuses to open an empty one. */}
          {view ? <AskAiPill /> : null}
          {/* Held back until the card above it has reported a height: at 0 the mask
              would cover that card for a frame and then jump off it, which reads as
              a flicker on the one thing the reader is meant to look at. */}
          <LockedOverlay
            visible={gated && revealBottom > headerH}
            top={headerH}
            revealTop={Math.max(0, revealBottom - headerH - 6)}
            title="The rest is locked"
            body="Pro shows every pattern found in your own log: what changed, what moves with what, and the trends worth watching. All computed on your device."
            onUpgrade={openPaywall}
          />
        </>
      }
    >
      {!view ? (
        <InsightsSkeleton shape={shape} />
      ) : (
        <>
          {/* ABOVE everything, in both states. The early tier is the first thing this
              engine can honestly say, and while the countdown holds the screen it is
              the only finding on it — a hint sitting over its own "8 of 14 days" is
              the whole point of the tier. It is empty once the strict sweep has
              anything, but NOT once the change card does (see `topCard`). */}
          {revealIf('early')(<EarlySignals list={earlyAbove} detail={view.detail} />)}
          {hasFindings ? (
            <>
              {/* Each card measures ITSELF, not a wrapper: a wrapper's frame includes the
                  card's 12pt bottom margin and the card's own frame does not, so
                  measuring the wrapper made every skeleton card 12pt too tall. */}
              {view.change ? revealIf('change')(
                <BiggestChangeCard change={view.change} series={view.detail[view.change.id] || null} onLayout={measure('change')} />,
              ) : null}
              <EarlySignals list={earlyBelow} detail={view.detail} />
              {revealIf('correlations')(
                <Correlations
                  list={view.correlations}
                  change={view.change}
                  detail={view.detail}
                  // Rows open the finding itself (see features/insights/FindingSheet).
                  // Every row on this screen does, Trend watch included: nothing here
                  // navigates away or touches Progress's range.
                  onLayout={measure('correlations')}
                  onRowLayout={measureRow('correlations')}
                />,
              )}
              {/* These three are the mature report's supporting cast, so they arrive
                  WITH it rather than before it. Alone on a young journal they read as
                  the whole answer, which is how "Only 8 of the last 30 days are
                  logged" ended up being the entire Insights view. */}
              <WorthALook
                list={view.observations}
                onLayout={measure('observations')}
                onRowLayout={measureRow('observations')}
              />
              <NoImpact
                list={view.noImpact}
                onLayout={measure('noImpact')}
                onRowLayout={measureRow('noImpact')}
              />
              <TrendWatch
                list={view.watch}
                onLayout={measure('watch')}
                onRowLayout={measureRow('watch')}
              />
              <InsightsFooter />
            </>
          ) : view.failed ? <InsightsFailed onRetry={retry} />
            : <InsightsEmpty daysLogged={view.daysLogged} progress={view.progress} />}
        </>
      )}
    </Screen>
  );
}

/**
 * The header's left side: how far the user has come, and a way into the working.
 *
 * "3% worse than day one", in two halves — the claim bold and in the metric's
 * colour, the reference in grey — because the number is the thing being read and
 * "than day one" only says what it is measured against. The chevron opens the same
 * kind of breakdown the Outlook's "What powers this" does, since a claim this
 * prominent has to be checkable.
 *
 * Falls back to stating the analysis window when there is nothing to compare.
 * `changeSinceStart` returns null under a month of logged days or with too few
 * scored days at either end, and "0% better" on three days of data would be a claim
 * the data cannot make, whereas "Last 21 days" is always true and is itself the
 * reason the claim is missing.
 */
function HeaderClaim({ head, onExplain }: { head: InsightReport | null; onExplain: () => void }) {
  const p = usePalette();
  if (!head) return <Text numberOfLines={1} style={[CLAIM, { color: p.text }]}>Insights</Text>;

  const since = head.since;
  if (!since) {
    // With nothing found, the window is the wrong thing to state: "Last 3 days"
    // sounds like a range the reader picked and can widen, over a body that says
    // there is nothing here yet. The header says what to do instead.
    const empty = !head.change && !head.correlations.length && !head.observations.length && !head.noImpact.length && !head.watch.length;
    return (
      <Text numberOfLines={1} style={[CLAIM, { color: p.text, fontWeight: '600', flexShrink: 1 }]}>
        {empty ? 'Keep logging' : windowLabel(head.windowDays)}
      </Text>
    );
  }
  // "About the same" is neither good nor bad, so it takes the neutral colour rather
  // than being congratulated in green.
  const flat = since.pct === 0;
  const color = flat ? p.text : since.better ? TREND_UP : p.accent;
  return (
    <Pressable
      onPress={onExplain}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${since.value}${since.tail}, ${since.detail}. How this was calculated.`}
      style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 }}
    >
      <Text numberOfLines={1} style={{ flexShrink: 1 }}>
        <Text style={[CLAIM, { color, fontWeight: '800' }]}>{since.value}</Text>
        <Text style={[CLAIM, { color: p.textDim, fontWeight: '500' }]}>{since.tail}</Text>
      </Text>
      <Icon name="chevronRight" size={17} color={p.textDim} strokeWidth={2.2} />
    </Pressable>
  );
}

/** The screen's one headline sentence, and the only text in the header now that the
 *  ring has lost its label. Sized up accordingly. */
const CLAIM = { fontSize: 17.5 } as const;
/** Same green the findings use for "this is working". */
const TREND_UP = '#3ec46d';

/**
 * The analysis window, for when there is no claim to make.
 *
 * States the REAL scope: `windowDays` is the user's own span capped at the engine's
 * limit, so somebody three weeks in is told three weeks rather than promised the
 * full six months of analysis they haven't got yet. In days, not rounded to weeks
 * or months, because a reader cannot tell whether "2 months" is 45 days or 89.
 */
function windowLabel(days: number): string {
  // Zero days is not a window, it is the absence of one — an empty journal, or a
  // build that failed. "Today" there would state a scope the screen doesn't have.
  if (days <= 0) return 'Insights';
  if (days === 1) return 'Today';
  return `Last ${days} days`;
}
