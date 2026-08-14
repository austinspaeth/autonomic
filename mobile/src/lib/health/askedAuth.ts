/**
 * Memory + pacing for the health authorization request.
 *
 * The product rule: the app asks for its whole health permission set whenever
 * the platform still has something to ask about — a fresh install, a type that
 * joined the set in an app update, or a sheet the user swiped away. Entry paths
 * (add-activity import card, the periodic/pull-to-refresh update check, watch
 * sync) all request, so a missing grant can never leave a surface quietly
 * empty. What keeps that from nagging:
 *   - nothing left to ask ⇒ no request at all (the platform is consulted first);
 *   - this exact set already asked ⇒ no request either (`hasAskedAuth`). This
 *     one matters most on Android: Health Connect lets the user grant a SUBSET,
 *     so "something is still missing" is the permanent steady state and is not
 *     a reason to ask again. Both platforms consult it now; the Android path
 *     once didn't, and re-raised the whole sheet on every cold start;
 *   - otherwise at most ONE prompt per app launch (`promptedThisLaunch`);
 *   - concurrent callers share one request (`shareAuthRequest`), so two checks
 *     firing at once can't stack two sheets.
 * Only the explicit Connect buttons pass `force`, which skips the pacing.
 *
 * The asked-set memory below is keyed on the exact permission set, so shipping
 * a NEW type in an app update changes the key and legitimately prompts again
 * for the addition.
 *
 * Lives in the plaintext flags MMKV (same instance as the import-pill memory,
 * see ./updates.ts): device-local bookkeeping that must not ride export/import
 * and should survive "Erase journal".
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'healthAuthAskedSet';

let kv: MMKV | null | undefined;
let mem: string | null = null; // in-memory fallback + cache

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** Whether this exact permission set has already been presented to the user. */
export function hasAskedAuth(setKey: string): boolean {
  if (mem === null) {
    try { mem = store()?.getString(KEY) ?? ''; } catch { mem = ''; }
  }
  return mem === setKey;
}

/** Remember that this permission set's request has been presented. */
export function markAskedAuth(setKey: string): void {
  mem = setKey;
  try { store()?.set(KEY, setKey); } catch { /* in-memory only */ }
}

/* ---------- permissions this build cannot actually obtain ---------- */

/**
 * A permission the app REQUESTS but does not DECLARE in its manifest can never
 * be granted: Health Connect happily lists it in the sheet, the user taps
 * Allow, and `getGrantedPermissions()` still comes back without it. Every later
 * check then sees a missing grant, asks again, and the user answers the same
 * question forever. (Shipped exactly that way: `ExerciseSession` + `Distance`
 * were in READ_TYPES but `health.READ_EXERCISE` / `health.READ_DISTANCE` were
 * missing from app.json's android.permissions.)
 *
 * A refusal has the same shape and deserves the same treatment, so rather than
 * hard-coding which types are broken, we observe: whatever is still missing
 * AFTER the user has answered the sheet is not obtainable right now, and asking
 * for it again is nagging. Keyed by permission set + app version, so a build
 * that adds the missing manifest entries (or a user who changes their mind in
 * an app update) gets exactly one fresh attempt.
 */
const UNGRANTABLE_KEY = 'healthUngrantable';

function appVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return String(require('expo-constants').default?.expoConfig?.version ?? '?');
  } catch { return '?'; }
}

/** Scope key for the memory below: this permission set, on this app version. */
export const ungrantableScope = (setKey: string) => `${setKey}@${appVersion()}`;

/** Permission ids (`read:HeartRate`) known to be unobtainable in this scope. */
export function ungrantable(scope: string): Set<string> {
  try {
    const raw = store()?.getString(UNGRANTABLE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { scope?: string; ids?: string[] };
    return parsed?.scope === scope ? new Set(parsed.ids ?? []) : new Set();
  } catch { return new Set(); }
}

/** Record what the user's answer left ungranted. Replaces any older scope. */
export function markUngrantable(scope: string, ids: string[]): void {
  try { store()?.set(UNGRANTABLE_KEY, JSON.stringify({ scope, ids })); } catch { /* in-memory only */ }
}

/* ---------- per-launch pacing ---------- */

// Module-scoped on purpose: the cap is one prompt per app launch, so a user who
// dismisses the OS sheet is asked again next launch (and not before). Nothing
// to persist.
let prompted = false;

/** Whether an entry path has already raised the OS permission UI this launch. */
export function promptedThisLaunch(): boolean { return prompted; }
/** Remember that the OS permission UI was raised this launch. */
export function markPromptedThisLaunch(): void { prompted = true; }

/**
 * Coalesce concurrent authorization requests. The launch check, a pull-to-
 * refresh and the add-activity card can all call `requestAuth` in the same
 * tick; without this they'd each open their own sheet (iOS) or permission
 * activity (Android).
 */
let inflight: Promise<boolean> | null = null;
export function shareAuthRequest(run: () => Promise<boolean>): Promise<boolean> {
  if (inflight) return inflight;
  const p = run();
  inflight = p;
  void p.catch(() => false).finally(() => { if (inflight === p) inflight = null; });
  // A request that never settles (see withAuthTimeout below) must not latch
  // this slot for the rest of the launch, or every later caller — including an
  // explicit Connect press — would await that dead promise. Longer than anyone
  // takes to answer a sheet; worst case a second request queues behind the
  // first, which the platform serializes anyway.
  setTimeout(() => { if (inflight === p) inflight = null; }, SHARE_EXPIRY_MS);
  return p;
}
const SHARE_EXPIRY_MS = 60_000;

/**
 * A permission request that is showing UI does not resolve until the user
 * answers it — and if the OS declined to present at all (asked while the app
 * wasn't foreground, or over another modal), it may never resolve. Callers that
 * only want the *chance* to ask — the quiet update check — must never hang on
 * that, so they give it a deadline and carry on reading whatever they can.
 */
// Short on purpose: the case worth waiting for is the silent one (nothing left
// to ask), which resolves in milliseconds. Once UI is actually on screen there
// is nothing to wait for — the user answers in their own time, and the next
// check (pull-to-refresh, or the next foreground) reads with the new grant.
export const AUTH_WAIT_MS = 2_500;
export function withAuthTimeout(p: Promise<boolean>, ms = AUTH_WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    void p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(false); },
    );
  });
}
