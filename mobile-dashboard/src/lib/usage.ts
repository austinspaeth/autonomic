/* The App usage maths: a port of landing/master/analytics.js, so a number
 * here means exactly what the same number means on the web dashboard. Pure.
 *
 * Every route is capped once per install per US Eastern day (per LETTER for
 * the choice routes), so a day's total is a headcount of installs, never a
 * count of taps. There is no device id anywhere, which is why everything
 * below is "install-days" and why retention is read off cohorts.
 *
 * Three rules carried over verbatim, because the alternative is a confident
 * wrong number:
 *  - A route's days before it SHIPPED are unknown, not zero (`known`).
 *  - A cohort too young for day N is left out of day N, never counted as
 *    churned (`isMature`).
 *  - A change against a base under 5 is not reported (`pctChange`).
 */
import { addDays } from './dates';
import type { Fault, PingKind, PingReport, PingRow } from './types';

export type PlatformKey = 'all' | 'ios' | 'android';
type Letter = 'I' | 'A' | 'U';
type Counts = Record<string, number>;

export type DayEntry = {
  total: number;
  /** ISO install day -> installs from that cohort (inside the filter). */
  cohorts: Counts;
  /** Store split, always UNFILTERED. */
  platforms: Record<Letter, number>;
  /** First runs (cohort == day) by store, always UNFILTERED. */
  fresh: Record<Letter, number>;
  /** Slot letter (sensor / surface / plan / event letter) -> count, filtered. */
  slots: Counts;
  tiers: Counts;
  /** Cohort -> tier letter -> count (who is in the app by install age and status). */
  cohortTiers: Record<string, Counts>;
  builds: Counts;
  /** Cohort -> slot -> count (sensor mix by install age). */
  cohortSlots: Record<string, Counts>;
  /** sub only: purchase evidence, V verified / S store-only. */
  evidence: { V: number; S: number };
  /** sub only: sales by the door they came through (wall or offer letter), filtered. */
  doors: Counts;
  unattributed: number;
  /** open only: arrivals per Eastern hour (24 slots), everyone and first runs,
   *  inside the filter. Null on a day the server was not counting hours. */
  hours: { all: number[]; fresh: number[] } | null;
};

export type UsageIndex = {
  routes: Partial<Record<PingKind, Map<string, DayEntry>>>;
  firstDay: Partial<Record<PingKind, string>>;
  hrvMethodFirst: string | null;
  days: string[];
  first: string | null;
  last: string | null;
  cohorts: string[];
  platform: PlatformKey;
  report: PingReport | null;
};

export const KINDS: PingKind[] = [
  'open', 'sub', 'rst', 'lap', 'act', 'cap', 'hrv', 'sav', 'pay', 'not', 'pot', 'see', 'err',
  'osh', 'odm', 'oac', 'ofl', 'log', 'use', 'fnd', 'rpt', 'rdg', 'mbp', 'rvw',
];

export const TRIAL_LAST_DAY = 14;
export const FIRST_POST_TRIAL = 15;
export const MILESTONES = [0, 1, 3, 7, 14, 15, 21, 30, 60, 90];
export const PRESENCE_WINDOW = 7;
export const SMALL_COHORT = 10;
export const DELTA_MIN_BASE = 5;

const zero = (): Record<Letter, number> => ({ I: 0, A: 0, U: 0 });
const bump = (o: Counts, k: string, n: number) => (o[k] = (o[k] || 0) + n);

export const ageDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

function entryOf(row: PingRow, letter: Letter | null): DayEntry {
  const e: DayEntry = {
    total: 0,
    cohorts: {},
    platforms: zero(),
    fresh: zero(),
    slots: {},
    tiers: {},
    cohortTiers: {},
    builds: {},
    cohortSlots: {},
    evidence: { V: 0, S: 0 },
    doors: {},
    unattributed: 0,
    hours: null,
  };
  if (row.hours) {
    const all = new Array<number>(24).fill(0);
    const fresh = new Array<number>(24).fill(0);
    Object.entries(row.hours).forEach(([k, n]) => {
      const m = /^(\d{2})([IAU])(N?)$/.exec(k);
      if (!m || Number(m[1]) > 23 || (letter && m[2] !== letter)) return;
      all[Number(m[1])] += n;
      if (m[3]) fresh[Number(m[1])] += n;
    });
    e.hours = { all, fresh };
  }
  let kept = 0;
  (row.cohorts || []).forEach((c) => {
    const p = (c.platform || 'U') as Letter;
    e.platforms[p] += c.count;
    if (c.cohort === row.day) e.fresh[p] += c.count;
    if (letter && p !== letter) {
      if (p === 'U') e.unattributed += c.count;
      return;
    }
    kept += c.count;
    bump(e.cohorts, c.cohort, c.count);
    if (c.slot !== null && c.slot !== undefined) {
      bump(e.slots, c.slot || '?', c.count);
      bump((e.cohortSlots[c.cohort] ||= {}), c.slot || '?', c.count);
    }
    bump(e.tiers, c.tier || '?', c.count);
    bump((e.cohortTiers[c.cohort] ||= {}), c.tier || '?', c.count);
  });
  e.total = letter ? kept : row.total;
  (row.builds || []).forEach((b) => {
    if (letter && b.platform !== letter) return;
    bump(e.builds, b.version || '?', b.count);
  });
  (row.evidence || []).forEach((ev) => {
    if (letter && String(ev.key).charAt(6) !== letter) return;
    if (ev.evidence === 'V') e.evidence.V += ev.count;
    else if (ev.evidence === 'S') e.evidence.S += ev.count;
  });
  (row.doors || []).forEach((w) => {
    if (letter && String(w.key).charAt(6) !== letter) return;
    bump(e.doors, w.door, w.count);
  });
  return e;
}

