import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { Segmented } from '../../src/components/ui';
import { useSheets } from '../../src/components/Sheet';
import { useToast } from '../../src/components/Toast';
import { PromptSheet } from '../../src/features/PromptSheet';
import { radius, usePalette } from '../../src/theme';
import { getState, useAppState } from '../../src/store/store';
import { todayKey } from '../../src/lib/dates';
import { REPORT_CARDS, ReportRange, buildDataExport, buildPrompt, hasAnyData, reportDateRange } from '../../src/lib/analysis/reports';
import { resolveProtocol } from '../../src/lib/scoring/day';
import { useTier } from '../../src/store/tier';
import { usePaywall } from '../../src/features/Paywall';
import { demoState, hasOwnData } from '../../src/lib/demo';
import { DemoBanner, DEMO_INSIGHTS_TEXT } from '../../src/features/DemoBanner';

/** The state reports are built from: the user's own, or the sample month while
 *  they have logged nothing. Resolved at press time off fresh store state so it
 *  can never disagree with what the view decided to render. */
const reportState = () => { const s = getState(); return hasOwnData(s.days) ? s : demoState(s); };

// Rendered full-width above the two-up grid, in this order, right under the
// data-only prompt: the doctor summary, then the all-in-one overall report.
const FULL_WIDTH_IDS = ['doctor', 'overall'];

export default function InsightsScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { openSheet } = useSheets();
  const state = useAppState();
  const [range, setRange] = useState<ReportRange>('week');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Freemium: all report cards are Pro. Locked cards show a lock badge and
  // raise the paywall; the data-only prompt stays free (the data is theirs).
  const locked = useTier() === 'free';
  const openPaywall = usePaywall();
  // Downgrade mid-session (trial expiry): drop any selection so the Generate
  // footer can't linger, and snap the range back to the free tier's Day.
  React.useEffect(() => { if (locked && selected.size) setSelected(new Set()); }, [locked, selected.size]);
  React.useEffect(() => { if (locked && range !== 'day') setRange('day'); }, [locked, range]);

  // Nothing logged yet: run the reports off the sample month behind a "demo
  // data" banner, so people can see what a report looks like before committing
  // to a month of logging. Swaps to their own data on the first entry.
  const demo = !hasOwnData(state.days);
  const hasData = useMemo(() => demo || hasAnyData(state.days, Object.keys(state.days)), [demo, state.days]);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generate = () => {
    const state = reportState();
    const cards = REPORT_CARDS.filter((c) => selected.has(c.id));
    if (!cards.length) return;
    const { keys: allKeys, rangeText } = reportDateRange(range, todayKey());
    const keys = allKeys.filter((k) => state.days[k]);
    if (!hasAnyData(state.days, keys)) { toast('No data available for this period'); return; }
    const ctx = { sex: state.profile.sex, height: state.profile.height, protocol: resolveProtocol(state.settings.protocol) };
    const prompt = buildPrompt(state, ctx, cards, range, todayKey());
    const title = cards.length === 1 ? cards[0].title : `Custom Report · ${cards.length} areas`;
    openSheet((c) => <PromptSheet title={title} rangeText={rangeText} prompt={prompt} controls={c} />);
  };

  const dataExport = () => {
    const state = reportState();
    const { keys: allKeys, rangeText } = reportDateRange(range, todayKey());
    const keys = allKeys.filter((k) => state.days[k]);
    if (!hasAnyData(state.days, keys)) { toast('No data available for this period'); return; }
    const ctx = { sex: state.profile.sex, height: state.profile.height, protocol: resolveProtocol(state.settings.protocol) };
    const text = buildDataExport(state, ctx, range, todayKey());
    openSheet((c) => <PromptSheet title="Data only prompt" rangeText={rangeText} prompt={text} controls={c} subtitle="Structured data only, no analysis prompt. Paste it into an AI to get specific reports or data back." />);
  };

  const fullWidthCard = (card: (typeof REPORT_CARDS)[number]) => {
    const sel = !locked && selected.has(card.id);
    return (
      <Pressable key={card.id} onPress={() => (locked ? openPaywall() : toggle(card.id))} style={{ marginBottom: 10, width: '100%', borderWidth: 1, borderRadius: radius.card, backgroundColor: sel ? p.accentSoft : p.surface, borderColor: sel ? p.accent : p.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={card.icon as IconName} size={26} color={locked ? p.textDim : p.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>{card.title}</Text>
          <Text style={{ fontSize: 12, color: p.textDim, marginTop: 4, lineHeight: 15 }}>{card.desc}</Text>
        </View>
        {sel ? <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></View> : null}
        {locked ? <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={12} color={p.textDim} /></View> : null}
      </Pressable>
    );
  };

  return (
    <Screen
      bottomPad={210}
      header={
        <View style={{ paddingHorizontal: 16 }}>
          <Segmented
            options={[
              { val: 'day', label: 'Day' },
              { val: 'week', label: 'Week', locked },
              { val: 'month', label: 'Month', locked },
              { val: 'year', label: 'Year', locked },
            ]}
            value={range}
            onChange={setRange}
            onLockedPress={openPaywall}
          />
        </View>
      }
      footer={
        hasData && selected.size > 0 ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 88 }}>
            <Pressable onPress={generate} style={{ backgroundColor: p.accent, borderRadius: 999, paddingVertical: 15, alignItems: 'center', shadowColor: p.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{selected.size > 1 ? `Generate Report Prompt (${selected.size})` : 'Generate Report Prompt'}</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      {!hasData ? (
        <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 }}>
          Nothing to analyze yet. Record readings, sleep, activities and more in your Journal, then come back here to generate AI insights.
        </Text>
      ) : (
        <>
          {demo ? <DemoBanner text={DEMO_INSIGHTS_TEXT} /> : null}
          <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 12, lineHeight: 19 }}>
            Pick a report area, tap Generate Report Prompt, then paste it into Claude, ChatGPT, Gemini, or any other provider to discover patterns, spot trends, gauge your progress, and surface what&apos;s worth discussing with your doctor.
          </Text>
          <Pressable onPress={dataExport} style={{ marginBottom: 10, width: '100%', borderWidth: 1, borderRadius: radius.card, backgroundColor: p.surface, borderColor: p.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="download" size={26} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>Data only prompt</Text>
              <Text style={{ fontSize: 12, color: p.textDim, marginTop: 4, lineHeight: 15 }}>Structured data only, no analysis prompt. Feed it to an AI to get specific reports or data back.</Text>
            </View>
          </Pressable>
          {FULL_WIDTH_IDS.map((id) => REPORT_CARDS.find((c) => c.id === id)).filter(Boolean).map((card) => fullWidthCard(card!))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            {REPORT_CARDS.filter((c) => !FULL_WIDTH_IDS.includes(c.id)).map((card) => {
              const sel = !locked && selected.has(card.id);
              return (
                <Pressable key={card.id} onPress={() => (locked ? openPaywall() : toggle(card.id))} style={{ width: '48%', borderWidth: 1, borderRadius: radius.card, backgroundColor: sel ? p.accentSoft : p.surface, borderColor: sel ? p.accent : p.border, padding: 14 }}>
                  {sel ? <View style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></View> : null}
                  {locked ? <View style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={12} color={p.textDim} /></View> : null}
                  <Icon name={card.icon as IconName} size={26} color={locked ? p.textDim : p.accent} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: p.text, marginTop: 8, paddingRight: 20 }}>{card.title}</Text>
                  <Text style={{ fontSize: 12, color: p.textDim, marginTop: 4, lineHeight: 15 }}>{card.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
