/**
 * Persistence for finding retention (./stability).
 *
 * The stateful sibling of a pure module, in exactly the ../trends/memory.ts
 * mold: ./index deliberately does not re-export this, so importing the insights
 * engine still pulls in no MMKV, and every statistical decision stays testable
 * without a store.
 *
 * Storage is the plaintext `autonomic.flags` MMKV. The ids in here name a
 * factor, an outcome and a lag — "med:custom-quercetin|rmssd|0" — which is not
 * health data (the journal holds the data; this is which CLAIM was on screen).
 * It never rides export/import.
 *
 * Demo builds never read or write this: the sample month's findings are not
 * claims anyone was shown about their own body.
 */
import { emptyFindingMemory, nextFindingMemory, normalizeFindingMemory, sameFindingMemory, type FindingMemoryState } from './stability';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'insightsFindings';

interface Flags {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. The
 * require is LAZY, unlike the sibling memory modules, because this one is
 * reachable from ./cache — which the pure-logic jest project imports, and that
 * environment cannot even parse react-native's entry point. */
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

export function findingMemory(): FindingMemoryState {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyFindingMemory();
  try { return normalizeFindingMemory(JSON.parse(raw)); } catch { return emptyFindingMemory(); }
}

/** Record what a real (non-demo) report showed. Skips the write when nothing
 *  changed, which is the common case. */
export function noteFindingsShown(report: { correlations: { id: string }[]; change: { id: string; kind: string } | null }): void {
  const next = nextFindingMemory(report);
  if (sameFindingMemory(next, findingMemory())) return;
  const raw = JSON.stringify(next);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/**
 * Forget everything. For "Clear all data" and for imports: a retained finding is
 * a claim about THIS journal's evidence, and letting one coast at the loose bar
 * over a journal it was never computed from would break the strict-entry rule.
 */
export function resetFindingMemory(): void {
  memValue = undefined;
  try { store()?.delete(KEY); } catch { /* ignore */ }
}
