/** Milestone tracker — recovery achievements beyond daily metrics. Now surfaced
 * as a progress card in the journal view (under the clean-day streak) that opens
 * a bottom sheet, rather than living in its own tab. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Card, Segmented } from '../components/ui';
import { useSheets } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { fmtNum, fmtShort, todayKey } from '../lib/dates';
import { useAppState } from '../store/store';
import { buildMilestoneDays, buildMilestoneGroups } from '../lib/analysis/milestones';
import { resolveProtocol } from '../lib/scoring/day';

export function useMilestones() {
  const state = useAppState();
  const ctx = { sex: state.profile.sex, height: state.profile.height, protocol: resolveProtocol(state.settings.protocol) };
  const md = buildMilestoneDays(state.days, ctx);
  const groups = md.keys.length ? buildMilestoneGroups(md) : [];
  let done = 0, total = 0;
  groups.forEach((g) => g.items.forEach((it) => { total++; if (it.done) done++; }));
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { groups, done, total, pct };
}

/** Compact card for the journal view; taps open the full tracker in a sheet.
 * When milestones were unlocked on `dk`, a divider + checklist of them appears
 * below the progress row. */
export function MilestoneProgressCard({ dk }: { dk?: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const { groups, done, total, pct } = useMilestones();
  if (!total) return null;
  const achievedToday = dk ? groups.flatMap((g) => g.items).filter((it) => it.done && it.date === dk) : [];
  return (
    <Pressable
      onPress={() => openSheet(() => <MilestonesSheet />)}
      style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, padding: 15 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
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
      </View>
      {achievedToday.length ? (
        <>
          <View style={{ height: 1, backgroundColor: p.border, marginTop: 15 }} />
          <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim, marginTop: 13, marginBottom: 11 }}>
            {achievedToday.length === 1 ? 'Unlocked today' : `${achievedToday.length} unlocked today`}
          </Text>
          <View style={{ gap: 11 }}>
            {achievedToday.slice(0, 3).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="check" size={16} color="#16a34a" />
                <Text style={{ flex: 1, fontSize: 14, color: p.text, fontWeight: '500' }}>{it.label}</Text>
              </View>
            ))}
          </View>
          {achievedToday.length > 3 ? (
            <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600', marginTop: 10 }}>{`+ ${achievedToday.length - 3} more`}</Text>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

/** Full milestone list — rendered inside a bottom sheet (which supplies the
 * scroll container, padding, and ✕). */
export function MilestonesSheet() {
  const p = usePalette();
  const { groups, done, total, pct } = useMilestones();
  const [filter, setFilter] = React.useState<'all' | 'done' | 'next'>('all');
  if (!total) {
    return <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 }}>Log readings, sleep, and clean days to start unlocking recovery milestones.</Text>;
  }
  const today = todayKey();
  const completedToday = groups.flatMap((g) => g.items).filter((it) => it.done && it.date === today);
  const shown = groups
    .map((g) => ({ ...g, rows: g.items.filter((it) => (filter === 'all' ? true : filter === 'done' ? it.done : !it.done)) }))
    .filter((g) => g.rows.length);
  return (
    <>
      <Text style={{ fontSize: 21, fontWeight: '800', color: p.text, marginBottom: 14 }}>Milestones</Text>
      {completedToday.length ? (
        <Card style={{ padding: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>
            {completedToday.length === 1 ? 'Completed Today' : `Completed Today · ${completedToday.length}`}
          </Text>
          <View style={{ gap: 12, marginTop: 13 }}>
            {completedToday.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="check" size={18} color="#16a34a" />
                <Text style={{ flex: 1, fontSize: 16, color: p.text, fontWeight: '600' }}>{it.label}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <Card style={{ padding: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>Milestone Tracker</Text>
        <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2 }}>{`${done} of ${total} achieved · progress beyond daily metrics`}</Text>
        <View style={{ height: 4, borderRadius: 999, backgroundColor: p.surface2, overflow: 'hidden', marginTop: 14 }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: p.accent }} />
        </View>
      </Card>
      <Segmented
        options={[{ val: 'all', label: 'All' }, { val: 'done', label: 'Completed' }, { val: 'next', label: 'Up next' }]}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 12 }}
      />
      {shown.map((g) => {
        const gdone = g.items.filter((it) => it.done).length;
        const rows = g.rows.slice().sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0) || (a.date || '').localeCompare(b.date || ''));
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
      {!shown.length ? (
        <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 }}>
          {filter === 'done' ? 'Nothing completed yet. Achieved milestones will show up here.' : 'Everything is complete. No milestones left to chase.'}
        </Text>
      ) : null}
    </>
  );
}
