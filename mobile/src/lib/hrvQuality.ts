/**
 * Trust rules for HRV readings that came from the platform health store.
 *
 * Apple Health / Health Connect are full of short HRV samples: the watch's
 * passive ~1-minute background measurement, a truncated Breathe session, an
 * RMSSD record written by another app. Those numbers are not comparable to a
 * real 5-minute seated reading, and a year of them dropped into the journal
 * drags every average, band and report off.
 *
 * So an *imported* HRV reading only counts — in the Journal, in the day score,
 * in Analysis, milestones, reports and widgets — when it carries real
 * beat-to-beat RR covering at least {@link IMPORTED_HRV_MIN_SEC}. The import
 * paths already refuse anything shorter (see health/updateSet + the readHistory
 * sweep); this is the second line of defence, and the only thing that helps a
 * journal that already took a bad batch in.
 *
 * Readings captured in-app are never touched by this — those are the user's own
 * deliberate sessions, however long they chose to make them.
 *
 * Pure module (no store imports) so it can run inside the analysis memos and be
 * unit-tested.
 */
import type { AppState, DayRecord, Entry } from './types';

/** Minimum RR coverage (seconds) for an imported HRV reading to be trusted.
 *  Matches the import-side gate in health/updateSet + health/index. */
export const IMPORTED_HRV_MIN_SEC = 4 * 60;

const HRV_TYPES = new Set(['hrv', 'breathHrv']);

/** Whether a reading may be shown and counted. Everything that isn't an
 *  imported HRV reading passes untouched. */
export function isTrustedReading(r: Entry): boolean {
  if (!HRV_TYPES.has(r.type)) return true;
  if (!r.imported) return true;
  // Imported readings are stamped with their RR coverage at import time; a
  // missing stamp means the sample carried no beat-to-beat series at all
  // (Apple's SDNN-only quantity sample, Health Connect's RMSSD record).
  const sec = Number(r.durationSec);
  return Number.isFinite(sec) && sec >= IMPORTED_HRV_MIN_SEC;
}

/** The day's readings with untrusted imports dropped. Returns the original
 *  array when nothing is filtered (keeps memo identity stable). */
export function trustedReadings(readings: readonly Entry[] | undefined): Entry[] {
  const arr = (readings || []) as Entry[];
  return arr.some((r) => !isTrustedReading(r)) ? arr.filter(isTrustedReading) : arr;
}

/**
 * Does this journal hold a single HRV reading worth calling a baseline?
 *
 * The question the Journal's Outlook slot asks before it shows a score at all:
 * until there is one, every derived number in the app is built on sleep and
 * blood pressure alone, and the honest thing to show is the ask rather than a
 * confident-looking dial. Untrusted imports do NOT count — a year of the
 * watch's one-minute background samples is exactly the case this module exists
 * for, and letting one of them retire the card would be the trust rule holding
 * everywhere except the place the user first meets it.
 *
 * Short-circuits on the first hit, so the common case (a journal with readings)
 * costs one day rather than a full scan.
 */
export function hasHrvReading(days: AppState['days'] | undefined): boolean {
  for (const dk of Object.keys(days || {})) {
    const day = (days as Record<string, DayRecord>)[dk];
    if (!day || !Array.isArray(day.readings)) continue;
    for (const r of day.readings) {
      if (HRV_TYPES.has(r.type) && isTrustedReading(r)) return true;
    }
  }
  return false;
}

/** Does this one day hold an HRV reading that counts? The morning reminder's
 *  question: a day already measured is not reminded. */
export function hasHrvReadingOn(day: DayRecord | undefined): boolean {
  return !!day && Array.isArray(day.readings)
    && day.readings.some((r) => HRV_TYPES.has(r.type) && isTrustedReading(r));
}

/** Does this day already hold a trusted BASELINE reading? The first one of a
 *  day is its morning snapshot (scoring and pacing build on it), so this is the
 *  question the morning card and the "which kind do you mean" entry points ask. */
export function hasBaselineReadingOn(day: DayRecord | undefined): boolean {
  return !!day && Array.isArray(day.readings)
    && day.readings.some((r) => r.type === 'hrv' && isTrustedReading(r));
}

/** RR coverage in whole seconds for a beat-to-beat series (ms intervals). */
export const rrCoverageSec = (rr: readonly number[] | undefined): number =>
  Math.round((rr || []).reduce((s, v) => s + v, 0) / 1000);

/**
 * One-time backfill: stamp `durationSec` on imported HRV readings saved by
 * older builds, which recorded no coverage. The RR series lives in the waveform
 * sidecar, so the caller passes the reader (the store owns MMKV; this stays
 * pure). A reading with no sidecar RR is stamped 0 — it never had a series, and
 * 0 keeps it consistently untrusted instead of re-reading the sidecar forever.
 *
 * Mutates `state`; returns how many readings were stamped (0 = nothing to do).
 */
export function stampImportedHrvCoverage(
  state: AppState,
  readRr: (id: string) => number[] | undefined,
): number {
  let stamped = 0;
  for (const dk of Object.keys(state.days)) {
    const day = state.days[dk] as DayRecord | undefined;
    if (!day || !Array.isArray(day.readings)) continue;
    for (const r of day.readings) {
      if (!HRV_TYPES.has(r.type) || !r.imported) continue;
      if (Number.isFinite(Number(r.durationSec))) continue;
      r.durationSec = rrCoverageSec(readRr(String(r.id)));
      stamped++;
    }
  }
  return stamped;
}

/* ---------- how good an imported sample was ---------- */

/**
 * The quality of the beat series behind an imported HRV sample.
 *
 * `computeHrv` already runs at import time (that is where the sample's metrics
 * come from), so the artifact rate and its verdict are free at exactly the
 * moment they are worth having. They ride the candidate to the offer sheet and
 * are then stamped on the entry, the same three numbers a live capture keeps.
 *
 * Absent means UNKNOWN, never clean: an SDNN-only sample carries no series to
 * grade, and a candidate built by a build before this shipped carries nothing.
 */
export interface ImportedHrvQuality {
  /** % of beats the artifact correction had to replace. */
  artifactPct: number;
  confidence: 'high' | 'fair' | 'low';
  /** Clean beats behind the numbers. */
  beatCount: number;
}

/**
 * Artifact rate above which an importable reading is called poor quality.
 *
 * Deliberately the `confidence` ladder's own 'fair' bar rather than the capture
 * gate (15% camera / 30% strap): capture REFUSES a reading over that, and an
 * import is not refused at all — the sample is already in the health store and
 * the user may well want it. So this is a warning, not a bar, and it is set
 * where the app already stops calling a reading trustworthy.
 */
export const POOR_IMPORT_ARTIFACT_PCT = 10;

/**
 * Should this candidate be tagged poor quality in the import sheet?
 *
 * A watch reading taken while walking, or a Breathe session with a loose band,
 * comes back with a third of its beats reconstructed — the numbers still
 * compute, and nothing downstream refuses them, so the only place the user can
 * learn this is the moment they choose whether to keep it. Unknown quality is
 * never reported as poor.
 */
export function isPoorImport(q: ImportedHrvQuality | undefined | null): boolean {
  if (!q) return false;
  return q.confidence === 'low' || q.artifactPct > POOR_IMPORT_ARTIFACT_PCT;
}

/** The reason, in the results card's own words ("23% artifacts"), for the row's
 *  sub-line. Null when there is no series to grade. */
export function importQualityNote(q: ImportedHrvQuality | undefined | null): string | null {
  return q ? `${Math.round(q.artifactPct)}% artifacts` : null;
}
