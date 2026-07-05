import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { Icon } from '../../src/components/Icon';
import { Card } from '../../src/components/ui';
import { usePalette } from '../../src/theme';
import { fmtNum, fmtShort } from '../../src/lib/dates';
import { useAppState } from '../../src/store/store';
import { buildMilestoneDays, buildMilestoneGroups } from '../../src/lib/analysis/milestones';

export default function MilestonesScreen() {
  const p = usePalette();
  const state = useAppState();
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const md = buildMilestoneDays(state.days, ctx);
  const groups = md.keys.length ? buildMilestoneGroups(md) : [];
  let done = 0, total = 0;
  groups.forEach((g) => g.items.forEach((it) => { total++; if (it.done) done++; }));
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {!total ? (
          <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 }}>Log readings, sleep, and clean days to start unlocking recovery milestones.</Text>
        ) : (
          <>
            <Card style={{ padding: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>Milestone Tracker</Text>
              <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2 }}>{`${done} of ${total} achieved · progress beyond daily metrics`}</Text>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: p.surface2, overflow: 'hidden', marginTop: 14 }}>
                <View style={{ height: '100%', width: `${pct}%`, backgroundColor: p.accent }} />
              </View>
            </Card>
            {groups.map((g) => {
              const gdone = g.items.filter((it) => it.done).length;
              const rows = g.items.slice().sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0) || (a.date || '').localeCompare(b.date || ''));
              return (
                <Card key={g.title} style={{ padding: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>{g.title}</Text>
                  <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2, marginBottom: 8 }}>{`${gdone} of ${g.items.length} achieved`}</Text>
                  {rows.map((it, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }}>
                      <View style={{ width: 16 }}>{it.done ? <Icon name="check" size={16} color="#16a34a" /> : <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: p.border }} />}</View>
                      <Text style={{ flex: 1, fontSize: 14, color: it.done ? p.text : p.textDim, fontWeight: it.done ? '500' : '400' }}>{it.label}</Text>
                      {it.done ? <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600', fontVariant: ['tabular-nums'] }}>{(it.value != null ? `${typeof it.value === 'number' ? fmtNum(it.value) : it.value} · ` : '') + fmtShort(it.date!)}</Text> : null}
                    </View>
                  ))}
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
