/**
 * Memory for the "What's new" pill: the last minor version whose notes the user
 * has already been shown (opened the card, or dismissed the pill).
 *
 * Lives in the plaintext flags MMKV, same instance as the health-import pill's
 * seen-memory and the review-prompt bookkeeping (see lib/health/askedAuth.ts for
 * the pattern). That placement is deliberate: this is device-local bookkeeping
 * about what THIS install has displayed, so it must not ride export/import, and
 * it should survive "Clear all data" — erasing the journal is not a request to
 * be told about the release again.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'whatsNewSeenMinor';

let kv: MMKV | null | undefined;
// `undefined` = not read yet, `null` = read and nothing stored.
let mem: string | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** The minor version already shown, or null if this install has shown none. */
export function getWhatsNewSeen(): string | null {
  if (mem === undefined) {
    try { mem = store()?.getString(KEY) ?? null; } catch { mem = null; }
  }
  return mem;
}

/** Remember that this minor version's notes were shown. */
export function markWhatsNewSeen(minor: string): void {
  mem = minor;
  try { store()?.set(KEY, minor); } catch { /* in-memory only this session */ }
}
