// Analysis bucketing — ordered time buckets for the active analysis mode.
// Ported from legacy docs/index.html:
//   acRangeLabel (~4581)
//   acBuckets    (~4589)
//
// Decoupled from the legacy globals: instead of reading the global
// `analysisMode` and `state.days`, both the mode and the days map are passed
// in. `todayKey` is supplied by the caller (computed in the component from the
// JS Date) so this module stays pure.

import type { Day } from '@core/types';

export type AnalysisMode = 'day' | 'week' | 'month' | 'year';

export type AcBucket = { start: string; end: string; label: string; days: string[] };

// keyOf-equivalent: local "YYYY-MM-DD" from a Date (kept inline to keep this
// module dependency-light; matches @core/date/dateUtils keyOf semantics).
function keyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function acRangeLabel(mode: AnalysisMode): string {
  return mode === 'day' ? 'Last 15 days · daily'
    : mode === 'week' ? 'Last 12 weeks · weekly average'
    : mode === 'month' ? 'Last 12 months · monthly average'
    : 'All time · yearly average';
}

// Ordered buckets for the active mode. Each: { start, end, label, days[] }.
export function acBuckets(
  days: Record<string, Day>,
  mode: AnalysisMode,
  todayKey: string,
): AcBucket[] {
  // Derive a local midnight Date from todayKey so bucket math is calendar-based.
  const [ty, tm, td] = todayKey.split('-').map((x) => +x);
  const today = new Date(ty, tm - 1, td);
  today.setHours(0, 0, 0, 0);

  const mk = (s: Date, e: Date, label: string): AcBucket => ({ start: keyOf(s), end: keyOf(e), label, days: [] });
  let buckets: AcBucket[] = [];

  if (mode === 'day') {
    for (let i = 14; i >= 0; i--) { const dt = new Date(today); dt.setDate(today.getDate() - i); buckets.push(mk(dt, dt, `${dt.getMonth() + 1}/${dt.getDate()}`)); }
  } else if (mode === 'week') {
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - dow);
    for (let i = 11; i >= 0; i--) { const s = new Date(thisMon); s.setDate(thisMon.getDate() - i * 7); const e = new Date(s); e.setDate(s.getDate() + 6); buckets.push(mk(s, e, `${s.getMonth() + 1}/${s.getDate()}`)); }
  } else if (mode === 'month') {
    for (let i = 11; i >= 0; i--) { const s = new Date(today.getFullYear(), today.getMonth() - i, 1); const e = new Date(today.getFullYear(), today.getMonth() - i + 1, 0); buckets.push(mk(s, e, s.toLocaleDateString(undefined, { month: 'short' }))); }
  } else {
    const keys = Object.keys(days); let minY = today.getFullYear();
    keys.forEach((k) => { const y = +k.slice(0, 4); if (y < minY) minY = y; });
    for (let y = minY; y <= today.getFullYear(); y++) buckets.push(mk(new Date(y, 0, 1), new Date(y, 11, 31), String(y)));
  }

  const allKeys = Object.keys(days).sort();
  buckets.forEach((b) => { b.days = allKeys.filter((k) => k >= b.start && k <= b.end); });
  return buckets;
}
