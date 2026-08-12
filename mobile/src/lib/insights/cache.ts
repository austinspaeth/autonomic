/**
 * One report per (day, journal revision), held in memory.
 *
 * The Insights view is a tab that stays mounted, re-renders on every sheet and
 * animation, and sits behind a ~180-day analysis. Rebuilding on render would be
 * unusable; rebuilding on focus would still stutter the tab transition. So the
 * screen asks this module, gets an instant hit or a null, and only pays for a
 * build when something has genuinely changed.
 *
 * The key is `todayKey() | meta.lastUpdated`. Both halves are load-bearing:
 * `save()` stamps `meta.lastUpdated` on every mutation, so a new entry
 * invalidates immediately rather than at midnight; and the day key invalidates a
 * report whose windows have all shifted by one even though nothing was logged.
 * Nothing here reads the clock or the store itself — the caller passes both, which
 * keeps the module testable and keeps the day boundary a decision made in one
 * place (../dates.todayKey).
 *
 * Only the latest entry is kept. A one-slot cache is enough because the screen
 * only ever asks about today, and holding old reports would pin whole journals in
 * memory for no benefit.
 *
 * Pure apart from the module-level slot: no store, no MMKV, no expo, no React.
 */
import type { ScoreContext } from '../scoring';
import type { AppState } from '../types';
import { buildInsights, type InsightReport } from './index';

interface Slot { key: string; report: InsightReport }

let slot: Slot | null = null;

/** The revision this state would produce a report for. `demo` is part of the key
 *  because the sample month and the user's own data are two different reports
 *  that can share a `lastUpdated` — the first entry someone logs flips the mode. */
export function cacheKey(state: AppState, dk: string, demo?: boolean, anchor?: string | null): string {
  // The anchor is part of the key because it changes which days the header's claim is
  // computed from: picking a new day one has to rebuild, not serve the old number.
  return `${dk}|${state.meta.lastUpdated || '-'}|${demo ? 'demo' : 'own'}|${anchor || '-'}`;
}

/** A cached report for this exact revision, or null. Never recomputes. */
export function getCachedInsights(state: AppState, dk: string, demo?: boolean, anchor?: string | null): InsightReport | null {
  const key = cacheKey(state, dk, demo, anchor);
  return slot && slot.key === key ? slot.report : null;
}

/**
 * The report for this revision, building it if the cache misses.
 *
 * This is the expensive call. Callers must keep it off the interaction path —
 * `InteractionManager.runAfterInteractions`, behind a skeleton on first build and
 * behind the previous report on later ones.
 */
export function computeInsights(state: AppState, dk: string, opts: { demo?: boolean; ctx?: ScoreContext; anchor?: string | null } = {}): InsightReport {
  const key = cacheKey(state, dk, opts.demo, opts.anchor);
  const hit = slot && slot.key === key ? slot.report : null;
  if (hit) return hit;
  const report = buildInsights(state, dk, opts);
  slot = { key, report };
  return report;
}

/** Drop the cache. For tests, and for "Clear all data". */
export function resetInsightsCache(): void { slot = null; }
