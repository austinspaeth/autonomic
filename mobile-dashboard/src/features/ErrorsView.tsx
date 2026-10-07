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
};

/* Rows opening and closing: a short ease-out, no spring. These are lists
   read quickly, and a bounce on every tap reads as lag. */
const ROW_EASE = LinearTransition.duration(200).easing(Easing.out(Easing.cubic));

export function ErrorsView({ dk, range, platform }: { dk: string; range: '7' | '30' | '90' | 'all'; platform: 'all' | 'ios' | 'android' }) {
  const { snap } = useData();
  const [sort, setSort] = useState<Sort>('installs');
  const [open, setOpen] = useState<string | null>(null);
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
      const g = groups.get(k) || { key: k, tag: f.tag, msg: f.msg, fatal: false, installs: 0, occurrences: 0, first: f.day, last: f.day, platforms: {}, versions: {}, byDay: {} };
      g.fatal = g.fatal || f.fatal;
      g.installs += inst(f);
      g.occurrences += occ(f);
      if (f.day < g.first) g.first = f.day;
      if (f.day > g.last) g.last = f.day;
      Object.entries(f.platforms || {}).forEach(([p, n]) => (!L || p === L) && (g.platforms[p] = (g.platforms[p] || 0) + n));
      Object.entries(f.versions || {}).forEach(([v, n]) => (g.versions[v] = (g.versions[v] || 0) + n));
      g.byDay[f.day] = (g.byDay[f.day] || 0) + inst(f);
      groups.set(k, g);
    });
    const list = [...groups.values()].map((g) => ({ ...g, isNew: (allFirst.get(g.key) ?? g.first) >= from }));
    const sum = (ds: string[], fatalOnly: boolean, f: (x: Fault) => number) =>
      faults.filter((x) => ds.includes(x.day) && (!fatalOnly || x.fatal)).reduce((t, x) => t + f(x), 0);
    const prevDays = range !== 'all' ? rangeDays(prevFrom, prevTo) : null;
    const opens = new Map((snap?.pings?.open || []).map((r) => [r.day, r.total]));
    return {
      days,
      list,
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

  const specs: MetricSpec[] = [
    {
      key: 'crashes',
      label: 'Crashes',
      value: int(m.crashes),
      change: m.crashesPrev !== null ? { value: m.crashes, base: m.crashesPrev } : null,
      note: 'Phones (install-days) where the app went down: an uncaught fatal or a native crash.',
    },
    {
      key: 'failures',
      label: 'All failures',
      value: int(m.failures),
      change: m.failuresPrev !== null ? { value: m.failures, base: m.failuresPrev } : null,
      note: 'Crashes plus everything the app caught and handled.',
    },
    { key: 'distinct', label: 'Distinct failures', value: int(m.list.length), comparisons: [{ label: 'New in this range', value: int(m.list.filter((g) => g.isNew).length) }] },
    { key: 'times', label: 'Times', value: int(m.occurrences), note: 'Every occurrence, however many phones they came from.' },
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

      <Card title="What is failing">
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
        {sorted.length ? (
          sorted.map((g, i) => {
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
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.big, num]}>{int(g.installs)}</Text>
                      <Text style={s.small}>{int(g.occurrences)}×</Text>
                    </View>
                  </View>
                  {isOpen ? (
                    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12, marginTop: 10 }}>
                      <Text style={s.small}>
                        First {shortDate(g.first)} · last {shortDate(g.last)} · {Object.keys(g.byDay).length} days
                      </Text>
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
                          parts={versions.map(([v, n], j) => ({
                            key: v,
                            label: v === '?' ? 'Not stated' : `v${v}`,
                            value: n,
                            color: ['#2563eb', '#199e70', '#c98500', '#d95926', '#d55181', '#8b5cf6'][j] || C.unknown,
                          }))}
                          format={int}
                        />
                      ) : null}
                      <Text style={s.small}>A failure sitting almost entirely on the newest build is a regression that shipped.</Text>
                    </Animated.View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        ) : (
          <Empty>Nothing here for this range.</Empty>
        )}
        <Text style={s.note}>Big number: phones (install-days). Small: times it happened.</Text>
      </Card>
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
});
