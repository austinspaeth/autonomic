/* The app noticing something happened: a port of landing/master/alerts.js's
 * pure half. Pure: two snapshots in, events out. No storage, no UI.
 *
 * Fed by the PING COUNTER only, the one source that changes on its own. The
 * store downloads and the sales ledger are typed in, so an alert from them
 * would be an alert about your own typing.
 *
 * The rules carried over:
 *  - A DOWNLOAD is a first run: an open whose cohort IS the day it arrived.
 *  - A RETURN is any other open.
 *  - Two snapshots are compared DAY BY DAY, never total against total, and a
 *    count that falls is not an event (the 400-day window slides; the oldest
 *    day drops out as the calendar turns). A drop clamps to zero.
 *  - Rows GROUP: pings agreeing on install day, store, tier and slot are one
 *    row with a count, because identical facts are one fact.
 *  - A first reading raises BOTH `act` and `hrv`; it is one event (a reading,
 *    tagged first), never two cards one above the other.
 */
import { shortDate } from './dates';
import type { PingKind, PingReport } from './types';

export type AlertKind = 'sale' | 'download' | 'visitor' | 'reading' | 'restore' | 'lapse' | 'record' | 'crash';

export type AlertRow = {
  cohort: string;
  platform: 'I' | 'A' | 'U';
  tier: 'F' | 'T' | 'P' | '?';
  /** Sensor on readings, plan on sales/restores/lapses. */
  slot: string;
  /** Days from install to the day it pinged. */
  age: number;
  n: number;
  first?: boolean;
  /** The app version, when this store+tier group arrived on exactly one. */
  version?: string;
};

export type AlertEvent = {
  id: string;
  kind: AlertKind;
  /** When the app noticed (ms). */
  at: number;
  /** The Eastern day the pings landed on. */
  day: string;
  count: number;
  title: string;
  body: string;
  rows: AlertRow[];
};

/** Days of per-install detail a snapshot keeps; past the 30-day catch-up with room to spare. */
export const COHORT_DAYS = 45;
/** A baseline older than this is reseeded in silence rather than replayed. */
export const MAX_CATCHUP_MS = 30 * 864e5;

type WhoMap = Record<string, number>;
export type Snapshot = {
  v: 1;
  at: number;
  /** day -> route -> install key -> count */
  days: Record<string, Partial<Record<PingKind, WhoMap>>>;
  /** day -> route -> "platform|tier" -> version -> count (versions ride in their own map on the server). */
  builds?: Record<string, Partial<Record<PingKind, Record<string, Record<string, number>>>>>;
  /** Crash rows (fatal faults) by key: install-days and occurrences so far. */
  crashes?: Record<string, { installs: number; occurrences: number; tag: string; msg: string; day: string; platforms: Record<string, number> }>;
};

const ROUTES: PingKind[] = ['open', 'sub', 'rst', 'lap', 'act', 'hrv'];

const STORE: Record<string, string> = { I: 'iOS', A: 'Android', U: 'unknown store' };
const SENSOR: Record<string, string> = { W: 'Apple Watch', B: 'chest strap', F: 'phone camera', G: 'Garmin watch' };
const PLAN: Record<string, string> = { Y: 'Yearly', M: 'Monthly', P: 'Promo year', F: 'Founder year' };
export const TIER: Record<string, string> = { F: 'Free', T: 'Trial', P: 'Pro' };
export const SENSOR_CHIP: Record<string, string> = { W: 'Apple Watch', B: 'Chest strap', F: 'Phone camera', G: 'Garmin watch' };
export const PLAN_CHIP = PLAN;
export const STORE_CHIP: Record<string, string> = { I: 'iOS', A: 'Android', U: 'Unknown store' };

const dayNum = (s: string) => Date.parse(`${s}T00:00:00Z`) / 864e5;
const ageOf = (cohort: string, day: string) => Math.max(0, Math.round(dayNum(day) - dayNum(cohort)));
const key = (cohort: string, platform: string, tier: string | null, slot: string | null) =>
  `${cohort}|${platform === 'I' || platform === 'A' ? platform : 'U'}|${tier && TIER[tier] ? tier : '?'}|${slot || '?'}`;

