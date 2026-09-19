/**
 * Persistence for the barometric pressure card (see `PressureInsight` in ./index).
 *
 * The ./findingMemory mold: plaintext `autonomic.flags` MMKV, a LAZY require so the
 * pure engine and its jest project never touch MMKV, never re-exported from
 * ./index. What it holds is which pressure pairs were found ("pressure:low|rmssd|0")
 * and the last numbers each was seen with, so the card can outlive a window in
 * which its pair can no longer be tested.
 *
 * Unlike the finding memory it only ever GROWS during normal use: the card is the
 * one claim the app keeps once made. It is still a claim about THIS journal, so
 * "Clear all data" and an import wipe it, and a fresh journal has to earn it again.
 *
 * Also read by the Journal (`pressureLink`), which has no report to hand and must
 * not build one to decide whether to show a one-line warning.
 */
import type { Correlation } from './correlate';
import type { PressureInsight, PressureMemory } from './index';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pressureLink';

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

const EMPTY: PressureMemory = { ids: [], snapshots: {} };

export function pressureMemory(): PressureMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<PressureMemory>;
    const ids = Array.isArray(v.ids) ? v.ids.filter((x): x is string => typeof x === 'string') : [];
    const snapshots = v.snapshots && typeof v.snapshots === 'object' ? v.snapshots as Record<string, Correlation> : {};
    return { ids, snapshots };
  } catch { return EMPTY; }
}

/** Fold a real report's pressure card into the memory: new pairs added, every
 *  pair the build could re-test given its current numbers. No write when nothing
 *  moved, which is the common case. */
export function notePressureShown(p: PressureInsight | null): void {
  if (!p) return;
  const prev = pressureMemory();
  const ids = Array.from(new Set([...prev.ids, ...p.found]));
  const snapshots = { ...prev.snapshots };
  p.findings.forEach((f) => { if (!f.stale) snapshots[f.c.id] = f.c; });
  const raw = JSON.stringify({ ids, snapshots });
  if (raw === JSON.stringify(prev)) return;
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/**
 * The link the Journal's warning speaks from: the strongest remembered pair that
 * still points the bad way, or null. Snapshots are refreshed on every Insights
 * build, so this is as current as the last time the report was computed.
 */
export function pressureLink(): Correlation | null {
  const mem = pressureMemory();
  const live = mem.ids.map((id) => mem.snapshots[id]).filter((c): c is Correlation => !!c && !c.good);
  live.sort((a, b) => (b.pips - a.pips) || (Math.abs(b.r) - Math.abs(a.r)));
  return live[0] || null;
}

/** Forget it. For "Clear all data" and imports. */
export function resetPressureMemory(): void {
  memValue = undefined;
  try { store()?.delete(KEY); } catch { /* ignore */ }
}
