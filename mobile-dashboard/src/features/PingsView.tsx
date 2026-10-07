/* Raw pings: exactly what the counter stores, nothing derived. One row per
 * (route, arrival day, cohort key), newest day first. The key reads
 * D{install day}{store}{slot}-{tier}; each part is spelled out beside it. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { Chips } from '../components/charts';
import { Card, Empty } from '../components/ui';
import { useData } from '../lib/data';
import { longDate, shortDate } from '../lib/dates';
import { int } from '../lib/format';
import type { PingKind } from '../lib/types';
import { C, num } from '../theme';

const ROUTES: { key: 'all' | PingKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Opens' },
  { key: 'sub', label: 'Subscribes' },
  { key: 'rst', label: 'Restores' },
  { key: 'lap', label: 'Lapses' },
  { key: 'act', label: 'Activations' },
  { key: 'hrv', label: 'Readings' },
  { key: 'cap', label: 'Started' },
  { key: 'pay', label: 'Paywalls' },
  { key: 'see', label: 'Views' },
  { key: 'pot', label: 'POTS' },
  { key: 'not', label: 'Notifications' },
  { key: 'osh', label: 'Offers shown' },
  { key: 'oac', label: 'Offers accepted' },
  { key: 'odm', label: 'Offers dismissed' },
  { key: 'log', label: 'Logged' },
  { key: 'use', label: 'Features' },
  { key: 'fnd', label: 'Findings' },
  { key: 'rpt', label: 'AI reports' },
  { key: 'rdg', label: 'Reading kinds' },
  { key: 'mbp', label: 'Morning card' },
  { key: 'rvw', label: 'Review asks' },
  { key: 'err', label: 'Failures' },
];
const STORE: Record<string, string> = { I: 'iOS', A: 'Android', U: 'no store' };
const TIER: Record<string, string> = { F: 'Free', T: 'Trial', P: 'Pro' };
const PAGE = 14;

export function PingsView() {
  const { snap } = useData();
  const [route, setRoute] = useState<'all' | PingKind>('all');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const days = useMemo(() => {
    const by = new Map<string, { kind: PingKind; total: number; rows: { key: string; cohort: string; platform: string; slot: string | null; tier: string | null; count: number }[] }[]>();
    ROUTES.filter((r) => r.key !== 'all' && (route === 'all' || r.key === route)).forEach((r) => {
      (snap?.pings?.[r.key as PingKind] || []).forEach((row) => {
        const list = by.get(row.day) || [];
        list.push({ kind: r.key as PingKind, total: row.total, rows: [...(row.cohorts || [])].sort((a, b) => b.count - a.count) });
        by.set(row.day, list);
      });
    });
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [snap, route]);

  return (
    <>
      <Card>
        <Chips
          options={ROUTES}
          value={route}
          onChange={(r) => {
            setRoute(r);
            setShown(PAGE);
            setOpen(null);
          }}
        />
        <Text style={s.note}>Exactly as stored: one count per route, arrival day (US Eastern) and cohort key. Nothing derived.</Text>
      </Card>

      {days.length ? (
        days.slice(0, shown).map(([day, routes]) => (
          <Card key={day} title={longDate(day)} right={<Text style={s.count}>{int(routes.reduce((t, r) => t + r.total, 0))}</Text>}>
            {routes.map((r) => {
              const k = `${day}|${r.kind}`;
              const isOpen = open === k;
              return (
                <View key={k}>
                  <Pressable onPress={() => setOpen(isOpen ? null : k)} style={s.route}>
                    <Text style={s.routeName}>{ROUTES.find((x) => x.key === r.kind)?.label ?? r.kind}</Text>
                    <Text style={s.routeMeta}>{r.rows.length} keys</Text>
                    <Text style={[s.routeTotal, num]}>{int(r.total)}</Text>
                    <SymbolView name={isOpen ? 'chevron.up' : 'chevron.down'} size={11} weight="semibold" tintColor={C.muted} />
                  </Pressable>
                  {isOpen ? (
                    <Animated.View entering={FadeIn.duration(180)} style={s.keys}>
                      {r.rows.map((c) => (
                        <View key={c.key} style={s.keyRow}>
                          <Text style={[s.key, num]}>{c.key}</Text>
                          <Text style={s.keyMeta} numberOfLines={1}>
                            {[`installed ${shortDate(c.cohort)}`, STORE[c.platform] || c.platform, c.slot, c.tier ? TIER[c.tier] : null].filter(Boolean).join(' · ')}
                          </Text>
                          <Text style={[s.keyCount, num]}>{int(c.count)}</Text>
                        </View>
                      ))}
                    </Animated.View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ))
      ) : (
        <Card>
          <Empty>No pings on this route.</Empty>
        </Card>
      )}
      {days.length > shown ? (
        <Pressable onPress={() => setShown((n) => n + PAGE)} style={({ pressed }) => [s.more, pressed && { opacity: 0.6 }]}>
          <Text style={s.moreText}>Show {Math.min(PAGE, days.length - shown)} more days</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  count: { color: C.dim, fontSize: 13, fontWeight: '600' },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  routeName: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  routeMeta: { color: C.muted, fontSize: 12 },
  routeTotal: { color: C.text, fontSize: 15, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  keys: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 8, gap: 4, marginBottom: 6 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  key: { color: C.dim, fontSize: 11, fontWeight: '600', width: 118 },
  keyMeta: { color: C.muted, fontSize: 11, flex: 1 },
  keyCount: { color: C.text, fontSize: 12, fontWeight: '700' },
  more: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: C.surface },
  moreText: { color: C.text, fontSize: 14, fontWeight: '600' },
});