export function snapshot(report: PingReport | null | undefined, now = Date.now()): Snapshot {
  const days: Snapshot['days'] = {};
  const builds: NonNullable<Snapshot['builds']> = {};
  const cutoff = new Date(now - COHORT_DAYS * 864e5).toISOString().slice(0, 10);
  ROUTES.forEach((k) => {
    (report?.[k] || []).forEach((row) => {
      if (row.day < cutoff) return;
      const map: WhoMap = ((days[row.day] ||= {})[k] ||= {});
      (row.cohorts || []).forEach((c) => {
        const kk = key(c.cohort, c.platform, c.tier, c.slot);
        map[kk] = (map[kk] || 0) + c.count;
      });
      (row.builds || []).forEach((b) => {
        const g = (((builds[row.day] ||= {})[k] ||= {})[`${b.platform}|${b.tier && TIER[b.tier] ? b.tier : '?'}`] ||= {});
        const v = b.version || '?';
        g[v] = (g[v] || 0) + b.count;
      });
    });
  });
  const crashes: NonNullable<Snapshot['crashes']> = {};
  (report?.faults || []).forEach((f) => {
    if (!f.fatal || f.day < cutoff) return;
    crashes[f.key] = { installs: f.installs, occurrences: f.occurrences, tag: f.tag, msg: f.msg, day: f.day, platforms: f.platforms || {} };
  });
  return { v: 1, at: now, days, builds, crashes };
}

function parseKey(k: string) {
  const [cohort, platform, tier, slot] = k.split('|');
  return { cohort, platform: platform as AlertRow['platform'], tier: tier as AlertRow['tier'], slot };
}

/** Per install key, how much each day rose. Never negative. */
function rises(prev: Snapshot, next: Snapshot, k: PingKind, filter?: (cohort: string, day: string) => boolean) {
  const out: { day: string; key: string; n: number }[] = [];
  Object.entries(next.days).forEach(([day, routes]) => {
    const now = routes[k] || {};
    const before = prev.days[day]?.[k] || {};
    Object.entries(now).forEach(([kk, n]) => {
      const { cohort } = parseKey(kk);
      if (filter && !filter(cohort, day)) return;
      const d = n - (before[kk] || 0);
      if (d > 0) out.push({ day, key: kk, n: d });
    });
  });
  return out;
}

function toRows(list: { day: string; key: string; n: number }[], firsts?: Set<string>): AlertRow[] {
  const by = new Map<string, AlertRow>();
  list.forEach(({ day, key: kk, n }) => {
    const p = parseKey(kk);
    const id = `${kk}|${firsts?.has(`${day}|${kk}`) ? 1 : 0}`;
    const r = by.get(id) || { ...p, age: ageOf(p.cohort, day), n: 0, first: firsts?.has(`${day}|${kk}`) || undefined };
    r.n += n;
    by.set(id, r);
  });
  return [...by.values()].sort((a, b) => b.n - a.n || a.age - b.age);
}

/** Attach a version to each row whose store+tier group rose on exactly one version. */
function withVersions(rows: AlertRow[], prev: Snapshot, next: Snapshot, k: PingKind): AlertRow[] {
  const rose: Record<string, Set<string>> = {};
  Object.entries(next.builds || {}).forEach(([day, routes]) => {
    Object.entries(routes[k] || {}).forEach(([group, vers]) => {
      Object.entries(vers).forEach(([v, n]) => {
        const before = prev.builds?.[day]?.[k]?.[group]?.[v] || 0;
        if (n > before && v !== '?') (rose[group] ||= new Set()).add(v);
      });
    });
  });
  return rows.map((r) => {
    const set = rose[`${r.platform}|${r.tier}`];
    return set && set.size === 1 ? { ...r, version: [...set][0] } : r;
  });
}