/** Build the index. `cursor` trims the day list (not the route maps) to the
 *  selected day, which becomes `last`: the day every "on <day>" number is
 *  about and the day cohorts are aged against. */
export function buildIndex(report: PingReport | null | undefined, platform: PlatformKey, cursor?: string): UsageIndex {
  const letter: Letter | null = platform === 'ios' ? 'I' : platform === 'android' ? 'A' : null;
  const routes: UsageIndex['routes'] = {};
  const firstDay: UsageIndex['firstDay'] = {};
  const all = new Set<string>();
  let hrvMethodFirst: string | null = null;
  KINDS.forEach((k) => {
    const rows = report?.[k] || [];
    const map = new Map<string, DayEntry>();
    rows.forEach((r) => {
      map.set(r.day, entryOf(r, letter));
      all.add(r.day);
      if (!firstDay[k] || r.day < firstDay[k]!) firstDay[k] = r.day;
      if (k === 'hrv' && (r.cohorts || []).some((c) => c.slot && c.slot !== '?')) {
        if (!hrvMethodFirst || r.day < hrvMethodFirst) hrvMethodFirst = r.day;
      }
    });
    routes[k] = map;
  });
  let days = [...all].sort();
  if (cursor) days = days.filter((d) => d <= cursor);
  const first = days[0] ?? null;
  const last = days[days.length - 1] ?? null;
  const open = routes.open!;
  const cohorts = days.filter((d) => (open.get(d)?.cohorts[d] || 0) > 0);
  return { routes, firstDay, hrvMethodFirst, days, first, last, cohorts, platform, report: report ?? null };
}

/* ------------------------------------------------------------ access */

export const entry = (ix: UsageIndex, k: PingKind, d: string) => ix.routes[k]?.get(d);
export const totalOn = (ix: UsageIndex, k: PingKind, d: string) => entry(ix, k, d)?.total ?? 0;
export const known = (ix: UsageIndex, k: PingKind, d: string) => !!ix.firstDay[k] && d >= ix.firstDay[k]!;
/** A total, or null on a day before the route shipped. */
export const knownTotal = (ix: UsageIndex, k: PingKind, d: string): number | null => (known(ix, k, d) ? totalOn(ix, k, d) : null);
export const slotOn = (ix: UsageIndex, k: PingKind, d: string, L: string) => entry(ix, k, d)?.slots[L] ?? 0;
export const activeOn = (ix: UsageIndex, d: string) => totalOn(ix, 'open', d);
export const countOn = (ix: UsageIndex, d: string, cohort: string) => entry(ix, 'open', d)?.cohorts[cohort] ?? 0;
export const newOn = (ix: UsageIndex, d: string) => countOn(ix, d, d);
export const returningOn = (ix: UsageIndex, d: string) => Math.max(0, activeOn(ix, d) - newOn(ix, d));
export const cohortSize = (ix: UsageIndex, c: string) => countOn(ix, c, c);
export const isMature = (ix: UsageIndex, c: string, n: number) => !!ix.last && ageDays(c, ix.last) >= n;

/** One day as the pace maths wants it: its count, and when it arrived. On the
 *  day the server began counting hours they cover only part of it; they are
 *  handed over as they are, and the pace maths places the rest. */
