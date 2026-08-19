/**
 * Which findings the user has actually SEEN, for the tab bar's unseen dot.
 *
 * The Insights tab gets a small violet dot when the latest real report contains
 * a finding id that was never on screen, and the dot clears when the screen is
 * visited. Ids, not counts: a finding that merely re-ranked is not news, a new
 * id is. Retained findings keep their id (../stability), so holding a finding
 * never re-lights the dot; a copy change doesn't either, because ids name the
 * factor/outcome/lag rather than the sentence.
 *
 * Storage is the plaintext `autonomic.flags` MMKV (lazy-required, same reason
 * as ./findingMemory: this module is reachable from environments that cannot
 * parse react-native). `null` from `seenFindingIds` means "never stamped" —
 * a fresh install or first launch after this shipped — and the caller stamps
 * the current report silently instead of greeting the user with a dot, the
 * same rule whatsNewSeen applies.
 *
 * Demo reports never reach this module: sample-month findings are not news
 * about anyone's body.
 */

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsSeen';
const MAX_SEEN = 128;

/* ---------- pure half ---------- */

/** Every id a report is showing: correlations, early signals, and the change
 *  card (never the fabricated welcome card). */
export function reportFindingIds(report: {
  correlations: { id: string }[];
  early: { id: string }[];
  change: { id: string; kind: string } | null;
}): string[] {
  const ids = [
    ...report.correlations.map((c) => c.id),
    ...report.early.map((c) => c.id),
  ];
  if (report.change && report.change.kind !== 'welcome') ids.push(report.change.id);
  return ids;
}

/** The ids in `ids` the user has not seen. */
export function unseenIds(ids: string[], seen: string[]): string[] {
  const have = new Set(seen);
  return ids.filter((id) => !have.has(id));
}

/* ---------- shell ---------- */

interface Flags {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

let kv: Flags | null | undefined;
let memValue: string | undefined;
function store(): Flags | null {
  if (kv !== undefined) return kv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv') as { MMKV: new (opts: { id: string }) => Flags };
    kv = new MMKV({ id: FLAGS_ID });
  } catch { kv = null; }
  return kv;
}

/** The stamped set, or null when nothing was ever stamped (fresh install). */
export function seenFindingIds(): string[] | null {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/**
 * Stamp what is on screen as seen. REPLACES the set rather than accumulating:
 * an id no longer in any report can only come back by re-passing the strict
 * bar, at which point it is genuinely news again — and the set stays bounded.
 */
export function stampInsightsSeen(ids: string[]): void {
  const raw = JSON.stringify(ids.slice(0, MAX_SEEN));
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}