const total = (rows: AlertRow[]) => rows.reduce((t, r) => t + r.n, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function storeLine(rows: AlertRow[]) {
  const by: Record<string, number> = {};
  rows.forEach((r) => (by[r.platform] = (by[r.platform] || 0) + r.n));
  return ['I', 'A', 'U'].filter((k) => by[k]).map((k) => `${by[k]} on ${STORE[k]}`).join(' · ');
}
function tierLine(rows: AlertRow[]) {
  const by: Record<string, number> = {};
  rows.forEach((r) => (by[r.tier] = (by[r.tier] || 0) + r.n));
  return ['P', 'T', 'F'].filter((k) => by[k]).map((k) => `${by[k]} ${TIER[k]}`).join(' · ');
}
function slotLine(rows: AlertRow[], names: Record<string, string>) {
  const by: Record<string, number> = {};
  rows.forEach((r) => (by[r.slot] = (by[r.slot] || 0) + r.n));
  return Object.keys(names)
    .filter((k) => by[k])
    .map((k) => `${by[k]} ${names[k]}`)
    .join(' · ');
}
const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(' · ');

function event(kind: AlertKind, rows: AlertRow[], title: string, body: string, at: number, day: string): AlertEvent {
  return { id: `${kind}-${at}-${Math.random().toString(36).slice(2, 7)}`, kind, at, day, count: total(rows), title, body, rows };
}

/** Everything that rose between two snapshots, loudest first. */
export function diff(prev: Snapshot, next: Snapshot): AlertEvent[] {
  const at = next.at;
  const latest = Object.keys(next.days).sort().pop() || '';
  const out: AlertEvent[] = [];

  const sales = withVersions(toRows(rises(prev, next, 'sub')), prev, next, 'sub');
  if (sales.length) {
    const n = total(sales);
    out.push(event('sale', sales, plural(n, 'new sale', 'new sales'), join(slotLine(sales, PLAN), storeLine(sales)), at, latest));
  }

  const downloads = withVersions(toRows(rises(prev, next, 'open', (c, d) => c === d)), prev, next, 'open');
  if (downloads.length) {
    const n = total(downloads);
    out.push(event('download', downloads, plural(n, 'new install', 'new installs'), storeLine(downloads), at, latest));
  }

  // Readings, with first readings folded in as a tag (act + hrv are one event).
  const actRises = rises(prev, next, 'act');
  const firsts = new Set(actRises.map((r) => `${r.day}|${r.key}`));
  const readings = withVersions(toRows(rises(prev, next, 'hrv'), firsts), prev, next, 'hrv');
  if (readings.length) {
    const n = total(readings);
    const f = readings.filter((r) => r.first).reduce((t, r) => t + r.n, 0);
    out.push(
      event('reading', readings, plural(n, 'new reading', 'new readings'), join(f ? `${f} first ever` : null, slotLine(readings, SENSOR)), at, latest),
    );
  }

  const visitors = withVersions(toRows(rises(prev, next, 'open', (c, d) => c !== d)), prev, next, 'open');
  if (visitors.length) {
    const n = total(visitors);
    const ages = visitors.map((r) => r.age).sort((a, b) => a - b);
    const median = ages[Math.floor(ages.length / 2)];
    out.push(
      event('visitor', visitors, `${plural(n, 'person', 'people')} came back`, join(storeLine(visitors), tierLine(visitors), `median ${median} days in`), at, latest),
    );
  }

  /* A crash is told the moment it is reported, one alert per call site, with
     how many phones (install-days) it reached since the last look. */
  /* A baseline written before crashes were tracked has no crash map: that is
     "not recorded", not "no crashes", so it seeds in silence (the web's
     SNAP_V rule) instead of announcing every crash in the window as new. */
  Object.entries(prev.crashes ? next.crashes || {} : {}).forEach(([k, c]) => {
    const before = prev.crashes![k];
    const phones = c.installs - (before?.installs || 0);
    const times = c.occurrences - (before?.occurrences || 0);
    if (phones <= 0 && times <= 0) return;
    const stores = ['I', 'A', 'U'].filter((p) => c.platforms[p]).map((p) => `${c.platforms[p]} on ${STORE[p]}`).join(' · ');
    out.push({
      id: `crash-${k}-${at}`,
      kind: 'crash',
      at,
      day: c.day,
      count: Math.max(1, phones),
      title: `Crash: ${c.tag}`,
      body: join(`${plural(Math.max(1, phones), 'phone', 'phones')}`, stores, c.msg),
      rows: [],
    });
  });

  const restores = toRows(rises(prev, next, 'rst'));
  if (restores.length) out.push(event('restore', restores, plural(total(restores), 'subscription restored', 'subscriptions restored'), storeLine(restores), at, latest));
  const lapses = toRows(rises(prev, next, 'lap'));
  if (lapses.length) out.push(event('lapse', lapses, plural(total(lapses), 'subscription lapsed', 'subscriptions lapsed'), storeLine(lapses), at, latest));

  return out;
}

/* -------------------------------------------------------------- records */

export type RecordMetric = { key: string; label: string; kind: PingKind; firstRunOnly?: boolean };

export const RECORD_METRICS: RecordMetric[] = [
  { key: 'active', label: 'in the app', kind: 'open' },
  { key: 'installs', label: 'new installs', kind: 'open', firstRunOnly: true },
  { key: 'sales', label: 'sales', kind: 'sub' },
  { key: 'readings', label: 'readings', kind: 'hrv' },
];

/** At least this many OTHER days must exist before a best day means anything (the web's rule). */
const RECORD_MIN_DAYS = 14;

/** A metric's value on `day` beat every earlier day it has? (Strictly; zero never counts.) */
export function records(report: PingReport | null | undefined, day: string, at = Date.now()): AlertEvent[] {
  const out: AlertEvent[] = [];
  RECORD_METRICS.forEach((m) => {
    const rows = report?.[m.kind] || [];
    const val = (r: (typeof rows)[number]) =>
      m.firstRunOnly ? (r.cohorts || []).filter((c) => c.cohort === r.day).reduce((t, c) => t + c.count, 0) : r.total;
    const today = rows.find((r) => r.day === day);
    const others = rows.filter((r) => r.day < day);
    if (!today || others.length < RECORD_MIN_DAYS) return;
    const v = val(today);
    let best = 0;
    let bestDay = '';
    others.forEach((r) => {
      const x = val(r);
      if (x > best) {
        best = x;
        bestDay = r.day;
      }
    });
    if (v > 0 && v > best) {
      out.push({
        id: `record-${m.key}-${day}`,
        kind: 'record',
        at,
        day,
        count: v,
        title: `All-time high: ${v} ${m.label}`,
        body: best ? `Beat the old best of ${best} on ${shortDate(bestDay)}` : 'The first day on record',
        rows: [],
      });
    }
  });
  return out;
}

/* The live toasts are a deck: the most important in front (TOAST_PRIORITY,
   newest first within a kind). One order for the deck that draws them and
   the store that picks the confetti, which follows the FRONT card only. */
export const TOAST_PRIORITY: AlertEvent['kind'][] = ['crash', 'sale', 'record', 'download', 'visitor', 'reading'];
const toastRank = (k: AlertEvent['kind']) => {
  const i = TOAST_PRIORITY.indexOf(k);
  return i < 0 ? TOAST_PRIORITY.length : i;
};

/** Live toast ids (arrival order) to events, front to back. */
export function deckOrder(live: string[], history: AlertEvent[]): AlertEvent[] {
  // `live` is in arrival order and the sort is stable, so reversing first
  // puts the newest first within a kind.
  return [...live]
    .reverse()
    .map((id) => history.find((e) => e.id === id))
    .filter((e): e is AlertEvent => !!e)
    .sort((a, b) => toastRank(a.kind) - toastRank(b.kind));
}