export function paceDay(ix: UsageIndex, d: string, who: 'all' | 'fresh'): { total: number; hours: number[] | null } {
  const total = who === 'fresh' ? newOn(ix, d) : activeOn(ix, d);
  const hours = entry(ix, 'open', d)?.hours?.[who] ?? null;
  return { total, hours: hours && total > 0 && hours.some((n) => n > 0) ? hours : null };
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function pctChange(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  if (before < DELTA_MIN_BASE) return null;
  return ((now - before) / before) * 100;
}

export function sumOver(days: string[], f: (d: string) => number | null): number | null {
  let t = 0;
  for (const d of days) {
    const v = f(d);
    if (v === null) return null;
    t += v;
  }
  return t;
}

export function meanOver(days: string[], f: (d: string) => number | null): number | null {
  let t = 0;
  let n = 0;
  days.forEach((d) => {
    const v = f(d);
    if (v === null) return;
    t += v;
    n += 1;
  });
  return n ? t / n : null;
}

/** Slot totals pooled over days. */
export function slotsOver(ix: UsageIndex, k: PingKind, days: string[]): Counts {
  const out: Counts = {};
  days.forEach((d) => {
    const e = entry(ix, k, d);
    if (e) Object.entries(e.slots).forEach(([L, n]) => bump(out, L, n));
  });
  return out;
}

export function platformsOver(ix: UsageIndex, k: PingKind, days: string[], fresh = false): Record<Letter, number> {
  const out = zero();
  days.forEach((d) => {
    const e = entry(ix, k, d);
    if (!e) return;
    const src = fresh ? e.fresh : e.platforms;
    out.I += src.I;
    out.A += src.A;
    out.U += src.U;
  });
  return out;
}

export function tiersOver(ix: UsageIndex, k: PingKind, days: string[]): Counts {
  const out: Counts = {};
  days.forEach((d) => {
    const e = entry(ix, k, d);
    if (e) Object.entries(e.tiers).forEach(([t, n]) => bump(out, t, n));
  });
  return out;
}

/* ----------------------------------------------------------- rates */

/** Readings over actives, on days the reading counter existed. */
export function measureRate(ix: UsageIndex, days: string[]) {
  let readings = 0;
  let active = 0;
  let blind = 0;
  days.forEach((d) => {
    if (!known(ix, 'hrv', d)) {
      blind += 1;
      return;
    }
    readings += totalOn(ix, 'hrv', d);
    active += activeOn(ix, d);
  });
  return { pct: active ? (readings / active) * 100 : null, readings, active, blind };
}

/** Readings started vs completed, on days both counters existed; optionally one sensor. */
export function captureFunnel(ix: UsageIndex, days: string[], L?: string) {
  let started = 0;
  let completed = 0;
  let blind = 0;
  days.forEach((d) => {
    if (!known(ix, 'cap', d) || !known(ix, 'hrv', d)) {
      blind += 1;
      return;
    }
    started += L ? slotOn(ix, 'cap', d, L) : totalOn(ix, 'cap', d);
    completed += L ? slotOn(ix, 'hrv', d, L) : totalOn(ix, 'hrv', d);
  });
  return { started, completed, abandoned: Math.max(0, started - completed), pct: started ? (completed / started) * 100 : null, blind };
}

/**
 * Readings completed vs SAVED, on days both counters existed; optionally one
 * sensor. `hrv` fires when a reading finishes, before anything has judged its
 * beats; `sav` only when an entry was written. The gap is readings the app
 * declined. Both are capped once per install per day and each names the day's
 * FIRST such reading, so per sensor the two can name different sensors on one
 * day and `saved` may exceed `completed` for one of them.
 */
export function saveFunnel(ix: UsageIndex, days: string[], L?: string) {
  let completed = 0;
  let saved = 0;
  let blind = 0;
  days.forEach((d) => {
    if (!known(ix, 'sav', d) || !known(ix, 'hrv', d)) {
      blind += 1;
      return;
    }
    completed += L ? slotOn(ix, 'hrv', d, L) : totalOn(ix, 'hrv', d);
    saved += L ? slotOn(ix, 'sav', d, L) : totalOn(ix, 'sav', d);
  });
  return { completed, saved, lost: Math.max(0, completed - saved), pct: completed ? Math.min(100, (saved / completed) * 100) : null, blind };
}

/**
 * Sales by the door they came through, over the days the door was being sent.
 * `known` is sales carrying one; `sales` is every sale on those days, so the
 * difference is purchases with no buy tap behind them or from an older build.
 */
export function doorsOver(ix: UsageIndex, days: string[]) {
  const first = [...(ix.routes.sub?.entries() ?? [])].filter(([, e]) => Object.keys(e.doors).length).map(([d]) => d).sort()[0] ?? null;
  const doors: Counts = {};
  let sales = 0;
  days.forEach((d) => {
    if (!first || d < first) return;
    const e = entry(ix, 'sub', d);
    if (!e) return;
    sales += e.total;
    Object.entries(e.doors).forEach(([L, n]) => bump(doors, L, n));
  });
  const named = Object.values(doors).reduce((a, b) => a + b, 0);
  return { doors, sales, known: named, unknown: Math.max(0, sales - named), first };
}

/** Offers raised, and what became of them. "Accepted" is the buy button, not a purchase. */
export function offerFunnel(ix: UsageIndex, days: string[], L?: string) {
  const get = (k: PingKind, d: string) => (!known(ix, k, d) ? 0 : L ? slotOn(ix, k, d, L) : totalOn(ix, k, d));
  let shown = 0;
  let dismissed = 0;
  let accepted = 0;
  days.forEach((d) => {
    shown += get('osh', d);
    dismissed += get('odm', d);
    accepted += get('oac', d);
  });
  return { shown, dismissed, accepted, ignored: Math.max(0, shown - dismissed - accepted), acceptPct: shown ? (accepted / shown) * 100 : null };
}

/* ------------------------------------------------------- lifecycle */

/** Actives on `d` still inside the trial (age <= 14) or past it (>= 15). */
export function lifecycleActive(ix: UsageIndex, d: string, inTrial: boolean): number {
  const e = entry(ix, 'open', d);
  if (!e) return 0;
  let t = 0;
  Object.entries(e.cohorts).forEach(([c, n]) => {
    const age = ageDays(c, d);
    if (inTrial ? age <= TRIAL_LAST_DAY : age >= FIRST_POST_TRIAL) t += n;
  });
  return t;
}

/** Actives on `d` by install age, youngest first, each with its split by status. */
export function activeByCohort(ix: UsageIndex, d: string): { age: number; cohort: string; count: number; tiers: Counts }[] {
  const e = entry(ix, 'open', d);
  if (!e) return [];
  return Object.entries(e.cohorts)
    .map(([c, n]) => ({ age: ageDays(c, d), cohort: c, count: n, tiers: e.cohortTiers[c] ?? {} }))
    .filter((x) => x.age >= 0)
    .sort((a, b) => a.age - b.age);
}

/**
 * One cohort on one day, against its OWN life: the day before, its average
 * (over the range and over everything), its best day, and how much of what
 * installed is left. `size` is null for a cohort born before the counter,
 * whose size was never observed. Ported from the web dashboard's `cohortNorm`.
 */
export function cohortNorm(ix: UsageIndex, cohort: string, day: string, days: string[]) {
  const has = new Set(ix.days);
  const alive = (d: string) => has.has(d) && d >= cohort && d <= day;
  const mean = (list: string[]) => {
    let sum = 0;
    let n = 0;
    list.forEach((d) => {
      if (!alive(d)) return;
      sum += countOn(ix, d, cohort);
      n += 1;
    });
    return n ? { avg: sum / n, days: n } : null;
  };
  let peak: { count: number; age: number } | null = null;
  ix.days.forEach((d) => {
    if (!alive(d)) return;
    const n = countOn(ix, d, cohort);
    if (!peak || n > peak.count) peak = { count: n, age: ageDays(cohort, d) };
  });
  const prevDay = addDays(day, -1);
  const size = cohortSize(ix, cohort) || null;
  const now = countOn(ix, day, cohort);
  return {
    now,
    prev: alive(prevDay) ? countOn(ix, prevDay, cohort) : null,
    range: mean(days),
    all: mean(ix.days),
    size,
    retained: size ? (now / size) * 100 : null,
    peak: peak as { count: number; age: number } | null,
  };
}

/**
 * The other axis of the same bar: what a day-N bar usually looks like, across
 * cohorts. `yesterday` is the bar that stood in this slot the day before (a
 * different cohort; null when none was born to fill it), `median` the usual
 * count at this age and `retention` the usual rate. Both exclude the cohort
 * being asked about, and every cohort counted must have REACHED day N by
 * `day`, so a past day never borrows from its own future. Ported from the web
 * dashboard's `ageNorm`.
 */
export function ageNorm(ix: UsageIndex, age: number, day: string, exclude: string) {
  const prevDay = addDays(day, -1);
  const prevCohort = addDays(prevDay, -age);
  const yesterday = cohortSize(ix, prevCohort) ? countOn(ix, prevDay, prevCohort) : null;
  const counts: number[] = [];
  const others: string[] = [];
  ix.cohorts.forEach((c) => {
    if (c === exclude) return;
    const at = addDays(c, age);
    if (at > day || !cohortSize(ix, c)) return;
    counts.push(countOn(ix, at, c));
    others.push(c);
  });
  counts.sort((a, b) => a - b);
  const m = counts.length;
  return {
    yesterday,
    median: m ? (m % 2 ? counts[(m - 1) / 2] : (counts[m / 2 - 1] + counts[m / 2]) / 2) : null,
    cohorts: m,
    retention: others.length ? retentionAt(ix, others, age) : null,
  };
}

/* -------------------------------------------------------- retention */

export type Rate = { pct: number | null; kept: number; of: number; immature: number; small: boolean; available: boolean };

const rate = (kept: number, of: number, immature: number): Rate => ({
  pct: of ? (kept / of) * 100 : null,
  kept,
  of,
  immature,
  small: of < SMALL_COHORT,
  available: of > 0,
});

/** Share of the cohorts' installs that opened on EXACTLY day n. Attendance, not survival. */
export function retentionAt(ix: UsageIndex, cohorts: string[], n: number): Rate {
  let kept = 0;
  let of = 0;
  let immature = 0;
  cohorts.forEach((c) => {
    if (!isMature(ix, c, n)) {
      immature += 1;
      return;
    }
    const size = cohortSize(ix, c);
    if (!size) return;
    kept += countOn(ix, addDays(c, n), c);
    of += size;
  });
  return rate(kept, of, immature);
}

export function curve(ix: UsageIndex, cohorts: string[], max = 60): (Rate & { n: number })[] {
  const out: (Rate & { n: number })[] = [];
  for (let n = 0; n <= max; n += 1) {
    const r = retentionAt(ix, cohorts, n);
    if (!r.available) break;
    out.push({ ...r, n });
  }
  return out;
}

/** Day 14 vs day 15 over the SAME installs (cohorts old enough for 15). */
export function boundaryTransition(ix: UsageIndex, cohorts: string[]) {
  const set = cohorts.filter((c) => isMature(ix, c, FIRST_POST_TRIAL));
  const before = retentionAt(ix, set, TRIAL_LAST_DAY);
  const after = retentionAt(ix, set, FIRST_POST_TRIAL);
  return { before, after, points: before.pct !== null && after.pct !== null ? after.pct - before.pct : null };
}

/** Cohort installs opened by `w` days, counting each event at most once (act/sub are once-ever). */
function cohortEventBy(ix: UsageIndex, cohorts: string[], w: number, k: PingKind): Rate {
  let kept = 0;
  let of = 0;
  let immature = 0;
  cohorts.forEach((c) => {
    if (!isMature(ix, c, w)) {
      immature += 1;
      return;
    }
    const size = cohortSize(ix, c);
    if (!size) return;
    for (let i = 0; i <= w; i += 1) kept += entry(ix, k, addDays(c, i))?.cohorts[c] ?? 0;
    of += size;
  });
  return rate(kept, of, immature);
}
export const activation = (ix: UsageIndex, cohorts: string[], w: number) => cohortEventBy(ix, cohorts, w, 'act');
export const conversion = (ix: UsageIndex, cohorts: string[], w: number) => cohortEventBy(ix, cohorts, w, 'sub');

/** The cohorts that turned exactly `w` days old inside [from, to]. */
export const cohortsReaching = (ix: UsageIndex, from: string, to: string, w: number) => {
  const lo = addDays(from, -w);
  const hi = addDays(to, -w);
  return ix.cohorts.filter((c) => c >= lo && c <= hi);
};
/**
 * Conversion by day `w` for a WINDOW: of the installs that turned `w` days old
 * inside it, the share with a subscription reported by then. Every cohort in
 * it has had its whole `w` days, so no range is too short to have an answer
 * and a burst of new installs cannot dilute it.
 */
export const conversionReached = (ix: UsageIndex, from: string, to: string, w: number) => conversion(ix, cohortsReaching(ix, from, to, w), w);

/**
 * The same question answered from the SALES LEDGER: installs are still the
 * pings' cohort sizes, but a conversion is a recorded sale carrying that
 * install day, bought within `w` days of it. The subscribe pings cannot be
 * de-duplicated (no identifier) and one replaying install once reported 39
 * sales against 3 real ones, so they overstate the rate; the ledger is one row
 * per purchase. A refunded sale is not a conversion, and a sale with no
 * install date cannot be placed and is left out. `sales` is already filtered
 * to the store `ix` is.
 */
export function ledgerConversionReached(
  ix: UsageIndex,
  sales: { date: string; cohort?: string; qty: number; refunded?: boolean }[],
  from: string,
  to: string,
  w: number,
): Rate {
  const sizes = new Map<string, number>();
  let immature = 0;
  cohortsReaching(ix, from, to, w).forEach((c) => {
    if (!isMature(ix, c, w)) {
      immature += 1;
      return;
    }
    const size = cohortSize(ix, c);
    if (size) sizes.set(c, size);
  });
  let kept = 0;
  sales.forEach((s) => {
    if (s.refunded || !s.cohort || !sizes.has(s.cohort)) return;
    const age = ageDays(s.cohort, s.date);
    if (age >= 0 && age <= w) kept += Math.max(1, s.qty || 1);
  });
  let of = 0;
  sizes.forEach((n) => (of += n));
  return rate(kept, of, immature);
}

/** Of each cohort, how many MEASURED on exactly day n (before the counter shipped is blind). */
export function measuringCurve(ix: UsageIndex, cohorts: string[], max = 60): { n: number; pct: number | null; of: number }[] {
  const out: { n: number; pct: number | null; of: number }[] = [];
  const hrvFirst = ix.firstDay.hrv;
  for (let n = 0; n <= max; n += 1) {
    let kept = 0;
    let of = 0;
    cohorts.forEach((c) => {
      if (!isMature(ix, c, n)) return;
      const d = addDays(c, n);
      if (!hrvFirst || d < hrvFirst) return;
      const size = cohortSize(ix, c);
      if (!size) return;
      kept += entry(ix, 'hrv', d)?.cohorts[c] ?? 0;
      of += size;
    });
    if (!of) break;
    out.push({ n, pct: (kept / of) * 100, of });
  }
  return out;
}

/**
 * "Still here?": a cohort's busiest single day over days n..n+6 is a FLOOR on
 * how many of it were alive that week. Eligible only once the cohort has
 * lived the WHOLE window. `dayOnePct` is exact-day attendance over the same
 * set, so it can never exceed `alivePct`; `intensity` is how often the alive
 * ones actually opened.
 */
export function presenceAt(ix: UsageIndex, cohorts: string[], n: number, w = PRESENCE_WINDOW) {
  let peak = 0;
  let days = 0;
  let one = 0;
  let size = 0;
  let ineligible = 0;
  cohorts.forEach((c) => {
    if (!isMature(ix, c, n + w - 1)) {
      ineligible += 1;
      return;
    }
    const s = cohortSize(ix, c);
    if (!s) return;
    let p = 0;
    for (let k = 0; k < w; k += 1) {
      const v = countOn(ix, addDays(c, n + k), c);
      p = Math.max(p, v);
      days += v;
      if (k === 0) one += v;
    }
    peak += p;
    size += s;
  });
  return {
    alivePct: size ? (peak / size) * 100 : null,
    dayOnePct: size ? (one / size) * 100 : null,
    intensity: peak ? days / (peak * w) : null,
    of: size,
    ineligible,
    available: size > 0,
  };
}

export function presenceCurve(ix: UsageIndex, cohorts: string[], max = 45) {
  const out: { n: number; alive: number; dayOne: number; of: number }[] = [];
  for (let n = 0; n <= max; n += 1) {
    const p = presenceAt(ix, cohorts, n);
    if (!p.available || p.alivePct === null || p.dayOnePct === null) break;
    out.push({ n, alive: p.alivePct, dayOne: p.dayOnePct, of: p.of });
  }
  return out;
}

export function weekStart(d: string): string {
  return addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
}

/** One age's presence for every weekly cohort, in birth order. */
export function presenceByWeek(ix: UsageIndex, cohorts: string[], n: number) {
  const weeks = new Map<string, string[]>();
  cohorts.forEach((c) => {
    const w = weekStart(c);
    (weeks.get(w) || weeks.set(w, []).get(w)!).push(c);
  });
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, cs]) => {
      const p = presenceAt(ix, cs, n);
      return { week, pct: p.available ? p.alivePct : null, of: p.of, partial: p.available && p.ineligible > 0 };
    });
}

