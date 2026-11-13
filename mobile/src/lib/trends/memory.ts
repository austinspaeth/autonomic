/**
 * Persistence for the Trend card's pacing (./pacing).
 *
 * The ONE stateful file in src/lib/trends — everything else in here is pure, and
 * ./index deliberately does not re-export this, so importing the trend engine
 * still pulls in no MMKV.
 *
 * Same storage rules as src/lib/upsell and src/lib/review: the plaintext
 * `autonomic.flags` MMKV. It isn't health data, and it must never ride
 * export/import (an imported journal is not a request to be congratulated
 * again). "Clear all data" is the one thing that DOES erase it
 * (`resetTrendMemory` below): the cooldowns are about the person reading, but a
 * pinned claim is a finished sentence about the data itself.
 */
import { MMKV } from 'react-native-mmkv';
import { claimTrend, emptyTrendMemory, migrateTrendMemory, type TrendClaim, type TrendMemory } from './pacing';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'trendCard';

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
let memValue: string | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function trendMemory(): TrendMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyTrendMemory();
  try {
    const parsed = JSON.parse(raw) as TrendMemory;
    return migrateTrendMemory({
      last: parsed.last && typeof parsed.last.atMs === 'number' ? parsed.last : undefined,
      families: parsed.families && typeof parsed.families === 'object' ? parsed.families : {},
    });
  } catch {
    return emptyTrendMemory();
  }
}

function write(m: TrendMemory): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/** Record a finding as said, and return the memory written so the card can
 *  render from the same value it just persisted rather than reading back. */
export function noteTrendShown(claim: Omit<TrendClaim, 'v'>): TrendMemory {
  const next = claimTrend(trendMemory(), claim);
  write(next);
  return next;
}

/**
 * Forget every claim and cooldown. For "Clear all data" only.
 *
 * The pacing itself is about the reader rather than the journal, which is why the
 * rest of this module survives a wipe — but a PINNED claim is not pacing, it is a
 * finished sentence about data that no longer exists ("Your resting HR is down 6
 * bpm!"), and `trendGate` would keep serving it on the Journal for the rest of the
 * day. Wholesale rather than just dropping `last`, for the same reason
 * `migrateTrendMemory` is: cooldowns exist to space out claims, and once the claims
 * are void there is nothing left to space.
 */
export function resetTrendMemory(): void {
  memValue = undefined;
  try { store()?.delete(KEY); } catch { /* in-memory only this session */ }
}
