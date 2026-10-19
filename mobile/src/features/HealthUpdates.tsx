/**
 * Health-store auto-import pill + its receipt.
 *
 * The pill floats above the tab bar (same treatment as WatchSyncPill) and
 * appears only while a quiet check is running or after one found something.
 * The check runs on launch, on every foreground, and on demand from the
 * Journal's pull-to-refresh (`requestHealthUpdateCheck` — ignored while the
 * pill or its card is already up). Nothing is shown for an empty result: the
 * pill just fades away. Checking and found are the SAME pill, one fixed-height
 * container whose two content layers cross-fade while its width tweens from the
 * checking content's (intrinsic) width out to the found content's, measured
 * off-screen.
 *
 * **What the pill says has changed: it is a RECEIPT, not a request.** A health
 * sample is a measurement that already happened, so the app files it and then
 * reports what it filed — approving each one turned every reading into a second
 * decision, which is the same objection the HRV results card answers with
 * "a finished reading is SAVED, not offered". The check therefore imports
 * everything that passes (`splitForReview` → `importUpdates`) before the pill
 * ever appears, and the pill counts what was written.
 *
 * Two things survive from the old flow, and both are deliberate:
 *  - **Poor-quality HRV is still ASKED about** (the review lane). It is the one
 *    thing the app declines to file on the user's behalf, exactly as a refused
 *    capture is offered rather than saved, because nothing downstream refuses it
 *    and this is the only moment anybody can judge it.
 *  - **The checkboxes still exist, inverted.** On the receipt a tick means
 *    REMOVE: it deletes that entry and permanently declines the sample
 *    (`undoImports` → `deleteEntry` → lib/health/declined), so the same sample
 *    is never imported again. Rows that cannot be removed carry no checkbox at
 *    all — the night is a field on the day rather than an entry, and a
 *    review row has not been written yet, so it carries an Import link instead.
 *    One meaning per control.
 *
 * The pill NAMES what came in ("Imported sleep from Apple Health" +2) and then
 * takes itself down after `RECEIPT_MS`, unless a reading is waiting for a
 * decision. It used to stand until tapped, because it was the only way to see
 * or undo a silent write. It no longer is: its card lists the whole DAY's
 * imports straight out of the journal (`ImportedList`, over
 * lib/health/importLog), and Settings → Apple Health shows the same list under
 * "Imported today", so the receipt can always be found again.
 *
 * Settings → Apple Health's "Check for updates" is still hand-
 * picked (`HealthUpdatesSheet`): it sweeps the last 24 hours, ignores both the
 * seen and declined memories, and is the way back to anything auto-import
 * skipped or the user removed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetControls, useSheets } from '../components/Sheet';
import { noteCrumb } from '../lib/diagnostics/breadcrumbs';
import { Button, ConfirmDeleteSheet } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { CAUTION_GOLD, CAUTION_GOLD_SOFT, radius, usePalette } from '../theme';
import { health, healthAppName } from '../lib/health';
import {
  allItemKeys, checkHealthUpdates, checkHealthUpdatesLast24h, emptyUpdateSet,
  filterDeclined, filterSeen, getDeclinedKeys, getSeenKeys, importUpdates,
  markSeenKeys, splitForReview, undoImports, updateCount,
  type HealthUpdateSet, type UpdateReading,
} from '../lib/health/updates';
import type { AppState as JournalState, Entry } from '../lib/types';
import { importQualityNote, isPoorImport } from '../lib/hrvQuality';
import { workoutCurveFor } from '../components/summary';
import { openWorkoutReport } from './forms';
import { getState, useAppState } from '../store/store';
import { typesFor } from '../lib/typeCatalog';
import { READING_TYPES } from '../lib/registry';
import { importedRows, pillSummary, type ImportKind, type ImportRow, type LabelOf } from '../lib/health/importLog';
import { setPillSlotClaim } from '../store/pillSlot';
import { fmtTime12, todayKey } from '../lib/dates';

/** Group tints, shared with the watch/design palette (see forms.tsx). */
const SLEEP_BLUE = '#4aa3f0';
const EXERCISE_GREEN = '#3ec46d';
const MED_GOLD = '#e0a030';

