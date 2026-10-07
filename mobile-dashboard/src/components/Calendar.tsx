/* Month picker for the date header, after mobile/src/features/Calendar.tsx:
   squircle cells, month nav, future days disabled, "Jump to Today".
   A day before the data begins is disabled too, since nothing could be shown.
   Cells are tinted by how many people were in the app that day, so a busy day
   is findable at a glance. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { C, num } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function Calendar({
  current,
  today,
  earliest,
  intensity,
  onPick,
}: {
  current: string;
  today: string;
  /** First day with data; earlier days are disabled. */
  earliest?: string | null;
  /** 0..1 per day, for the cell tint. */
  intensity?: (dk: string) => number;
  onPick: (dk: string) => void;
}) {
  const [view, setView] = useState(() => ({ y: Number(current.slice(0, 4)), m: Number(current.slice(5, 7)) - 1 }));
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const atLast = view.y > ty || (view.y === ty && view.m >= tm);
  const firstKey = keyOf(view.y, view.m, 1);
  const atFirst = !!earliest && firstKey <= earliest;

  const weeks = useMemo(() => {
    const startPad = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [view]);

  const shift = (n: number) =>
    setView((v) => {
      const m = v.m + n;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  return (
    <View>
      <View style={s.nav}>
        <Pressable disabled={atFirst} onPress={() => shift(-1)} hitSlop={10} style={{ opacity: atFirst ? 0.3 : 1 }}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={C.text} />
        </Pressable>
        <Text style={s.month}>
          {MONTHS[view.m]} {view.y}
        </Text>
        <Pressable disabled={atLast} onPress={() => shift(1)} hitSlop={10} style={{ opacity: atLast ? 0.3 : 1 }}>
          <SymbolView name="chevron.right" size={18} weight="semibold" tintColor={C.text} />
        </Pressable>
      </View>
      <View style={s.row}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <View key={i} style={s.dow}>
            <Text style={s.dowText}>{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.row}>
          {week.map((dn, i) => {
            if (dn == null) return <View key={`e${i}`} style={s.cellWrap} />;
            const dk = keyOf(view.y, view.m, dn);
            const disabled = dk > today || (!!earliest && dk < earliest);
            const sel = dk === current;
            const isToday = dk === today;
            const k = disabled ? 0 : Math.max(0, Math.min(1, intensity?.(dk) ?? 0));
            return (
              <View key={dk} style={s.cellWrap}>
                <Pressable
                  disabled={disabled}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onPick(dk);
                  }}
                  style={[
                    s.cell,
                    { opacity: disabled ? 0.25 : 1 },
                    sel
                      ? { backgroundColor: C.accent }
                      : k > 0
                        ? { backgroundColor: `rgba(37,99,235,${(0.12 + k * 0.5).toFixed(2)})` }
                        : null,
                    isToday && !sel ? s.todayRing : null,
                  ]}
                >
                  <Text style={[s.day, num, sel && { color: '#fff', fontWeight: '700' }, isToday && !sel && { fontWeight: '700' }]}>
                    {dn}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <Pressable
        onPress={() => onPick(today)}
        style={({ pressed }) => [s.todayBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.todayBtnText}>Jump to Today</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  month: { color: C.text, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row' },
  dow: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dowText: { color: C.dim, fontSize: 11, fontWeight: '700' },
  cellWrap: { flex: 1, aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  todayRing: { borderWidth: 1.5, borderColor: C.accent },
  day: { color: C.text, fontSize: 15 },
  todayBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  todayBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
