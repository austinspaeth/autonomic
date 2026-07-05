/** Milestone tracker — recovery achievements beyond daily metrics. Now surfaced
 * as a progress card in the journal view (under the clean-day streak) that opens
 * a bottom sheet, rather than living in its own tab. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Card } from '../components/ui';
import { useSheets } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { fmtNum, fmtShort } from '../lib/dates';
import { useAppState } from '../store/store';
import { buildMilestoneDays, buildMilestoneGroups } from '../lib/analysis/milestones';

export function useMilestones() {
  const state = useAppState();
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const md = buildMilestoneDays(state.days, ctx);
  const groups = md.keys.length ? buildMilestoneGroups(md) : [];
  let done = 0, total = 0;
  groups.forEach((g) => g.items.forEach((it) => { total++; if (it.done) done++; }));
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { groups, done, total, pct };
}

/** Compact card for the journal view; taps open the full tracker in a sheet. */
export function MilestoneProgressCard() {
  const p = usePalette();
  const { openSheet } = useSheets();
  const { done, total, pct } = useMilestones();
  if (!total) return null;
  return (
    <Pressable
      onPress={() => openSheet(() => <MilestonesSheet />)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, padding: 15 }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(224,49,39,0.12)' }}>
        <Icon name="star" size={21} color={p.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: p.text, fontWeight: '700' }}>Milestones</Text>
        <Text style={{ fontSize: 13, color: p.textDim, marginTop: 2 }}>{`${done} of ${total} achieved`}</Text>
        <View style={{ height: 4, borderRadius: 999, backgroundColor: p.surface2, overflow: 'hidden', marginTop: 10 }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: p.accent }} />
        </View>
      </View>
      <Icon name="chevronRight" size={18} color={p.textDim} />
    </Pressable>
  );
}

/** Full milestone list — rendered inside a bottom sheet (which supplies the
 * scroll container, padding, and ✕). */
export function MilestonesSheet() {
  const p = usePalette();
  const { groups, done, total, pct } = useMilestones();
  if (!total) {
    return <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 }}>Log readings, sleep, and clean days to start unlocking recovery milestones.</Text>;
  }
  return (
    <>
      <Text style={{ fontSize: 21, fontWeight: '800', color: p.text, marginBottom: 14 }}>Milestones</Text>
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
  );
}
