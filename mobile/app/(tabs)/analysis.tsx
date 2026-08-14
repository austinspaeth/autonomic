import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, InteractionManager, type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing as REasing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomFade, Screen, headerHeight } from '../../src/components/Header';
import { Icon } from '../../src/components/Icon';
import { Ghost, HelpDot, ScoreDot, Segmented } from '../../src/components/ui';
import { Bars, BpDumbbell, LineChart, StackedBars, ZonesToggle, useChartsBlur } from '../../src/components/charts';
import { TAIL_STYLE, fonts, radius, readoutTail, usePalette } from '../../src/theme';
import { getWaveform, useAppState } from '../../src/store/store';
import { useTier } from '../../src/store/tier';
import { takeProgressRange, useProgressRangeSignal } from '../../src/store/nav';
import { LockedOverlay } from '../../src/features/LockedOverlay';
import { usePaywall } from '../../src/features/Paywall';
import { buildCategories, type AnalysisCard, type BpPeriod, type OrthoTransition } from '../../src/lib/analysis/categories';
import { resolveProtocol, type DaysMap } from '../../src/lib/scoring/day';
import { catFromBands, type BucketView, type Mode } from '../../src/lib/analysis/buckets';
import { HrvFilterLinks, HrvProgress, HrvProgressSkeleton, type Filt } from '../../src/features/HrvProgress';
import { SectionSkeleton } from '../../src/features/ProgressSkeleton';
import { demoDays, hasOwnData } from '../../src/lib/demo';
import { logError } from '../../src/lib/diagnostics/errorLog';
import { DemoBanner, DEMO_PROGRESS_TEXT } from '../../src/features/DemoBanner';

/** Sidecar lookup handed to the category builders (POTS Episodes grades each
 *  event on the max delta across its captured curve). Module-level so the
 *  build-args memo keeps a stable identity. */
const hrCurve = (id: string) => getWaveform(id)?.sampledHr ?? null;