/** Weekly cohorts x milestone ages, newest first. */
export function cohortHeat(ix: UsageIndex, cohorts: string[]) {
  const weeks = new Map<string, string[]>();
  cohorts.forEach((c) => {
    const w = weekStart(c);
    (weeks.get(w) || weeks.set(w, []).get(w)!).push(c);
  });
  return [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, cs]) => ({
      week,
      size: cs.reduce((t, c) => t + cohortSize(ix, c), 0),
      cells: MILESTONES.map((n) => {
        const r = retentionAt(ix, cs, n);
        return { n, pct: r.available ? r.pct : null, partial: r.available && r.immature > 0 };
      }),
    }));
}

export const AGE_BUCKETS = [
  { label: 'D0–7', lo: 0, hi: 7 },
  { label: 'D8–14', lo: 8, hi: 14 },
  { label: 'D15', lo: 15, hi: 15 },
  { label: 'D16–21', lo: 16, hi: 21 },
  { label: 'D22–30', lo: 22, hi: 30 },
  { label: 'D30+', lo: 31, hi: Infinity },
];

/** Every event on route `k` bucketed by the install's age when it happened. */
export function eventAges(ix: UsageIndex, k: PingKind) {
  const counts = AGE_BUCKETS.map(() => 0);
  let unknown = 0;
  ix.routes[k]?.forEach((e, d) => {
    if (ix.last && d > ix.last) return;
    Object.entries(e.cohorts).forEach(([c, n]) => {
      const age = ageDays(c, d);
      const i = AGE_BUCKETS.findIndex((b) => age >= b.lo && age <= b.hi);
      if (i < 0) unknown += n;
      else counts[i] += n;
    });
  });
  return { buckets: AGE_BUCKETS.map((b, i) => ({ label: b.label, value: counts[i] })), unknown };
}

