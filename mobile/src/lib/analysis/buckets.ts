/**
 * Analysis aggregation engine — ported from the PWA's acBuckets/acAgg/acReadVals
 * family. Buckets days by the active range (day/week/month/year) and averages
 * within each bucket. Pure over a days map + score context.
 */
import { keyOf } from '../dates';
import type { Band, DayRecord, Entry } from '../types';
import { BANDS, SCORE_COLORS, catFromBands, type ScoreContext } from '../scoring';
import { SCORE_CATS, scoreSet, blueZone, type DaysMap } from '../scoring/day';

export type Mode = 'day' | 'week' | 'month' | 'year';
export interface Bucket { start: string; end: string; label: string; days: string[] }

export function acRangeLabel(mode: Mode): string {
  return mode === 'day' ? 'Last 14 days · daily'
    : mode === 'week' ? 'Last 12 weeks · weekly average'
    : mode === 'month' ? 'Last 12 months · monthly average'
    : 'All time · yearly average';
}

export function acBuckets(days: DaysMap, mode: Mode): Bucket[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mk = (s: Date, e: Date, label: string): Bucket => ({ start: keyOf(s), end: keyOf(e), label, days: [] });
  const buckets: Bucket[] = [];
  if (mode === 'day') {
    for (let i = 13; i >= 0; i--) { const dt = new Date(today); dt.setDate(today.getDate() - i); buckets.push(mk(dt, dt, `${dt.getMonth() + 1}/${dt.getDate()}`)); }
  } else if (mode === 'week') {
    // Weeks run Sunday → Saturday (matching the Calendar grid), so the last
    // bucket is the in-progress week starting on the most recent Sunday.
    const thisSun = new Date(today); thisSun.setDate(today.getDate() - today.getDay());
    for (let i = 11; i >= 0; i--) { const s = new Date(thisSun); s.setDate(thisSun.getDate() - i * 7); const e = new Date(s); e.setDate(s.getDate() + 6); buckets.push(mk(s, e, `${s.getMonth() + 1}/${s.getDate()}`)); }
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

export const acMinOf = (t?: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const isMorning = (r: Entry) => { const mo = acMinOf(r.time as string); if (mo != null) return mo < 720; return (r.period || '') === 'Morning'; };
export const isEvening = (r: Entry) => { const mo = acMinOf(r.time as string); if (mo != null) return mo >= 1080; return (r.period || '') === 'Evening'; };

export function acReadVals(d: DayRecord, type: string, key: string, filt?: (r: Entry) => boolean): number[] {
  const out: number[] = [];
  (d.readings || []).forEach((r) => { if (r.type !== type) return; if (filt && !filt(r)) return; const v = parseFloat(r[key] as string); if (!isNaN(v)) out.push(v); });
  return out;
}
export function acTotalPower(d: DayRecord, filt?: (r: Entry) => boolean): number[] {
  return (d.readings || []).filter((r) => r.type === 'breathHrv' && (!filt || filt(r))).map((r) => {
    const p = ['vlowPower', 'lowPower', 'highPower'].map((k) => parseFloat(r[k] as string));
    return p.every((x) => !isNaN(x)) ? p[0] + p[1] + p[2] : null;
  }).filter((v): v is number => v != null);
}

export function makeAgg(days: DaysMap, ctx: ScoreContext) {
  const acDayScore = (d: DayRecord, dk: string) => scoreSet(d.readings || [], d, dk, days, ctx).score;
  const acAgg = (buckets: Bucket[], valFn: (d: DayRecord, dk: string) => number | number[] | null): (number | null)[] =>
    buckets.map((b) => {
      let s = 0, n = 0;
      b.days.forEach((dk) => { const v = valFn(days[dk], dk); if (v == null) return; (Array.isArray(v) ? v : [v]).forEach((x) => { if (x != null && !isNaN(x)) { s += x; n++; } }); });
      return n ? s / n : null;
    });
  const acAggSum = (buckets: Bucket[], dayFn: (d: DayRecord, dk: string) => number | null): (number | null)[] =>
    buckets.map((b) => { let s = 0, any = false; b.days.forEach((dk) => { const v = dayFn(days[dk], dk); if (v != null && !isNaN(v)) { s += v; any = true; } }); return any ? s : null; });
  return { acDayScore, acAgg, acAggSum };
}

export const acPresent = (vals: (number | null)[]) => vals.filter((v): v is number => v != null && !isNaN(v));
/** Index of the newest bucket where any of the given series resolved, or -1.
 *  Card readouts default to this bucket (the current week/month/year when it
 *  has data), mirroring what a chart tap on the last point would show. */
export const acLatestIdx = (...seriesArr: (number | null)[][]): number => {
  for (let i = Math.max(0, ...seriesArr.map((a) => a.length)) - 1; i >= 0; i--) {
    if (seriesArr.some((a) => a[i] != null && !isNaN(a[i] as number))) return i;
  }
  return -1;
};
export const acMean = (vals: (number | null)[]) => { const p = acPresent(vals); return p.length ? p.reduce((s, x) => s + x, 0) / p.length : null; };
export const avgRound = (vals: (number | null)[], dp = 0) => { const m = acMean(vals); if (m == null) return null; const f = Math.pow(10, dp); return Math.round(m * f) / f; };

export function acBandsToZones(b: Band[] | null | undefined): { from: number; to: number; color: string }[] | null {
  if (!b) return null;
  const out: { from: number; to: number; color: string }[] = []; let prev = -1e9;
  b.forEach((seg) => { const to = seg.max === Infinity ? 1e9 : seg.max; out.push({ from: prev, to, color: SCORE_COLORS[seg.cat] || '#888' }); prev = seg.max; });
  return out;
}
export function acBandZones(bandName: string): { from: number; to: number; color: string }[] | null {
  return acBandsToZones(BANDS[bandName]);
}
export function acScoreZones() {
  const cats = [...SCORE_CATS].sort((a, b) => a.min - b.min);
  return cats.map((c, i) => ({ from: c.min, to: i < cats.length - 1 ? cats[i + 1].min : 100, color: c.color }));
}

export { catFromBands, blueZone, BANDS };
export type { DaysMap, ScoreContext };
