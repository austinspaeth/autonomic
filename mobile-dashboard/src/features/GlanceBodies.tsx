/* What the "Convert rate, past trial" card holds beyond its own number: the
 * same question asked by install age. Of the installs that turned 7, 14 and 30
 * days old in the range, the share with a sale in the ledger by then, each
 * sale tied to its install by the install date on its row. Pick an age to see
 * how it ran across the range. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BarChart } from '../components/charts';
import { ChangeText } from '../components/MetricTiles';
import { int } from '../lib/format';
import type { Series } from '../lib/metrics';
import type { Rate } from '../lib/usage';
import { C, num } from '../theme';

export type ConversionAge = { n: number; now: Rate; prev: Rate | null; ios: Rate | null; android: Rate | null; series: Series };

const pct = (v: number | null) => (v === null ? '–' : `${v.toFixed(1)}%`);
const of = (r: Rate) => `${int(r.kept)} of ${int(r.of)}`;

export function ConversionByDay({ items, undated = 0 }: { items: ConversionAge[]; undated?: number }) {
  const [sel, setSel] = useState(items[0]?.n ?? 7);
  const cur = items.find((x) => x.n === sel) ?? items[0];
  if (!cur) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={st.head}>Converted by install age</Text>
      <View style={st.cells}>
        {items.map((x) => {
          const on = x.n === cur.n;
          return (
            <Pressable
              key={x.n}
              onPress={() => {
                if (!on) Haptics.selectionAsync();
                setSel(x.n);
              }}
              style={[st.cell, on && st.cellOn]}
            >
              <Text style={st.cellLabel}>By day {x.n}</Text>
              <Text style={[st.cellValue, num]}>{x.now.available ? pct(x.now.pct) : '–'}</Text>
              <Text style={[st.cellSub, num]} numberOfLines={1}>
                {x.now.available ? of(x.now) : 'none yet'}
              </Text>
              {x.now.pct !== null && x.prev?.pct ? <ChangeText change={{ value: x.now.pct, base: x.prev.pct }} size={12} /> : <Text style={st.cellSub}> </Text>}
            </Pressable>
          );
        })}
      </View>
      <View style={st.rows}>
        <Row label={`Turned ${cur.n} days old in range`} value={int(cur.now.of)} />
        <Row label="Bought by then" value={int(cur.now.kept)} />
        {cur.prev ? <Row label="Range before" value={`${pct(cur.prev.pct)} · ${of(cur.prev)}`} /> : null}
        {cur.ios && cur.android ? (
          <>
            <Row label="iOS" value={`${pct(cur.ios.pct)} · ${of(cur.ios)}`} />
            <Row label="Android" value={`${pct(cur.android.pct)} · ${of(cur.android)}`} />
          </>
        ) : null}
        {cur.now.available && cur.now.small ? <Row label="Sample" value="small" /> : null}
      </View>
      <BarChart title={`By the day they turned ${cur.n} days old`} series={cur.series} summary="" format={(v) => pct(v)} color="#199e70" height={84} compact />
      <Text style={st.note}>
        Sales from the ledger, by the install date on each. Each age is its own set of installs, so a later one can read lower.
        {undated ? ` ${int(undated)} with no install date left out.` : ''}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowValue, num]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  head: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  cells: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent', gap: 1 },
  cellOn: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.16)' },
  cellLabel: { color: C.dim, fontSize: 12, fontWeight: '500' },
  cellValue: { color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  cellSub: { color: C.muted, fontSize: 12 },
  rows: { gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10 },
  rowLabel: { color: C.dim, fontSize: 14, flexShrink: 1 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