/** Sensor shares of readings by install age, over ages the sensor letter existed. */
export function sensorMixByAge(ix: UsageIndex, cohorts: string[], max = 30) {
  const out: { n: number; slots: Counts; total: number }[] = [];
  const first = ix.hrvMethodFirst;
  for (let n = 0; n <= max; n += 1) {
    const slots: Counts = {};
    let total = 0;
    cohorts.forEach((c) => {
      if (!isMature(ix, c, n)) return;
      const d = addDays(c, n);
      if (!first || d < first) return;
      const cs = entry(ix, 'hrv', d)?.cohortSlots[c];
      if (!cs) return;
      Object.entries(cs).forEach(([L, v]) => {
        bump(slots, L, v);
        total += v;
      });
    });
    out.push({ n, slots, total });
  }
  while (out.length && !out[out.length - 1].total) out.pop();
  return out;
}

/** D7 retention by the weekday people installed on (Monday-first). */
export function retentionByInstallWeekday(ix: UsageIndex, cohorts: string[], n = 7) {
  const groups: string[][] = Array.from({ length: 7 }, () => []);
  cohorts.forEach((c) => groups[(new Date(`${c}T12:00:00Z`).getUTCDay() + 6) % 7].push(c));
  return groups.map((cs) => ({
    ...retentionAt(ix, cs, n),
    installs: cs.reduce((t, c) => t + cohortSize(ix, c), 0),
    count: cs.length,
  }));
}

