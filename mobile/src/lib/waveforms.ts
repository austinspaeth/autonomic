/**
 * Waveform sidecar helpers — pure logic, unit-tested (see __tests__/waveforms).
 *
 * Live HRV readings capture large per-beat arrays (~650 RR floats plus
 * per-second HR/SDNN samples — tens of KB per session). Persisted inline they
 * dominated the journal blob, which save() re-stringifies on every mutation,
 * so write cost grew monotonically with history. The arrays now live in a
 * separate MMKV instance keyed by entry id (wired in src/store/store.ts);
 * the journal keeps only the computed metrics, so it stays small no matter
 * how many sessions accumulate. Activities carry waveforms too — a workout
 * imported from the health store keeps its full HR trace as `sampledHr`.
 *
 * These helpers do the moving: splitting an entry into journal + waveform
 * halves, migrating legacy embedded arrays on load, and round-tripping
 * waveforms through export/import (new exports carry a top-level `waveforms`
 * map keyed by reading id; old exports with embedded arrays still import).
 */
import { isPlainObject } from './migrate';
import type { AppState, Entry } from './types';

export interface WaveformData {
  rrRaw?: number[];
  rrClean?: number[];
  /** Indices into rrRaw where camera tracking resumed after a dropout — the
   *  reading is discontinuous there, so it rides with rrRaw rather than in the
   *  journal blob (it's meaningless without it). Absent = one continuous take. */
  rrSegments?: number[];
  /** Seconds from the start of the reading/workout/night, and the rate then.
   *  A night's overnight heart-rate curve rides here too (keyed by
   *  {@link sleepWaveformId}), which is why this is `t`-relative rather than
   *  absolute: the journal already knows when the night began. */
  sampledHr?: { t: number; bpm: number }[];
  sampledSdnn?: { t: number; sdnn: number }[];
  /** Overnight respiratory rate, breaths per minute, same time base. */
  sampledResp?: { t: number; br: number }[];
  /** The night's hypnogram: one span per stage block, `s` seconds from bed and
   *  `d` seconds long. Stage minutes in the journal are the sums of these; the
   *  spans are what say WHEN each stage happened, which is the whole reason a
   *  night can be read rather than just totalled. */
  stageSpans?: { s: number; d: number; v: 'deep' | 'rem' | 'core' | 'awake' }[];
}

export const WAVEFORM_FIELDS = ['rrRaw', 'rrClean', 'rrSegments', 'sampledHr', 'sampledSdnn', 'sampledResp', 'stageSpans'] as const;

/**
 * Sidecar key for a night's series (overnight HR, respiratory rate, stage
 * spans). Nights are not entries — they live at `day.sleep` and have no id —
 * so they get a namespaced key instead. Entry ids are `uid()`s and never
 * contain a colon, so the two can't collide.
 */
export const sleepWaveformId = (dk: string) => `sleep:${dk}`;

/**
 * Split an entry into its journal half (waveform fields removed) and its
 * sidecar payload (null when it carries none). rrClean is NOT stored when
 * rrRaw is present — it's derived (correctArtifacts) and recomputed on view,
 * which halves the payload; it's kept only for defensive shapes that somehow
 * have a cleaned series without the raw one. Returns the original entry
 * object untouched when there is nothing to strip.
 */
export function splitWaveform(entry: Entry): { entry: Entry; waveform: WaveformData | null } {
  let waveform: WaveformData | null = null;
  let stripped: Entry | null = null;
  const hasRaw = Array.isArray(entry.rrRaw) && entry.rrRaw.length > 0;
  for (const f of WAVEFORM_FIELDS) {
    const v = entry[f];
    if (!Array.isArray(v)) continue;
    if (!stripped) stripped = { ...entry };
    delete stripped[f];
    if (!v.length) continue;
    if (f === 'rrClean' && hasRaw) continue; // derivable — recomputed on view
    if (!waveform) waveform = {};
    (waveform as Record<string, unknown>)[f] = v;
  }
  return stripped ? { entry: stripped, waveform } : { entry, waveform: null };
}

