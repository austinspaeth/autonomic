/**
 * Cycle-aware tracking, the impure half: logging a day, the settings, the
 * Health sync and the one-shot history import. The rules live in src/lib/cycle
 * (pure + tested); this file only moves data between them, the journal and the
 * health store.
 *
 * Privacy, since this is the most sensitive data the app holds: nothing here
 * sends anything anywhere except the platform health store the user connected,
 * and only while `healthSync` is on. The one ping is `use` C, fired when
 * tracking is turned on, which carries no phase, no flow and no mode.
 */
import { AppState as RNAppState, Platform } from 'react-native';
import type { CycleFlow, CycleMode, CycleSettings } from '../lib/types';
import { addDays, todayKey } from '../lib/dates';
import { health } from '../lib/health';
import { getDeclinedKeys, markDeclinedKeys } from '../lib/health/declined';
import { cycleTombstone, planCycleImport } from '../lib/cycle/sync';
import { findPeriods } from '../lib/cycle/periods';
import { CYCLE_SYMPTOMS } from '../lib/registry';
import { logError } from '../lib/diagnostics/errorLog';
import { currentCycleModel, ensureDay, getState, mutate, save, subscribeStore } from './store';
import * as Notifications from 'expo-notifications';
import { HEADS_UP_COPY, headsUpAt } from '../lib/cycle/headsUp';
import { pingFeature } from './ping';

/** A year, like the welcome wizard's Health backfill. */
export const CYCLE_HISTORY_DAYS = 365;
/** What a foreground sync re-reads: long enough to catch a period logged in
 *  another app after the fact, short enough to be cheap on every open. */
const SYNC_DAYS = 45;

export function cycleSettings(): CycleSettings | undefined {
  return getState().settings.cycle;
}

export const cycleEnabled = (): boolean => !!getState().settings.cycle?.enabled;

/** Health sync is on when tracking is, Health is connected, and the user has
 *  not switched sync off (undefined = on). */
export function cycleSyncOn(): boolean {
  const s = getState().settings;
  return !!s.cycle?.enabled && !!s.healthEnabled && s.cycle.healthSync !== false && health().available;
}

/**
 * Turn tracking on (the setup sheet's last step, or the Settings switch).
 * Settings go through `mutate`, never a bare save: the scores' memos are keyed
 * on `days`, and the phase-matched baselines change with the mode.
 */
export function enableCycle(mode: CycleMode, opts: { lastStart?: string; typicalLength?: number | null } = {}): void {
  const was = cycleEnabled();
  mutate((s) => {
    s.settings.cycle = { ...s.settings.cycle, enabled: true, mode, setupOn: s.settings.cycle?.setupOn || todayKey() };
    if (opts.typicalLength != null) s.settings.cycle.typicalLength = opts.typicalLength;
    // "When did your last period start?" seeds the model with day 1 when the
    // journal holds no flow near it. One day, logged as the user said it.
    if (opts.lastStart && !s.days[opts.lastStart]?.cycle) {
      const d = s.days[opts.lastStart] || ensureDay(opts.lastStart);
      d.cycle = { flow: 'medium' };
    }
  });
  if (!was) pingFeature('cycle');
}

export function setCycleMode(mode: CycleMode): void {
  mutate((s) => { if (s.settings.cycle) s.settings.cycle = { ...s.settings.cycle, mode }; });
}

/** The typical length from Settings → Cycle; null clears it back to "learn
 *  it from what I log". */
export function setTypicalLength(v: number | null): void {
  mutate((s) => {
    if (!s.settings.cycle) return;
    const next = { ...s.settings.cycle };
    if (v == null) delete next.typicalLength; else next.typicalLength = v;
    s.settings.cycle = next;
  });
}

export function setCycleOption(key: 'healthSync' | 'headsUp', value: boolean): void {
  mutate((s) => { if (s.settings.cycle) s.settings.cycle = { ...s.settings.cycle, [key]: value }; });
}

/** Turn it off. The logged days stay: they are the user's data, and turning
 *  tracking back on should find them. Scores stop adjusting by phase. */
export function disableCycle(): void {
  mutate((s) => { if (s.settings.cycle) s.settings.cycle = { ...s.settings.cycle, enabled: false }; });
}

/**
 * Log, change or clear a day's flow. Clearing an IMPORTED day leaves a
 * permanent decline (by sample key and by day), the rule every other import
 * path keeps; correcting one marks it `edited` so no later read replaces it.
 * Then, with sync on, the day is mirrored to the health store.
 */
export function logFlow(dk: string, flow: CycleFlow | null): void {
  const d = ensureDay(dk);
  const prev = d.cycle;
  if (!flow) {
    if (prev?.imported) markDeclinedKeys([cycleTombstone(dk), ...(prev.healthKey ? [prev.healthKey] : [])]);
    delete d.cycle;
  } else if (prev?.imported) {
    d.cycle = { ...prev, flow, ...(prev.flow !== flow ? { edited: true } : {}) };
  } else {
    d.cycle = { flow };
  }
  save();
  // An imported day is another app's record: correcting it here must not put
  // a second, competing sample beside it in the health store.
  if (prev?.imported) return;
  if (cycleSyncOn()) void mirrorDay(dk, flow, !!prev);
}

