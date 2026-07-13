/**
 * Module-level Apple Watch sync poller. The polling used to live inside
 * WatchSyncSheet, but "Continue using app" minimizes that card while the watch
 * hands the reading to Apple Health — so the poll loop lives here, outside any
 * component, and keeps running with the sheet stack closed. WatchSyncSheet and
 * the floating WatchSyncPill both render from this store (useSyncExternalStore).
 *
 * Lifecycle: startWatchSync() begins a poll for RR-backed readings (heartbeat
 * series + ECGs) near the session window; status moves syncing → found (with
 * candidates) or an auth/availability error. minimize/restore only flip the
 * `minimized` flag — the poll is untouched. stopWatchSync() cancels everything
 * and returns to idle.
 */
import { health } from '../../lib/health';
import { requestEcgAuth } from '../../lib/health/ecg';
import { rrFromEcg, type RawEcgSample } from '../../lib/health/ecgMetrics';
import { ecgNative } from '../../../modules/ecg-health';
import type { SessionConfig } from './Session';

const POLL_MS = 4000;
// A reading counts if it overlaps the session window stretched by 3 minutes on
// each side: the watch clock can drift, hand-off takes a moment, and a Breathe
// session started just before or after the in-app reading is clearly the one
// the wearer means.
const GRACE_MS = 3 * 60000;

export type WatchCandidate = {
  key: string;
  kind: 'hrv' | 'ecg';
  rr: number[];
  startMs: number;
  endMs: number;
  avgHr: number | null; // ECG-reported average HR, results fallback when RR is too dirty
};

export type WatchSyncStatus = 'idle' | 'syncing' | 'noauth' | 'unavailable' | 'found';

export interface WatchSyncState {
  status: WatchSyncStatus;
  waitedSec: number;
  candidates: WatchCandidate[];
  /** Card dismissed via "Continue using app" — the pill shows instead. */
  minimized: boolean;
  config: SessionConfig | null;
}

const IDLE: WatchSyncState = { status: 'idle', waitedSec: 0, candidates: [], minimized: false, config: null };

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
    const [hkOk, ecgOk] = await Promise.all([
      hk.available ? hk.requestAuth() : Promise.resolve(false),
      native ? requestEcgAuth() : Promise.resolve(false),
    ]);
    if (!live()) return;
    if (!hkOk && !ecgOk) { set({ status: 'noauth' }); return; }

    const fromMs = windowStartMs - GRACE_MS;
    const toMs = windowEndMs + GRACE_MS;

    const tick = async () => {
      if (!live() || state.status !== 'syncing') return;
      set({ waitedSec: state.waitedSec + POLL_MS / 1000 });
      const found: WatchCandidate[] = [];
      if (hkOk) {
        const sessions = await hk.readHrvSessions({ fromMs, toMs });
        for (const s of sessions) {
          found.push({ key: `hrv-${s.startMs}`, kind: 'hrv', rr: s.rr, startMs: s.startMs, endMs: s.endMs, avgHr: null });
        }
      }
      if (ecgOk && native) {
        let raw: RawEcgSample[] = [];
        try { raw = await native.queryEcg(fromMs, 10); } catch { raw = []; }
        for (const s of raw) {
          if (s.start > toMs || s.end < fromMs) continue;
          const rr = rrFromEcg(s);
          if (rr.length < 10) continue;
          found.push({ key: `ecg-${s.start}`, kind: 'ecg', rr, startMs: s.start, endMs: s.end, avgHr: s.averageHeartRate ? Math.round(s.averageHeartRate) : null });
        }
      }
      if (!live() || state.status !== 'syncing' || !found.length) return;
      if (timer) { clearInterval(timer); timer = null; }
      found.sort((a, b) => b.startMs - a.startMs);
      set({ status: 'found', candidates: found });
    };
    await tick();
    if (live() && state.status === 'syncing') timer = setInterval(tick, POLL_MS);
  })();
}
