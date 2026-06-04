// Analysis value-extraction / aggregation layer.
// Ported from legacy docs/index.html:
//   acReadVals   (~4617)
//   acTotalPower (~4622)
//   acDayScore   (~4628)
//   acAgg        (~4631)
//   acAggSum     (~4639)
//   acSeries     (~4646)
//   acPresent    (~4647) / acMean (~4648)
//   acMeanOver   (~5563)
//
// Decoupled from the legacy globals: the aggregators take an explicit `days`
// map (Record<DateKey, Day>) rather than reading `state.days`, and acDayScore
// threads the Profile through scoreSet (whose signature is
// scoreSet(readings, day, profile)). The legacy `dk` third arg to scoreSet has
// been replaced by `profile`.

import type { Day, Profile, Reading } from '@core/types';
import { scoreSet } from '@core/scoring/scoreSet';
import type { AcBucket } from '@core/analytics/buckets';

export function acReadVals(day: Day, type: string, key: string, filt?: (r: Reading) => boolean): number[] {
  const out: number[] = [];
  (day.readings || []).forEach((r) => {
    if (r.type !== type) return;
    if (filt && !filt(r)) return;
    const v = parseFloat((r as any)[key]);
    if (!isNaN(v)) out.push(v);
  });
  return out;
}

export function acTotalPower(day: Day, filt?: (r: Reading) => boolean): number[] {
  return (day.readings || [])
    .filter((r) => r.type === 'breathHrv' && (!filt || filt(r)))
    .map((r) => {
      const p = ['vlowPower', 'lowPower', 'highPower'].map((k) => parseFloat((r as any)[k]));
      return p.every((x) => !isNaN(x)) ? p[0] + p[1] + p[2] : null;
    })
    .filter((v): v is number => v != null);
}

export function acDayScore(day: Day, dk: string, profile: Profile): number | null {
  return scoreSet(day.readings || [], day, profile).score;
}

// Per-bucket mean of every value produced by valFn across that bucket's days.
export function acAgg(
  buckets: AcBucket[],
  valFn: (day: Day, dk: string) => number[] | number | null,
  days: Record<string, Day>,
): (number | null)[] {
  return buckets.map((b) => {
    let s = 0, n = 0;
    b.days.forEach((dk) => {
      const day = days[dk];
      if (!day) return;
      const v = valFn(day, dk);
      if (v == null) return;
      (Array.isArray(v) ? v : [v]).forEach((x) => { if (x != null && !isNaN(x)) { s += x; n++; } });
    });
    return n ? s / n : null;
  });
}

// Per-bucket sum of one number per day (e.g. total minutes, counts).
export function acAggSum(
  buckets: AcBucket[],
  dayFn: (day: Day, dk: string) => number | null,
  days: Record<string, Day>,
): (number | null)[] {
  return buckets.map((b) => {
    let s = 0, any = false;
    b.days.forEach((dk) => {
      const day = days[dk];
      if (!day) return;
      const v = dayFn(day, dk);
      if (v != null && !isNaN(v)) { s += v; any = true; }
    });
    return any ? s : null;
  });
}

export function acSeries(
  buckets: AcBucket[],
  type: string,
  key: string,
  color: string,
  label: string | undefined,
  days: Record<string, Day>,
  filt?: (r: Reading) => boolean,
  band?: unknown,
): { values: (number | null)[]; color: string; label: string | undefined; pointBands: unknown } {
  return {
    values: acAgg(buckets, (d) => acReadVals(d, type, key, filt), days),
    color,
    label,
    pointBands: band || null,
  };
}

const acPresent = (vals: (number | null)[]): number[] =>
  vals.filter((v): v is number => v != null && !isNaN(v));

export function acMean(values: (number | null)[]): number | null {
  const p = acPresent(values);
  return p.length ? p.reduce((s, x) => s + x, 0) / p.length : null;
}

export function acMeanOver(
  keys: string[],
  valFn: (day: Day, dk: string) => number[] | number | null,
  days: Record<string, Day>,
): number | null {
  let s = 0, n = 0;
  keys.forEach((k) => {
    const day = days[k];
    if (!day) return;
    const v = valFn(day, k);
    if (v == null) return;
    (Array.isArray(v) ? v : [v]).forEach((x) => { if (x != null && !isNaN(x)) { s += x; n++; } });
  });
  return n ? s / n : null;
}
