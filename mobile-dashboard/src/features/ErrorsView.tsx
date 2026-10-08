/* Crashes & Errors: every reported failure, grouped by call site and message.
 *
 * Two numbers, always together: TIMES is how often it happened (every
 * occurrence); PHONES is install-days, as close to a phone count as a system
 * with no device id gets (nine may be nine phones once or one phone nine
 * days). Ranked by phones by default. A CRASH is a fatal report (the app went
 * down: an uncaught JS fatal, or an Android native crash); everything else was
 * caught and handled. Native iOS crashes are not reported by the app at all.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';
import { Chips, SplitBar } from '../components/charts';
import { MetricTiles, type MetricSpec } from '../components/MetricTiles';
import { OverlayBars } from '../components/series';
import { Card, Divider, Empty, Pill } from '../components/ui';
import { DeepDive, DeepDiveGrid } from '../components/DeepDive';
import { useData } from '../lib/data';
import { addDays, shortDate } from '../lib/dates';
import { int } from '../lib/format';
import type { Fault } from '../lib/types';
import { compareVersions, rangeDays } from '../lib/usage';
import { C, num } from '../theme';

type Sort = 'installs' | 'often' | 'recent' | 'new' | 'fatal';
type Group = {
  key: string;
  tag: string;
  msg: string;
  fatal: boolean;
  installs: number;
  occurrences: number;
  first: string;
  last: string;
  platforms: Record<string, number>;
  versions: Record<string, number>;
  byDay: Record<string, number>;
  /** When its first and its latest report arrived, where the server recorded it. */
  firstAt: string | null;
  lastAt: string | null;
  /** One per day it was seen: that day's counts and the times of its first and latest report. */
  seen: { day: string; installs: number; occurrences: number; firstAt: string | null; lastAt: string | null }[];
};

/* Rows opening and closing: a short ease-out, no spring. These are lists
   read quickly, and a bounce on every tap reads as lag. */
const ROW_EASE = LinearTransition.duration(200).easing(Easing.out(Easing.cubic));

/* Times are the phone's own zone; the DAY a failure is filed under is US
   Eastern, the server's bucket, so near midnight the two can differ. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** A date and time from a report's timestamp, or just the day when an older row has none. */
const stamp = (iso: string | null, day: string) =>
  iso ? `${new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${clock(iso)}` : shortDate(day);
/** The stretch of a day a failure was reported over. */
const span = (first: string | null, last: string | null) =>
  !first && !last ? 'time not recorded' : !first || !last || clock(first) === clock(last) ? clock((last || first)!) : `${clock(first)} – ${clock(last)}`;

const VERSION_COLORS = ['#2563eb', '#199e70', '#c98500', '#d95926', '#d55181', '#8b5cf6'];
const STORE: Record<string, string> = { I: 'iOS', A: 'Android', U: 'No store' };

/** What one failure says at rest: where it is, and which builds it is on. */
function where(g: Group) {
  const stores = Object.entries(g.platforms)
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => STORE[p] || p);
  const versions = Object.entries(g.versions)
    .filter(([v, n]) => n && v !== '?')
    .sort((a, b) => compareVersions(a[0], b[0]))
    .map(([v]) => `v${v}`);
  return [stores.join(' + '), versions.slice(0, 2).join(', ') + (versions.length > 2 ? ` +${versions.length - 2}` : '')].filter(Boolean).join(' · ');
}

/**
 * A list of failures, one row each: its call site, the message cut to two
 * lines, where it happens and how many phones and times. Tapping a row opens
 * it: the whole message, when it was first and last seen, and its split by
 * store and by build.
 */