export default function AnalysisScreen() {
  const p = usePalette();
  const state = useAppState();
  // Nothing logged yet: chart the sample month behind a "demo data" banner
  // rather than an empty view. Swaps to their own data on the first entry.
  const demo = !hasOwnData(state.days);
  const days = demo ? demoDays() : state.days;
  // Freemium: free tier keeps the Day view; the longer ranges are Pro. The
  // range control stays fully live either way — no lock glyphs, no paywall on
  // tap. Picking a Pro range builds and lays out the real document, then
  // `<LockedOverlay/>` masks it and docks a small upgrade card over the top
  // (Claude Design "Locked Progress"). Switching back to Day clears it.
  const locked = useTier() === 'free';
  const openPaywall = usePaywall();
  // HRV filter lives here (not inside HrvProgress) so the same All/Morning/Evening
  // toggle can appear both inline beside the section title and in the pinned bar.
  const [hrvFilt, setHrvFilt] = useState<Filt>('all');
  const sex = state.profile.sex;
  const height = state.profile.height;

  const scrollRef = useRef<ScrollView>(null);
  // Seeded to the header's exact height (see Screen) so the sticky bar and the
  // range veil aren't pinned to the top of the window before it measures.
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(() => headerHeight(insets.top));
  const headerRef = useRef(headerHeight(insets.top));   // same value, readable synchronously off the UI runtime

  // Pinned-section tracking runs as a Reanimated worklet: the per-frame scan
  // (which section header has scrolled up to the bottom of the top bar) stays
  // on the UI thread, so scrolling never contends with the chart trees for JS
  // time. JS only hears runOnJS(setPinned) on an actual handoff — as one title
  // slides behind the blur the pinned bar adopts it, and the next section takes
  // over when its title reaches the line.
  // Section id -> y in the scroll content. The map is *owned* by `offsetsRef` on
  // the JS side and mirrored into the shared value for the worklet to scan:
  // writing `sv.value` from JS is asynchronous (Reanimated schedules it onto the
  // UI runtime) and reading it back returns the UI thread's current value, so
  // `sv.value = { ...sv.value, [id]: y }` across the several onLayouts that land
  // in one frame would have every section merge into the same stale map and the
  // last write would win — leaving only one section pinnable.
  const offsetsRef = useRef<Record<string, number>>({});
  /**
   * Card offsets, keyed `${sectionId}#${cardTitle}`, RELATIVE to their section.
   *
   * Kept apart from the section map because the pinned-header worklet scans that
   * one every frame and has no use for cards.
   *
   * A section whose cards are nested one level deeper (HRV, which renders one
   * `HrvProgress` rather than a list of cards) also registers `CARD_BASE`: its
   * children can only report their y within that wrapper, and the wrapper's own
   * offset is added back at resolve time.
   */
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const cardOffset = useCallback((sectionId: string, card?: string): number | null => {
    if (!card) return 0;
    const within = cardOffsetsRef.current[`${sectionId}#${card}`];
    if (within == null) return null;
    return within + (cardOffsetsRef.current[`${sectionId}#${CARD_BASE}`] || 0);
  }, []);

  const offsetsSv = useSharedValue<Record<string, number>>({});
  // y of the document wrapper itself — the offsets above are relative to it.
  const bodyRef = useRef(0);
  const bodySv = useSharedValue(0);
  const headerSv = useSharedValue(headerHeight(insets.top));
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
   * document in ~110ms, and the commit happens only once that veil is opaque
   * *and* the pill's spring has settled — so neither animation ever has the
   * heavy commit landing in the middle of it. The veil carries the *same section
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
  // `anchorId` is carried separately from `from` because the index can be stale
  // or unknowable: when the Journal navigates straight here, the veil is raised
  // before `sections` exists, so there is no index yet — but the id is enough to
  // resolve one once the body builds, and the progressive reveal below has to
  // mount that far or the section we mean to land on has no offset to land on.
  const [veil, setVeil] = useState<{ from: number; items: VeilItem[]; anchorId?: string } | null>(null);
  const veilOp = useSharedValue(0);
  const stage = useRef<'idle' | 'in' | 'opaque' | 'out'>('idle');
  const fadeStarted = useRef(false);
  const pending = useRef<Mode | null>(null);
  // A veil pre-raised while the tab was unfocused (stale data, or first
  // launch): it must not lift until the deferred rebuild has committed.
  const dirtyVeil = useRef(false);
  // The range pill's spring is still travelling: the commit waits for it, so
  // the heavy re-render can't land a dropped frame mid-animation.
  const pillMoving = useRef(false);
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `card` is the chart WITHIN the anchored section to land on ('RMSSD', 'Clean
  // Days'). Optional and best-effort: a card that never reports an offset falls
  // back to the section, which is the neighbourhood the claim came from.
  const anchor = useRef<{ id: string; index: number; card?: string } | null>(null);
  const awaitingBody = useRef(false);
  const floorAt = useRef(0);
  const timers = useRef<{ ceiling?: ReturnType<typeof setTimeout>; lift?: ReturnType<typeof setTimeout> }>({});
  const sectionsRef = useRef<Section[]>([]);
  useEffect(() => () => {
    if (timers.current.ceiling) clearTimeout(timers.current.ceiling);
    if (timers.current.lift) clearTimeout(timers.current.lift);
    if (pillTimer.current) clearTimeout(pillTimer.current);
  }, []);

  // Put the scroll where the new range should open — the section the user was
  // reading, or the top. Always runs while the veil is opaque, so it's unseen.
  const restore = useCallback((force = false) => {
    if (!awaitingBody.current) return true;
    const a = anchor.current;
    // Read the JS-side map, not the shared value: the offsets this very layout
    // pass just seeded haven't crossed to the UI runtime yet.
    const off = a ? offsetsRef.current[a.id] : null;
    // An anchored section with no offset means this layout pass was NOT the
    // document — on a cold tab the veil goes opaque and commits before the
    // first build lands, so the body lays out as the empty-state text. Staying
    // armed lets the next layout pass (the real one) do the scroll; consuming
    // the flag here landed the user at the top and never looked again, which is
    // exactly what tapping the Trend card into a cold Progress tab did.
    // `force` is the ceiling timer giving up, and takes the top.
    if (a && off == null && !force) return false;
    // The card's own offset when it has reported one — usually it has, since
    // children lay out before the parent whose layout triggered this. It is NEVER
    // waited for, though: the veil's lift hangs off this handshake, and anything
    // that can fail to resolve must not be able to strand the page under a
    // skeleton. `settleCard` below corrects the landing afterwards instead.
    const within = a ? cardOffset(a.id, a.card) : 0;
    awaitingBody.current = false;
    const y = off != null ? Math.max(0, off + (within || 0) + bodyRef.current - headerRef.current - CONTENT_PAD) : 0;
    scrollRef.current?.scrollTo({ y, animated: false });
    lastYSv.value = y;
    // That landing spot is inside the handoff zone, so the anchored section is
    // pinned on arrival — say so now rather than waiting for the scroll event,
    // so the pinned bar's fade-in also happens under the veil.
    if (a && off != null) { activeSv.value = a.id; setPinned(a.id, 1); }
    return true;
  }, [lastYSv, activeSv, setPinned, cardOffset]);

  const clearVeil = useCallback(() => {
    if (stage.current !== 'out') return;   // a new tap caught it on the way down
    stage.current = 'idle';
    fadeStarted.current = false;
    dirtyVeil.current = false;
    anchor.current = null;
    setVeil(null);
  }, []);

  const lift = useCallback(() => {
    if (stage.current !== 'opaque') return;
    // A commit is still on its way — a re-tapped range waiting on the pill, or
    // a stale document waiting on the tab transition. Whoever lands it will
    // re-schedule the lift; the ceiling timer stays armed as the backstop.
    if (pending.current != null || dirtyVeil.current) return;
    if (timers.current.ceiling) { clearTimeout(timers.current.ceiling); timers.current.ceiling = undefined; }
    if (timers.current.lift) { clearTimeout(timers.current.lift); timers.current.lift = undefined; }
    restore(true);                         // no-op unless the ceiling beat the layout
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
    offsetsRef.current = {};
    offsetsSv.value = offsetsRef.current;
    cardOffsetsRef.current = {};
    setPinned(null, 1);
    awaitingBody.current = true;
    raiseCeiling();
    setChartMode(to);
  }, [activeSv, offsetsSv, setPinned, raiseCeiling, scheduleLift]);

  // The commit is gated on *two* things: the veil being opaque (so the frame
  // cost is invisible) and the range pill's spring having settled (so the
  // pill's travel is never interrupted by it). Whichever finishes last fires
  // the commit.
  const tryCommit = useCallback(() => {
    if (stage.current === 'opaque' && !pillMoving.current) commitPending();
  }, [commitPending]);

  const onPillSettled = useCallback(() => {
    if (pillTimer.current) { clearTimeout(pillTimer.current); pillTimer.current = null; }
    pillMoving.current = false;
    tryCommit();
  }, [tryCommit]);

  const onVeilOpaque = useCallback(() => {
    if (stage.current !== 'in') return;
    stage.current = 'opaque';
    floorAt.current = Date.now() + VEIL_HOLD_MS;
    tryCommit();
  }, [tryCommit]);

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

  /** `anchorId` overrides where the new range opens — the Journal's Trend card
   *  passes the section its claim came from, so the user lands on that chart
   *  instead of the top. Omitted, the anchor stays "wherever you were reading". */
  const changeMode = useCallback((m: Mode, anchorId?: string, anchorCard?: string) => {
    if (m === modeRef.current) return;
    modeRef.current = m;
    setMode(m);            // the pill has already moved itself; this is bookkeeping
    pending.current = m;
    // Hold the commit until the pill's spring settles (Segmented reports via
    // onSettled). The timer is the safety net in case the report never comes —
    // e.g. a mode change forced from outside while the control is off-screen.
    pillMoving.current = true;
    if (pillTimer.current) clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(onPillSettled, PILL_SETTLE_MAX_MS);
    if (stage.current === 'idle') {
      // Where to reopen: whatever section the user was reading. Flipping
      // Day→Week to see the same metric at a coarser resolution shouldn't
      // throw you back to the top of the page.
      const id = anchorId ?? pinnedRef.current;
      const i = id ? sectionsRef.current.findIndex((s) => s.id === id) : -1;
      // `i < 0` with nothing built yet is the Journal navigating straight here
      // before this tab has ever been focused (`renderArgs` is null, so
      // `sections` is empty). That used to drop the requested anchor and land
      // the user at the top of the page — the exact case the Trend card hits on
      // first use. The index only dresses the veil; restore() resolves the id
      // against the offsets the incoming layout seeds, so keep the id and let
      // the veil start from the top.
      const cold = i < 0 && sectionsRef.current.length === 0;
      // `i > 0` because landing on the FIRST section is the same as landing at
      // the top — except when a card was asked for: Outlook is that first
      // section and it is several charts long, so "Clean days" needs the anchor
      // even though its section starts at the top of the page.
      anchor.current = id && (i > 0 || cold || anchorCard) ? { id, index: Math.max(0, i), card: anchorCard } : null;
      stage.current = 'in';
      fadeStarted.current = false;
      const from = anchor.current ? anchor.current.index : 0;
      setVeil({ from, items: veilItems(sectionsRef.current, from), anchorId: anchor.current?.id });
    } else if (stage.current === 'opaque') {
      tryCommit();           // already hidden — swap as soon as the pill rests
    } else if (stage.current === 'out') {
      stage.current = 'in';  // caught the veil on the way down; back up it goes
      fadeUp();
    }
    // stage === 'in': the fade is already running and will pick up `pending`.
  }, [tryCommit, fadeUp, onPillSettled]);

  // A trial expiring while parked on Week/Month/Year needs no forced downgrade:
  // the range stays selected and the mask simply arrives over it.

  // The Journal's Trend card navigates here asking for a specific range, so the
  // user lands on the view its claim was computed from. A free user lands on the
  // same view with the Pro mask over it — meeting their own faded month sells
  // better than being dropped on a price list.
  const rangeSignal = useProgressRangeSignal();
  const scrollToSection = useCallback((id: string, card?: string) => {
    const off = offsetsRef.current[id];
    if (off == null) return false;
    // A section is several charts long, so landing on its top lands the reader on
    // a different metric from the one they tapped. `card` adds the card's own
    // offset WITHIN the section when that card has reported one; an unknown card
    // (a chart this range has no data for) falls back to the section, which is
    // still the right neighbourhood.
    const within = cardOffset(id, card);
    if (within == null) return false;
    const y = Math.max(0, off + within + bodyRef.current - headerRef.current - CONTENT_PAD);
    // Not animated: arriving from another tab, a visible scroll from the top
    // down to the section reads as the page moving on its own. The section
    // should simply be what the page opened on.
    scrollRef.current?.scrollTo({ y, animated: false });
    lastYSv.value = y;
    activeSv.value = id;
    setPinned(id, 1);
    return true;
  }, [lastYSv, activeSv, setPinned, cardOffset]);
  /**
   * Land on the card once it reports, after the veil has already lifted.
   *
   * The veil's restore is best-effort about cards on purpose (see above), so this
   * is the half that guarantees "tap RMSSD, get RMSSD". It is a plain retry loop
   * over `scrollToSection`, and it stops the moment it succeeds.
   */
  const settleCard = useCallback((section: string, card?: string) => {
    if (!card) return undefined;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      // Never falls back to the section: whatever the veil landed on is already
      // the section, so a failure here should leave the page exactly as it is.
      if (scrollToSection(section, card) || ++tries > 40) return;
      timer = setTimeout(tick, 60);
    };
    timer = setTimeout(tick, TAB_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [scrollToSection]);

  useEffect(() => {
    const want = takeProgressRange();
    if (!want) return;
    // Build the document NOW if this tab has never been focused. The normal
    // path waits for `focused` to flip, which happens after the tab transition
    // — well after the veil has faded up, committed, and laid out an empty
    // body. The user is being navigated here deliberately and the veil is
    // already up to hide the cost, so there is nothing to defer for.
    if (renderArgsRef.current == null) setRenderArgs(buildArgsRef.current);
    if (want.mode !== modeRef.current) {
      // The range is changing anyway: hand the section AND the card to the veil's
      // anchor, and the existing restore() lands there while the page is still
      // hidden. Nothing else may drive the landing on this path: an earlier
      // version ran the section retry loop below alongside the veil, which left
      // two things scrolling the same list while the veil was deciding whether it
      // could lift — and it stayed up.
      changeMode(want.mode as Mode, want.section, want.card);
      // The veil owns the LANDING; this only refines it onto the card once the new
      // range has laid out. The two never fight over the section: `settleCard`
      // scrolls to section+card or does nothing at all.
      return want.section ? settleCard(want.section, want.card) : undefined;
    }
    if (!want.section) return;
    // Already on the requested range, so the veil's anchor never runs — jump
    // there directly. Deferred past the tab transition (Screen scrolls itself
    // to the top on focus, and the section offsets may not have been reported
    // yet), then retried: on a cold tab the body has to build and lay out
    // first, which the 350ms settle alone does not cover.
    anchor.current = { id: want.section, index: 0 };   // in case a veiled rebuild lands first
    let tries = 0;
    const tick = () => {
      // The card first, and only for as long as it is worth waiting for it: a
      // card that never reports (this range has no data for that chart) must not
      // leave the reader at the top of the page, so the last few attempts drop
      // back to the section.
      const target = tries < 30 ? want.card : undefined;
      if (scrollToSection(want.section!, target) || ++tries > 40) return;
      timer = setTimeout(tick, 60);
    };
    let timer = setTimeout(tick, TAB_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [rangeSignal, changeMode, scrollToSection, settleCard]);

  // First layout of the freshly committed range. Children lay out before their
  // parent, so every mounted section has already reported its offset by now.
  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    // Sections report y relative to *this* wrapper, but the scan compares
    // against the scroll offset — so the wrapper's own y (the scroll view's top
    // inset: header height + content padding) has to be added back in. Recorded
    // here rather than assumed, since the header measures itself at runtime.
    bodyRef.current = e.nativeEvent.layout.y;
    bodySv.value = e.nativeEvent.layout.y;
    if (!awaitingBody.current) return;
    // Only hand the page back once the anchored section was actually reached.
    // A deferred restore stays armed for the next layout pass, and the ceiling
    // timer is the backstop if that pass never comes.
    if (restore()) scheduleLift();
  }, [bodySv, restore, scheduleLift]);

  // Building a range walks the whole journal, so keep the last build per range:
  // switching back to one you've already seen then costs nothing and the veil
  // is pure courtesy. Demand-only on purpose — there is nowhere off-thread to
  // pre-warm the unseen ranges (a Reanimated worklet runtime can't take this
  // work: the built cards carry live functions — `regrade`, `fmt`, the ortho
  // predicates — which don't cross a runtime boundary), so speculating would
  // just be an unbounded JS-thread stall on a long journal in exchange for
  // shortening a window the veil already hides. The cache is dropped wholesale
  // whenever any build input changes.
  const buildArgs = useMemo(
    () => ({ days, sex, height, protocol: resolveProtocol(state.settings.protocol), customTypes: state.customTypes, hrCurve }),
    [days, sex, height, state.settings.protocol, state.customTypes],
  );
  // What the document is *actually* built from. Frozen while the tab is
  // unfocused: a journal edit made elsewhere doesn't rebuild this pre-mounted
  // scene in the background — it just leaves `renderArgs` behind `buildArgs`
  // (dirty), and the effect below handles the catch-up on the next focus.
  // Null until the first focus ever, so startup mounts ghosts, not charts.
  const [renderArgs, setRenderArgs] = useState<typeof buildArgs | null>(null);
  // Bumped by each veiled catch-up commit so the body remounts and its
  // onLayout re-fires even though `chartMode` didn't change.
  const [renderSeq, setRenderSeq] = useState(0);
  const dirty = renderArgs !== buildArgs;
  const focused = useIsFocused();
  const buildArgsRef = useRef(buildArgs);
  buildArgsRef.current = buildArgs;
  const renderArgsRef = useRef(renderArgs);
  renderArgsRef.current = renderArgs;
  // The cache holds builds for exactly one args identity — the launch pre-warm
  // fills it with `buildArgs` before the first commit adopts that same object
  // as `renderArgs`, which is why the reset lives here and not at render time.
  const cache = useRef<{ args: typeof renderArgs; byMode: Map<Mode, Section[]> }>({ args: null, byMode: new Map() });
  const buildWith = useCallback((args: NonNullable<typeof renderArgs>, m: Mode): Section[] => {
    if (cache.current.args !== args) cache.current = { args, byMode: new Map() };
    const hit = cache.current.byMode.get(m);
    if (hit) return hit;
    const { days: d, ...ctx } = args;
    const cats = buildCategories(d, m, ctx);
    const built = cats.map((c) => ({ id: c.id, title: c.title, buckets: c.buckets, cards: c.build(), hasOwn: c.hasData?.() ?? false }));
    cache.current.byMode.set(m, built);
    return built;
  }, []);
  const sections = useMemo(() => (renderArgs ? buildWith(renderArgs, chartMode) : []), [buildWith, renderArgs, chartMode]);
  sectionsRef.current = sections;

  // Launch pre-warm. The scene pre-mounts unbuilt so startup stays cheap, but
  // the entry veil must show the *same* skeletons a range change does — and
  // those are shaped from real built cards. So once launch interactions
  // settle (the user is still on the Journal), build the initial range in the
  // background and re-dress the still-cold veil with it. The first-focus
  // commit then finds this build already in the cache, so the only work left
  // under the veil is mounting the chart tree.
  useEffect(() => {
    if (renderArgsRef.current != null) return;
    const task = InteractionManager.runAfterInteractions(() => {
      if (renderArgsRef.current != null) return;   // beaten by a fast tab-in
      // Wrapped because this queue is SHARED. A task that throws stops it, and the
      // symptom lands on whichever screen defers next rather than on the one that
      // failed — this screen sitting on its skeletons at every range was in fact
      // Insights throwing. Failing here costs an undressed veil, nothing more.
      let built: Section[];
      try {
        built = buildWith(buildArgsRef.current, chartModeRef.current);
      } catch (e) {
        logError('progress.prewarm', e);
        return;
      }
      // A cold veil raised by an incoming range request already carries its
      // anchor id but no index, since nothing was built when it went up. Now
      // that there is a document, resolve it — so the skeleton is dressed from
      // the section the user is actually being taken to.
      setVeil((v) => {
        if (!v || v.items.length !== 0) return v;
        const i = v.anchorId ? built.findIndex((s) => s.id === v.anchorId) : -1;
        const from = i > 0 ? i : 0;
        return { ...v, from, items: veilItems(built, from) };
      });
    });
    return () => task.cancel();
  }, [buildWith]);

  // Tab-entry skeleton. New data while unfocused (or first launch) raises the
  // veil immediately — opaque, no fade; nothing is watching — so switching to
  // this tab slides a *skeleton* in, and the rebuild commits only once the
  // tab transition and nav pill have settled, keeping the switch fluid. A
  // change that lands while the tab is focused (a health import, a settings
  // edit) still commits in place with no veil, exactly as before the freeze.
  useEffect(() => {
    if (!dirty) return;
    if (!focused) {
      if (stage.current !== 'idle') return;    // a range swap is mid-flight; catch up on focus
      const id = pinnedRef.current;
      const i = id ? sectionsRef.current.findIndex((s) => s.id === id) : -1;
      anchor.current = id && i > 0 ? { id, index: i } : null;
      stage.current = 'opaque';
      fadeStarted.current = true;
      dirtyVeil.current = true;
      veilOp.value = 1;
      const from = anchor.current ? anchor.current.index : 0;
      setVeil({ from, items: veilItems(sectionsRef.current, from), anchorId: anchor.current?.id });
      return;
    }
    if (dirtyVeil.current) {
      const t = setTimeout(() => {
        dirtyVeil.current = false;
        awaitingBody.current = true;
        floorAt.current = Date.now() + VEIL_HOLD_MS;
        raiseCeiling();
        setRenderArgs(buildArgs);
        setRenderSeq((s) => s + 1);
      }, TAB_SETTLE_MS);
      return () => clearTimeout(t);
    }
    setRenderArgs(buildArgs);
  }, [dirty, focused, buildArgs, veilOp, raiseCeiling]);

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
        // Section top in scroll coordinates vs the bottom of the header bar.
        if (off + bodySv.value - y <= headerSv.value + HANDOFF_LEAD) active = id;
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
  const onCardLayout = useCallback((sectionId: string, card: string, y: number) => {
    const key = `${sectionId}#${card}`;
    if (cardOffsetsRef.current[key] === y) return;
    cardOffsetsRef.current = { ...cardOffsetsRef.current, [key]: y };
  }, []);

  const onSectionLayout = useCallback((id: string, y: number) => {
    if (offsetsRef.current[id] === y) return;
    offsetsRef.current = { ...offsetsRef.current, [id]: y };
    offsetsSv.value = offsetsRef.current;
  }, [offsetsSv]);
  const onHeaderHeight = useCallback((h: number) => { setHeaderH(h); headerRef.current = h; headerSv.value = h; }, [headerSv]);

  // Charts are expensive, so sections mount progressively (see the hook below);
  // until a section's turn comes it renders its real title over skeleton cards.
  // While the veil is up we mount straight through to the anchored section
  // instead, so its offset is real before we scroll to it — one bigger commit,
  // entirely hidden, beats waiting several reveal frames with the veil held up.
  //
  // The reveal target is resolved from the anchor's ID against the sections
  // actually on hand, not from `veil.from`. `from` is snapshotted when the veil
  // goes up, which for a request arriving from the Journal is BEFORE the
  // document exists — it was 0, so only the first two sections mounted, the
  // anchored one never reported an offset, and restore() fell back to y=0. That
  // is the "tapping the Trend card leaves me at the Autonomic score" bug: the
  // anchor was right, there was simply nothing mounted at the other end of it.
  const anchorIdx = veil?.anchorId ? sections.findIndex((s) => s.id === veil.anchorId) : -1;
  const revealFrom = Math.max(veil ? veil.from : 0, anchorIdx);
  const revealed = useProgressiveReveal(sections, revealFrom + INITIAL_SECTIONS);

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
              { val: 'week', label: 'Week' },
              { val: 'month', label: 'Month' },
              { val: 'year', label: 'Year' },
            ]}
            value={mode}
            onChange={changeMode}
            onSettled={onPillSettled}
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
            <RangeVeil top={headerH} op={veilOp} items={veil.items} banner={demo && veil.from === 0} hrvFilt={hrvFilt} onLayout={onVeilLayout} />
          ) : null}
          {/* Above the veil: the mask belongs to the range that was picked, not
              to the rebuild, so it must not blink off while the veil is up. */}
          {locked ? (
        <LockedOverlay
          visible={mode !== 'day'}
          top={headerH}
          title={`${MODE_LABEL[mode]} trends are locked`}
          body="Free keeps the last 14 days on the Day view. Pro opens every range over your full history."
          onUpgrade={openPaywall}
        />
      ) : null}
        </>
      }
    >
      <View key={`${chartMode}:${renderSeq}`} onLayout={onBodyLayout}>
        {!hasData ? (
          <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 }}>
            Nothing to show yet. Record readings, sleep, activities and more in your Journal and your progress will start populating here.
          </Text>
        ) : (
          <SectionsBody
            sections={sections}
            demo={demo}
            days={renderArgs ? renderArgs.days : days}
            mode={chartMode}
            sex={sex}
            height={height}
            hrvFilt={hrvFilt}
            setHrvFilt={setHrvFilt}
            revealed={revealed}
            onSectionLayout={onSectionLayout}
            onCardLayout={onCardLayout}
          />
        )}
      </View>
    </Screen>
  );
}

