/**
 * Memory for the NEW badge in the Insights header: the fingerprint of the
 * findings this install has already shown.
 *
 * Lives in the plaintext `autonomic.flags` MMKV, the same instance as the
 * what's-new pill and the review bookkeeping (see ../whatsNewSeen for the
 * pattern). That placement is deliberate and for the same reasons: this is
 * device-local bookkeeping about what THIS install has displayed, so it must not
 * ride export/import — importing a friend's journal is not a reason to be told
 * the findings are new — and it should survive "Clear all data", since clearing
 * the journal empties the findings rather than making the old ones fresh again.
 *
 * The badge is driven by `InsightReport.fingerprint`, which covers only the
 * headline change and the four visible correlations. A badge that lit up whenever
 * anything anywhere shifted would light up every day and mean nothing.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsSeenFingerprint';

let kv: MMKV | null | undefined;
// `undefined` = not read yet, `null` = read and nothing stored.
let mem: string | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** The fingerprint already shown, or null if this install has shown none. */
export function getInsightsSeen(): string | null {
  if (mem === undefined) {
    try { mem = store()?.getString(KEY) ?? null; } catch { mem = null; }
  }
  return mem ?? null;
}

/**
 * Are these findings new to this install?
 *
 * A first-ever report is NOT new. Someone opening the screen for the first time
 * is being shown everything for the first time by definition; a NEW badge there
 * is noise, and it would then go stale the moment they looked away.
 */
export function insightsAreNew(fingerprint: string): boolean {
  if (!fingerprint || fingerprint === '-') return false;
  const seen = getInsightsSeen();
  return seen !== null && seen !== fingerprint;
}

/** Mark these findings as shown. Called once the user has actually seen them. */
export function markInsightsSeen(fingerprint: string): void {
  if (!fingerprint) return;
  if (mem === fingerprint) return;
  mem = fingerprint;
  try { store()?.set(KEY, fingerprint); } catch { /* a lost badge is not worth a crash */ }
}