function FaultRows({ title, groups, lead = 'phones' }: { title?: string; groups: (Group & { isNew: boolean })[]; /** Which count is the big number. */ lead?: 'phones' | 'times' }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View>
      {title ? (
        <Text style={s.listHead}>{title}</Text>
      ) : null}
      {groups.length ? (
        groups.map((g, i) => {
          const isOpen = open === g.key;
          const versions = Object.entries(g.versions).sort((a, b) => compareVersions(a[0], b[0])).slice(0, 6);
          return (
            <Animated.View key={g.key} layout={ROW_EASE}>
              {i ? <Divider /> : null}
              <Pressable onPress={() => setOpen(isOpen ? null : g.key)} style={s.item}>
                <View style={s.itemHead}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={s.tagRow}>
                      {g.fatal ? <Pill label="CRASH" color={C.down} /> : null}
                      {g.isNew ? <Pill label="NEW" color="#c98500" /> : null}
                      <Text style={s.tag} numberOfLines={1}>
                        {g.tag}
                      </Text>
                    </View>
                    <Text style={s.msg} numberOfLines={isOpen ? undefined : 2}>
                      {g.msg || 'No message'}
                    </Text>
                    <Text style={[s.small, num]} numberOfLines={1}>
                      {where(g)}
                    </Text>
                    <Text style={[s.small, num]} numberOfLines={1}>
                      Last {stamp(g.lastAt, g.last)}
                      {g.first !== g.last || (g.firstAt && g.firstAt !== g.lastAt) ? ` · first ${stamp(g.firstAt, g.first)}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.big, num]}>{lead === 'times' ? `${int(g.occurrences)}×` : int(g.installs)}</Text>
                    <Text style={s.small}>{lead === 'times' ? `${int(g.installs)} ${g.installs === 1 ? 'phone' : 'phones'}` : `${int(g.occurrences)}×`}</Text>
                  </View>
                </View>
                {isOpen ? (
                  <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12, marginTop: 10 }}>
                    <View style={s.facts}>
                      {[
                        ['First seen', stamp(g.firstAt, g.first)],
                        ['Last seen', stamp(g.lastAt, g.last)],
                        ['Days seen', int(Object.keys(g.byDay).length)],
                        ['Phones', int(g.installs)],
                        ['Times', int(g.occurrences)],
                        ['Times per phone', g.installs ? (g.occurrences / g.installs).toFixed(1) : '–'],
                      ].map(([k, v]) => (
                        <View key={k} style={s.fact}>
                          <Text style={s.small}>{k}</Text>
                          <Text style={[s.factValue, num]}>{v}</Text>
                        </View>
                      ))}
                    </View>
                    <SplitBar
                      parts={[
                        { key: 'I', label: 'iOS', value: g.platforms.I || 0, color: C.ios },
                        { key: 'A', label: 'Android', value: g.platforms.A || 0, color: C.android },
                        { key: 'U', label: 'No store', value: g.platforms.U || 0, color: C.unknown },
                      ]}
                      format={int}
                    />
                    {versions.length ? (
                      <SplitBar
                        parts={versions.map(([v, n], j) => ({ key: v, label: v === '?' ? 'Not stated' : `v${v}`, value: n, color: VERSION_COLORS[j] || C.unknown }))}
                        format={int}
                      />
                    ) : null}
                    <Text style={s.small}>A failure sitting almost entirely on the newest build is a regression that shipped.</Text>
                    <View style={{ gap: 6 }}>
                      <Text style={s.listHead}>Day by day</Text>
                      {[...g.seen]
                        .sort((a, b) => b.day.localeCompare(a.day))
                        .slice(0, 14)
                        .map((d) => (
                          <View key={d.day} style={s.dayRow}>
                            <Text style={[s.dayLabel, num]}>{shortDate(d.day)}</Text>
                            <Text style={[s.small, num, { flex: 1 }]} numberOfLines={1}>
                              {span(d.firstAt, d.lastAt)}
                            </Text>
                            <Text style={[s.dayValue, num]}>
                              {int(d.installs)} · {int(d.occurrences)}×
                            </Text>
                          </View>
                        ))}
                      {g.seen.length > 14 ? <Text style={s.small}>and {g.seen.length - 14} earlier days</Text> : null}
                    </View>
                  </Animated.View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })
      ) : (
        <Empty>Nothing here for this range.</Empty>
      )}
    </View>
  );
}

export function ErrorsView({ dk, range, platform }: { dk: string; range: '7' | '30' | '90' | 'all'; platform: 'all' | 'ios' | 'android' }) {
  const { snap } = useData();
  const [sort, setSort] = useState<Sort>('installs');
  const L = platform === 'ios' ? 'I' : platform === 'android' ? 'A' : null;

  const m = useMemo(() => {
    const faults = snap?.pings?.faults || [];
    const first = faults.reduce((min, f) => (f.day < min ? f.day : min), dk);
    let from = range === 'all' ? first : addDays(dk, -(Number(range) - 1));
    if (from > dk) from = dk;
    const days = rangeDays(from, dk);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days.length - 1));
    const inst = (f: Fault) => (L ? f.platforms?.[L] || 0 : f.installs);
    const occ = (f: Fault) => (L ? f.occPlatforms?.[L] || 0 : f.occurrences);
    const groups = new Map<string, Group>();
    const allFirst = new Map<string, string>();
    faults.forEach((f) => {
      const k = `${f.tag}|${f.msg}`;
      if (!allFirst.has(k) || f.day < allFirst.get(k)!) allFirst.set(k, f.day);
      if (f.day < from || f.day > dk) return;
      if (L && !inst(f) && !occ(f)) return;
      const g = groups.get(k) || { key: k, tag: f.tag, msg: f.msg, fatal: false, installs: 0, occurrences: 0, first: f.day, last: f.day, platforms: {}, versions: {}, byDay: {}, firstAt: null, lastAt: null, seen: [] };
      g.fatal = g.fatal || f.fatal;
      g.installs += inst(f);
      g.occurrences += occ(f);
      if (f.day < g.first) g.first = f.day;
      if (f.day > g.last) g.last = f.day;
      Object.entries(f.platforms || {}).forEach(([p, n]) => (!L || p === L) && (g.platforms[p] = (g.platforms[p] || 0) + n));
      Object.entries(f.versions || {}).forEach(([v, n]) => (g.versions[v] = (g.versions[v] || 0) + n));
      g.byDay[f.day] = (g.byDay[f.day] || 0) + inst(f);
      if (f.firstAt && (!g.firstAt || f.firstAt < g.firstAt)) g.firstAt = f.firstAt;
      if (f.lastAt && (!g.lastAt || f.lastAt > g.lastAt)) g.lastAt = f.lastAt;
      g.seen.push({ day: f.day, installs: inst(f), occurrences: occ(f), firstAt: f.firstAt ?? null, lastAt: f.lastAt ?? null });
      groups.set(k, g);
    });
    const list = [...groups.values()].map((g) => ({ ...g, isNew: (allFirst.get(g.key) ?? g.first) >= from }));
    const sum = (ds: string[], fatalOnly: boolean, f: (x: Fault) => number) =>
      faults.filter((x) => ds.includes(x.day) && (!fatalOnly || x.fatal)).reduce((t, x) => t + f(x), 0);
    const prevDays = range !== 'all' ? rangeDays(prevFrom, prevTo) : null;
    const opens = new Map((snap?.pings?.open || []).map((r) => [r.day, r.total]));
    const inRange = faults.filter((x) => x.day >= from && x.day <= dk);
    const tally = (fatalOnly: boolean) => {
      const platforms: Record<string, number> = {};
      const versions: Record<string, number> = {};
      const byDay: Record<string, number> = {};
      let times = 0;
      inRange.forEach((x) => {
        if (fatalOnly && !x.fatal) return;
        Object.entries(x.platforms || {}).forEach(([p, n]) => (!L || p === L) && (platforms[p] = (platforms[p] || 0) + n));
        Object.entries(x.versions || {}).forEach(([v, n]) => (versions[v] = (versions[v] || 0) + n));
        byDay[x.day] = (byDay[x.day] || 0) + inst(x);
        times += occ(x);
      });
      return { platforms, versions, byDay, times };
    };
    const people = days.reduce((t, d) => t + (opens.get(d) || 0), 0);
    return {
      days,
      list,
      prevLabel: prevDays ? `vs previous ${days.length} days` : null,
      people,
      fatal: tally(true),
      all: tally(false),
      crashes: sum(days, true, inst),
      crashesPrev: prevDays ? sum(prevDays, true, inst) : null,
      failures: sum(days, false, inst),
      failuresPrev: prevDays ? sum(prevDays, false, inst) : null,
      occurrences: sum(days, false, occ),
      perDay: days.map((d) => ({ x: d, back: opens.get(d) ?? null, front: faults.filter((x) => x.day === d).reduce((t, x) => t + inst(x), 0) })),
    };
  }, [snap, dk, range, L]);

  const sorted = useMemo(() => {
    const l = [...m.list];
    if (sort === 'often') l.sort((a, b) => b.occurrences - a.occurrences);
    else if (sort === 'recent') l.sort((a, b) => b.last.localeCompare(a.last) || b.installs - a.installs);
    else if (sort === 'new') return l.filter((g) => g.isNew).sort((a, b) => b.installs - a.installs);
    else if (sort === 'fatal') return l.filter((g) => g.fatal).sort((a, b) => b.installs - a.installs);
    else l.sort((a, b) => b.installs - a.installs || b.occurrences - a.occurrences);
    return l;
  }, [m.list, sort]);

  /** Everything one of the two headline cards says: `kind` picks crashes or every failure. */
  const deep = (fatalOnly: boolean, total: number, prev: number | null, color: string): Partial<MetricSpec> => {
    const t = fatalOnly ? m.fatal : m.all;
    const rows = m.list.filter((g) => !fatalOnly || g.fatal).sort((x, y) => y.installs - x.installs || y.occurrences - x.occurrences);
    const worst = Object.entries(t.byDay).sort((x, y) => y[1] - x[1])[0];
    const yesterday = t.byDay[addDays(dk, -1)] || 0;
    const today = t.byDay[dk] || 0;
    const versions = Object.entries(t.versions).sort((x, y) => compareVersions(x[0], y[0])).slice(0, 6);
    return {
      comparisons: [
        ...(m.prevLabel && prev !== null ? [{ label: m.prevLabel, change: { value: total, base: prev } }] : []),
        { label: `${shortDate(dk)} vs the day before`, change: { value: today, base: yesterday } },
        { label: `On ${shortDate(dk)}`, value: int(today) },
        { label: 'Per day', value: (total / Math.max(1, m.days.length)).toFixed(1) },
        { label: 'Worst day', value: worst ? `${int(worst[1])} · ${shortDate(worst[0])}` : '–' },
        { label: 'Days with any', value: `${int(Object.values(t.byDay).filter(Boolean).length)} of ${int(m.days.length)}` },
        { label: 'Of people in the app', value: m.people ? `${((total / m.people) * 100).toFixed(1)}%` : '–' },
        { label: 'Times it happened', value: int(t.times) },
        { label: 'Times per phone', value: total ? (t.times / total).toFixed(1) : '–' },
        { label: fatalOnly ? 'Distinct crashes' : 'Distinct failures', value: int(rows.length) },
        { label: 'New in this range', value: int(rows.filter((g) => g.isNew).length) },
      ],
      splits: [
        {
          title: 'Platform',
          parts: [
            { key: 'I', label: 'iOS', value: t.platforms.I || 0, color: C.ios },
            { key: 'A', label: 'Android', value: t.platforms.A || 0, color: C.android },
            { key: 'U', label: 'No store', value: t.platforms.U || 0, color: C.unknown },
          ],
          format: int,
        },
        ...(versions.length
          ? [{ title: 'Version', parts: versions.map(([v, n], j) => ({ key: v, label: v === '?' ? 'Not stated' : `v${v}`, value: n, color: VERSION_COLORS[j] || C.unknown })), format: int }]
          : []),
      ],
      body: <FaultRows title={`${fatalOnly ? 'Every crash' : 'Every failure'} · ${rows.length}`} groups={rows} />,
      chart: { title: 'Per day', series: m.days.map((d) => ({ day: d, value: t.byDay[d] || 0 })), format: int, color },
    };
  };

  const often = [...m.list].sort((x, y) => y.occurrences - x.occurrences || y.installs - x.installs).slice(0, 20);

  const specs: MetricSpec[] = [
    {
      key: 'crashes',
      label: 'Crashes',
      value: int(m.crashes),
      change: m.crashesPrev !== null ? { value: m.crashes, base: m.crashesPrev } : null,
      note: 'Phones (install-days) where the app went down: an uncaught fatal or a native crash.',
      ...deep(true, m.crashes, m.crashesPrev, '#e66767'),
    },
    {
      key: 'failures',
      label: 'All failures',
      value: int(m.failures),
      change: m.failuresPrev !== null ? { value: m.failures, base: m.failuresPrev } : null,
      note: 'Crashes plus everything the app caught and handled.',
      ...deep(false, m.failures, m.failuresPrev, '#c98500'),
    },
    { key: 'distinct', label: 'Distinct failures', value: int(m.list.length), comparisons: [{ label: 'New in this range', value: int(m.list.filter((g) => g.isNew).length) }] },
    {
      key: 'times',
      label: 'Times',
      value: int(m.occurrences),
      note: 'Every occurrence, however many phones they came from.',
      comparisons: [
        { label: 'Per day', value: (m.occurrences / Math.max(1, m.days.length)).toFixed(1) },
        { label: 'Per phone', value: m.failures ? (m.occurrences / m.failures).toFixed(1) : '–' },
        { label: 'From crashes', value: int(m.fatal.times) },
        ...(often[0] && m.occurrences ? [{ label: 'From the most frequent one', value: `${((often[0].occurrences / m.occurrences) * 100).toFixed(0)}%` }] : []),
      ],
      // Ranked by how often, not by how many phones: one looping phone leads here.
      body: <FaultRows title={often.length < m.list.length ? `Most often · top ${often.length} of ${m.list.length}` : `Most often · ${often.length}`} groups={often} lead="times" />,
    },
  ];

  return (
    <>
      <MetricTiles specs={specs} />

      <Card>
        <OverlayBars
          title="Failures against people in the app"
          back={{ key: 'open', label: 'In the app', color: C.series }}
          front={{ key: 'f', label: 'Hit a failure', color: '#e66767' }}
          rows={m.perDay}
          xLabel={shortDate}
        />
        <Text style={s.note}>The gap turns a count into a rate: ten failures on a day with ten people in the app is a broken release.</Text>
      </Card>

      <DeepDiveGrid>
        <DeepDive icon="list.bullet.rectangle" title="All failures" sub={`${int(m.list.length)} distinct · ${int(m.list.filter((g) => g.isNew).length)} new in this range`}>
          <Card>
            <Chips
              options={[
                { key: 'installs', label: 'Most phones' },
                { key: 'often', label: 'Most often' },
                { key: 'recent', label: 'Most recent' },
                { key: 'new', label: 'New' },
                { key: 'fatal', label: 'Crashes' },
              ]}
              value={sort}
              onChange={setSort}
            />
            <FaultRows groups={sorted} />
            <Text style={s.note}>Big number: phones (install-days). Small: times it happened.</Text>
          </Card>
        </DeepDive>
      </DeepDiveGrid>
    </>
  );
}

const s = StyleSheet.create({
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  item: { paddingVertical: 10 },
  itemHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { color: C.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  msg: { color: C.dim, fontSize: 12, lineHeight: 16 },
  big: { color: C.text, fontSize: 17, fontWeight: '700' },
  small: { color: C.muted, fontSize: 12 },
  listHead: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dayLabel: { color: C.text, fontSize: 13, fontWeight: '600', width: 52 },
  dayValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  fact: { width: '50%' },
  factValue: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 1 },
});
