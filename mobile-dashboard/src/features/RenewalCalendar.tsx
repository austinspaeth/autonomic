/* Renewals laid out on a month grid: each day that has a charge coming says
 * how much, tinted by its size, and tapping it lists what is due that day.
 * It runs forward from the selected date, a year at most, which is as far as
 * one annual term can put a charge. Every figure here is ESTIMATED: nothing
 * reports a renewal, so each subscription not marked cancelled is assumed to
 * renew on its own date. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { shortDate } from '../lib/dates';
import type { Renewal } from '../lib/sales';
import { C, num } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const TINT = '25,158,112';

export function RenewalCalendar({
  from,
  renewals,
  format,
  selected,
  onSelect,
}: {
  /** The day the calendar starts from; earlier days are behind it. */
  from: string;
  /** Every charge due after `from`, up to a year out. */
  renewals: Renewal[];
  format: (n: number) => string;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const fy = Number(from.slice(0, 4));
  const fm = Number(from.slice(5, 7)) - 1;
  const [off, setOff] = useState(0);
  const y = fy + Math.floor((fm + off) / 12);
  const m = (fm + off) % 12;

  const byDay = useMemo(() => {
    const out = new Map<string, number>();
    renewals.forEach((r) => out.set(r.date, (out.get(r.date) || 0) + r.amount));
    return out;
  }, [renewals]);
  const max = Math.max(1, ...byDay.values());
  const monthKey = `${y}-${pad(m + 1)}`;
  const monthTotal = renewals.filter((r) => r.date.startsWith(monthKey)).reduce((t, r) => t + r.amount, 0);

  const weeks = useMemo(() => {
    const startPad = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [y, m]);

  const shift = (n: number) => {
    Haptics.selectionAsync();
    setOff((o) => Math.max(0, Math.min(12, o + n)));
    onSelect(null);
  };
  /* A cell is narrow: whole dollars, and thousands as "1.2k". */
  const tiny = (n: number) => `$${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n)}`;

  return (
    <View>
      <View style={st.nav}>
        <Pressable disabled={off === 0} onPress={() => shift(-1)} hitSlop={10} style={{ opacity: off === 0 ? 0.3 : 1 }}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={C.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.month}>
            {MONTHS[m]} {y}
          </Text>
          <Text style={[st.monthTotal, num]}>{monthTotal ? `${format(monthTotal)} due` : 'Nothing due'}</Text>
        </View>
        <Pressable disabled={off === 12} onPress={() => shift(1)} hitSlop={10} style={{ opacity: off === 12 ? 0.3 : 1 }}>
          <SymbolView name="chevron.right" size={18} weight="semibold" tintColor={C.text} />
        </Pressable>
      </View>
      <View style={st.row}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <View key={i} style={st.dow}>
            <Text style={st.dowText}>{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={st.row}>
          {week.map((dn, i) => {
            if (dn == null) return <View key={`e${i}`} style={st.cellWrap} />;
            const dk = keyOf(y, m, dn);
            const amount = byDay.get(dk) || 0;
            const past = dk <= from;
            const sel = dk === selected;
            return (
              <View key={dk} style={st.cellWrap}>
                <Pressable
                  disabled={!amount}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelect(sel ? null : dk);
                  }}
                  style={[
                    st.cell,
                    past && { opacity: 0.3 },
                    amount ? { backgroundColor: `rgba(${TINT},${(0.18 + (amount / max) * 0.5).toFixed(2)})` } : null,
                    sel && st.cellSel,
                    dk === from && st.today,
                  ]}
                >
                  <Text style={[st.day, num, !!amount && { color: C.text, fontWeight: '700' }]}>{dn}</Text>
                  {amount ? <Text style={[st.amount, num]}>{tiny(amount)}</Text> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      {selected ? (
        <View style={st.due}>
          <Text style={st.dueHead}>Due {shortDate(selected)}</Text>
          {renewals
            .filter((r) => r.date === selected)
            .map((r) => (
              <View key={`${r.sale.id}-${r.date}`} style={st.dueRow}>
                <Text style={st.dueLabel}>
                  {r.plan === 'annual' ? 'Annual' : 'Monthly'} · {r.sale.platform === 'ios' ? 'iOS' : 'Android'} · bought {shortDate(r.sale.date)}
                </Text>
                <Text style={[st.dueValue, num]}>{format(r.amount)}</Text>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  month: { color: C.text, fontSize: 16, fontWeight: '700' },
  monthTotal: { color: C.dim, fontSize: 12, marginTop: 1 },
  row: { flexDirection: 'row' },
  dow: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dowText: { color: C.dim, fontSize: 11, fontWeight: '700' },
  cellWrap: { flex: 1, aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  cellSel: { borderColor: '#ffffff' },
  today: { borderColor: 'rgba(255,255,255,0.35)' },
  day: { color: C.dim, fontSize: 13 },
  amount: { color: C.text, fontSize: 10, fontWeight: '600', marginTop: -1 },
  due: { marginTop: 10, gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12 },
  dueHead: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  dueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  dueLabel: { color: C.dim, fontSize: 13, flexShrink: 1 },
  dueValue: { color: C.text, fontSize: 14, fontWeight: '600' },
});