/** The day arrays whose entries may own a sidecar waveform. */
const WAVEFORM_ARRAYS = ['readings', 'activities'] as const;

/**
 * Move embedded arrays off every reading/activity into the sidecar via `put`.
 * The sidecar write happens BEFORE the stripped journal is persisted by the
 * caller, so a crash between the two writes just re-runs the (idempotent)
 * move on the next launch. Mutates `state`. Returns how many entries changed.
 */
export function extractWaveforms(
  state: AppState,
  put: (id: string, data: WaveformData) => void,
): number {
  let moved = 0;
  for (const dk of Object.keys(state.days)) {
    const day = state.days[dk];
    if (!day) continue;
    for (const arr of WAVEFORM_ARRAYS) {
      if (!Array.isArray(day[arr])) continue;
      day[arr] = day[arr].map((r) => {
        const { entry, waveform } = splitWaveform(r);
        if (entry === r) return r;
        if (waveform) put(entry.id, waveform);
        moved++;
        return entry;
      });
    }
  }
  return moved;
}

/** Every reading + activity id in the journal — the set of sidecar keys
 *  allowed to exist (export filters to these; the store prunes strays on
 *  launch). */
export function waveformIds(state: AppState): Set<string> {
  const ids = new Set<string>();
  for (const dk of Object.keys(state.days)) {
    const day = state.days[dk];
    if (!day) continue;
    for (const arr of WAVEFORM_ARRAYS) {
      const rs = day[arr];
      if (!Array.isArray(rs)) continue;
      for (const r of rs) if (typeof r.id === 'string' && r.id) ids.add(r.id);
    }
    // Nights own a sidecar too. They must be listed here or `pruneWaveforms`
    // would delete every overnight curve on the next launch (it drops any key
    // this set does not name), and exports would leave them behind.
    if (day.sleep && day.sleep.bed && day.sleep.wake) ids.add(sleepWaveformId(dk));
  }
  return ids;
}

/**
 * Validate the top-level `waveforms` map of a new-format export. Imports are
 * user-picked files, so only well-shaped array fields survive, only for ids
 * that exist as entries — and "__proto__" is skipped (JSON.parse creates it
 * as an own key; using it as a map key would poison the output's prototype).
 */
export function collectImportWaveforms(
  parsed: unknown,
  validIds: Set<string>,
): Record<string, WaveformData> {
  const out: Record<string, WaveformData> = {};
  if (!isPlainObject(parsed) || !isPlainObject(parsed.waveforms)) return out;
  const src = parsed.waveforms;
  for (const id of Object.keys(src)) {
    if (id === '__proto__' || !validIds.has(id)) continue;
    const v = src[id];
    if (!isPlainObject(v)) continue;
    let data: WaveformData | null = null;
    for (const f of WAVEFORM_FIELDS) {
      const arr = v[f];
      if (!Array.isArray(arr) || !arr.length) continue;
      if (!data) data = {};
      (data as Record<string, unknown>)[f] = arr;
    }
    if (data) out[id] = data;
  }
  return out;
}

/** Dev-build tripwire: the first entry still carrying an inline waveform
 *  array, as "day/type:field" — null when the journal is clean. Every write
 *  path must route arrays through the sidecar; this catches a missed one. */
export function findEmbeddedWaveform(state: AppState): string | null {
  for (const dk of Object.keys(state.days)) {
    const day = state.days[dk];
    if (!day) continue;
    for (const arr of WAVEFORM_ARRAYS) {
      const rs = day[arr];
      if (!Array.isArray(rs)) continue;
      for (const r of rs) {
        for (const f of WAVEFORM_FIELDS) {
          const v = r[f];
          if (Array.isArray(v) && v.length) return `${dk}/${String(r.type)}:${f}`;
        }
      }
    }
  }
  return null;
}
