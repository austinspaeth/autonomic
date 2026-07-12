/** Month calendar picker sheet — ported from openCalendar. */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SheetControls } from '../components/Sheet';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { usePalette } from '../theme';
import { dateFromKey, keyOf, todayKey } from '../lib/dates';
import { getState } from '../store/store';
import { scoreCat, scoreSet } from '../lib/scoring/day';

const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function dayHasData(k: string): boolean {
  const d = getState().days[k];
  if (!d) return false;
  return !!(
    (d.readings && d.readings.length) || (d.activities && d.activities.length) ||
    (d.meds && d.meds.length) || (d.symptoms && d.symptoms.length) ||
    (d.sleep && (d.sleep.bed || d.sleep.wake)) ||
    (d.food && (+d.food.water > 0 || Object.values(d.food.triggers || {}).some((c) => c > 0))) ||
    (d.digestion && d.digestion.movements && d.digestion.movements.length)
  );
}

/** The day's autonomic-outlook color, mirroring DaySummary's gating: a scorable
 * day with enough confidence. Returns null otherwise (plain cell). */
function dayColor(k: string): string | null {
  const state = getState();
  const d = state.days[k];
  if (!d || !d.readings || !d.readings.length) return null;
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const all = scoreSet(d.readings, d, k, state.days, ctx);
  if (all.score == null || all.confidence < 40) return null;
  return scoreCat(all.score).color;
}

export function Calendar({ current, onPick, controls }: { current: string; onPick: (k: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const [view, setView] = useState(() => { const d = dateFromKey(current); d.setDate(1); return d; });
  const now = new Date();
  const tk = todayKey();
  const atCurMonth = view.getFullYear() > now.getFullYear() || (view.getFullYear() === now.getFullYear() && view.getMonth() >= now.getMonth());
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, marginBottom: 16 }}>Select date</Text>
      {/* Month nav sits fully below the sheet's ✕ pill — the extra top margin
          keeps the next-month chevron from crowding the close button. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
        <Pressable onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} hitSlop={8}><Icon name="chevronLeft" size={22} color={p.text} /></Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: p.text }}>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable disabled={atCurMonth} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} hitSlop={8} style={{ opacity: atCurMonth ? 0.3 : 1 }}><Icon name="chevronRight" size={22} color={p.text} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}><Text style={{ fontSize: 11, color: p.textDim, fontWeight: '700' }}>{d}</Text></View>)}
        {cells.map((dn, i) => {
          if (dn == null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const dk = keyOf(new Date(view.getFullYear(), view.getMonth(), dn));
          const isSel = dk === current, isFuture = dk > tk, has = dayHasData(dk);
          const color = dayColor(dk);
          return (
            <View key={dk} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              {/* Squircle cell: tinted with the day's autonomic-outlook color when
                  scored. Selected day fills the solid outlook color. */}
              <Pressable
                disabled={isFuture}
                onPress={() => { onPick(dk); controls.close(); }}
                style={{
                  flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', opacity: isFuture ? 0.3 : 1,
                  backgroundColor: isSel ? (color || p.accent) : color ? hexA(color, 0.16) : 'transparent',
                  borderWidth: color && !isSel ? 1 : 0,
                  borderColor: color ? hexA(color, 0.45) : 'transparent',
                }}
              >
                <Text style={{ color: isSel ? '#fff' : color ? color : p.text, fontWeight: isSel || color ? '700' : '400', fontSize: 15 }}>{dn}</Text>
                {has && !isSel && !color ? <View style={{ position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: p.accent }} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={{ height: 12 }} />
      <Button title="Jump to Today" onPress={() => { onPick(tk); controls.close(); }} />
      <View style={{ height: 12 }} />
    </View>
  );
}
