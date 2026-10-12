/* The inside of the Revenue card on App Performance: the range's cash by
 * day, split into money from people paying for the FIRST time (the ledger)
 * and renewals. Renewals are never reported by either store, so they are
 * derived (every subscription not marked cancelled is charged again each
 * term) and always called estimated. Ends in the way out to the full ledger. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { StackedBars, type Key } from '../components/series';
import { dayDate, shortDate } from '../lib/dates';
import { setView } from '../lib/views';
import { useWide } from '../lib/wide';
import { C, num } from '../theme';

export type RevenueDay = { day: string; fresh: number; renew: number; purchases: number; charges: number };

const KEYS: Key[] = [
  { key: 'fresh', label: 'New', color: '#c98500' },
  { key: 'renew', label: 'Renewals (est.)', color: '#199e70' },
];

/* Past this many rows the day list folds, so a quarter does not bury the button. */
const FOLD = 10;

export function RevenueBody({
  buckets,
  monthly,
  days,
  format,
  link = true,
}: {
  /** One per bar: a day, or a month on a long range. */
  buckets: { x: string; fresh: number; renew: number }[];
  monthly: boolean;
  /** Days that took any money, newest first. */
  days: RevenueDay[];
  format: (n: number) => string;
  /** The button out to the sales view; off when this is already drawn there. */
  link?: boolean;
}) {
  const [all, setAll] = useState(false);
  // On a wide screen the sales section is already on the board beside this.
  const wide = useWide();
  const shown = all ? days : days.slice(0, FOLD);
  const month = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return (
    <>
      <StackedBars
        title={monthly ? 'By month' : 'By day'}
        keys={KEYS}
        rows={buckets.map((b) => ({ x: b.x, values: { fresh: b.fresh, renew: b.renew } }))}
        xLabel={monthly ? month : dayDate}
        format={format}
        height={110}
        summary={`${format(buckets.reduce((t, b) => t + b.fresh + b.renew, 0))} in the range`}
      />

      <View style={{ gap: 8 }}>
        <Text style={st.head}>Days with revenue</Text>
        {!days.length ? <Text style={st.empty}>No money arrived in this range.</Text> : null}
        {shown.map((d) => (
          <View key={d.day} style={st.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.day}>{shortDate(d.day)}</Text>
              <Text style={[st.meta, num]} numberOfLines={1}>
                {[
                  d.purchases ? `${d.purchases} new · ${format(d.fresh)}` : null,
                  d.charges ? `${d.charges} ${d.charges === 1 ? 'renewal' : 'renewals'} · ${format(d.renew)}` : null,
                ]
                  .filter(Boolean)
                  .join('   ')}
              </Text>
            </View>
            <Text style={[st.total, num]}>{format(d.fresh + d.renew)}</Text>
          </View>
        ))}
        {days.length > FOLD ? (
          <Pressable
            hitSlop={6}
            onPress={() => {
              Haptics.selectionAsync();
              setAll(!all);
            }}
            style={({ pressed }) => [st.more, pressed && { opacity: 0.6 }]}
          >
            <Text style={st.moreText}>{all ? 'Show fewer' : `Show all ${days.length} days`}</Text>
          </Pressable>
        ) : null}
      </View>

      {wide || !link ? null : (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setView('sales');
        }}
        style={({ pressed }) => [st.link, pressed && { opacity: 0.7 }]}
      >
        <View style={st.linkIcon}>
          <SymbolView name="dollarsign" size={15} weight="bold" tintColor={C.text} />
        </View>
        <Text style={st.linkText}>All sales data</Text>
        <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={C.muted} />
      </Pressable>
      )}
    </>
  );
}

const st = StyleSheet.create({
  head: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { color: C.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  day: { color: C.text, fontSize: 14, fontWeight: '700' },
  meta: { color: C.dim, fontSize: 12, marginTop: 1 },
  total: { color: C.text, fontSize: 15, fontWeight: '700' },
  more: { alignItems: 'center', paddingVertical: 6 },
  moreText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 12, paddingHorizontal: 12 },
  linkIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700' },
});