/** Key under which a section registers the offset of the container its cards sit
 *  in, when they are nested one level deeper than the section itself. */
const CARD_BASE = '\u0000base';

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
// The veil's copies of live controls are inert — nothing under it can be reached.
const NOOP = () => {};
const VEIL_CEILING_MS = 700;
/** Backstop for the pill-settle gate: if `Segmented` never reports the spring
 *  finishing (forced mode change while the control is off-screen), commit
 *  anyway. Just past the spring's real settle time (~290ms). */
const PILL_SETTLE_MAX_MS = 500;
/** Focus → catch-up commit delay: long enough for the tab scene transition
 *  (190ms iOS / staged 160ms Android) and the tab bar's highlight spring to
 *  visibly finish, so the rebuild never drops a frame of either. */
const TAB_SETTLE_MS = 350;

type Section = { id: string; title: string; buckets: BucketView[]; cards: AnalysisCard[]; hasOwn: boolean };

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

type VeilItem = { id: string; title: string; cards: AnalysisCard[] };

/** Snapshot of the on-screen document's shape, from `from` down. Section titles
 *  — and the card chrome the skeleton keeps (titles, help copy, descriptions,
 *  chart labels) — are the same whichever range is charted, so the outgoing
 *  range's cards describe the incoming one's layout well enough to stand in. */
