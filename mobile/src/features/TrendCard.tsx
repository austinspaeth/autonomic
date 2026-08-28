/**
 * "Your resting heart rate is down 6 bpm since last month" — one true sentence
 * about the user's own data, in the Journal under the Outlook.
 *
 * This replaced `ProUpsellCard`, a permanent generic four-bullet advertisement
 * shown to every free user on every day. It said nothing about the person
 * reading it, so people stopped seeing it.
 *
 * IT RENDERS FOR EVERY TIER. It is a feature, not an upsell, and a card that
 * only appears when you haven't paid teaches people to ignore it. Free and Pro
 * see the identical card, and it goes nowhere for either — see the note on the
 * render below for why it is no longer tappable.
 *
 * All the decisions live in src/lib/trends (pure, tested), including the rule
 * that this never reports a decline and stays silent during a downturn, and the
 * pacing in src/lib/trends/pacing: one celebration a week, one subject a month,
 * and a headline PINNED once claimed so its number can't drift day to day.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { radius, usePalette } from '../theme';
import { useAppState } from '../store/store';
import { resolveProtocol } from '../lib/scoring/day';
import { findTrend, trendGate, type TrendMetricId } from '../lib/trends';
import { noteTrendShown, trendMemory } from '../lib/trends/memory';

/** Which Progress section each metric was computed from (category ids in
 *  src/lib/analysis/categories.ts), so a tap lands on that chart rather than the
 *  top of the page. Outlook renders first and untitled, so the score-derived
 *  metrics correctly land at the top.
 *
 *  The Trend card below no longer navigates; the one consumer today is Insights'
 *  Trend Watch, whose rows route through this over the wider WATCH_PRIORITY set.
 *  It still covers every metric, which is also what a future per-metric
 *  destination for this card would build on. */
/**
 * The CARD inside that section, by title, so a claim lands on its own chart.
 *
 * A section is several charts long: 'hrv' opens on Power distribution and
 * 'outlook' on the score gauge, so "RMSSD" and "Clean days" both landed the
 * reader on a different metric from the one they tapped. Titles rather than ids
 * because that is what the cards have — `AnalysisCard.title` for a built card,
 * the metric's own label inside `HrvProgress` — and both are matched exactly.
 * A metric with no entry (or whose card this range has no data for) still lands
 * on its section.
 */
export const METRIC_CARD: Partial<Record<TrendMetricId, string>> = {
  badDays: 'Clean Days',
  cleanDays: 'Clean Days',
  rmssd: 'RMSSD',
  sdnn: 'SDNN',
  pnn50: 'pNN50',
  totalPower: 'Power distribution',
  lfPeak: 'LF peak',
  restingHr: 'Resting Heart Rate',
  sys: 'Blood Pressure',
  dia: 'Blood Pressure',
  orthoDelta: 'POTS Episodes',
  sleepConsistency: 'Duration',
  sleepDuration: 'Duration',
  sleepingHr: 'Sleeping HR',
  waterIntake: 'Hydration',
  // No symptomLoad: Progress has no symptom chart, and its `triggers` section
  // charts trigger EXPOSURE counts — a different quantity. It lands on the
  // section, which is the nearest true thing.
};

export const METRIC_SECTION: Record<TrendMetricId, string> = {
  score: 'outlook',
  badDays: 'outlook',
  cleanDays: 'outlook',
  rmssd: 'hrv',
  sdnn: 'hrv',
  pnn50: 'hrv',
  totalPower: 'hrv',
  lfPeak: 'hrv',
  restingHr: 'vitals',
  sys: 'vitals',
  dia: 'vitals',
  orthoDelta: 'pots',
  sleepConsistency: 'sleep',
  sleepDuration: 'sleep',
  sleepingHr: 'sleep',
  waterIntake: 'triggers',
  symptomLoad: 'triggers',
  bmCount: 'triggers',
};

export function TrendCard({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();

  // Pacing memory is component state, not a bare read: claiming a finding below
  // has to re-render this card onto the pinned branch, or it would keep
  // recomputing (and re-wording) the very claim it just froze.
  const [memory, setMemory] = useState(trendMemory);
  const gate = useMemo(() => trendGate(memory, dk, Date.now()), [memory, dk]);

  // One pass over the two 30-day windows, memoized on the same `days` identity
  // the rest of DaySummary keys on — `save()` only re-wraps `state.days` when a
  // day was actually touched, so settings-only saves don't re-run this. Skipped
  // entirely while the card is quiet or pinned: the answer is already decided.
  const search = gate.kind === 'search' ? gate.exclude : null;
  const found = useMemo(
    () => (search === null ? null : findTrend(
      state.days, dk,
      { sex: state.profile.sex, height: state.profile.height },
      resolveProtocol(state.settings.protocol),
      state.customTypes,
      search,
    )),
    [search, state.days, dk, state.profile.sex, state.profile.height, state.settings.protocol, state.customTypes],
  );

  // A pinned claim and a fresh finding both carry `metric` + `headline`, which
  // is all this card renders — the finding's `detail` line is not shown.
  const claim: { metric: TrendMetricId; headline: string } | null =
    gate.kind === 'pinned' ? gate.claim : found;

  // Stamp a fresh finding as said, in an effect rather than during render: this
  // writes MMKV and starts both cooldown clocks, and it must happen exactly once
  // for a card the user actually saw.
  const fresh = gate.kind === 'search' && found ? found : null;
  useEffect(() => {
    if (!fresh) return;
    setMemory(noteTrendShown({ metric: fresh.metric, headline: fresh.headline, dk, atMs: Date.now() }));
  }, [fresh, dk]);

  if (!claim) return null;

  // NOT tappable, deliberately. It used to open Progress at the month range,
  // which is the wrong evidence for most of these claims and flatly wrong for a
  // dispersion one: "your bedtime is far more consistent" landed on twelve
  // monthly AVERAGES of sleep duration, a chart with no bedtime series on it at
  // any range and no scatter left in it to see. A chevron promises the working,
  // so it must not be there until a view exists that actually shows it (a
  // per-metric destination is future work). The downturn card above keeps its
  // chevron because its explain sheet is real.
  return (
    <View
      accessibilityRole="text"
      style={{
        borderWidth: 1, borderColor: p.border, borderRadius: radius.card,
        backgroundColor: p.surface, marginBottom: 12, padding: 15,
        flexDirection: 'row', alignItems: 'center', gap: 13,
      }}
    >
      {/* Sunk neutral tile, deliberately NOT the red accent wash the offer cards
          use — this is good news about the user, not something being sold. */}
      <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border }}>
        <Text style={{ fontSize: 21 }}>🎉</Text>
      </View>
      {/* Headline only. The finding's `detail` line ("68 → 100 pts · 30 scored
          days") is still computed and tested, but showing the working turns a
          congratulation into a readout. */}
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: p.text, lineHeight: 20 }}>{claim.headline}</Text>
    </View>
  );
}
