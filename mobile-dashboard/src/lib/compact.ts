/* The usage report arrives COMPACT: each row is the stored maps as they are,
 * `{ day, total, c: { cohortKey: n }, b?: { buildKey: n }, e?: { "key~V": n } }`,
 * because every field the expanded form spells out is in the keys. This is
 * the server's expansion (sls/lambdas/ping/main.js readDays), done here, so
 * every view keeps reading the expanded shape it always has.
 *
 *   cohort key  MMDDYY + store letter (I/A, absent = U) + slot letter? + "-" tier?
 *   build key   store "-" tier "-" version
 */
import type { PingBuild, PingCohort, PingKind, PingReport, PingRow } from './types';

const TIERS: Record<string, true> = { F: true, T: true, P: true };
const STORES: Record<string, true> = { I: true, A: true, U: true };
const EVIDENCE: Record<string, true> = { V: true, S: true };

function cohortOf(key: string, count: number): PingCohort {
  const [head, tierPart] = String(key).split('-');
  const date = head.slice(0, 6);
  const platform = (head.length > 6 && STORES[head[6]] ? head[6] : 'U') as PingCohort['platform'];
  return {
    key,
    cohort: `20${date.slice(4, 6)}-${date.slice(0, 2)}-${date.slice(2, 4)}`,
    platform,
    slot: head.length > 7 ? head[7] : null,
    tier: tierPart && TIERS[tierPart] ? (tierPart as PingCohort['tier']) : null,
    count: Number(count) || 0,
  };
}

function buildOf(key: string, count: number): PingBuild {
  const [platform, tier, version] = String(key).split('-');
  return {
    key,
    platform: (STORES[platform] ? platform : 'U') as PingBuild['platform'],
    tier: tier && TIERS[tier] ? (tier as PingBuild['tier']) : null,
    version: version && version !== '?' ? version : null,
    count: Number(count) || 0,
  };
}

type CompactRow = { day: string; total: number; c?: Record<string, number>; b?: Record<string, number>; e?: Record<string, number> };

function rowOf(r: CompactRow): PingRow {
  const out: PingRow = {
    day: r.day,
    total: Number(r.total) || 0,
    cohorts: Object.entries(r.c || {}).map(([k, n]) => cohortOf(k, n)),
    builds: Object.entries(r.b || {}).map(([k, n]) => buildOf(k, n)),
  };
  if (r.e) {
    out.evidence = Object.entries(r.e)
      .map(([k, n]) => {
        const [key, letter] = k.split('~');
        return EVIDENCE[letter] ? { key, evidence: letter as 'V' | 'S', count: Number(n) || 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }
  return out;
}

/** Expand a compact report; an expanded one (an older server) passes through. */
export function expandReport(raw: any): PingReport {
  if (!raw || !raw.compact) return raw as PingReport;
  const out: any = { since: raw.since, faults: raw.faults || [], offerFailures: raw.offerFailures || [] };
  Object.keys(raw).forEach((k) => {
    const v = raw[k];
    if (!Array.isArray(v) || k === 'faults' || k === 'offerFailures') return;
    out[k as PingKind] = v.map(rowOf);
  });
  return out as PingReport;
}
