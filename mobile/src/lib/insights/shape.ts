/**
 * How many findings the user last saw, so the skeleton can be the right LENGTH.
 *
 * Matching heights per row gets a skeleton most of the way, but not all of it: a
 * user whose journal yields two correlations and no observations still watches the
 * page collapse if the placeholder shows four and three. Progress solves the same
 * problem by shaping its veil from the outgoing range's real cards
 * (`veilItems`); this screen has no outgoing range to copy, so it remembers
 * instead.
 *
 * Lives in the plaintext `autonomic.flags` MMKV alongside the NEW-badge
 * fingerprint (see ./seen for the pattern). It is device-local bookkeeping about
 * what THIS install last displayed, so it must not ride export/import, and it
 * should survive "Clear all data" — though a cleared journal will simply write a
 * smaller shape on the next build, which is the correct outcome anyway.
 *
 * Deliberately a shape and not a report: caching the findings themselves would
 * mean a stale claim could be rendered as though it were current.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsShape';

export interface InsightsShape {
  change: boolean;
  correlations: number;
  observations: number;
  watch: number;
}

/**
 * What a first-ever launch assumes.
 *
 * A full-looking page rather than an empty one: the first build is the one most
 * likely to find something (it has the whole journal to work with), and
 * over-reserving costs a little empty space at the bottom for one frame, while
 * under-reserving costs a visible jump. Only ever wrong once per install.
 */
export const DEFAULT_SHAPE: InsightsShape = { change: true, correlations: 4, observations: 3, watch: 4 };

/** Nothing at all, for the locked and genuinely-empty cases. */
export const EMPTY_SHAPE: InsightsShape = { change: false, correlations: 0, observations: 0, watch: 0 };

let kv: MMKV | null | undefined;
// `undefined` = not read yet, `null` = read and nothing stored.
let mem: InsightsShape | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

const clamp = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
};

/** The last shape this install displayed, or DEFAULT_SHAPE. */
export function insightsShape(): InsightsShape {
  if (mem === undefined) {
    mem = null;
    try {
      const raw = store()?.getString(KEY);
      if (raw) {
        const o = JSON.parse(raw) as Record<string, unknown>;
        // Clamped on read: a hand-edited or future-version value must not be able
        // to ask for four hundred ghost rows.
        mem = {
          change: !!o.change,
          correlations: clamp(o.correlations, 8),
          observations: clamp(o.observations, 3),
          watch: clamp(o.watch, 5),
        };
      }
    } catch { mem = null; }
  }
  return mem ?? DEFAULT_SHAPE;
}

/** Record what was just rendered. Cheap and idempotent; skips an identical write. */
export function noteInsightsShape(shape: InsightsShape): void {
  const cur = mem ?? null;
  if (cur && cur.change === shape.change && cur.correlations === shape.correlations
    && cur.observations === shape.observations && cur.watch === shape.watch) return;
  mem = shape;
  try { store()?.set(KEY, JSON.stringify(shape)); } catch { /* a mis-sized skeleton is not worth a crash */ }
}
