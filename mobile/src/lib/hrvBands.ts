/**
 * One-time repair: the frequency bands an Apple Watch reading should always
 * have carried.
 *
 * Before `computeHrv` could bridge a heartbeat series across its seams (see
 * `BRIDGE_MIN_COVERAGE` in lib/hrv), a watch reading's bands were resolved
 * over its longest unbroken piece only. The watch cuts a series wherever it
 * lost a beat, so a five-minute session holding 4m 40s of clean pulse
 * routinely kept every time-domain metric and NO power at all: no power
 * distribution, no total power, no VLF, and the day score's training-only
 * components missing with them.
 *
 * The beats are still in the waveform sidecar, but not the time each seam
 * lost (nothing recorded it until the bridge needed it), so the repair places
 * the stored pieces end to end: a hole read as zero seconds long, which is the
 * spectrum the reading's own chart has always drawn. It only ever FILLS a band
 * the reading is missing, never rewrites one it carries, and leaves every
 * time-domain number alone, since those were right. A reading recorded after
 * the bridge shipped carries `rrSeamGaps` and is never touched.
 *
 * Idempotent with no flag: a repaired reading holds the bands it was missing,
 * and the next launch finds nothing to do.
 *
 * Pure (no store imports), so it runs inside `loadState` and is unit-tested.
 */
import { computeHrv, MIN_SEC_LFHF, MIN_SEC_VLF } from './hrv';
import { computeScores, profileCtx } from './scoring';
import type { AppState, Entry } from './types';
import type { WaveformData } from './waveforms';

const HRV_TYPES = new Set(['hrv', 'breathHrv']);
const LF_FIELDS = ['lowPower', 'highPower', 'lfPeak', 'hfPeak'] as const;

const has = (r: Entry, k: string) => r[k] != null && r[k] !== '';

/** The band fields a reading of `sec` seconds of beats should carry and does not. */
function missingBands(r: Entry, sec: number): string[] {
  const want: string[] = [];
  if (sec >= MIN_SEC_LFHF) want.push(...LF_FIELDS);
  if (sec >= MIN_SEC_VLF) want.push('vlowPower');
  return want.filter((k) => !has(r, k));
}

/** Fill the missing bands on every Apple Watch reading the sidecar can
 *  recompute. Returns how many readings changed. */
export function fillWatchHrvBands(
  state: AppState,
  readWaveform: (id: string) => WaveformData | null | undefined,
): number {
  let filled = 0;
  const ctx = profileCtx(state.profile);
  for (const day of Object.values(state.days)) {
    const readings = day?.readings;
    if (!Array.isArray(readings)) continue;
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      if (!HRV_TYPES.has(r.type) || r.source !== 'watch') continue;
      const w = readWaveform(String(r.id));
      const rr = w?.rrRaw;
      if (!rr || rr.length < 20 || w?.rrSeamGaps) continue;
      const sec = rr.reduce((a, x) => a + x, 0) / 1000;
      const missing = missingBands(r, sec);
      if (!missing.length) continue;
      const starts = w?.rrSegments;
      const res = computeHrv(rr, {
        segmentStarts: starts,
        seamGapsMs: starts?.length ? starts.map(() => 0) : undefined,
      });
      const add = missing.filter((k) => res.fields[k] != null);
      if (!add.length) continue;
      const next: Entry = { ...r };
      for (const k of add) next[k] = res.fields[k];
      next.scores = computeScores(next, ctx);
      readings[i] = next;
      filled++;
    }
  }
  return filled;
}
