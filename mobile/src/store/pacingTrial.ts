/**
 * The pacing budget's free week — the stateful side of src/lib/pacingTrial.ts.
 *
 * The stamp lives in the plaintext `autonomic.flags` MMKV for the reason every
 * flag there does: it is device bookkeeping about a PERSON, not health data, so
 * it must never ride export/import and must survive "Clear all data" — erasing
 * a journal is not a way to re-earn a free week. Reinstalling resets it, the
 * same accepted hole the install trial has.
 *
 * The window is stamped LAZILY, at the first moment the install is actually on
 * the free tier (see the pure module for why not at first launch). That check
 * runs wherever the tier can change: at init, on every tier change, and on
 * every return to the foreground. Expiry is a clock event with nothing to
 * announce it, so a one-shot timer is armed at the boundary — capped at 24h and
 * re-armed, since OSes throttle multi-day timers.
 *
 * `isPacingUnlocked()` is the single question the rest of the app asks; nothing
 * outside this module should compose the tier and the window itself.
 */
import { useSyncExternalStore } from 'react';
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import {
  PACING_TRIAL_DAYS,
  pacingTrialActive,
  pacingTrialDaysLeft,
  pacingTrialMsLeft,
  pacingTrialSpent,
} from '../lib/pacingTrial';
import { getTier, subscribeTier, useTier } from './tier';

export { PACING_TRIAL_DAYS };

const FLAGS_ID = 'autonomic.flags';
const KEY_STARTED = 'pacingTrialStartedAt';   // ISO timestamp

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so one
 * session still behaves rather than throwing at import. */
let flags: MMKV | null | undefined;
let memStarted: string | undefined;
function kv(): MMKV | null {
  if (flags !== undefined) return flags;
  try { flags = new MMKV({ id: FLAGS_ID }); } catch { flags = null; }
  return flags;
}
function readStarted(): string | undefined {
  const store = kv();
  if (!store) return memStarted;
  try { return store.getString(KEY_STARTED) ?? memStarted; } catch { return memStarted; }
}
function writeStarted(iso: string) {
  memStarted = iso;
  try { kv()?.set(KEY_STARTED, iso); } catch { /* in-memory only this session */ }
}

function startedAtMs(): number | null {
  const raw = readStarted();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** The snapshot React reads. Identity is stable between changes, which
 *  useSyncExternalStore requires. */
export interface PacingTrialState {
  /** The window is open right now. */
  active: boolean;
  /** Whole days left (0 when closed). */
  daysLeft: number;
  /** The window was opened and has since run out. */
  spent: boolean;
}

let snapshot: PacingTrialState = { active: false, daysLeft: 0, spent: false };
const listeners = new Set<() => void>();
let started = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function armExpiryTimer(active: boolean) {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = undefined; }
  if (!active) return;
  // +1s past expiry so the flip lands on the far side of the boundary.
  const delay = Math.min(pacingTrialMsLeft(Date.now(), startedAtMs()) + 1000, 86_400_000);
  expiryTimer = setTimeout(recheck, delay);
}

/**
 * Stamp the window if it is due, re-derive the snapshot, notify on a change.
 *
 * The stamp is written only while the tier is 'free' and only when there is no
 * stamp already: one window per install, ever.
 */
function recheck(): PacingTrialState {
  const now = Date.now();
  if (startedAtMs() == null && getTier() === 'free') writeStarted(new Date(now).toISOString());
  const at = startedAtMs();
  const next: PacingTrialState = {
    active: pacingTrialActive(now, at),
    daysLeft: pacingTrialDaysLeft(now, at),
    spent: pacingTrialSpent(now, at),
  };
  armExpiryTimer(next.active);
  if (next.active !== snapshot.active || next.daysLeft !== snapshot.daysLeft || next.spent !== snapshot.spent) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
  return snapshot;
}

/** Call once at app start, AFTER initTier — it reads the tier to decide
 *  whether the window is due. */
export function initPacingTrial() {
  if (started) return;
  started = true;
  subscribeTier(recheck);
  try {
    RNAppState.addEventListener('change', (s) => { if (s === 'active') recheck(); });
  } catch { /* no AppState here (jest / bare node) */ }
  recheck();
}

/** Freshly derived state (non-React callers). */
export function pacingTrial(): PacingTrialState {
  if (!started) initPacingTrial();
  return recheck();
}

/**
 * May this install see the pacing budget? The one question the rest of the app
 * asks. Read at TAP TIME by the gate in features/budget/open.tsx, so an upgrade
 * takes effect without leaving the Journal.
 */
export function isPacingUnlocked(): boolean {
  return getTier() !== 'free' || pacingTrial().active;
}

export function usePacingTrial(): PacingTrialState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => snapshot,
  );
}

/** The React half of `isPacingUnlocked` — re-renders on both a tier change and
 *  the window's expiry, so the strip locks itself the morning it runs out. */
export function usePacingUnlocked(): boolean {
  const tier = useTier();
  const { active } = usePacingTrial();
  return tier !== 'free' || active;
}
