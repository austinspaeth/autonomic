/**
 * Persistence for the Trend card's pacing (./pacing).
 *
 * The ONE stateful file in src/lib/trends — everything else in here is pure, and
 * ./index deliberately does not re-export this, so importing the trend engine
 * still pulls in no MMKV.
 *
 * Same storage rules as src/lib/upsell and src/lib/review: the plaintext
 * `autonomic.flags` MMKV. It isn't health data, it must never ride
 * export/import (an imported journal is not a request to be congratulated
 * again), and it has to survive "Clear all data" — the pacing is about the
 * person reading, not about the journal.
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
