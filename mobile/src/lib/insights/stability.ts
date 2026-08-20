/**
 * Hysteresis for findings: strict to ENTER the report, looser to STAY.
 *
 * Without it a finding lives or dies by a single build. Every window slides one
 * day at midnight, and the Benjamini–Hochberg threshold is (k/m)·q — so a new
 * factor crossing MIN_FACTOR_DAYS changes the family size m and can flip an
 * unrelated finding that didn't move at all. The user experience of that is a
 * strong, well-evidenced claim ("quercetin days show higher RMSSD") simply
 * vanishing overnight, which reads as the app changing its mind for no reason.
 *
 * The fix is the standard one for flapping: two thresholds. A finding must pass
 * the full strict bar (BH at FDR_Q, MIN_EFFECT, worthSaying) to be SHOWN for the
 * first time; once shown, it is retained while it still passes a looser bar —
 * raw p ≤ RETAIN_P plus the same clinical filters — and is dropped the first
 * build it fails that. No clock: a finding holds as long as it stays plausible,
 * and its confidence pips are computed from its CURRENT q, so the row honestly
 * sags while it coasts.
 *
 * What this deliberately does not weaken: nothing enters the report at the loose
 * bar. Retention can only ever extend the life of a claim that once cleared the
 * measured FDR_Q, so the noise suite's guarantee — zero findings on a noise
 * journal — is untouched for anything the user hasn't already been shown.
 *
 * The memory of what was shown lives in ./findingMemory (MMKV); this module is
 * the pure half: the threshold and the id bookkeeping.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */

/**
 * The exit bar: a shown finding survives while its RAW p stays at or under this.
 *
 * Raw, not BH-adjusted, on purpose — the whole failure mode being fixed is the
 * adjusted threshold moving underneath a finding whose own evidence didn't
 * change. 0.10 is one notch looser than the entry q of 0.05: loose enough that
 * a day-to-day wobble doesn't kill a real finding, tight enough that a finding
 * which has genuinely dissolved (p drifting toward noise) is dropped within a
 * few days of losing its support.
 */
export const RETAIN_P = 0.10;

/** What the shell remembers between builds. */
export interface FindingMemoryState {
  /** Ids of the correlations the last real report showed. */
  correlationIds: string[];
  /** Id of the biggest-change finding it showed, if any. */
  changeId: string | null;
}

export const emptyFindingMemory = (): FindingMemoryState => ({ correlationIds: [], changeId: null });

/** A stale import or a decade of drift must not grow the list without bound. */
export const MAX_REMEMBERED = 64;

/** Parse whatever was persisted back into shape, dropping anything malformed. */
export function normalizeFindingMemory(raw: unknown): FindingMemoryState {
  if (!raw || typeof raw !== 'object') return emptyFindingMemory();
  const m = raw as { correlationIds?: unknown; changeId?: unknown };
  const ids = Array.isArray(m.correlationIds)
    ? m.correlationIds.filter((x): x is string => typeof x === 'string').slice(0, MAX_REMEMBERED)
    : [];
  return { correlationIds: ids, changeId: typeof m.changeId === 'string' ? m.changeId : null };
}

/**
 * The memory a finished report leaves behind: exactly what it showed.
 *
 * Not a union with the past — a remembered finding that failed even the loose
 * bar this build is gone, and keeping its id would let it pop back days later
 * on a lucky wobble, which is the flapping this module exists to prevent. The
 * fabricated welcome card is never remembered; there is no finding behind it.
 */
export function nextFindingMemory(report: {
  correlations: { id: string }[];
  change: { id: string; kind: string } | null;
}): FindingMemoryState {
  return {
    correlationIds: report.correlations.slice(0, MAX_REMEMBERED).map((c) => c.id),
    changeId: report.change && report.change.kind !== 'welcome' ? report.change.id : null,
  };
}

export function sameFindingMemory(a: FindingMemoryState, b: FindingMemoryState): boolean {
  return a.changeId === b.changeId
    && a.correlationIds.length === b.correlationIds.length
    && a.correlationIds.every((id, i) => id === b.correlationIds[i]);
}
