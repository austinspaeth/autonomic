/**
 * Analysis aggregation engine — ported from the PWA's acBuckets/acAgg/acReadVals
 * family. Buckets days by the active range (day/week/month/year) and averages
 * within each bucket. Pure over a days map + score context.
 */
import { dateFromKey, fmtSlashShort, keyOf, pad } from '../dates';
import type { Band, DayRecord, Entry } from '../types';
import { BANDS, SCORE_COLORS, catFromBands, type ScoreContext } from '../scoring';
import { SCORE_CATS, scoreSet, blueZone, type DaysMap } from '../scoring/day';
import { isTrustedReading } from '../hrvQuality';

export type Mode = 'day' | 'week' | 'month' | 'year';
export interface Bucket { start: string; end: string; label: string; days: string[] }

/**
 * A window the user picked by hand, charted at `mode`'s grouping. Day keys,
 * inclusive both ends. It replaces the range the four tabs describe; the
 * grouping still travels as `mode`, so everything downstream (bucket labels,
 * the "for the week of" phrasing, the rolling-average window) keeps working
 * off the one value it always did.
 */
export interface CustomRange { from: string; to: string }

/**
 * Ceiling on how many buckets a custom range may produce. A window charted at
 * a grouping too fine for it isn't a chart — a thousand points on a 350pt-wide
 * line is a smear — so the sheet refuses to apply that combination rather than
 * silently coarsening the grouping the user asked for.
 */
export const MAX_CUSTOM_BUCKETS = 366;

/** How many buckets `from`→`to` would make at this grouping. Pure, so the
 *  sheet can check the pair before committing to a rebuild. */
export function customBucketCount(mode: Mode, custom: CustomRange): number {
  return customRanges(mode, custom).length;
}

const GROUP_WORD: Record<Mode, string> = {
  day: 'daily', week: 'weekly average', month: 'monthly average', year: 'yearly average',
};

export function acRangeLabel(mode: Mode, custom?: CustomRange | null): string {
  // A custom range names its own two ends: "over the range" is true of the
  // tabs, where the reader knows what the range is, and meaningless here.
  if (custom) return `${fmtSlashShort(custom.from)} – ${fmtSlashShort(custom.to)} · ${GROUP_WORD[mode]}`;
  return mode === 'day' ? 'Last 14 days · daily'
    : mode === 'week' ? 'Last 12 weeks · weekly average'
    : mode === 'month' ? 'Last 12 months · monthly average'
    : 'All time · yearly average';
}

/**
 * The phrase a card readout trails its value with when it is showing one
 * bucket's figure. The wording follows the range, so the readout stays a
 * sentence at every zoom level: "on 7/27", "for the week of 7/27", "in July",
 * "in 2027". Months spell out in full (the chart axis keeps the short label).
 */
export function bucketWhen(mode: Mode, b?: { start: string; label: string } | null): string | null {
  if (!b) return null;
  if (mode === 'week') return `for the week of ${b.label}`;
  if (mode === 'month') {
    const d = new Date(+b.start.slice(0, 4), +b.start.slice(5, 7) - 1, 1);
    return `in ${d.toLocaleDateString(undefined, { month: 'long' })}`;
  }
  if (mode === 'year') return `in ${b.label}`;
  return `on ${b.label}`;
}

/** Same phrase for a plain calendar date (an event's own day, not a bucket). */
export const onDay = (label?: string | null): string | null => (label ? `on ${label}` : null);

/** What the chart/readout components need from a bucket: its axis label and the
 *  phrase a readout for it reads with. */
export interface BucketView { label: string; when: string | null }
export const bucketViews = (buckets: Bucket[], mode: Mode): BucketView[] =>
  buckets.map((b) => ({ label: b.label, when: bucketWhen(mode, b) }));

/**
 * The [start, end] pairs a custom window breaks into at this grouping, clamped
 * to the window at both ends: a month bucket for a range starting on the 12th
 * starts on the 12th, so the average it reports covers only days the user
 * actually asked for. Separate from `acBuckets` so the sheet can count buckets
 * without touching the journal.
 */
function customRanges(mode: Mode, custom: CustomRange): { s: Date; e: Date }[] {
  // A backwards pair is a picker mishap, not an empty range — read it either way.
  const lo = custom.from <= custom.to ? custom.from : custom.to;
  const hi = custom.from <= custom.to ? custom.to : custom.from;
  const from = dateFromKey(lo), to = dateFromKey(hi);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return [];
  const out: { s: Date; e: Date }[] = [];
  const clamp = (s: Date, e: Date) => out.push({ s: s < from ? from : s, e: e > to ? to : e });
  if (mode === 'day') {
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) out.push({ s: new Date(d), e: new Date(d) });
  } else if (mode === 'week') {
    // Sunday-aligned, matching the Week tab and the Calendar grid.
    const s = new Date(from); s.setDate(s.getDate() - s.getDay());
    for (; s <= to; s.setDate(s.getDate() + 7)) { const e = new Date(s); e.setDate(s.getDate() + 6); clamp(new Date(s), e); }
  } else if (mode === 'month') {
    for (const s = new Date(from.getFullYear(), from.getMonth(), 1); s <= to; s.setMonth(s.getMonth() + 1)) {
      clamp(new Date(s), new Date(s.getFullYear(), s.getMonth() + 1, 0));
    }
  } else {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) clamp(new Date(y, 0, 1), new Date(y, 11, 31));
  }
  return out;
}

/** A custom bucket's axis label. Month labels carry the year once the window
 *  crosses one, or "Jan" appears twice on the same axis meaning two things. */
function customLabel(mode: Mode, s: Date, spansYears: boolean): string {
  if (mode === 'year') return String(s.getFullYear());
  if (mode === 'month') {
    const m = s.toLocaleDateString(undefined, { month: 'short' });
    return spansYears ? `${m} '${pad(s.getFullYear() % 100)}` : m;
  }
  return `${s.getMonth() + 1}/${s.getDate()}`;
}

export function acBuckets(days: DaysMap, mode: Mode, custom?: CustomRange | null): Bucket[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mk = (s: Date, e: Date, label: string): Bucket => ({ start: keyOf(s), end: keyOf(e), label, days: [] });
  const buckets: Bucket[] = [];
  if (custom) {
    const ranges = customRanges(mode, custom);
    const spansYears = ranges.length > 0 && ranges[0].s.getFullYear() !== ranges[ranges.length - 1].e.getFullYear();
    ranges.forEach(({ s, e }) => buckets.push(mk(s, e, customLabel(mode, s, spansYears))));
  } else if (mode === 'day') {
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
  // Imported HRV without enough real RR never reaches an aggregate — see
  // src/lib/hrvQuality.ts. Every Analysis/Progress/widget series funnels
  // through here, so this one guard covers them all.
  (d.readings || []).forEach((r) => { if (r.type !== type) return; if (!isTrustedReading(r)) return; if (filt && !filt(r)) return; const v = parseFloat(r[key] as string); if (!isNaN(v)) out.push(v); });
  return out;
}
export function acTotalPower(d: DayRecord, filt?: (r: Entry) => boolean): number[] {
  return (d.readings || []).filter((r) => r.type === 'breathHrv' && isTrustedReading(r) && (!filt || filt(r))).map((r) => {
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
