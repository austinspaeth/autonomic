// Calendar drawer — month grid date picker (legacy openCalendar/dayHasData,
// docs/index.html:4347-4441). No future days; dots mark days with data.
import React, { useState } from 'react';
import { View } from 'react-native';
import type { DateKey, Day } from '@core/types';
import { keyOf, dateFromKey } from '@core/date/dateUtils';
import { useRepository } from '@data/RepositoryProvider';
import { Box, Pressable, Text } from '@ui/primitives';
import { H2 } from '@ui/components/SheetText';
import { Button } from '@ui/components/Button';
import { IconButton } from '@ui/components/IconButton';
import { openSheet, type SheetApi } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';

function dayHasData(d: Day | undefined): boolean {
  if (!d) return false;
  return Boolean(
    d.readings?.length ||
      d.activities?.length ||
      d.meds?.length ||
      d.symptoms?.length ||
      (d.sleep && (d.sleep.bed || d.sleep.wake)) ||
      (d.food && (+d.food.water > 0 || +d.food.calories > 0 || Object.values(d.food.triggers || {}).some((c) => c > 0))) ||
      d.digestion?.movements?.length,
  );
}

function CalendarBody({
  selected,
  onSelect,
  api,
}: {
  selected: DateKey;
  onSelect: (k: DateKey) => void;
  api: SheetApi;
}) {
  const t = useTheme();
  const repo = useRepository();
  const sel = dateFromKey(selected);
  const [view, setView] = useState({ y: sel.getFullYear(), m: sel.getMonth() });

  const now = new Date();
  const todayKey = keyOf(now);
  const atCurMonth =
    view.y > now.getFullYear() || (view.y === now.getFullYear() && view.m >= now.getMonth());
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const startPad = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let dn = 1; dn <= daysInMonth; dn++) cells.push(dn);

  const pick = (dk: DateKey) => {
    onSelect(dk);
    api.closeAll();
  };

  return (
    <>
      <H2>Select date</H2>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <IconButton accessibilityLabel="Previous month" onPress={() => setView((v) => normalize(v.y, v.m - 1))}>
          <Text style={{ fontSize: 22, color: t.text }}>‹</Text>
        </IconButton>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{monthName}</Text>
        <IconButton
          accessibilityLabel="Next month"
          onPress={atCurMonth ? undefined : () => setView((v) => normalize(v.y, v.m + 1))}
          style={{ opacity: atCurMonth ? 0.3 : 1 }}
        >
          <Text style={{ fontSize: 22, color: t.text }}>›</Text>
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, color: t.textDim, fontWeight: '700' }}>{d}</Text>
          </View>
        ))}
        {cells.map((dn, i) => {
          if (dn == null) return <View key={`p${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const dk = keyOf(new Date(view.y, view.m, dn));
          const isSel = dk === selected;
          const isToday = dk === todayKey;
          const isFuture = dk > todayKey;
          const hasData = dayHasData(repo.hasDay(dk) ? repo.getDay(dk) : undefined);
          return (
            <View key={dk} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <Pressable
                onPress={isFuture ? undefined : () => pick(dk)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSel ? t.accent : 'transparent',
                  borderWidth: isToday && !isSel ? 2 : 0,
                  borderColor: t.accent,
                  opacity: isFuture ? 0.3 : 1,
                }}
              >
                <Text style={{ fontSize: 14, color: isSel ? '#fff' : t.text, fontWeight: isSel ? '700' : '400' }}>
                  {dn}
                </Text>
                {hasData && !isSel ? (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: t.accent,
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 18 }}>
        <Button title="Jump to Today" onPress={() => pick(todayKey)} />
      </View>
    </>
  );
}

function normalize(y: number, m: number) {
  if (m < 0) return { y: y - 1, m: 11 };
  if (m > 11) return { y: y + 1, m: 0 };
  return { y, m };
}

export function openCalendar(selected: DateKey, onSelect: (k: DateKey) => void) {
  openSheet((api) => <CalendarBody selected={selected} onSelect={onSelect} api={api} />);
}