/**
 * Where to split cohorts into "earlier" and "recent": the NEWEST release that
 * leaves at least two cohorts on each side, else the median.
 */
export function splitFor(cohorts: string[], releases: { date: string; label: string }[]) {
  const sorted = [...releases].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    const recent = cohorts.filter((c) => c >= r.date);
    const earlier = cohorts.filter((c) => c < r.date);
    if (recent.length >= 2 && earlier.length >= 2) {
      return { earlier, recent, earlierLabel: `Before ${r.label}`, recentLabel: `${r.label} onward` };
    }
  }
  const half = Math.ceil(cohorts.length / 2);
  return { earlier: cohorts.slice(0, half), recent: cohorts.slice(half), earlierLabel: 'Earlier half', recentLabel: 'Recent half' };
}

/* ----------------------------------------------------------- faults */

/**
 * The capture funnel rides the fault route (it is the only one that counts
 * every occurrence, by store), and three of its tags are NOT failures: a
 * reading that began, one the app filed, and one the user kept from a refusal.
 * Anything that counts things going wrong must leave them out. Mirrors
 * `CAPTURE_EVENT_TAGS` in the app's lib/hrv/refusal.ts.
 */
export const CAPTURE_TAG = { attempt: 'hrv.attempt', filed: 'hrv.filed', refused: 'hrv.refused', salvaged: 'hrv.salvaged', abandoned: 'hrv.abandoned' } as const;
const EVENT_TAGS = new Set<string>([CAPTURE_TAG.attempt, CAPTURE_TAG.filed, CAPTURE_TAG.salvaged]);
export const isFailure = (f: Pick<Fault, 'tag'>) => !EVENT_TAGS.has(f.tag);

