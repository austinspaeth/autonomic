/**
 * Breadcrumbs — the shell. The trail itself (shape, collapsing, formatting) is
 * pure and lives in ./crumbs; this is the flags MMKV, the session boundary and
 * the AppState listener.
 *
 * TWO TRAILS ARE KEPT, and the split is what makes a native crash locatable.
 * A JavaScript fatal is reported in the session it happens in, so it takes the
 * LIVE trail. A native crash is recorded by a process on its way out and only
 * drained on the NEXT launch (`drainNativeCrashes`), by which point the live
 * trail describes this launch and not the one that died. So on every launch
 * the trail the previous session left in MMKV is read back as `previous`
 * before a fresh one starts, and a drained crash asks for it by TIME
 * (`trailCovers`): a crash stamped inside that session gets its trail, and a
 * crash from two launches ago gets none, because a wrong context is worse
 * than no context.
 *
 * Every crumb is persisted as it lands — one MMKV write of a few hundred
 * bytes, a handful of times a minute at most — because the process this is
 * for is one that does not get to flush anything on its way out.
 *
 * Plaintext `autonomic.flags`, same instance as the error log, for the same
 * reasons: device bookkeeping, never rides export/import, holds no health data
 * and nothing identifying — every crumb is a NAME this app chose.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { type CrumbTrail, emptyTrail, parseTrail, pushCrumb, trailCovers } from './crumbs';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'crumbs';

let kv: MMKV | null | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

let live: CrumbTrail | null = null;
let previous: CrumbTrail | null = null;

function persist(): void {
  if (!live) return;
  try { store()?.set(KEY, JSON.stringify(live)); } catch { /* in-memory only this session */ }
}

/**
 * Start this session's trail, keeping the one the last session left.
 *
 * Called from `installErrorLogging()`, i.e. as early as the app can run JS, so
 * nothing recorded this launch is lost to ordering. Idempotent.
 */
export function initBreadcrumbs(): void {
  if (live) return;
  try { previous = parseTrail(store()?.getString(KEY)); } catch { previous = null; }
  live = pushCrumb(emptyTrail(Date.now()), 'launch', Date.now());
  persist();
  try {
    AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') noteCrumb('fg');
      else if (s === 'background') noteCrumb('bg');
    });
  } catch { /* no AppState here (jest / bare node) */ }
}

/**
 * Record one step: a tab, a sheet, a phase. The name is the whole crumb — it
 * must be something this code chose, never a value from the journal.
 */
export function noteCrumb(name: string): void {
  try {
    if (!live) initBreadcrumbs();
    if (!live) return;
    live = pushCrumb(live, name, Date.now());
    persist();
  } catch { /* a breadcrumb must never be the failure */ }
}

/** This session's trail, for a crash reported in the session it happened in. */
export function liveTrail(): CrumbTrail | null {
  return live;
}

/**
 * The trail for a crash recorded by an EARLIER process and drained now.
 *
 * By time when the crash carries one; otherwise (`atMs` undefined) the previous
 * session's trail as an approximation — MetricKit reports the window a crash
 * was collected in, not the instant, and the session before this launch is
 * the best answer there is. The caller marks that case as approximate.
 */
export function previousTrail(atMs?: number): { trail: CrumbTrail; approx: boolean } | null {
  if (!previous) return null;
  if (atMs === undefined) return { trail: previous, approx: true };
  return trailCovers(previous, atMs) ? { trail: previous, approx: false } : null;
}

/** The newest crumbs as one line, for the support dump. */
export function describeTrail(): string {
  const t = live;
  if (!t || !t.crumbs.length) return 'none';
  return t.crumbs.map((c) => c.s).join(' > ');
}
