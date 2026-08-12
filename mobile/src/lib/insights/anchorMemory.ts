/**
 * The user's chosen "day one": the date the header's claim compares against.
 *
 * By default the comparison runs from the earliest day they ever logged, which is the
 * right answer for almost everybody. It is the wrong answer for two common cases,
 * which is why this exists: somebody who imported a year of Health data has a "day
 * one" from before they were paying attention, and somebody recovering from a
 * distinct event wants to measure from that event rather than from the start of the
 * file.
 *
 * Lives in the plaintext `autonomic.flags` MMKV alongside the skeleton's shape memory
 * and the what's-new pill (see ../whatsNewSeen for the pattern). Device-local
 * bookkeeping about how this install wants to be shown its own data: it must not ride
 * export/import, and it should survive "Clear all data" — an anchor with no journal
 * behind it simply produces no claim, and the next journal will use it.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsAnchor';

/** A day key, `YYYY-MM-DD`. Validated on the way in AND out: this value decides which
 *  numbers a health claim is computed from, so a malformed one must read as absent
 *  rather than as a date the engine will try to slice a window at. */
const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

let kv: MMKV | null | undefined;
let mem: string | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** The chosen day one, or null to use the earliest logged day. */
export function insightsAnchor(): string | null {
  if (mem === undefined) {
    mem = null;
    try { const raw = store()?.getString(KEY); if (isDayKey(raw)) mem = raw; } catch { mem = null; }
  }
  return mem ?? null;
}

/** Set it, or pass null to go back to the earliest logged day. */
export function setInsightsAnchor(dk: string | null): void {
  const next = isDayKey(dk) ? dk : null;
  if (mem === next) return;
  mem = next;
  try {
    const s = store();
    if (next) s?.set(KEY, next); else s?.delete(KEY);
  } catch { /* a lost preference is not worth a crash */ }
}