function veilItems(sections: Section[], from: number): VeilItem[] {
  return sections.slice(from).map((s) => ({
    id: s.id,
    // Outlook renders untitled at the very top.
    title: s.id === 'outlook' ? '' : s.title,
    cards: s.cards,
  }));
}

/** The skeleton veil raised over the document while a new range commits: the
 *  same headings over ghost cards, so the page reads as recalculating rather
 *  than as a new screen loading. Opaque by the time anything happens beneath
 *  it, which is what lets the rebuild — and the scroll reposition that goes
 *  with it — be free. Touches are swallowed while it's up; the header (and so
 *  the range control) sits in a layer above it and stays live. */
function RangeVeil({ top, op, items, banner, hrvFilt, onLayout }: {
  top: number; op: SharedValue<number>; items: VeilItem[]; banner: boolean; hrvFilt: Filt; onLayout: () => void;
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
      {items.length === 0 ? <ColdSkeleton /> : null}
      {items.map((it, i) => (
        <View key={i} style={{ marginTop: i === 0 ? 0 : 22 }}>
          {it.id === 'hrv' ? (
            // Same title row as the document's, filter pills and all — they're
            // live under there and unaffected by the range change.
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 34 }}>
              <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text }}>{it.title}</Text>
              <View style={{ flexShrink: 1, marginLeft: 12, alignItems: 'flex-end' }}>
                <HrvFilterLinks value={hrvFilt} onChange={NOOP} />
              </View>
            </View>
          ) : it.title ? (
            <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>{it.title}</Text>
          ) : null}
          {it.id === 'hrv' ? <HrvProgressSkeleton /> : <SectionSkeleton cards={it.cards} />}
        </View>
      ))}
      <BottomFade />
    </Animated.View>
  );
}

