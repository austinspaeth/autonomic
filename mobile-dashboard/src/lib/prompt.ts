/* The AI prompt export: everything the dashboard knows about a period, written
 * out as one block of text to paste into a chat. Pure: a snapshot, the chosen
 * sections and a period in, a string out.
 *
 * It carries the dashboard's own rules into the text, because a model reading
 * bare numbers will break them: a count is a headcount of installs, not taps;
 * a day before a counter shipped is blank, not zero; a cohort too young for
 * day N is left out of day N; store reports stop at the last import.
 */
import type { Snapshot } from './data';
import { addDays, shortDate } from './dates';
import { DIG_LINES, DO_LINES, LOG_LINES, type Line } from './lines';
import { costsBetween, DOOR, faultGroups, PLAN, SENSOR, TIER, WALL } from './metrics';
import { bookOn, ledger, renewals, summarize as summarizeLedger } from './sales';
import { buildBase, dayRec, summarize, type StoreBase } from './store';
import {
  activation,
  activeOn,
  ageDays,
  boundaryTransition,
  buildIndex,
  buildsOver,
  captureFunnel,
  captureOutcomes,
  cohortHeat,
  cohortSize,
  compareVersions,
  conversion,
  conversionReached,
  doorsOver,
  entry,
  faultDay,
  known,
  measureRate,
  MILESTONES,
  newOn,
  offerFunnel,
  rangeDays,
  retentionAt,
  saveFunnel,
  shapeLabel,
  returningOn,
  slotOn,
  slotsOver,
  tiersOver,
  totalOn,
  weekStart,
  type CaptureOutcomes,
  type Rate,
  type UsageIndex,
} from './usage';
import type { PingKind } from './types';

export type PromptSection = 'usage' | 'retention' | 'features' | 'store' | 'sales' | 'errors' | 'events';
export type PromptPeriod = '7' | '30' | '90' | '180' | '365' | 'all';

export const PROMPT_SECTIONS: { key: PromptSection; label: string; sub: string }[] = [
  { key: 'usage', label: 'App usage', sub: 'Actives, installs, readings, tiers' },
  { key: 'retention', label: 'Retention & conversion', sub: 'Cohorts by install age' },
  { key: 'features', label: 'Feature use', sub: 'What they log, open and hit' },
  { key: 'store', label: 'Store funnel', sub: 'Impressions, page views, downloads' },
  { key: 'sales', label: 'Sales & revenue', sub: 'Ledger, MRR, churn, costs' },
  { key: 'errors', label: 'Crashes & errors', sub: 'Failures ranked by reach' },
  { key: 'events', label: 'Releases & events', sub: 'What shipped and when' },
];

export const PROMPT_PERIODS: { key: PromptPeriod; label: string }[] = [
  { key: '7', label: 'Past week' },
  { key: '30', label: 'Past month' },
  { key: '90', label: '3 months' },
  { key: '180', label: '6 months' },
  { key: '365', label: 'Past year' },
  { key: 'all', label: 'All time' },
];

/** Past this many days the tables are per week, so a year stays readable. */
const WEEKLY_AFTER = 92;

export type PromptWindow = { from: string; to: string; days: string[]; weekly: boolean };

/** The days a period covers, ending today. "All time" starts at the first day anything was recorded. */
export function promptWindow(snap: Snapshot | null, period: PromptPeriod, today: string): PromptWindow {
  let from: string;
  if (period === 'all') {
    const firsts = [buildBase(snap).min, snap?.pings?.since, ...(snap?.load?.sales || []).map((s) => s.date)].filter((d): d is string => !!d && d <= today);
    from = firsts.length ? firsts.reduce((a, b) => (a < b ? a : b)) : today;
  } else from = addDays(today, -(Number(period) - 1));
  const days = rangeDays(from, today);
  return { from, to: today, days, weekly: days.length > WEEKLY_AFTER };
}

/* ------------------------------------------------------------ writing */

