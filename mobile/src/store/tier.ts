/**
 * Freemium tier store — the stateful side of src/lib/tier.ts.
 *
 * Composes the store entitlement (src/store/iap.ts) with a local 7-day
 * full-access window stamped on first launch. The stamp lives in its own tiny
 * plaintext MMKV instance (`autonomic.flags`), deliberately outside the
 * journal: it isn't health data, must never ride export/import/replaceState,
 * and should survive "Erase journal" (clearAllData wipes the journal
 * instances, not this one). Reinstalling the app resets the window — accepted.
 *
 * Tier changes are time-based as well as event-based, so recheck() runs on:
 * entitlement changes (subscribeIap), every return to the foreground, and a
 * one-shot timer armed to fire just past the trial's expiry (capped at 24h and
 * re-armed, since long timers get throttled). Listeners are only notified when
 * the derived tier actually changes.
 */
import { useSyncExternalStore } from 'react';
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { deriveTier, trialMsLeft, type Tier } from '../lib/tier';
import { getIapState, subscribeIap } from './iap';

export type { Tier };

/** TEMP (dev only): pin the tier to preview locked states in a dev build —
 *  necessary because the dev/TestFlight/sideload bypass in iap.ts makes those
 *  builds `isPro`, i.e. always 'pro'. Leave null in committed code. */
const FORCE_TIER: Tier | null = null;

const FLAGS_ID = 'autonomic.flags';
const KEY_TRIAL_STARTED = 'trialStartedAt';   // ISO timestamp
const KEY_WAS_PRO = 'wasPro';                 // '1' | '0' — last store answer

/* MMKV can be unavailable (jest, web); degrade to an in-memory map so the
 * derivation still works for one session rather than throwing at import. */
let flags: MMKV | null | undefined;
const memFlags = new Map<string, string>();
function kv(): MMKV | null {
  if (flags !== undefined) return flags;
  try { flags = new MMKV({ id: FLAGS_ID }); } catch { flags = null; }
  return flags;
}
function readFlag(key: string): string | undefined {
  const store = kv();
  if (!store) return memFlags.get(key);
  try { return store.getString(key); } catch { return memFlags.get(key); }
}
function writeFlag(key: string, value: string) {
  memFlags.set(key, value);
  try { kv()?.set(key, value); } catch { /* in-memory only this session */ }
}

let current: Tier = 'free';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function trialStartedAtMs(): number | null {
  const raw = readFlag(KEY_TRIAL_STARTED);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** The entitlement to derive from. Until the store connection has answered
 *  (`ready`), fall back to the last persisted answer so a subscriber's cold
 *  start doesn't flash the free-tier locks for the first second. */
function effectiveIsPro(): boolean {
  const { ready, isPro } = getIapState();
  if (ready) return isPro;
  return readFlag(KEY_WAS_PRO) === '1';
}

function armExpiryTimer(tier: Tier) {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = undefined; }
  if (tier !== 'trial') return;
  const left = trialMsLeft(Date.now(), trialStartedAtMs());
  // +1s past expiry so the flip lands on the far side of the boundary; capped
  // and re-armed because OSes throttle multi-day timers.
  const delay = Math.min(left + 1000, 86_400_000);
  expiryTimer = setTimeout(recheck, delay);
}

/** Re-derive the tier; notify listeners only when it changed. */
function recheck(): Tier {
  if (__DEV__ && FORCE_TIER) {
    if (current !== FORCE_TIER) { current = FORCE_TIER; emit(); }
    return current;
  }
  const iap = getIapState();
  if (iap.ready) writeFlag(KEY_WAS_PRO, iap.isPro ? '1' : '0');
  const next = deriveTier(Date.now(), trialStartedAtMs(), effectiveIsPro());
  armExpiryTimer(next);
  if (next !== current) { current = next; emit(); }
  return current;
}

/** Call once at app start (after initIap). Stamps the trial window on first
 *  launch — existing installs updating to the freemium build get a fresh
 *  7 days, by design. */
export function initTier() {
  if (started) return;
  started = true;
  const now = Date.now();
  const stamp = trialStartedAtMs();
  // No stamp yet (first launch on this install) or a stamp in the future
  // (clock rolled back since stamping): (re)stamp to now.
  if (stamp == null || stamp > now) writeFlag(KEY_TRIAL_STARTED, new Date(now).toISOString());
  subscribeIap(recheck);
  try {
    RNAppState.addEventListener('change', (s) => { if (s === 'active') recheck(); });
  } catch { /* no AppState here (jest / bare node) */ }
  recheck();
}

/** Current tier, freshly derived (non-React callers: gating handlers, the
 *  watch context push). */
export function getTier(): Tier {
  if (!started) initTier();
  return recheck();
}

/** Whole days of local trial remaining (0 outside the window) — Settings copy. */
export function getTrialDaysLeft(): number {
  return Math.ceil(trialMsLeft(Date.now(), trialStartedAtMs()) / 86_400_000);
}

export function useTier(): Tier {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
}

/** Non-React subscription (watch relay). Returns the unsubscribe. */
export function subscribeTier(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