const MODE_LABEL: Record<Mode, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

/** Last-resort veil filling for the moments at launch before the pre-warm has
 *  produced real cards to shape skeletons from — reachable only by tabbing to
 *  Progress faster than the background build. A generic first viewport: a
 *  ghost where Outlook lands, the HRV section, a ghost card under the next
 *  title. */
function ColdSkeleton() {
  const p = usePalette();
  return (
    <>
      <Ghost h={170} r={radius.card} />
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>HRV</Text>
        <HrvProgressSkeleton />
      </View>
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>Vitals</Text>
        <Ghost h={280} r={radius.card} />
      </View>
    </>
  );
}

/** The whole document of category sections, memoized as one unit so pinned-bar
 *  handoffs (parent state flipping mid-scroll) never touch the chart trees. */
const SectionsBody = React.memo(function SectionsBody({ sections, demo, days, mode, sex, height, hrvFilt, setHrvFilt, revealed, onSectionLayout, onCardLayout }: {
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
  /** Where each card sits inside its section, so a claim can land on the chart it
   *  was made about rather than on the section's first one. */
  onCardLayout: (sectionId: string, card: string, y: number) => void;
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
            s.id === 'hrv' ? <HrvProgressSkeleton /> : <SectionSkeleton cards={s.cards} />
          ) : s.id === 'hrv' ? (
            // Its metric blocks report their y within HrvProgress, so the
            // wrapper's own offset is registered as the section's CARD_BASE and
            // added back when a card is resolved.
            <View onLayout={(e) => onCardLayout(s.id, CARD_BASE, e.nativeEvent.layout.y)}>
              <HrvProgress
                days={days} mode={mode} ctx={ctx} filt={hrvFilt}
                onCardLayout={(card, y) => onCardLayout(s.id, card, y)}
              />
            </View>
          ) : s.cards.length === 0 ? (
            <Text style={{ color: p.textDim }}>No data logged yet for this category.</Text>
          ) : (
            s.cards.map((card, i) => (
              <View key={i} onLayout={(e) => onCardLayout(s.id, card.title, e.nativeEvent.layout.y)}>
                <CardView card={card} buckets={s.buckets} />
              </View>
            ))
          )}
        </View>
      ))}
    </>
  );
});

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

