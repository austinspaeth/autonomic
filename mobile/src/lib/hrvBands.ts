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
 * Idempotent, and BOTH halves of that matter, because this runs inside
 * `loadState` — synchronously, on the JS thread, before React mounts. A
 * repaired reading holds the bands it was missing and is skipped from the
 * entry alone, with no sidecar read. A reading the repair CANNOT finish is
 * marked `bandsTried`, because without a mark it is not idempotent at all: it
 * pays for a decrypt, a JSON parse of its whole beat series and a full
 * artifact-correction + FFT on every launch for ever, and writes nothing.
 * That was an unbounded launch cost that grew with history.
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

/** Every band this repair can ever add. */
const ALL_BANDS: readonly string[] = [...LF_FIELDS, 'vlowPower'];

/** Could this reading gain ANY band, at ANY coverage? Answered from the entry
 *  alone — the whole point is to decide before touching the sidecar, since
 *  `missingBands` needs `sec` and `sec` costs a read of the full series. */
const couldGainABand = (r: Entry) => ALL_BANDS.some((k) => !has(r, k));

/** Fill the missing bands on every Apple Watch reading the sidecar can
 *  recompute. Returns how many readings were written — repaired, or marked as
 *  unrepairable so the next launch skips them. */
export function fillWatchHrvBands(
  state: AppState,
  readWaveform: (id: string) => WaveformData | null | undefined,
): number {
  let changed = 0;
  const ctx = profileCtx(state.profile);
  for (const day of Object.values(state.days)) {
    const readings = day?.readings;
    if (!Array.isArray(readings)) continue;
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      if (!HRV_TYPES.has(r.type) || r.source !== 'watch') continue;
      // Both guards are answered from the ENTRY. The read they skip is an
      // encrypted MMKV get plus a JSON parse of a whole beat series, and it is
      // deliberately uncached (`readWaveformUncached`, so this sweep cannot
      // evict the curves the Journal is about to draw) — so an unguarded read
      // is paid in full on every launch, for every watch reading ever taken.
      if (r.bandsTried || !couldGainABand(r)) continue;
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
      if (!add.length) {
        // The series cannot produce these bands and never will, so mark it.
        // Only HERE, never where `missing` came back empty: that one is "this
        // coverage wants no more bands", which is a reading already complete,
        // not a repair that failed.
        readings[i] = { ...r, bandsTried: true };
        changed++;
        continue;
      }
      const next: Entry = { ...r };
      for (const k of add) next[k] = res.fields[k];
      next.scores = computeScores(next, ctx);
      readings[i] = next;
      changed++;
    }
  }
  return changed;
}
