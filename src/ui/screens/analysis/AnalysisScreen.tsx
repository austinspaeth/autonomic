// AnalysisScreen — Phase E. Port of renderAnalysis (docs/index.html:6046),
// renderAnalysisContent (6062), the category nav/grid (6071-6129), and the
// report-builder cards (see analysisCards.tsx).
//
// SIMPLIFICATIONS vs legacy:
// - The sliding category detail panel (legacy .ac-track / show-detail / goBack
//   animation, 6097-6125) is replaced by an expandable accordion: tapping a
//   category card expands its report cards inline. The open category is kept in
//   local state so a range/view change preserves it (matches legacy intent at
//   6128). The slide-in transform animation is deferred.
// - The interactive chart scrub + "Show zones" toggle are deferred inside the
//   already-ported AnalysisChart / BpBars (their own TODOs).
//
// DEFERRED CARDS (low priority — logged here): Structured HRV power-distribution
// stack card, Morning/Evening filtered-reading cards, the Outlook extras
// (Comparison, Calendar Heat Map, Week Pattern, Clean Days, Streak Analytics,
// Protocol Adherence, Recovery Phase, Intervention Impact), Extreme Event Log,
// and Exercise Progression. All the prioritized cards (HRV, Blood Pressure,
// Resting HR, Sleep, Activity, ECG, Blood Oxygen, Autonomic Outlook) plus
// Orthostatic, Hydration, Nutrition, Bowel, Meds, Subjective, Correlations and
// Trigger Impact ARE ported.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { Box, Text, Pressable, Icon } from '@ui/primitives';
import { type IconName } from '@ui/primitives/icons';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Screen } from '@ui/components/Screen';
import { SegmentedControl } from '@ui/forms/SegmentedControl';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { keyOf } from '@core/date/dateUtils';
import { acBuckets, type AnalysisMode } from '@core/analytics/buckets';
import type { Day } from '@core/types';
import {
  acAutonomicOutlook,
  acAllHrv,
  acUnstructuredHrv,
  acBloodPressure,
  acRestingHr,
  acBloodOxygen,
  acEcg,
  acOrthostatic,
  acSleep,
  acActivity,
  acHydration,
  acNutrition,
  acBowel,
  acMeds,
  acTriggerImpact,
  acSubjective,
  acCorrelations,
  type CardCtx,
} from './analysisCards';

// Each category bundles a set of report builders (legacy CATS, 6071-6089).
interface Category {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  sections: ((ctx: CardCtx) => React.ReactElement | null)[];
}

const CATEGORIES: Category[] = [
  {
    id: 'outlook',
    icon: 'gauge',
    title: 'Autonomic Outlook',
    desc: 'Recovery score, trends & adherence',
    sections: [acAutonomicOutlook, acSubjective, acCorrelations],
  },
  {
    id: 'hrv',
    icon: 'heartPulse',
    title: 'HRV',
    desc: 'Heart-rate variability readings',
    sections: [acAllHrv, acUnstructuredHrv],
  },
  {
    id: 'vitals',
    icon: 'heart',
    title: 'Vitals',
    desc: 'BP, heart rate, SpO₂ & ECG',
    sections: [acBloodPressure, acRestingHr, acBloodOxygen, acEcg],
  },
  {
    id: 'pots',
    icon: 'standing',
    title: 'POTS',
    desc: 'Orthostatic & extreme events',
    sections: [acOrthostatic],
  },
  {
    id: 'sleep',
    icon: 'moon',
    title: 'Sleep',
    desc: 'Sleep duration & quality',
    sections: [acSleep],
  },
  {
    id: 'activity',
    icon: 'bike',
    title: 'Activity',
    desc: 'Workouts & exercise progression',
    sections: [acActivity],
  },
  {
    id: 'food',
    icon: 'utensils',
    title: 'Food & Drink',
    desc: 'Hydration, nutrition & triggers',
    sections: [acHydration, acNutrition, acBowel, acTriggerImpact],
  },
  {
    id: 'supps',
    icon: 'pill',
    title: 'Supplements',
    desc: 'Medications & supplements',
    sections: [acMeds],
  },
];

const MODE_OPTIONS: { value: AnalysisMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

// Safe builder — legacy wrapped each section in try/catch (renderAnalysisContent
// `safe`, 6067) so one bad card can't blank the whole view.
function safeBuild(
  fn: (ctx: CardCtx) => React.ReactElement | null,
  ctx: CardCtx,
): React.ReactElement | null {
  try {
    return fn(ctx);
  } catch (e) {
    console.error('analytics container failed', e);
    return null;
  }
}

export function AnalysisScreen({ scrollY }: { scrollY: SharedValue<number> }) {
  const t = useTheme();
  const repo = useRepository();
  const [mode, setMode] = useState<AnalysisMode>('day');
  const [openCat, setOpenCat] = useState<string | null>(null);

  // Subscribe to the day store so cards re-render on data changes.
  const days = useRepoSelector((r) => r.allDays()) as Record<string, Day>;
  const profile = repo.getProfile();
  const todayKey = keyOf(new Date());

  const buckets = useMemo(() => acBuckets(days, mode, todayKey), [days, mode, todayKey]);
  const ctx: CardCtx = { days, profile, mode, buckets, todayKey };

  const hasData = buckets.some((b) => b.days.length);
  const active = CATEGORIES.find((c) => c.id === openCat) || null;

  return (
    <Screen scrollY={scrollY}>
      {active ? (
        // ---- Category detail: back header + that category's report cards ----
        <View>
          <Pressable
            onPress={() => setOpenCat(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to categories"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, marginBottom: 6 }}
          >
            <Icon name="arrowLeft" size={20} color={t.accent} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{active.title}</Text>
          </Pressable>
          <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
          {(() => {
            const built = active.sections.map((fn) => safeBuild(fn, ctx)).filter(Boolean);
            if (!hasData || !built.length) {
              return (
                <Text style={{ color: t.textDim, fontSize: 14, paddingVertical: 24 }}>
                  No data logged yet for this category.
                </Text>
              );
            }
            return built.map((node, i) => <View key={i}>{node}</View>);
          })()}
        </View>
      ) : (
        // ---- Category grid ----
        <View>
          <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
          {CATEGORIES.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} onPress={() => setOpenCat(cat.id)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function CategoryCard({ cat, onPress }: { cat: Category; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        padding: 14,
        marginBottom: t.gap,
        ...t.shadow,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: t.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={cat.icon} size={20} color={t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{cat.title}</Text>
        <Text style={{ fontSize: 12, color: t.textDim, marginTop: 1 }}>{cat.desc}</Text>
      </View>
      <View style={{ transform: [{ rotate: '0deg' }] }}>
        <Icon name="chevron" size={18} color={t.textDim} />
      </View>
    </Pressable>
  );
}
