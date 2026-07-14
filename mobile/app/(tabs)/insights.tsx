import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Screen } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, Segmented } from '../../src/components/ui';
import { SheetControls, SheetFooter, useSheets } from '../../src/components/Sheet';
import { useToast } from '../../src/components/Toast';
import { radius, usePalette } from '../../src/theme';
import { getState, useAppState } from '../../src/store/store';
import { todayKey } from '../../src/lib/dates';
import { REPORT_CARDS, ReportRange, buildDataExport, buildPrompt, hasAnyData, reportDateRange } from '../../src/lib/analysis/reports';
import { resolveProtocol } from '../../src/lib/scoring/day';
import { useTier } from '../../src/store/tier';
import { usePaywall } from '../../src/features/Paywall';

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

  // Nothing to analyze until something real is logged, so hide the report picker
  // and point people back to the Journal, same gate the Progress view uses.
  const hasData = useMemo(() => hasAnyData(state.days, Object.keys(state.days)), [state.days]);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generate = () => {
    const state = getState();
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
    const state = getState();
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

function PromptSheet({ title, rangeText, prompt, controls, subtitle }: { title: string; rangeText: string; prompt: string; controls: SheetControls; subtitle?: string }) {
  const p = usePalette();
  const toast = useToast();
  const copy = async () => {
    await Clipboard.setStringAsync(prompt);
    controls.close();
    toast('Copied to clipboard');
  };
  const share = async () => {
    const uri = `${FileSystem.cacheDirectory}autonomic-report.txt`;
    try {
      await FileSystem.writeAsStringAsync(uri, prompt);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: title });
    } catch { toast('Share failed'); }
    finally {
      // The report contains the user's health data in plaintext; don't leave it in cache.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4 }}>{subtitle || 'Copy this prompt and paste it into Claude, ChatGPT, Gemini, or your AI of choice.'}</Text>
      <Text style={{ color: p.textDim, fontSize: 12, marginTop: 6, marginBottom: 10, fontVariant: ['tabular-nums'] }}>{`${rangeText} · ${prompt.length.toLocaleString()} characters`}</Text>
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12 }}>
        <Text selectable style={{ color: p.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 }}>{prompt}</Text>
      </View>
      {/* Extra tail room: the pinned footer (disclaimer + buttons) is taller than
          the sheet's default footer clearance. */}
      <View style={{ height: 70 }} />
      {/* Copy/Share stay pinned in the sheet's fixed footer so they're always in
          view, with the AI disclaimer riding directly above them. */}
      <SheetFooter>
        <View style={{ flex: 1 }}>
          {!subtitle ? (
            <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 10, marginBottom: 10 }}>
              <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={p.textDim} /></View>
              <Text style={{ flex: 1, color: p.textDim, fontSize: 11.5, lineHeight: 16 }}>
                Any analysis or advice comes from the AI service you paste this into. Autonomic only assembles your logged data. Talk to your doctor before acting on its suggestions.
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Share" variant="ghost" onPress={share} />
            <Button title={subtitle ? 'Copy data' : 'Copy prompt'} variant="primary" onPress={copy} />
          </View>
        </View>
      </SheetFooter>
    </View>
  );
}
