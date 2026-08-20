/**
 * The Insights tab's unseen-findings dot: one boolean, live.
 *
 * The tab bar subscribes here; the value is derived by building (or cache-
 * hitting) the same report the Insights screen shows and diffing its finding
 * ids against ../lib/insights/seen. Producing it cannot wait for the user to
 * open the screen — the whole point is telling them there is a reason to — so
 * `initInsightsBadge()` refreshes it at launch and after journal changes,
 * debounced and behind InteractionManager. The screen's own launch pre-warm
 * shares the report cache, so in the common case this costs a lookup, and
 * whichever side builds first pays for both.
 *
 * Everything queued here is wrapped: a throw in a deferred task poisons the
 * InteractionManager queue for every screen (the Progress-stuck-on-skeletons
 * incident), and a missing dot is the full cost of failing quietly.
 */
import { InteractionManager } from 'react-native';
import { useSyncExternalStore } from 'react';
import { hasOwnData } from '../lib/demo';
import { logError } from '../lib/diagnostics/errorLog';
import { resolveProtocol } from '../lib/scoring/day';
import type { InsightReport } from '../lib/insights';
import { computeInsights } from '../lib/insights/cache';
import { insightsAnchor } from '../lib/insights/anchorMemory';
import { reportFindingIds, seenFindingIds, stampInsightsSeen, unseenIds } from '../lib/insights/seen';
import { todayKey } from '../lib/dates';

let unseen = false;
const subs = new Set<() => void>();

function set(v: boolean): void {
  if (v === unseen) return;
  unseen = v;
  subs.forEach((cb) => cb());
}

export function useInsightsUnseen(): boolean {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => unseen,
  );
}

/** Re-derive the dot from a freshly built real report. */
export function refreshInsightsBadge(report: InsightReport): void {
  if (report.demo || report.failed) { set(false); return; }
  const ids = reportFindingIds(report);
  const seen = seenFindingIds();
  if (seen === null) {
    // First ever real report: stamp silently rather than greet a brand-new (or
    // freshly updated) install with a dot — the whatsNewSeen rule.
    stampInsightsSeen(ids);
    set(false);
    return;
  }
  set(unseenIds(ids, seen).length > 0);
}

/** The Insights screen was actually looked at: everything on it is now seen. */
export function markInsightsSeen(report: InsightReport): void {
  if (report.demo || report.failed) return;
  stampInsightsSeen(reportFindingIds(report));
  set(false);
}

/* ---------- the launch/journal-change refresher ---------- */

let armed = false;
/** Slower than the widget push's 2s on purpose: a full report build is heavier
 *  than a widget payload, and the dot is not a live readout. */
const DEBOUNCE_MS = 5000;

function refresh(): void {
  InteractionManager.runAfterInteractions(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getState } = require('./store') as typeof import('./store');
      const state = getState();
      // An empty journal has nothing to find and shows the countdown screen
      // instead — never a dot, and no reason to pay for the build.
      if (!hasOwnData(state.days)) { set(false); return; }
      const ctx = {
        sex: state.profile.sex,
        height: state.profile.height,
        protocol: resolveProtocol(state.settings.protocol),
        customTypes: state.customTypes,
      };
      refreshInsightsBadge(computeInsights(state, todayKey(), { ctx, anchor: insightsAnchor() }));
    } catch (e) {
      logError('insights.badge', e);
    }
  });
}

/** Arm once, from the root layout. */
export function initInsightsBadge(): void {
  if (armed) return;
  armed = true;
  refresh();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { subscribeStore } = require('./store') as typeof import('./store');
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; refresh(); }, DEBOUNCE_MS);
  });
}