type Cell = string | number | null | undefined;
const cell = (v: Cell) =>
  v === null || v === undefined ? '' : typeof v === 'number' ? (isFinite(v) ? String(Math.round(v * 100) / 100) : '') : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const table = (head: string[], rows: Cell[][]) => (rows.length ? ['```csv', head.join(','), ...rows.map((r) => r.map(cell).join(',')), '```'].join('\n') : '(none in this period)');
const pct = (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? 'n/a' : `${v.toFixed(1)}%`);
const money = (n: number, cur: string) => `${cur}${n.toFixed(2)}`;
const list = (lines: (string | null | false | undefined)[]) => lines.filter(Boolean).map((l) => `- ${l}`).join('\n');
const named = (counts: Record<string, number>, names: Record<string, string>) =>
  Object.entries(counts)
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${names[k] || k} ${n}`)
    .join(', ') || 'none';

type Bucket = { label: string; days: string[] };
function buckets(w: PromptWindow): Bucket[] {
  if (!w.weekly) return w.days.map((d) => ({ label: d, days: [d] }));
  const out: Bucket[] = [];
  w.days.forEach((d) => {
    const label = weekStart(d);
    const last = out[out.length - 1];
    if (last && last.label === label) last.days.push(d);
    else out.push({ label, days: [d] });
  });
  return out;
}
const sum = (days: string[], f: (d: string) => number) => days.reduce((t, d) => t + f(d), 0);
/** A sum over the days a counter existed; blank when it existed on none of them. */
const sumKnown = (ix: UsageIndex, k: PingKind, days: string[], f: (d: string) => number = (d) => totalOn(ix, k, d)) => {
  const seen = days.filter((d) => known(ix, k, d));
  return seen.length ? sum(seen, f) : null;
};

/* ----------------------------------------------------------- sections */

function usage(ix: UsageIndex, w: PromptWindow): string {
  const rows = buckets(w).map((b) => {
    const tiers = tiersOver(ix, 'open', b.days);
    const stores = b.days.reduce((t, d) => ({ I: t.I + (entry(ix, 'open', d)?.platforms.I ?? 0), A: t.A + (entry(ix, 'open', d)?.platforms.A ?? 0) }), { I: 0, A: 0 });
    return [
      b.label,
      sum(b.days, (d) => activeOn(ix, d)),
      sum(b.days, (d) => newOn(ix, d)),
      sum(b.days, (d) => returningOn(ix, d)),
      sumKnown(ix, 'cap', b.days),
      sumKnown(ix, 'hrv', b.days),
      sumKnown(ix, 'sav', b.days),
      sumKnown(ix, 'act', b.days),
      sumKnown(ix, 'sub', b.days),
      sumKnown(ix, 'rst', b.days),
      sumKnown(ix, 'lap', b.days),
      tiers.P ?? 0,
      tiers.T ?? 0,
      tiers.F ?? 0,
      stores.I,
      stores.A,
    ];
  });
  const m = measureRate(ix, w.days);
  const f = captureFunnel(ix, w.days);
  const sv = saveFunnel(ix, w.days);
  const bySensor = (label: string, fn: (L: string) => { num: number; den: number; pct: number | null }) =>
    `${label}: ${['W', 'G', 'B', 'F']
      .map((L) => ({ L, r: fn(L) }))
      .filter((x) => x.r.den > 0)
      .map((x) => `${SENSOR[x.L]} ${pct(x.r.pct)} (${x.r.num} of ${x.r.den})`)
      .join(', ') || 'none'}.`;
  const builds = Object.entries(buildsOver(ix, w.days))
    .sort((a, b) => compareVersions(a[0], b[0]))
    .slice(0, 8)
    .map(([v, n]) => `${v === '?' ? 'unknown' : v} ${n}`)
    .join(', ');
  return [
    '## App usage',
    list([
      `Active install-days ${sum(w.days, (d) => activeOn(ix, d))}, an average of ${(sum(w.days, (d) => activeOn(ix, d)) / w.days.length).toFixed(1)} installs in the app per day.`,
      `First runs (new installs seen by the app) ${sum(w.days, (d) => newOn(ix, d))}.`,
      `Share of active installs that completed an HRV reading that day: ${pct(m.pct)} (${m.readings} of ${m.active}).`,
      `Readings completed of readings started: ${pct(f.pct)} (${f.completed} of ${f.started}).`,
      `Sensor behind each install's first reading of the day: ${named(slotsOver(ix, 'hrv', w.days), SENSOR)}.`,
      `Sensor behind each install's FIRST EVER reading (activation, once per install): ${named(slotsOver(ix, 'act', w.days), SENSOR)}.`,
      bySensor('Completed of started, by sensor', (L) => {
        const x = captureFunnel(ix, w.days, L);
        return { num: x.completed, den: x.started, pct: x.pct };
      }),
      sv.completed
        ? `Readings saved to the journal of readings completed: ${pct(sv.pct)} (${sv.saved} of ${sv.completed}${sv.blind ? `; ${sv.blind} days before the saved counter existed are left out` : ''}). Completed means the reading ran to its end; saved means an entry was written. The gap is readings the app refused.`
        : null,
      sv.completed
        ? bySensor('Saved of completed, by sensor', (L) => {
          const x = saveFunnel(ix, w.days, L);
          return { num: x.saved, den: x.completed, pct: x.pct };
        })
        : null,
      `Active install-days by status: ${named(tiersOver(ix, 'open', w.days), { ...TIER, '?': 'Not stated' })}.`,
      `Active install-days by app version, newest first: ${builds || 'none'}.`,
    ]),
    '',
    capture(ix, w),
    '',
    `Per ${w.weekly ? 'week (starting Monday; each row sums daily headcounts, so it is install-days, not unique installs)' : 'day'}:`,
    table(
      ['date', 'active', 'first_runs', 'returning', 'readings_started', 'readings_completed', 'readings_saved', 'first_ever_readings', 'subs_reported', 'subs_restored', 'subs_lapsed', 'pro', 'trial', 'free', 'ios', 'android'],
      rows,
    ),
  ].join('\n');
}