type Split = { n: number; I: number; A: number; U: number };
const split = (): Split => ({ n: 0, I: 0, A: 0, U: 0 });

export type CaptureOutcomes = {
  /** Readings begun. Every attempt, not one per install per day. */
  attempts: Split;
  /** Filed by the app with no question asked. */
  filed: Split;
  /** Declined by the results card. */
  refused: Split;
  /** ...of which the user chose to keep anyway. */
  salvaged: Split;
  /** Ended with no result: stopped by the app, given up on, or finished too early. */
  abandoned: Split;
  abandonedBy: { signal: number; user: number; early: number };
  /** Began and reported nothing more: the app was closed or killed mid-reading. */
  vanished: Split;
  /** attempts - filed - salvaged: every attempt that did not become an entry. */
  failed: Split;
  failPct: number | null;
  /** The refusals and abandons, grouped by what they looked like, most first. */
  shapes: { tag: string; msg: string; n: number; I: number; A: number; installs: number }[];
  /** Per day, for a chart: attempts and how many of them landed. */
  byDay: { day: string; attempts: number; landed: number }[];
  /** The first day any attempt was reported for this sensor; null = never. */
  first: string | null;
  /** Refusals from builds that reported no attempts, install-days. Outside the rate. */
  legacyRefusedInstalls: number;
};

/**
 * How one sensor's readings went, PER ATTEMPT, from the capture funnel.
 *
 * The pings cannot answer this: `cap` and `hrv` are capped once per install per
 * day, so somebody who fails on the camera six times and then gets one reads as
 * one start and one completion. Here every attempt is one count, so the rate is
 * "of the readings that began, how many did not become an entry".
 *
 * Only builds that report ATTEMPTS are in the rate. An older build reports its
 * refusals and nothing to divide them by; those are recognisable (their message
 * carries no `dur` token) and are set aside as `legacyRefusedInstalls` rather
 * than counted as failures with no attempt behind them.
 */