/** A 6-digit hex tint → the faded chip fill behind its solid icon. */
function softTint(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.15)`;
}

// The import card sets this while mounted, so a pull-to-refresh can't stack a
// second check under it.
let importSheetOpen = false;

// Manual check requests (Journal pull-to-refresh) → the mounted pill.
const checkRequests = new Set<() => void>();
/** Ask the pill to run a check now. No-ops while
 *  the pill or the import card is already showing in any state. */
export function requestHealthUpdateCheck(): void {
  checkRequests.forEach((l) => l());
}

/**
 * User-pressed check (Settings → Apple Health). Interactive: may raise the OS
 * permission sheet; sweeps the last 24 hours and ignores the pill's "already
 * shown" memory. Toasts on empty, opens the import sheet on found.
 */
export async function runHealthUpdateCheck(
  openSheet: (builder: (c: SheetControls) => React.ReactElement, opts?: { fitContent?: boolean }) => void,
  toast: (msg: string) => void,
): Promise<void> {
  const sets = await checkHealthUpdatesLast24h();
  if (!sets.length) {
    toast(`Nothing new to import from ${healthAppName()}`);
    return;
  }
  openSheet((c) => <HealthUpdatesSheet sets={sets} controls={c} onImported={(n) => toast(n === 1 ? '1 item imported' : `${n} items imported`)} />);
}

/* ---------- the floating pill ---------- */

type PillPhase = 'hidden' | 'checking' | 'found';

/**
 * What a finished check left behind: the newest thing it wrote and how many
 * more (the pill's words), and the readings the app would not file unasked.
 *
 * It keeps no list of its own. The card lists the whole DAY's imports straight
 * out of the journal (`importedRows`), so a second check's pill no longer
 * hides the first check's items, and an entry deleted from the Journal is
 * never listed as imported.
 */
interface Receipt { dk: string; lead: ImportRow | null; more: number; review: UpdateReading[] }

/** How long a receipt with nothing left to decide stays up. The card is always
 *  reachable from Settings → Apple Health, so the pill no longer has to wait
 *  for an answer; a reading that needs one still holds it up. */
const RECEIPT_MS = 8000;

/** Icon + tint per kind, the import card's group palette. */
const KIND_LOOK: Record<ImportKind, { icon: IconName; tint: string }> = {
  sleep: { icon: 'moon', tint: SLEEP_BLUE },
  reading: { icon: 'heartPulse', tint: '#e03127' },
  workout: { icon: 'activity', tint: EXERCISE_GREEN },
  med: { icon: 'pill', tint: MED_GOLD },
};

/** Labels through the user's own catalog, so a custom type keeps its name. */
function labelOfState(): LabelOf {
  return labelOfIn(getState());
}
/** Readings are built-in only (`READING_TYPES`); the rest go through the
 *  catalog the user can extend. */
function labelOfIn(s: JournalState): LabelOf {
  return (kind, type) => (kind === 'readings' ? READING_TYPES[type]?.label : typesFor(s, kind)[type]?.label) ?? type;
}

/** Longest the pill will wait on the health store before giving up quietly. */
const CHECK_TIMEOUT_MS = 30_000;
/** Reject once `ms` passes, so a pending native call can't wedge the pill. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('health check timed out')), ms);
    void p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Fixed pill height — every state renders at this height so the morph only
 *  ever moves width. */
const PILL_H = 46;
/** Pill border width — the measured content width has to grow by it, since RN
 *  widths are border-box. */
const BORDER = 1;

export function HealthUpdatePill() {
  const { openSheet, depth } = useSheets();
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<PillPhase>('hidden');
  const [found, setFound] = useState<Receipt | null>(null);
  // Natural width of the "found" content, measured off-screen (below) so the
  // pill can tween out to it instead of snapping. The checking state needs no
  // measurement — its content sits in flow and gives the pill its width.
  const [foundW, setFoundW] = useState(0);
  // Both lengths of the found line, measured off-screen; the long one is used
  // only when it fits the screen with the usual 16pt gutter either side.
  const [fullW, setFullW] = useState(0);
  const [shortW, setShortW] = useState(0);
  const { width: screenW } = useWindowDimensions();
  const useFull = fullW > 0 && fullW + BORDER * 2 <= screenW - 32;
  // Only true once we're driving width ourselves; until then the pill is
  // intrinsically sized, so it can never render at zero width.
  const [morphing, setMorphing] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const checkOp = useRef(new Animated.Value(1)).current;
  const foundOp = useRef(new Animated.Value(0)).current;
  // The pill's own laid-out width while it's intrinsically sized = where the
  // tween starts from.
  const restW = useRef(0);
  const running = useRef(false);
  const phaseRef = useRef<PillPhase>('hidden');
  phaseRef.current = phase;

  // Own the floating slot while visible, so the low-priority "What's new" pill
  // recedes behind this one instead of overlapping it (src/store/pillSlot).
  // Release on unmount only: a cleanup keyed on `phase` would drop the claim and
  // retake it on every transition, bouncing the pill behind it mid-spring.
  useEffect(() => { setPillSlotClaim('health', phase !== 'hidden'); }, [phase]);
  useEffect(() => () => setPillSlotClaim('health', false), []);
  // For the crash context trail (lib/diagnostics/crumbs): a check or an offer
  // in flight is one of the things most likely to be happening when a launch
  // dies, and it is otherwise invisible.
  useEffect(() => { if (phase !== 'hidden') noteCrumb(`health:${phase}`); }, [phase]);

  const fadeTo = (to: number, done?: () => void) =>
    Animated.timing(opacity, { toValue: to, duration: to ? 220 : 280, useNativeDriver: true }).start(({ finished }) => { if (finished) done?.(); });

  const hide = () => {
    // Hand the slot back as the fade STARTS, not when it finishes. `phase` only
    // reaches 'hidden' after the 280ms fade, so releasing from the effect below
    // would leave the pill behind sitting shrunk for the whole dissolve; the two
    // should move together.
    setPillSlotClaim('health', false);
    fadeTo(0, () => {
      setPhase('hidden'); setFound(null); setFoundW(0); setFullW(0); setShortW(0); setMorphing(false); restW.current = 0;
    });
  };

  // The chosen length is what the pill tweens out to.
  useEffect(() => {
    const w = useFull ? fullW : shortW;
    if (w) setFoundW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, [useFull, fullW, shortW]);

  // A receipt with nothing left to decide takes itself down. One that holds a
  // reading the app would not file unasked waits for the answer, as before.
  useEffect(() => {
    if (phase !== 'found' || !found || found.review.length) return undefined;
    const t = setTimeout(() => hide(), RECEIPT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, found]);

  // Morph into "found": fade the checking content out, tween the width out to
  // the measured new content, fade that in as the width settles.
  useEffect(() => {
    if (phase !== 'found' || !foundW || !restW.current) return;
    pillW.setValue(restW.current);
    setMorphing(true);
    Animated.sequence([
      Animated.timing(checkOp, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(pillW, { toValue: foundW + BORDER * 2, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(foundOp, { toValue: 1, duration: 200, delay: 90, useNativeDriver: true }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, foundW]);

  const runCheck = async () => {
    if (running.current || importSheetOpen || phaseRef.current !== 'hidden') return;
    const s = getState();
    if (!health().available || !s.settings.healthEnabled) return;
    running.current = true;
    checkOp.setValue(1);
    foundOp.setValue(0);
    setPhase('checking');
    fadeTo(1);
    const startedAt = Date.now();
    // Hold the "Checking…" pill up at least this long — a fast empty result
    // shouldn't flash it on and off the screen.
    const settle = (apply: () => void) => {
      const wait = Math.max(0, 2000 - (Date.now() - startedAt));
      setTimeout(() => { apply(); running.current = false; }, wait);
    };
    try {
      // Hard ceiling on the whole check. Everything inside it is a native
      // round-trip (health-store reads, and a permission request that only
      // resolves once the user answers the OS sheet), so any one of them
      // pending would otherwise leave "Checking…" on screen forever.
      const set = await withTimeout(checkHealthUpdates(todayKey()), CHECK_TIMEOUT_MS);
      // Items the user was already offered (viewed or dismissed) don't count,
      // and neither does anything they imported and then deleted.
      const fresh = set ? filterDeclined(filterSeen(set, getSeenKeys()), getDeclinedKeys()) : null;
      if (fresh && updateCount(fresh) > 0) {
        // Write first, report second. Everything that passes is filed here,
        // before the pill has said anything — the pill is the receipt for it.
        // Only the readings the app declines to file (poor-quality HRV) wait.
        const { auto, review } = splitForReview(fresh);
        const { added, workouts } = importUpdates(auto, null);
        // Both lanes are marked seen: a receipt the user dismisses without
        // reading is still a thing they were told, and a review row they
        // ignored is an answer. Settings → Apple Health is the way back.
        markSeenKeys(allItemKeys(fresh));
        if (added > 0 || review.length) {
          const keys = new Set<string>([
            ...auto.readings.map((r) => r.key), ...auto.workouts.map((w) => w.key), ...auto.meds.map((m) => m.key),
            ...(auto.sleep ? ['sleep'] : []),
          ]);
          const summary = added > 0 ? pillSummary(importedRows(getState().days[fresh.dk], labelOfState()), keys) : null;
          settle(() => {
            setFound({ dk: fresh.dk, lead: summary?.lead ?? null, more: summary?.more ?? 0, review });
            setPhase('found');
            // Exactly ONE workout lands on its report, the same as importing
            // one from the card. Never over a sheet that is already up: a
            // reading in progress is not interrupted for a receipt, and the
            // pill is still there to say what was filed.
            if (workouts.length === 1 && workoutCurveFor(workouts[0]) && depthRef.current === 0 && AppState.currentState === 'active') {
              openWorkoutReport(openSheet, workouts[0], fresh.dk, true);
            }
          });
        } else {
          settle(hide);
        }
      } else {
        settle(hide);
      }
    } catch {
      settle(hide);
    }
  };

  useEffect(() => {
    void runCheck();
    // Coming back to the app IS the request, so every foreground checks. There
    // is no background execution here, so a foreground is the only moment a
    // check can happen at all; runCheck itself refuses to stack.
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') void runCheck(); });
    // Journal pull-to-refresh: check now, debounce aside (runCheck still no-ops
    // while the pill or card is visible).
    const onRequest = () => { void runCheck(); };
    checkRequests.add(onRequest);
    return () => { appSub.remove(); checkRequests.delete(onRequest); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'hidden') return null;

  const lead = found?.lead ?? null;
  const more = found?.more ?? 0;
  const reviewCount = found ? found.review.length : 0;
  const openImport = () => {
    if (!found) return;
    openSheet((c) => <HealthImportsSheet dk={found.dk} review={found.review} controls={c} />);
    // The receipt has been read; the pill's job is done either way.
    hide();
  };
  // Keys were marked seen when the check ran (the import already happened), so
  // dismissing is just taking the notice down.
  const dismiss = () => { hide(); };

  // Both states' contents, rendered twice: once stacked inside the pill (so
  // they can cross-fade in place) and once in the off-screen measure layer.
  const checkingContent = (
    <>
      <ActivityIndicator size="small" color="#fff" />
      <Text numberOfLines={1} style={styles.label}>{`Checking ${healthAppName()}…`}</Text>
    </>
  );
  // The receipt state names what came in: "Imported sleep from Apple Health",
  // with a "+2" chip for the rest of that check. "from Apple Health" is the
  // part that gives way — whenever the full line would not fit the screen
  // (measured below), and always beside a review chip. With nothing written it
  // is a gold question instead, which must not say "imported".
  const moreChip = (
    <View style={styles.more}>
      <Text style={styles.moreText}>{`+${more}`}</Text>
    </View>
  );
  const reviewChip = (
    <View style={styles.tag}>
      <Icon name="alert" size={11} color={CAUTION_GOLD} />
      <Text style={styles.tagText}>{reviewCount === 1 ? '1 TO REVIEW' : `${reviewCount} TO REVIEW`}</Text>
    </View>
  );
  const foundContent = (interactive: boolean, full: boolean) => (
    <>
      {lead ? (
        <>
          <View style={[styles.badge, { backgroundColor: softTint(KIND_LOOK[lead.kind].tint) }]}>
            <Icon name={KIND_LOOK[lead.kind].icon} size={12} color={KIND_LOOK[lead.kind].tint} />
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {full && !reviewCount ? `Imported ${lead.noun} from ${healthAppName()}` : `Imported ${lead.noun}`}
          </Text>
          {more > 0 ? moreChip : null}
          {reviewCount ? reviewChip : null}
        </>
      ) : (
        <>
          <Icon name="alert" size={16} color={CAUTION_GOLD} />
          <Text numberOfLines={1} style={[styles.label, { color: CAUTION_GOLD }]}>
            {reviewCount === 1 ? '1 reading needs a look' : `${reviewCount} readings need a look`}
          </Text>
        </>
      )}
      <Pressable
        onPress={interactive ? dismiss : undefined}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.dismiss}
      >
        <Icon name="x" size={13} color="#9a9aa0" />
      </Pressable>
    </>
  );

  // The checking row stays in flow — it's what gives the pill its width before
  // (and its starting width for) the morph. The found row overlays it.
  const inner = (
    <>
      <Animated.View pointerEvents="none" style={[styles.row, { opacity: checkOp }]}>
        {checkingContent}
      </Animated.View>
      {found ? (
        <Animated.View pointerEvents={phase === 'found' ? 'auto' : 'none'} style={[styles.row, styles.layer, { opacity: foundOp }]}>
          {foundContent(true, useFull)}
        </Animated.View>
      ) : null}
    </>
  );

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88, opacity }]}>
      <Animated.View
        style={[styles.pill, morphing && { width: pillW }]}
        onLayout={(e) => { if (!morphing) restW.current = e.nativeEvent.layout.width; }}
      >
        <Pressable
          onPress={phase === 'found' ? openImport : undefined}
          accessibilityRole="button"
          accessibilityLabel={phase === 'found'
            ? [lead ? `Imported ${lead.noun} from ${healthAppName()}` : null, more ? `and ${more} more` : null, reviewCount ? `${reviewCount} to review` : null].filter(Boolean).join(', ')
            : `Checking ${healthAppName()}`}
        >
          {Platform.OS === 'android'
            ? <View style={[styles.stack, { backgroundColor: '#0a0a0e' }]}>{inner}</View>
            : <BlurView intensity={40} tint="dark" style={styles.stack}>{inner}</BlurView>}
        </Pressable>
      </Animated.View>

      {/* Off-screen sizing pass: the found state's natural width, so the pill
          knows what to tween out to. */}
      {found ? (
        <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* Both lengths are measured, unconstrained (the layer is wider than
              any screen), and the long one is used only when it fits. */}
          <View style={[styles.row, styles.measured]} onLayout={(e) => setFullW(e.nativeEvent.layout.width)}>
            {foundContent(false, true)}
          </View>
          <View style={[styles.row, styles.measured]} onLayout={(e) => setShortW(e.nativeEvent.layout.width)}>
            {foundContent(false, false)}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

// Styled to match the floating tab bar + WatchSyncPill (same blur, tint, border).
const styles = StyleSheet.create({
  // zIndex 2: this pill always sits in front of the "What's new" pill, which
  // recedes to the layer behind it while this one holds the slot.
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  pill: {
    height: PILL_H, borderRadius: 999, overflow: 'hidden', borderWidth: BORDER, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  // No percentage sizes anywhere in the pill: widths are intrinsic (or the
  // animated width on the pill itself, which the children stretch to).
  stack: { backgroundColor: 'rgba(6,6,9,0.82)' },
  // Contents are centered inside the animated width so they stay put mid-tween.
  layer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  measure: { position: 'absolute', bottom: 0, left: 0, width: 2000, opacity: 0 },
  measured: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: PILL_H - BORDER * 2, paddingHorizontal: 16, justifyContent: 'center' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
  badge: { minWidth: 21, height: 21, borderRadius: 999, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  more: { minWidth: 26, height: 21, borderRadius: 999, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  moreText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: CAUTION_GOLD_SOFT, borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  tagText: { color: CAUTION_GOLD, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
  // Pulled in against the row's 16pt padding: the ✕ glyph is 13pt inside a 24pt
  // circle, so without this it sits ~21pt off the pill's edge while the badge
  // opposite it sits at 16 — the right side reads heavier than the left. Trimming
  // 6 puts the GLYPH at the same inset as the badge. It lives on the button
  // rather than on `row`, which the symmetric "Checking…" state shares.
  dismiss: { width: 24, height: 24, marginRight: -6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
});

/* ---------- the grouped import sheet ---------- */

interface SheetItem {
  key: string; title: string; sub: string;
  /** A warning chip beside the title. Only the HRV rows carry one today: a
   *  sample the health store kept but whose beats were mostly reconstructed
   *  (see lib/hrvQuality). Nothing refuses it downstream, so the moment the
   *  user chooses whether to keep it is the only place they can be told. */
  tag?: string;
}
interface SheetGroup { key: string; label: string; tint: string; icon: IconName; items: SheetItem[] }

/** Merge one or more day-sets (Settings passes yesterday + today) into the
 *  fixed group order; items from a day other than today say so in their sub.
 *
 *  Rows carry no icon of their own: the group header already names the kind,
 *  and a second icon per row only made the list noisier without adding a fact. */
function groupsOf(sets: HealthUpdateSet[]): SheetGroup[] {
  const today = todayKey();
  const tag = (set: HealthUpdateSet, sub: string) => (set.dk === today ? sub : `Yesterday · ${sub}`);

  const sleep: SheetItem[] = [];
  const readings: SheetItem[] = [];
  const workouts: SheetItem[] = [];
  const meds: SheetItem[] = [];
  for (const set of sets) {
    if (set.sleep) {
      const h = Math.floor(set.sleep.minutesAsleep / 60);
      const m = set.sleep.minutesAsleep % 60;
      sleep.push({
        key: 'sleep',
        title: set.sleep.minutesAsleep > 0 ? `${h}h ${m}m asleep` : 'Last night’s sleep',
        sub: `${fmtTime12(set.sleep.bed)} to ${fmtTime12(set.sleep.wake)}${set.sleep.interrupted ? ' · interrupted' : ''}`,
      });
    }
    readings.push(...set.readings.map((r) => {
      // A poor series says so twice: the chip is the verdict, the sub-line the
      // number behind it, in the results card's own words.
      const poor = isPoorImport(r.quality);
      const why = poor ? importQualityNote(r.quality) : null;
      return {
        key: r.key, title: r.title,
        sub: tag(set, why ? `${r.sub} · ${why}` : r.sub),
        ...(poor ? { tag: 'Poor quality' } : {}),
      };
    }));
    workouts.push(...set.workouts.map((w) => ({ key: w.key, title: w.label, sub: tag(set, w.sub) })));
    meds.push(...set.meds.map((m) => ({ key: m.key, title: m.title, sub: tag(set, m.sub) })));
  }

  const groups: SheetGroup[] = [];
  if (sleep.length) groups.push({ key: 'sleep', label: 'Sleep', tint: SLEEP_BLUE, icon: 'moon', items: sleep });
  if (readings.length) groups.push({ key: 'readings', label: 'Readings', tint: '#e03127', icon: 'heartPulse', items: readings });
  if (workouts.length) groups.push({ key: 'workouts', label: 'Exercise', tint: EXERCISE_GREEN, icon: 'activity', items: workouts });
  if (meds.length) groups.push({ key: 'meds', label: 'Medications', tint: MED_GOLD, icon: 'pill', items: meds });
  return groups;
}

export function HealthUpdatesSheet({ sets, controls, onImported }: {
  sets: HealthUpdateSet[]; controls: SheetControls; onImported: (n: number) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const groups = groupsOf(sets);
  const total = sets.reduce((n, s) => n + updateCount(s), 0);
  const selKeys = Object.keys(sel).filter((k) => sel[k]);

  // Viewing counts as "shown": whatever the user leaves unchecked here is
  // never pushed at them by the pill again (Settings still finds it).
  useEffect(() => {
    importSheetOpen = true;
    markSeenKeys(sets.flatMap(allItemKeys));
    return () => { importSheetOpen = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => setSel((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = (g: SheetGroup, on: boolean) =>
    setSel((prev) => { const next = { ...prev }; g.items.forEach((it) => { next[it.key] = on; }); return next; });

  const finish = (selected: Set<string> | null) => {
    let n = 0;
    const workouts: { entry: Entry; dk: string }[] = [];
    for (const s of sets) {
      const res = importUpdates(s, selected);
      n += res.added;
      res.workouts.forEach((entry) => workouts.push({ entry, dk: s.dk }));
    }
    controls.closeAll();
    onImported(n);
    // Importing exactly ONE workout lands on its report, the same as picking a
    // workout from the add-activity import card. More than one and there's no
    // single report to show, so the journal list is the right landing place.
    if (workouts.length === 1 && workoutCurveFor(workouts[0].entry)) {
      openWorkoutReport(openSheet, workouts[0].entry, workouts[0].dk, true);
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>{`Import from ${healthAppName()}`}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>
        {total === 1 ? 'Found 1 new item.' : `Found ${total} new items.`}
      </Text>

      {groups.map((g) => {
        const allOn = g.items.every((it) => sel[it.key]);
        return (
          <View key={g.key} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name={g.icon} size={15} color={g.tint} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: p.textDim }}>{g.label}</Text>
              <Pressable onPress={() => toggleAll(g, !allOn)} hitSlop={8}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: p.accent }}>{allOn ? 'Clear' : 'Select all'}</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, overflow: 'hidden' }}>
              {g.items.map((it, i) => {
                const on = !!sel[it.key];
                return (
                  <Pressable
                    key={it.key}
                    onPress={() => toggle(it.key)}
                    style={({ pressed }) => [
                      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border },
                      on && { backgroundColor: softTint(g.tint) },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <View style={{
                      width: 24, height: 24, borderRadius: 7, borderWidth: 2,
                      borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on ? <Icon name="check" size={14} color="#fff" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: p.text, fontSize: 15.5, fontWeight: '600' }}>{it.title}</Text>
                        {it.tag ? (
                          <View style={styles.tag}>
                            <Icon name="alert" size={11} color={CAUTION_GOLD} />
                            <Text style={styles.tagText}>{it.tag}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{it.sub}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Button
        title={selKeys.length === 0 ? 'Select what to import' : selKeys.length === 1 ? 'Import 1 item' : `Import ${selKeys.length} items`}
        variant="primary"
        disabled={selKeys.length === 0}
        onPress={() => finish(new Set(selKeys))}
      />
      <View style={{ height: 10 }} />
      <Button title="Import everything" onPress={() => finish(null)} />
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

/* ---------- the day's imports ---------- */

/**
 * The pill's card: everything the health store put into the day, newest first,
 * with the readings still waiting for a decision pinned above.
 *
 * It is a view of the JOURNAL, not of one check (`importedRows`), so it stays
 * right however many checks have run and whatever was deleted since. A tick
 * still means REMOVE: it deletes the entry and declines the sample for good
 * (`undoImports` → `deleteEntry` → lib/health/declined). The card stays open
 * after a removal — the rows leaving IS the confirmation, and a toast cannot
 * be seen from inside a sheet anyway.
 */
export function HealthImportsSheet({ dk, review: initialReview, controls }: {
  dk: string; review: UpdateReading[]; controls: SheetControls;
}) {
  const p = usePalette();
  const [review, setReview] = useState<UpdateReading[]>(initialReview);

  useEffect(() => {
    importSheetOpen = true;
    return () => { importSheetOpen = false; };
  }, []);

  // A reviewed reading is written the moment the user says so, and then simply
  // appears in the list below, which is read from the journal.
  const importOne = (r: UpdateReading) => {
    const { added } = importUpdates({ ...emptyUpdateSet(dk), readings: [r] }, null);
    if (added) setReview((prev) => prev.filter((x) => x.key !== r.key));
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>
        {dk === todayKey() ? 'Imported today' : 'Imported'}
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>
        {`From ${healthAppName()}. Tick anything you don’t want and it won’t be imported again.`}
      </Text>

      {review.length ? (
        <View style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="alert" size={15} color={CAUTION_GOLD} />
            <Text style={{
              flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.6,
              textTransform: 'uppercase', color: CAUTION_GOLD,
            }}>Needs review</Text>
          </View>
          <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, overflow: 'hidden' }}>
            {review.map((r, i) => (
              <View
                key={r.key}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
                  backgroundColor: CAUTION_GOLD_SOFT,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: p.text, fontSize: 15.5, fontWeight: '600' }}>{r.title}</Text>
                    <View style={styles.tag}>
                      <Icon name="alert" size={11} color={CAUTION_GOLD} />
                      <Text style={styles.tagText}>POOR QUALITY</Text>
                    </View>
                  </View>
                  <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>
                    {[r.sub, importQualityNote(r.quality)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable onPress={() => importOne(r)} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: p.accent }}>Import</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ImportedList dk={dk} />
      <View style={{ height: 10 }} />
      <Button title="Done" onPress={() => controls.closeAll()} />
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

/**
 * The day's imports as one list, newest first, with the Remove button under
 * it. Shared by the pill's card and Settings → Apple Health, so the two can
 * never list different things. Live: it re-reads the journal on every change.
 *
 * Each row wears its kind (the import card's group icon on its soft tint),
 * because one chronological list has no group header to say it, and the
 * checkbox sits on the right where the eye lands after reading the row. The
 * night has no checkbox: it is a field on the day, not an entry, so there is
 * nothing to delete or decline. Its time is when you woke.
 */
export function ImportedList({ dk }: { dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const s = useAppState();
  const rows = importedRows(s.days[dk], labelOfIn(s));
  const [remove, setRemove] = useState<Record<string, boolean>>({});
  // Drop ticks whose row has gone (removed here, or deleted from the Journal).
  const live = new Set(rows.map((r) => r.key));
  const removeKeys = Object.keys(remove).filter((k) => remove[k] && live.has(k));

  if (!rows.length) {
    return (
      <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, padding: 16, alignItems: 'center' }}>
        <Text style={{ color: p.textDim, fontSize: 14 }}>
          {`Nothing imported from ${healthAppName()} ${dk === todayKey() ? 'today' : 'that day'}.`}
        </Text>
      </View>
    );
  }

  const confirmRemoval = () => {
    const keys = removeKeys;
    openSheet((c) => (
      <ConfirmDeleteSheet
        title={keys.length === 1 ? 'Remove 1 item?' : `Remove ${keys.length} items?`}
        message={`${keys.length === 1 ? 'It' : 'They'} will be deleted from ${dk === todayKey() ? 'today' : 'that day'} and never imported from ${healthAppName()} again.`}
        confirmTitle="Remove"
        onConfirm={() => { undoImports(dk, keys); setRemove({}); }}
        controls={c}
      />
    ), { fitContent: true });
  };

  return (
    <>
      <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, overflow: 'hidden', marginBottom: 14 }}>
        {rows.map((r, i) => {
          const look = KIND_LOOK[r.kind];
          const on = !!remove[r.key];
          const style = {
            flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 13,
            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border,
          };
          const body = (
            <>
              <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: softTint(look.tint), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={look.icon} size={16} color={look.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{
                    flexShrink: 1, color: on ? p.textDim : p.text, fontSize: 15.5, fontWeight: '600',
                    textDecorationLine: on ? 'line-through' : 'none',
                  }}>{r.title}</Text>
                  {r.poor ? (
                    <View style={styles.tag}>
                      <Icon name="alert" size={11} color={CAUTION_GOLD} />
                      <Text style={styles.tagText}>POOR QUALITY</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{r.sub}</Text>
              </View>
              {r.removable ? (
                <View style={{
                  width: 24, height: 24, borderRadius: 7, borderWidth: 2,
                  borderColor: on ? p.accent : p.border,
                  backgroundColor: on ? p.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {on ? <Icon name="check" size={14} color="#fff" /> : null}
                </View>
              ) : null}
            </>
          );
          if (!r.removable) return <View key={r.key} style={style}>{body}</View>;
          return (
            <Pressable
              key={r.key}
              onPress={() => setRemove((prev) => ({ ...prev, [r.key]: !prev[r.key] }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Remove ${r.title}`}
              style={({ pressed }) => [style, on && { backgroundColor: softTint(look.tint) }, pressed && { opacity: 0.6 }]}
            >
              {body}
            </Pressable>
          );
        })}
      </View>
      <Button
        title={removeKeys.length === 0 ? 'Remove'
          : removeKeys.length === 1 ? 'Remove 1 item' : `Remove ${removeKeys.length} items`}
        variant="danger"
        disabled={removeKeys.length === 0}
        onPress={confirmRemoval}
      />
    </>
  );
}