/** The per-attempt capture funnel: the one block here that counts tries, not people. */
function capture(ix: UsageIndex, w: PromptWindow): string {
  const sensors: [string, string][] = [['camera', 'Camera'], ['polar', 'Chest strap']];
  const got = sensors.map(([src, label]) => ({ label, o: captureOutcomes(ix.report, w.days, 'all', src) }));
  if (!got.some((g) => g.o.attempts.n || g.o.legacyRefusedInstalls)) return 'Reading attempts: not counted in this period.';
  const rate = (o: CaptureOutcomes, k: 'n' | 'I' | 'A') => (o.attempts[k] ? (o.failed[k] / o.attempts[k]) * 100 : null);
  const shapes = got.flatMap((g) => g.o.shapes.slice(0, 8).map((x) => [g.label, shapeLabel(x.tag, x.msg), x.n, x.I, x.A, x.installs, x.msg] as Cell[]));
  const first = got.map((g) => g.o.first).filter((d): d is string => !!d).sort()[0];
  return [
    'Reading attempts. Unlike everything else in this section these count every ATTEMPT, not one per install per day, so an install that fails five times and then succeeds is six attempts, five of them failed. A failed attempt is one that began and did not become a journal entry: refused by the app at the end, stopped early by the app because it could not get a usable pulse, given up on by the user, finished within the first 45 seconds, or the app was closed mid-reading. Only sensors the phone itself reads are counted (watch readings are taken on the wrist).'
      + (first ? ` Counted from ${first}, when builds began reporting attempts; earlier days are blank, not zero.` : ''),
    table(
      ['sensor', 'attempts', 'failed', 'fail_pct', 'ios_attempts', 'ios_fail_pct', 'android_attempts', 'android_fail_pct', 'saved_by_app', 'refused', 'refused_but_kept_by_user', 'stopped_by_app', 'gave_up', 'finished_too_early', 'closed_mid_reading', 'older_build_refusals_install_days'],
      got.map(({ label, o }) => [
        label, o.attempts.n, o.failed.n, rate(o, 'n'), o.attempts.I, rate(o, 'I'), o.attempts.A, rate(o, 'A'),
        o.filed.n, o.refused.n, o.salvaged.n, o.abandonedBy.signal, o.abandonedBy.user, o.abandonedBy.early, o.vanished.n, o.legacyRefusedInstalls,
      ]),
    ),
    shapes.length ? 'What the failed attempts looked like (signature tokens: cov = share of the session with usable pulse kept, raw = share with any pulse collected, seg = separate stretches of pulse, dur = how long it ran, paced/free = paced breathing or not):' : null,
    shapes.length ? table(['sensor', 'what', 'times', 'ios', 'android', 'install_days', 'signature'], shapes) : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function retention(ix: UsageIndex, w: PromptWindow): string {
  const cohorts = ix.cohorts.filter((c) => c >= w.from && c <= w.to);
  const installs = cohorts.reduce((t, c) => t + cohortSize(ix, c), 0);
  const row = (label: string, r: Rate): Cell[] => [label, r.available ? r.pct : null, r.kept, r.of, r.immature];
  const t = boundaryTransition(ix, cohorts);
  const heat = cohortHeat(ix, cohorts);
  return [
    '## Retention and conversion',
    `Cohorts are install days. ${cohorts.length} cohorts were born in this period, ${installs} installs in all. Retention on day N is the share that opened the app on exactly day N (attendance, so a skipped day reads as a miss). A cohort too young to have reached day N is left out of that row and counted under cohorts_too_young; it has not churned.`,
    '',
    table(
      ['metric', 'rate_pct', 'installs_that_did', 'installs_counted', 'cohorts_too_young'],
      [
        ...[1, 3, 7, 14, 15, 30].map((n) => row(`Opened on day ${n}`, retentionAt(ix, cohorts, n))),
        row('Took a first reading on day 0', activation(ix, cohorts, 0)),
        row('Took a first reading by day 7', activation(ix, cohorts, 7)),
        ...[7, 14, 30].map((n) => row(`Subscribed by day ${n}`, conversion(ix, cohorts, n))),
        ...[7, 14, 30].map((n) => row(`Subscribed by day ${n}, of installs that turned ${n} days old in the period`, conversionReached(ix, w.from, w.to, n))),
      ],
    ),
    '',
    t.points === null ? null : `The trial ends after day 14. Over the same installs, day 14 attendance was ${pct(t.before.pct)} and day 15 was ${pct(t.after.pct)} (${t.points > 0 ? '+' : ''}${t.points.toFixed(1)} points).`,
    '',
    'Retention by weekly cohort (percent opening on exactly that day; blank is too young):',
    table(['week_of', 'installs', ...MILESTONES.map((n) => `d${n}`)], heat.map((h) => [h.week, h.size, ...h.cells.map((c) => c.pct)])),
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function features(ix: UsageIndex, w: PromptWindow): string {
  const lines = (ls: Line[]) =>
    table(
      ['what', 'install_days'],
      ls.map((l) => [l.label, sumKnown(ix, l.kind, w.days, (d) => (l.L ? slotOn(ix, l.kind, d, l.L) : totalOn(ix, l.kind, d)))] as Cell[]).filter((r) => r[1] !== null),
    );
  const offers = [
    ['Half-price annual', 'A'],
    ['Founding member', 'F'],
  ].map(([label, L]) => {
    const f = offerFunnel(ix, w.days, L);
    return [label, f.shown, f.accepted, f.dismissed, f.ignored, f.acceptPct] as Cell[];
  });
  const fails = slotsOver(ix, 'ofl', w.days);
  const sold = doorsOver(ix, w.days);
  return [
    '## Feature use',
    'Each line is a headcount of installs per day, summed over the period (install-days). Lines overlap and must not be added together. A line missing from a table was not being counted yet.',
    '',
    'Logged by hand, and readings by kind:',
    lines(LOG_LINES),
    '',
    'Things done in the app:',
    lines(DO_LINES),
    '',
    'Deeper views opened:',
    lines(DIG_LINES),
    '',
    `Paywall raised by a tap on a locked feature, by the first locked thing each install hit that day: ${named(slotsOver(ix, 'pay', w.days), WALL)}. "Settings upgrade" is somebody who went looking, not a wall.`,
    sold.first
      ? `Purchases by the door they were bought through (the locked feature that raised the paywall, or an offer card): ${named(sold.doors, DOOR)}.${sold.unknown ? ` ${sold.unknown} more did not say (an older build, or a payment with no buy tap behind it).` : ''} Counted from ${sold.first}. Set against the paywall line above, this is which wall converts rather than which is met most.`
      : 'Purchases by the door they were bought through: not reported by any build yet.',
    '',
    'Offers the app raised on its own ("accepted" is a tap on the buy button, not a completed purchase):',
    table(['offer', 'shown', 'accepted', 'dismissed', 'ignored', 'accept_pct'], offers),
    Object.values(fails).some(Boolean) ? `Purchase attempts that did not complete: ${named(fails, { A: 'half-price annual', F: 'founding member', P: 'paywall' })}.` : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function store(snap: Snapshot | null, b: StoreBase, w: PromptWindow): string {
  const bI = buildBase(snap, 'ios');
  const bA = buildBase(snap, 'android');
  const last = b.lastReported;
  const reported = (d: string) => !!last && d <= last;
  const rows = buckets(w).map((k) => {
    const seen = k.days.filter(reported);
    const s = (base: StoreBase, f: 'downloads' | 'impressions' | 'pageViews') => (seen.length ? sum(seen, (d) => dayRec(base, d)[f]) : null);
    return [k.label, s(bI, 'downloads'), s(bA, 'downloads'), s(b, 'impressions'), s(b, 'pageViews'), sum(k.days, (d) => dayRec(b, d).sales)];
  });
  const to = last && last < w.to ? last : w.to;
  const s = summarize(b, w.from, to >= w.from ? to : w.from);
  // Purchases are not waiting on a store report, so the all-time line runs to today.
  const all = summarize(b, w.from, w.to);
  return [
    '## Store funnel',
    `From the App Store and Google Play reports, imported by hand${last ? ` and recorded through ${last}` : ''}. Days after that are blank because they are not reported yet, not because they were zero. Purchases come from the sales ledger.`,
    list([
      `Impressions ${s.impressions}, product page views ${s.pageViews}, first-time downloads ${s.downloads}.`,
      `Impression to page view ${pct(s.tapThrough)}, page view to download ${pct(s.ppvConv)}, impression to download ${pct(s.storeConv)}.`,
      `All time: ${all.totalInstalls} downloads, ${all.outOfTrial} of them past the ${b.trialDays}-day trial, ${all.totalSales} purchases (${pct(all.convOfOutOfTrial)} of those past the trial).`,
    ]),
    '',
    `Per ${w.weekly ? 'week (starting Monday)' : 'day'}:`,
    table(['date', 'downloads_ios', 'downloads_android', 'impressions', 'page_views', 'purchases'], rows),
  ].join('\n');
}

function sales(snap: Snapshot | null, w: PromptWindow): string {
  const cur = snap?.load?.settings?.currency || '$';
  const $ = (n: number) => money(n, cur);
  const l = ledger(snap?.load?.sales, snap?.load?.churn, 'all');
  const s = summarizeLedger(l, w.from, w.to);
  const ren = renewals(l, w.from, w.to);
  const renSum = ren.reduce((t, r) => t + r.amount, 0);
  const now = bookOn(l, w.to);
  const before = bookOn(l, addDays(w.from, -1));
  const cut = snap?.load?.settings?.storeCutPct ?? 0;
  const costs = costsBetween(snap, w.from, w.to);
  const inRange = l.rows.filter((r) => r.date >= w.from && r.date <= w.to);
  const churn = l.churn.filter((c) => c.date >= w.from && c.date <= w.to);
  return [
    '## Sales and revenue',
    'A hand-kept ledger of FIRST payments at the customer-facing price. Nothing reports a renewal, so renewals are estimated: every subscription not marked cancelled is assumed to renew each term. MRR is the monthly rate the book runs at, not cash received.',
    list([
      `New purchases ${s.totalUnits} for ${$(s.totalBookings)}: monthly ${s.units.monthly} (${$(s.bookings.monthly)}), annual ${s.units.annual} (${$(s.bookings.annual)}), lifetime ${s.units.lifetime} (${$(s.bookings.lifetime)})${s.units.unknown ? `, unclassified ${s.units.unknown} (${$(s.bookings.unknown)})` : ''}.`,
      `Estimated renewals ${ren.length} for ${$(renSum)}. Total ${$(s.totalBookings + renSum)} before the stores' ${cut}% cut, ${$((s.totalBookings + renSum) * (1 - cut / 100))} after.`,
      `Refunded purchases ${s.refunds}. Cancelled subscriptions ${s.cancelledUnits}, taking ${$(s.churnedMrr)} of MRR with them.`,
      `MRR ${$(before.mrr)} the day before the period, ${$(now.mrr)} at its end (ARR ${$(now.arr)}). Active subscriptions at the end: ${now.active} (monthly ${now.activeByPlan.monthly}, annual ${now.activeByPlan.annual}).`,
      `Costs recorded in the period: ${$(costs)}.`,
    ]),
    '',
    'Purchases in the period (days_to_buy is purchase day minus install day, where the install day is known):',
    table(
      ['date', 'store', 'plan', 'price', 'qty', 'installed', 'days_to_buy', 'cancelled', 'refunded'],
      inRange.map((r) => [r.date, r.platform, r.plan, r.price, r.qty, r.cohort ?? null, r.cohort ? ageDays(r.cohort, r.date) : null, r.cancelled ?? null, r.refunded ? 'yes' : null]),
    ),
    churn.length ? '\nChurn reported by the stores with no purchase attached:' : null,
    churn.length ? table(['date', 'mrr_lost', 'plan', 'store', 'units'], churn.map((c) => [c.date, c.mrr, c.plan ?? null, c.platform ?? null, c.units ?? null])) : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function errors(ix: UsageIndex, w: PromptWindow): string {
  const groups = faultGroups(ix.report, w.days);
  const total = w.days.reduce((t, d) => {
    const f = faultDay(ix, d);
    return { installs: t.installs + f.installs, crash: t.crash + f.crashInstalls, occ: t.occ + f.occurrences };
  }, { installs: 0, crash: 0, occ: 0 });
  const active = sum(w.days, (d) => activeOn(ix, d));
  return [
    '## Crashes and errors',
    `Failures the app reported about itself, grouped by where in the code they happened (the tag) and a redacted message. install_days is how many installs hit it per day, summed, which is the measure of reach; occurrences is how many times it fired. One looping phone makes occurrences large and install_days small. Rows are kept for 120 days.`,
    list([
      `Install-days with any failure ${total.installs}${active ? ` (${pct((total.installs / active) * 100)} of active install-days)` : ''}, with a crash ${total.crash}. Occurrences ${total.occ}. Distinct failures ${groups.length}.`,
    ]),
    '',
    `The ${Math.min(30, groups.length)} with the widest reach:`,
    table(['tag', 'crash', 'install_days', 'occurrences', 'last_seen', 'message'], groups.slice(0, 30).map((g) => [g.tag, g.fatal ? 'yes' : null, g.installs, g.occurrences, g.lastDay, g.msg])),
  ].join('\n');
}

function events(snap: Snapshot | null, w: PromptWindow): string {
  const evs = (snap?.load?.events || []).filter((e) => e.date >= w.from && e.date <= w.to).sort((a, b) => a.date.localeCompare(b.date));
  const side = (name: string, s: NonNullable<Snapshot['stores']>['ios']) =>
    s && !s.error ? `${name}: version ${s.version ?? 'unknown'}${s.released ? ` released ${String(s.released).slice(0, 10)}` : ''}${s.rating ? `, rated ${Number(s.rating).toFixed(2)} from ${s.ratingCount ?? '?'} ratings` : ''}.` : null;
  return [
    '## Releases and events',
    'What changed, to line up against the numbers above.',
    table(['date', 'kind', 'title', 'note'], evs.map((e) => [e.date, e.category.toLowerCase(), e.title, e.note ?? null])),
    '',
    list([side('App Store now', snap?.stores?.ios), side('Google Play now', snap?.stores?.android)]),
  ]
    .join('\n')
    .trimEnd();
}

/* -------------------------------------------------------------- whole */

export function buildPrompt(snap: Snapshot | null, sections: PromptSection[], period: PromptPeriod, today: string): string {
  const w = promptWindow(snap, period, today);
  const has = (k: PromptSection) => sections.includes(k);
  const pings = has('usage') || has('retention') || has('features') || has('errors');
  const ix = buildIndex(snap?.pings, 'all', today);
  const b = buildBase(snap);
  const label = PROMPT_PERIODS.find((p) => p.key === period)?.label.toLowerCase() ?? '';
  const year = (d: string) => `${shortDate(d)} ${d.slice(0, 4)}`;

  const intro = [
    'You are helping me, the solo developer of Autonomic Journal, understand how the app is doing and decide what to do next.',
    '',
    `Autonomic Journal is a private, offline-first iOS and Android app for people tracking autonomic recovery (dysautonomia, POTS, long COVID, ME/CFS). People take heart rate variability readings with an Apple Watch, a Garmin, a chest strap or the phone camera, log sleep, symptoms, medications and activity by hand, and get a daily score, trends and a pacing budget. It is freemium: every install starts with a ${b.trialDays}-day full-access trial and then drops to Free unless it subscribes to Pro (monthly or annual). Taking readings is free forever; Pro is the analysis.`,
    '',
    `The data below covers ${year(w.from)} to ${year(w.to)} (${label}, ${w.days.length} days), both stores combined, ${w.weekly ? 'in weekly rows' : 'in daily rows'}. Days are US Eastern. The last day, ${w.to}, is today and still filling, so treat it as partial.`,
    '',
    'How to read it:',
    list([
      pings && 'The app keeps no accounts and no user or device id. Usage comes from anonymous counters, each capped at once per install per day, so a count is a headcount of installs that day and never a count of taps. Summed over days it is install-days, which cannot be turned into unique users.',
      pings && 'A blank cell means not measured (a counter that had not shipped yet, a cohort too young, a report not imported). It is never zero.',
      pings && '"Subscriptions reported" are purchases the app itself saw; the sales ledger is the record of money.',
      (has('store') || has('sales')) && 'Store numbers and the sales ledger are typed in from the store consoles, so they lag by a day or two and can be incomplete.',
      'Many of these numbers are small. Say so when a difference rests on a handful of installs rather than reading a trend into it.',
    ]),
  ].join('\n');

  const body = [
    has('usage') && usage(ix, w),
    has('retention') && retention(ix, w),
    has('features') && features(ix, w),
    has('store') && store(snap, b, w),
    has('sales') && sales(snap, w),
    has('errors') && errors(ix, w),
    has('events') && events(snap, w),
  ].filter(Boolean);

  const ask = [
    '## What I want from you',
    list([
      'The three or four things in this data that matter most, each with the numbers behind it.',
      'What is getting better and what is getting worse, and the most likely reason for each.',
      'Where people are being lost: between the store and the first reading, during the trial, and at the paywall.',
      'The highest-leverage things to do next, in order, and what each should move.',
      'Anything that looks wrong or contradictory in the data itself.',
    ]),
    '',
    'Be direct and specific. Separate what the data shows from what you are guessing, and tell me what you would want to see that is not here.',
  ].join('\n');

  return [intro, ...body, ask].join('\n\n');
}
