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
 * The pill does NOT fade once it has something to report: it is the only notice
 * of a silent write, so it stands until it is tapped or dismissed. After that
 * the journal is the durable undo path anyway — every imported row is deletable
 * and deleting one declines the sample.
 *
 * Settings → Apple Health's "Check for updates" is unchanged and still hand-
 * picked (`HealthUpdatesSheet`): it sweeps the last 24 hours, ignores both the
 * seen and declined memories, and is the way back to anything auto-import
 * skipped or the user removed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetControls, useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
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
import type { Entry } from '../lib/types';
import { importQualityNote, isPoorImport } from '../lib/hrvQuality';
import { workoutCurveFor } from '../components/summary';
import { openWorkoutReport } from './forms';
import { getState } from '../store/store';
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
 * What a finished check left behind: the items already written to the journal,
 * how many that was, and the readings the app would not file unasked.
 *
 * `imported` keeps the whole set (not just a count) because the receipt lists
 * it, and `importedCount` is taken from `importUpdates` rather than recomputed
 * — the night counts as one item there, and nothing else knows that.
 */
interface Receipt { dk: string; imported: HealthUpdateSet; importedCount: number; review: UpdateReading[] }

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
  const p = usePalette();
  const { openSheet } = useSheets();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<PillPhase>('hidden');
  const [found, setFound] = useState<Receipt | null>(null);
  // Natural width of the "found" content, measured off-screen (below) so the
  // pill can tween out to it instead of snapping. The checking state needs no
  // measurement — its content sits in flow and gives the pill its width.
  const [foundW, setFoundW] = useState(0);
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

  const fadeTo = (to: number, done?: () => void) =>
    Animated.timing(opacity, { toValue: to, duration: to ? 220 : 280, useNativeDriver: true }).start(({ finished }) => { if (finished) done?.(); });

  const hide = () => {
    // Hand the slot back as the fade STARTS, not when it finishes. `phase` only
    // reaches 'hidden' after the 280ms fade, so releasing from the effect below
    // would leave the pill behind sitting shrunk for the whole dissolve; the two
    // should move together.
    setPillSlotClaim('health', false);
    fadeTo(0, () => {
      setPhase('hidden'); setFound(null); setFoundW(0); setMorphing(false); restW.current = 0;
    });
  };

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
        const { added } = importUpdates(auto, null);
        // Both lanes are marked seen: a receipt the user dismisses without
        // reading is still a thing they were told, and a review row they
        // ignored is an answer. Settings → Apple Health is the way back.
        markSeenKeys(allItemKeys(fresh));
        if (added > 0 || review.length) {
          settle(() => {
            setFound({ dk: fresh.dk, imported: auto, importedCount: added, review });
            setPhase('found');
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

  const count = found ? found.importedCount : 0;
  const reviewCount = found ? found.review.length : 0;
  const openImport = () => {
    if (!found) return;
    openSheet((c) => (
      <HealthReceiptSheet
        receipt={found}
        controls={c}
        onRemoved={(n) => { toast(n === 1 ? '1 item removed' : `${n} items removed`); }}
      />
    ));
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
  // The receipt state. Three shapes, and the label shortens as the pill fills:
  // "Imported from Apple Health" alone, "Imported" once a review chip has to
  // fit beside it, and a gold line when there is nothing to report at all —
  // that last one is a question, not a receipt, so it must not say "imported".
  const reviewChip = (
    <View style={styles.tag}>
      <Icon name="alert" size={11} color={CAUTION_GOLD} />
      <Text style={styles.tagText}>{reviewCount === 1 ? '1 TO REVIEW' : `${reviewCount} TO REVIEW`}</Text>
    </View>
  );
  const foundContent = (interactive: boolean) => (
    <>
      {count > 0 ? (
        <>
          <View style={[styles.badge, { backgroundColor: p.accent }]}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {reviewCount ? 'Imported' : `Imported from ${healthAppName()}`}
          </Text>
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
          {foundContent(true)}
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
            ? `${count} items imported from ${healthAppName()}${reviewCount ? `, ${reviewCount} to review` : ''}`
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
          <View
            style={styles.row}
            onLayout={(e) => { const w = e.nativeEvent.layout.width; setFoundW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w)); }}
          >
            {foundContent(false)}
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
  measure: { position: 'absolute', bottom: 0, left: 0, opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: PILL_H - BORDER * 2, paddingHorizontal: 16, justifyContent: 'center' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
  badge: { minWidth: 21, height: 21, borderRadius: 999, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: CAUTION_GOLD_SOFT, borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)',
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  tagText: { color: CAUTION_GOLD, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
  dismiss: { width: 24, height: 24, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
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

/* ---------- the receipt ---------- */

/**
 * What the auto-import wrote, and the two things the user can still do about it.
 *
 * The card grammar is `HealthUpdatesSheet`'s, unchanged — same group headers,
 * same bubble rows, same checkbox — because it is the same object seen a moment
 * later. Only the MEANING of a tick is inverted: here it marks a row for
 * removal, and the footer counts removals only. Keeping a reviewed reading is
 * not a change to announce; the tick already did it.
 *
 * Rows that cannot be removed carry no checkbox, so a tick never means two
 * things in one list:
 *  - the night is a field on the day rather than an entry, so there is nothing
 *    to delete and nothing to decline. It is listed as a fact. (The Journal's
 *    "Last night" card is the app's one route to the sleep editor and stays
 *    that way.)
 *  - a review row has not been written yet, so it carries an Import link. Once
 *    imported it becomes an ordinary row, checkbox and all.
 */
export function HealthReceiptSheet({ receipt, controls, onRemoved }: {
  receipt: Receipt; controls: SheetControls; onRemoved: (n: number) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [imported, setImported] = useState<HealthUpdateSet>(receipt.imported);
  const [review, setReview] = useState<UpdateReading[]>(receipt.review);
  const [written, setWritten] = useState(receipt.importedCount);
  const [remove, setRemove] = useState<Record<string, boolean>>({});

  useEffect(() => {
    importSheetOpen = true;
    return () => { importSheetOpen = false; };
  }, []);

  const groups = groupsOf([imported]);
  const removeKeys = Object.keys(remove).filter((k) => remove[k]);

  // A reviewed reading is written the moment the user says so — the card is a
  // receipt, so an accepted row joins the list it is a receipt for.
  const importOne = (r: UpdateReading) => {
    const { added } = importUpdates({ ...emptyUpdateSet(receipt.dk), readings: [r] }, null);
    if (!added) return;
    setImported((prev) => ({ ...prev, readings: [...prev.readings, r].sort((a, b) => a.time.localeCompare(b.time)) }));
    setReview((prev) => prev.filter((x) => x.key !== r.key));
    setWritten((n) => n + added);
  };

  const commitRemoval = () => {
    const n = undoImports(receipt.dk, removeKeys);
    controls.closeAll();
    onRemoved(n);
  };

  const confirmRemoval = () => {
    openSheet((c) => (
      <ConfirmDeleteSheet
        title={removeKeys.length === 1 ? 'Remove 1 item?' : `Remove ${removeKeys.length} items?`}
        message={`It will be deleted from today and never imported from ${healthAppName()} again.`}
        confirmTitle="Remove"
        onConfirm={commitRemoval}
        controls={c}
      />
    ), { fitContent: true });
  };

  const sub = [
    written === 1 ? '1 item written.' : `${written} items written.`,
    review.length ? (review.length === 1 ? '1 needs your call.' : `${review.length} need your call.`) : null,
  ].filter(Boolean).join(' ');

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>
        {written > 0 ? `Imported from ${healthAppName()}` : `From ${healthAppName()}`}
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>{sub}</Text>

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

      {groups.map((g) => (
        <View key={g.key} style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name={g.icon} size={15} color={g.tint} />
            <Text style={{
              flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.6,
              textTransform: 'uppercase', color: p.textDim,
            }}>{g.label}</Text>
          </View>
          <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, overflow: 'hidden' }}>
            {g.items.map((it, i) => {
              // The night has no entry behind it, so it is stated, not offered.
              const fixed = g.key === 'sleep';
              const on = !!remove[it.key];
              const row = (
                <>
                  {fixed ? null : (
                    <View style={{
                      width: 24, height: 24, borderRadius: 7, borderWidth: 2,
                      borderColor: on ? p.accent : p.border,
                      backgroundColor: on ? p.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on ? <Icon name="check" size={14} color="#fff" /> : null}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{
                        color: on ? p.textDim : p.text, fontSize: 15.5, fontWeight: '600',
                        textDecorationLine: on ? 'line-through' : 'none',
                      }}>{it.title}</Text>
                      {it.tag ? (
                        <View style={styles.tag}>
                          <Icon name="alert" size={11} color={CAUTION_GOLD} />
                          <Text style={styles.tagText}>{it.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{it.sub}</Text>
                  </View>
                </>
              );
              const style = {
                flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 13,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border,
              };
              if (fixed) return <View key={it.key} style={style}>{row}</View>;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => setRemove((prev) => ({ ...prev, [it.key]: !prev[it.key] }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Remove ${it.title}`}
                  style={({ pressed }) => [style, on && { backgroundColor: softTint(g.tint) }, pressed && { opacity: 0.6 }]}
                >
                  {row}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Button
        title={removeKeys.length === 0 ? 'Remove'
          : removeKeys.length === 1 ? 'Remove 1 item' : `Remove ${removeKeys.length} items`}
        variant="danger"
        disabled={removeKeys.length === 0}
        onPress={confirmRemoval}
      />
      <View style={{ height: 10 }} />
      <Button title="Keep everything" onPress={() => controls.closeAll()} />
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
