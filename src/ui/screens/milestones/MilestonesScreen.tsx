// MilestonesScreen — Phase E. Faithful port of renderMilestones (docs/index.html
// 6037) + acMilestones (5948) + buildMilestoneGroups (5750). Computes the
// milestone-day map over repo.allDays()/profile and renders the header progress
// card plus one card per group (achieved-first, with the same copy + criteria).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { Box, Text, Icon } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Screen } from '@ui/components/Screen';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { dateFromKey } from '@core/date/dateUtils';
import {
  buildMilestoneDays,
  buildMilestoneGroups,
  type MilestoneGroup,
  type MilestoneItem,
} from './milestoneData';

// fmtShort (docs:3279) / fmtNum (docs:3280) — not in @core, inlined.
const fmtShort = (dk: string): string =>
  dateFromKey(dk).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtNum = (v: number | string | null): string => {
  if (v == null) return '-';
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

export function MilestonesScreen({ scrollY }: { scrollY: SharedValue<number> }) {
  const t = useTheme();
  const repo = useRepository();
  // Re-derive when day count or last-updated stamp changes.
  const stamp = useRepoSelector(
    (r) => Object.keys(r.allDays()).length + '|' + (r.getMeta().lastUpdated ?? ''),
  );

  const data = useMemo(() => {
    const days = repo.allDays();
    const profile = repo.getProfile();
    const md = buildMilestoneDays(days, profile);
    if (!md.keys.length) return null;
    const groups = buildMilestoneGroups(md, days);
    let done = 0,
      total = 0;
    groups.forEach((g) =>
      g.items.forEach((it) => {
        total++;
        if (it.done) done++;
      }),
    );
    if (!total) return null;
    return { groups, done, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, stamp]);

  return (
    <Screen scrollY={scrollY}>
      {!data ? (
        <Text style={{ color: t.textDim, fontSize: 14, paddingVertical: 24 }}>
          Log readings, sleep, and clean days to start unlocking recovery milestones.
        </Text>
      ) : (
        <>
          <HeaderCard done={data.done} total={data.total} />
          {data.groups.map((g) =>
            g.items.length ? <GroupCard key={g.title} group={g} /> : null,
          )}
        </>
      )}
    </Screen>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Box
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        marginBottom: t.gap,
        overflow: 'hidden',
        ...t.shadow,
      }}
    >
      {children}
    </Box>
  );
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{title}</Text>
      {sub ? (
        <Text style={{ fontSize: 13, color: t.textDim, marginTop: 2 }}>{sub}</Text>
      ) : null}
    </View>
  );
}

function HeaderCard({ done, total }: { done: number; total: number }) {
  const t = useTheme();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Card>
      <CardHead
        title="Milestone Tracker"
        sub={`${done} of ${total} achieved · progress beyond daily metrics`}
      />
      {/* Slim progress bar pinned to the card's bottom edge. */}
      <View
        style={{
          height: 4,
          borderRadius: 999,
          backgroundColor: t.surface2,
          overflow: 'hidden',
          marginTop: 14,
        }}
      >
        <View style={{ height: '100%', backgroundColor: t.accent, width: `${pct}%` }} />
      </View>
    </Card>
  );
}

function GroupCard({ group }: { group: MilestoneGroup }) {
  // Achieved first, then by date — same sort as acMilestones (5967).
  const rows = group.items
    .slice()
    .sort(
      (a, b) =>
        (b.done ? 1 : 0) - (a.done ? 1 : 0) ||
        (a.date || '').localeCompare(b.date || ''),
    );
  const gdone = group.items.filter((it) => it.done).length;
  return (
    <Card>
      <CardHead title={group.title} sub={`${gdone} of ${group.items.length} achieved`} />
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
        {rows.map((it, i) => (
          <MilestoneRow key={i} item={it} />
        ))}
      </View>
    </Card>
  );
}

function MilestoneRow({ item }: { item: MilestoneItem }) {
  const t = useTheme();
  const meta = item.done
    ? (item.value != null ? fmtNum(item.value) + ' · ' : '') +
      (item.date ? fmtShort(item.date) : '')
    : '';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 10,
      }}
    >
      <View style={{ width: 18, alignItems: 'center' }}>
        {item.done ? <Icon name="check" size={16} color={t.accent} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: item.done ? t.text : t.textDim }}>
        {item.label}
      </Text>
      {meta ? <Text style={{ fontSize: 12, color: t.textDim }}>{meta}</Text> : null}
    </View>
  );
}