const CardView = React.memo(function CardView({ card, buckets }: { card: AnalysisCard; buckets: BucketView[] }) {
  const p = usePalette();
  // A `selectStat` chart drives the card's first stat: dragging the chart swaps
  // the range average for that bucket's value, trailed by the phrase for that
  // bucket ("on 7/27", "in July"); tapping outside the chart blurs back.
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
  // swaps each value for that bucket's (and the tail for that bucket's phrase);
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
      when: buckets[sel]?.when ?? null,
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
    // BP: the two tiles are the selected period's range averages.
    if (bpSpan && st.length >= 2) {
      st[0] = { ...st[0], value: bpSpan.avgSys };
      st[1] = { ...st[1], value: bpSpan.avgDia };
    }
    if (selChart && selSeries && sel != null && sel >= 0 && st.length) {
      const v = selSeries.values[sel];
      if (v != null && !isNaN(v)) {
        st[0] = {
          ...st[0],
          label: st[0].label.replace(/^avg\s+/i, ''),
          value: selChart.integer ? Math.round(v) : Math.round(v * 10) / 10,
          when: buckets[sel]?.when ?? null,
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
                  {readoutTail(s.sub, s.when) ? <Text style={TAIL_STYLE(p)}>{readoutTail(s.sub, s.when)}</Text> : null}
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
                  {readoutTail(s.sub, s.when) ? <Text style={TAIL_STYLE(p)}>{readoutTail(s.sub, s.when)}</Text> : null}
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
            {shownMetrics.metrics.map((m, i) => {
              // The period rides on the last metric's unit ("64 bpm on 7/28")
              // rather than standing in a column of its own.
              const t = readoutTail(m.sub, i === shownMetrics.metrics.length - 1 ? shownMetrics.when : undefined);
              return (
                <View key={m.label}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {m.color ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: m.color }} /> : null}
                    <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{m.label}</Text>
                  </View>
                  <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: m.color || p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>
                    {m.value == null ? '–' : `${m.prefix || ''}${m.value}`}
                    {t ? <Text style={TAIL_STYLE(p)}>{t}</Text> : null}
                  </Text>
                </View>
              );
            })}
          </View>
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
                  hideHeader
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
