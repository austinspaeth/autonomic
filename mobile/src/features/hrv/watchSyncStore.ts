/**
 * Module-level Apple Watch sync poller. The polling used to live inside
 * WatchSyncSheet, but "Continue using app" minimizes that card while the watch
 * hands the reading to Apple Health — so the poll loop lives here, outside any
 * component, and keeps running with the sheet stack closed. WatchSyncSheet and
 * the floating WatchSyncPill both render from this store (useSyncExternalStore).
 *
 * Lifecycle: startWatchSync() begins a poll for RR-backed readings (heartbeat
 * series + ECGs); status moves syncing → found (with candidates) or an
 * auth/availability error. Each tick scans the WHOLE day so far: readings
 * overlapping the session window (with grace) auto-sync as `candidates`, and
 * everything else the watch put in Health today is surfaced as `nearby` so the
 * waiting card can offer a manual pick — resilience against watch clock drift,
 * a Breathe session started at the wrong moment, or a reading from earlier in
 * the day that never got saved. minimize/restore only flip the `minimized`
 * flag — the poll is untouched. stopWatchSync() cancels everything.
 */
import { health } from '../../lib/health';
import { requestEcgAuth } from '../../lib/health/ecg';
import { ecgNative } from '../../../modules/ecg-health';
import { dayStartMs, isPickable, partitionCandidates, type RrCandidate } from '../../lib/health/rrCandidates';
import { findRrCandidates } from '../../lib/health/rrSearch';
import type { SessionConfig } from './Session';

export type WatchCandidate = RrCandidate;

const POLL_MS = 4000;
// A reading counts if it overlaps the session window stretched by 3 minutes on
// each side: the watch clock can drift, hand-off takes a moment, and a Breathe
// session started just before or after the in-app reading is clearly the one
// the wearer means.
const GRACE_MS = 3 * 60000;

export type WatchSyncStatus = 'idle' | 'syncing' | 'noauth' | 'unavailable' | 'found';

export interface WatchSyncState {
  status: WatchSyncStatus;
  waitedSec: number;
  candidates: WatchCandidate[];
  /** RR-backed readings elsewhere in today's Health data (outside the session
   *  window) — offered on the waiting card as a manual pick. */
  nearby: WatchCandidate[];
  /** Card dismissed via "Continue using app" — the pill shows instead. */
  minimized: boolean;
  config: SessionConfig | null;
}

const IDLE: WatchSyncState = { status: 'idle', waitedSec: 0, candidates: [], nearby: [], minimized: false, config: null };

let state: WatchSyncState = IDLE;
const listeners = new Set<() => void>();
const set = (patch: Partial<WatchSyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const getWatchSyncState = () => state;
export function subscribeWatchSync(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

let timer: ReturnType<typeof setInterval> | null = null;
// Bumped by every start/stop; an in-flight async step from a stale run sees a
// different token and bails instead of writing into the new run's state.
let token = 0;

export function stopWatchSync() {
  token += 1;
  if (timer) { clearInterval(timer); timer = null; }
  if (state !== IDLE) set(IDLE);
}

export const minimizeWatchSync = () => set({ minimized: true });
export const restoreWatchSync = () => set({ minimized: false });

const keysOf = (cands: WatchCandidate[]) => cands.map((c) => c.key).join('|');

export function startWatchSync({ windowStartMs, windowEndMs, config }: {
  windowStartMs: number; windowEndMs: number; config: SessionConfig;
}) {
  stopWatchSync();
  const run = token;
  const live = () => token === run;
  set({ status: 'syncing', config });

  (async () => {
    const hk = health();
    const native = ecgNative();
    if (!hk.available && !native) { if (live()) set({ status: 'unavailable' }); return; }
    // Sequential, not parallel: each call can present a permission sheet, and
    // two sheets must not race. Both are silent once already determined —
    // WatchPrep and onboarding request the same set up front, so by here this
    // normally resolves without any UI.
    const hkOk = hk.available ? await hk.requestAuth() : false;
    if (!live()) return;
    const ecgOk = native ? await requestEcgAuth() : false;
    if (!live()) return;
    if (!hkOk && !ecgOk) { set({ status: 'noauth' }); return; }

    const fromMs = windowStartMs - GRACE_MS;
    const toMs = windowEndMs + GRACE_MS;

    const tick = async () => {
      if (!live() || state.status !== 'syncing') return;
      set({ waitedSec: state.waitedSec + POLL_MS / 1000 });
      // One scan covers the whole day so far; iOS returns nothing (not an
      // error) for unauthorized reads, so querying both sources is always safe.
      const all = await findRrCandidates({ fromMs: dayStartMs(windowStartMs), toMs: Date.now() });
      if (!live() || state.status !== 'syncing') return;
      const { inWindow, outside } = partitionCandidates(all, fromMs, toMs);
      // The manual-pick list only offers readings worth evaluating: real
      // beat-to-beat data, at least 2 minutes long.
      const nearby = outside.filter(isPickable);
      if (inWindow.length) {
        if (timer) { clearInterval(timer); timer = null; }
        set({ status: 'found', candidates: inWindow, nearby });
        return;
      }
      if (keysOf(nearby) !== keysOf(state.nearby)) set({ nearby });
    };
    await tick();
    if (live() && state.status === 'syncing') timer = setInterval(tick, POLL_MS);
  })();
}