export function captureOutcomes(report: PingReport | null | undefined, days: string[], platform: PlatformKey, source: string): CaptureOutcomes {
  const L = platform === 'ios' ? 'I' : platform === 'android' ? 'A' : null;
  const want = new Set(days);
  const faults = (report?.faults || []).filter((f) => f.tag.startsWith('hrv.') && f.msg.split(' ')[0] === source);
  const first = faults.filter((f) => f.tag === CAPTURE_TAG.attempt).reduce<string | null>((m, f) => (!m || f.day < m ? f.day : m), null);
  const out: CaptureOutcomes = {
    attempts: split(), filed: split(), refused: split(), salvaged: split(), abandoned: split(), vanished: split(), failed: split(),
    abandonedBy: { signal: 0, user: 0, early: 0 }, failPct: null, shapes: [], byDay: [], first, legacyRefusedInstalls: 0,
  };
  const shapes = new Map<string, CaptureOutcomes['shapes'][number]>();
  const perDay = new Map<string, { attempts: number; landed: number }>();
  const add = (s: Split, f: Fault): number => {
    const o = f.occPlatforms || {};
    const I = o.I || 0;
    const A = o.A || 0;
    // A row from before the per-store occurrence split has only a total.
    const U = Math.max(0, f.occurrences - I - A);
    const n = L ? (L === 'I' ? I : A) : f.occurrences;
    s.n += n;
    if (!L || L === 'I') s.I += I;
    if (!L || L === 'A') s.A += A;
    if (!L) s.U += U;
    return n;
  };
  faults.forEach((f) => {
    if (!want.has(f.day)) return;
    const modern = / dur/.test(f.msg);
    if (f.tag === CAPTURE_TAG.refused && !modern) {
      out.legacyRefusedInstalls += L ? f.platforms?.[L] || 0 : f.installs;
      return;
    }
    if (f.tag === CAPTURE_TAG.salvaged && !modern) return;
    const day = perDay.get(f.day) || { attempts: 0, landed: 0 };
    if (f.tag === CAPTURE_TAG.attempt) day.attempts += add(out.attempts, f);
    else if (f.tag === CAPTURE_TAG.filed) day.landed += add(out.filed, f);
    else if (f.tag === CAPTURE_TAG.salvaged) day.landed += add(out.salvaged, f);
    else if (f.tag === CAPTURE_TAG.refused || f.tag === CAPTURE_TAG.abandoned) {
      const n = add(f.tag === CAPTURE_TAG.refused ? out.refused : out.abandoned, f);
      if (f.tag === CAPTURE_TAG.abandoned) {
        const why = f.msg.split(' ')[1] as keyof CaptureOutcomes['abandonedBy'];
        if (why in out.abandonedBy) out.abandonedBy[why] += n;
      }
      if (n) {
        const k = `${f.tag}|${f.msg}`;
        const g = shapes.get(k) || { tag: f.tag, msg: f.msg, n: 0, I: 0, A: 0, installs: 0 };
        g.n += n;
        g.I += f.occPlatforms?.I || 0;
        g.A += f.occPlatforms?.A || 0;
        g.installs += L ? f.platforms?.[L] || 0 : f.installs;
        shapes.set(k, g);
      }
    }
    perDay.set(f.day, day);
  });
  (['n', 'I', 'A', 'U'] as const).forEach((k) => {
    out.failed[k] = Math.max(0, out.attempts[k] - out.filed[k] - out.salvaged[k]);
    out.vanished[k] = Math.max(0, out.attempts[k] - out.filed[k] - out.refused[k] - out.abandoned[k]);
  });
  out.failPct = out.attempts.n ? (out.failed.n / out.attempts.n) * 100 : null;
  out.shapes = [...shapes.values()].sort((a, b) => b.n - a.n);
  out.byDay = days.map((d) => ({ day: d, attempts: perDay.get(d)?.attempts ?? 0, landed: Math.min(perDay.get(d)?.attempts ?? 0, perDay.get(d)?.landed ?? 0) }));
  return out;
}

/**
 * A refusal or an abandon in words. The message is banded tokens
 * (`camera nodata art? cov<25 raw50+ seg5+ dur4m+ paced`); this reads the three
 * that decide what happened and leaves the rest to the raw line beside it.
 */
export function shapeLabel(tag: string, msg: string): string {
  const t = msg.split(' ');
  const has = (x: string) => t.includes(x);
  const how = has('raw50+') && has('seg5+') ? 'lock kept breaking'
    : has('raw<25') ? 'pulse barely arrived'
      : has('seg5+') ? 'many dropouts' : '';
  let what: string;
  if (tag === CAPTURE_TAG.abandoned) {
    what = t[1] === 'signal' ? 'Stopped by the app' : t[1] === 'early' ? 'Finished too early' : t[1] === 'user' ? 'Gave up (Having issues?)' : 'Abandoned';
  } else {
    what = t[1] === 'nodata' ? 'Refused, nothing usable' : t[1] === 'thin' ? 'Refused, too little pulse' : t[1] === 'noisy' ? 'Refused, too noisy' : 'Refused';
  }
  return how ? `${what}: ${how}` : what;
}

/** A sensor's failure rate for one store, or null with no attempts there. */
export const failPctFor = (o: CaptureOutcomes, k: 'I' | 'A') => (o.attempts[k] ? (o.failed[k] / o.attempts[k]) * 100 : null);

export function faultDay(ix: UsageIndex, d: string) {
  const L = ix.platform === 'ios' ? 'I' : ix.platform === 'android' ? 'A' : null;
  const out = { installs: 0, occurrences: 0, signatures: 0, crashInstalls: 0, crashOccurrences: 0, platforms: zero(), crashPlatforms: zero() };
  (ix.report?.faults || []).forEach((f) => {
    if (f.day !== d || !isFailure(f)) return;
    const inst = L ? f.platforms?.[L] || 0 : f.installs;
    const occ = L ? f.occPlatforms?.[L] || 0 : f.occurrences;
    if (L && !inst && !occ) return;
    out.installs += inst;
    out.occurrences += occ;
    out.signatures += 1;
    (['I', 'A', 'U'] as Letter[]).forEach((p) => {
      if (L && p !== L) return;
      out.platforms[p] += f.platforms?.[p] || 0;
      if (f.fatal) out.crashPlatforms[p] += f.platforms?.[p] || 0;
    });
    if (f.fatal) {
      out.crashInstalls += inst;
      out.crashOccurrences += occ;
    }
  });
  return out;
}

/* ----------------------------------------------------------- builds */

const semver = (v: string) => v.split('.').map((x) => Number(x) || 0);
export function compareVersions(a: string, b: string) {
  if (a === '?') return 1;
  if (b === '?') return -1;
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  }
  return 0;
}

export function buildsOver(ix: UsageIndex, days: string[]): Counts {
  const out: Counts = {};
  days.forEach((d) => {
    const e = entry(ix, 'open', d);
    if (e) Object.entries(e.builds).forEach(([v, n]) => bump(out, v, n));
  });
  return out;
}
