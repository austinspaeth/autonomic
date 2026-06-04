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

// Done-milestone green — legacy uses a literal #16a34a (CSS lines 1180-1182),
// not a SCORE_COLORS token, so it's inlined here to match exactly.
const MS_DONE = '#16a34a';

// .chart-card / .ac-card (docs CSS 870-877): surface bg, 1px border, radius 14,
// padding 14, marginBottom var(--gap)=14, box-shadow var(--shadow).
function Card({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Box
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        padding: 14,
        marginBottom: t.gap,
        ...t.shadow,
      }}
    >
      {children}
    </Box>
  );
}

// .chart-card h3 (docs CSS 878-881): 13px / 700, uppercase, letter-spacing
// 0.05em, color var(--text-dim), margin 0 0 10px.
function CardTitle({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.65, // 0.05em × 13px
        color: t.textDim,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

// .ac-sub (docs CSS 1019-1022): 11px / 600, color var(--text-dim),
// letter-spacing 0.02em, margin -4px 0 12px.
function CardSub({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '600',
        color: t.textDim,
        letterSpacing: 0.22, // 0.02em × 11px
        marginTop: -4,
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

function HeaderCard({ done, total }: { done: number; total: number }) {
  const t = useTheme();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Card>
      <CardTitle>Milestone Tracker</CardTitle>
      <CardSub>{`${done} of ${total} achieved · progress beyond daily metrics`}</CardSub>
      {/* .ms-progress (docs 5958): height 4, radius 999, surface-2 track,
          accent fill, margin-top 14. */}
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
      <CardTitle>{group.title}</CardTitle>
      <CardSub>{`${gdone} of ${group.items.length} achieved`}</CardSub>
      {/* .ac-ms-list (docs 1173): a plain column; rows carry their own borders. */}
      <View>
        {rows.map((it, i) => (
          <MilestoneRow key={i} item={it} first={i === 0} />
        ))}
      </View>
    </Card>
  );
}

// .ac-ms-row (docs 1174-1182): grid 18px / 1fr / auto, gap 8, align center,
// padding 7px 0, border-top 1px var(--border) (none on first child).
function MilestoneRow({ item, first }: { item: MilestoneItem; first: boolean }) {
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
        paddingVertical: 7,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: t.border,
      }}
    >
      {/* .ac-ms-ic: 16×16, color var(--border); .done → #16a34a. */}
      <View style={{ width: 18, marginRight: 8 }}>
        {item.done ? <Icon name="check" size={16} color={MS_DONE} /> : null}
      </View>
      {/* .ac-ms-label: 13px, var(--text-dim); .done → var(--text) + 500. */}
      <Text
        style={{
          flex: 1,
          marginRight: 8,
          fontSize: 13,
          color: item.done ? t.text : t.textDim,
          fontWeight: item.done ? '500' : '400',
        }}
      >
        {item.label}
      </Text>
      {/* .ac-ms-meta: 11px, var(--text-dim), tabular; .done → #16a34a + 600. */}
      {meta ? (
        <Text
          style={{
            fontSize: 11,
            color: item.done ? MS_DONE : t.textDim,
            fontWeight: item.done ? '600' : '400',
            fontVariant: ['tabular-nums'],
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}
