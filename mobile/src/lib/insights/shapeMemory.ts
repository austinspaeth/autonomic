/**
 * Storage for the skeleton's shape memory: how many rows each card last held, and
 * how tall each card measured.
 *
 * Lives in the plaintext `autonomic.flags` MMKV alongside the what's-new pill and the
 * review bookkeeping (see ../whatsNewSeen for the pattern). That placement is
 * deliberate: this is device-local bookkeeping about what THIS install last
 * displayed, so it must not ride export/import, and it should survive "Clear all
 * data" — a cleared journal simply writes a smaller shape on the next build, which is
 * the correct outcome anyway.
 *
 * Deliberately a shape and not a report: caching the findings themselves would mean a
 * stale claim could be rendered as though it were current. All the rules live in
 * ./shape, which is pure and tested.
 */
import { MMKV } from 'react-native-mmkv';
import { DEFAULT_SHAPE, normalizeShape, sameShape, type InsightsShape } from './shape';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsShape';

let kv: MMKV | null | undefined;
// `undefined` = not read yet, `null` = read and nothing stored.
let mem: InsightsShape | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** The last shape this install displayed, or DEFAULT_SHAPE. */
export function insightsShape(): InsightsShape {
  if (mem === undefined) {
    mem = null;
    try {
      const raw = store()?.getString(KEY);
      if (raw) mem = normalizeShape(JSON.parse(raw));
    } catch { mem = null; }
  }
  return mem ?? DEFAULT_SHAPE;
}

/** Record what was just rendered. Cheap and idempotent; skips an identical write. */
export function noteInsightsShape(shape: InsightsShape): void {
  const cur = mem ?? null;
  if (cur && sameShape(cur, shape)) return;
  mem = shape;
  try { store()?.set(KEY, JSON.stringify(shape)); } catch { /* a mis-sized skeleton is not worth a crash */ }
}

/** Drop the in-memory copy. For tests. */
export function resetInsightsShape(): void { mem = undefined; kv = undefined; }