async function mirrorDay(dk: string, flow: CycleFlow | null, replace: boolean): Promise<void> {
  try {
    const periods = findPeriods(getState().days);
    const periodStart = !!flow && flow !== 'spotting' && periods.some((p) => p.start === dk);
    const ok = await health().writeCycleDay(dk, flow, { periodStart, replace });
    if (!ok && replace) logError('cycle.mirror', new Error('replace unsupported or refused'));
  } catch (e) {
    logError('cycle.mirror', e);
  }
}

/** Mirror a day's cycle symptoms to Apple Health (sync on, iOS). Called by
 *  the cycle entry card after a save; the symptoms are ordinary Symptoms
 *  entries, so the mirror is a REPLACE of what this app wrote for the day. */
export function mirrorCycleSymptoms(dk: string): void {
  if (!cycleSyncOn()) return;
  const items = (getState().days[dk]?.symptoms || [])
    .filter((e) => (CYCLE_SYMPTOMS as readonly string[]).includes(e.type))
    .map((e) => ({ type: e.type, time: e.time }));
  void health().writeCycleSymptoms(dk, items).catch((e) => logError('cycle.symptoms', e));
}

/** Ask for the cycle permission set. Tap paths only. */
export function requestCycleHealth(): Promise<boolean> {
  return health().requestAuth({ force: true, scope: 'cycle' });
}

export interface CycleImportResult { periods: number; days: number; temps: number; written: string[] }

/**
 * The setup sheet's "Bring in your history": a year of flow and overnight
 * temperature, written in ONE mutate so a year lands as one save.
 */
export async function importCycleHistory(): Promise<CycleImportResult> {
  const today = todayKey();
  const read = await health().readCycle(addDays(today, -CYCLE_HISTORY_DAYS), today);
  return applyRead(read);
}

/** The quiet foreground sync: the last few weeks, files what is new. */
let syncing = false;
/** Returns the days it filed, so the Health import pill can name them. */
export async function syncCycleFromHealth(): Promise<string[]> {
  if (syncing || !cycleSyncOn()) return [];
  syncing = true;
  try {
    const today = todayKey();
    return applyRead(await health().readCycle(addDays(today, -SYNC_DAYS), today)).written;
  } catch (e) {
    logError('cycle.sync', e);
    return [];
  } finally {
    syncing = false;
  }
}

function applyRead(read: Awaited<ReturnType<ReturnType<typeof health>['readCycle']>>): CycleImportResult {
  const plan = planCycleImport(getState().days, read, getDeclinedKeys());
  const tempDays = Object.keys(plan.temps);
  if (plan.writes.length || tempDays.length) {
    mutate((s) => {
      for (const w of plan.writes) {
        const d = s.days[w.dk] || ensureDay(w.dk);
        d.cycle = w.record;
      }
      if (tempDays.length) s.bodyTemp = { ...(s.bodyTemp || {}), ...plan.temps };
    });
  }
  return { periods: findPeriods(getState().days).length, days: plan.writes.length, temps: tempDays.length, written: plan.writes.map((w) => w.dk) };
}

/* ---------- the heads-up notification ---------- */

/** NEVER change: the cancel targets it, and a rename would orphan a schedule. */
const HEADS_UP_ID = 'cycle-heads-up';
const HEADS_UP_CHANNEL = 'cycle';
let headsUpPlan: string | null = null;

/**
 * Arm (or clear) the one heads-up for the coming period. Derived state, like
 * the morning reminder: re-planned from the model on launch, foreground and
 * journal changes, and a no-op when the planned moment has not moved. Never
 * asks for notification permission; it rides whatever the user granted.
 */
export async function syncCycleHeadsUp(): Promise<void> {
  try {
    const c = getState().settings.cycle;
    const at = c?.enabled && c.headsUp !== false ? headsUpAt(currentCycleModel(), new Date()) : null;
    const plan = at ? String(at.getTime()) : 'none';
    if (plan === headsUpPlan) return;
    await Notifications.cancelScheduledNotificationAsync(HEADS_UP_ID).catch(() => {});
    headsUpPlan = plan;
    if (!at) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) { headsUpPlan = null; return; }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(HEADS_UP_CHANNEL, {
        name: 'Heads-up',
        importance: Notifications.AndroidImportance.DEFAULT,
        // PRIVATE: a secure lock screen shows the app name, not the words.
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: HEADS_UP_ID,
      content: { title: HEADS_UP_COPY.title, body: HEADS_UP_COPY.body, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: HEADS_UP_CHANNEL },
    });
  } catch (e) {
    headsUpPlan = null;
    logError('cycle.headsUp', e);
  }
}

/** The heads-up schedule, on launch, foreground and journal change. The Health
 *  read itself rides the import pill's check (features/HealthUpdates), so a
 *  period another app logged arrives with a receipt like every other import. */
export function initCycleSync(): void {
  void syncCycleHeadsUp();
  RNAppState.addEventListener('change', (s) => {
    if (s === 'active') void syncCycleHeadsUp();
  });
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void syncCycleHeadsUp(); }, 2000);
  });
}
