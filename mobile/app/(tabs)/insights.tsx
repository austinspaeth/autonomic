import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Screen } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, Segmented } from '../../src/components/ui';
import { SheetControls, useSheets } from '../../src/components/Sheet';
import { useToast } from '../../src/components/Toast';
import { radius, usePalette } from '../../src/theme';
import { getState, useAppState } from '../../src/store/store';
import { getCurrentKey } from '../../src/store/nav';
import { REPORT_CARDS, ReportRange, buildPrompt, hasAnyData, reportDateRange } from '../../src/lib/analysis/reports';

export default function InsightsScreen() {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  useAppState();
  const [range, setRange] = useState<ReportRange>('week');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generate = () => {
    const state = getState();
    const cards = REPORT_CARDS.filter((c) => selected.has(c.id));
    if (!cards.length) return;
    const { keys: allKeys, rangeText } = reportDateRange(range, getCurrentKey());
    const keys = allKeys.filter((k) => state.days[k]);
    if (!hasAnyData(state.days, keys)) { toast('No data available for this period'); return; }
    const ctx = { sex: state.profile.sex, height: state.profile.height };
    const prompt = buildPrompt(state, ctx, cards, range, getCurrentKey());
    const title = cards.length === 1 ? cards[0].title : `Custom Report · ${cards.length} areas`;
    openSheet((c) => <PromptSheet title={title} rangeText={rangeText} prompt={prompt} controls={c} />);
  };

  return (
    <Screen
      bottomPad={140}
      header={
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Segmented options={[{ val: 'day', label: 'Day' }, { val: 'week', label: 'Week' }, { val: 'month', label: 'Month' }, { val: 'year', label: 'Year' }]} value={range} onChange={setRange} />
        </View>
      }
      footer={
        selected.size > 0 ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 88 }}>
            <Pressable onPress={generate} style={{ backgroundColor: p.accent, borderRadius: 999, paddingVertical: 15, alignItems: 'center', shadowColor: p.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{selected.size > 1 ? `Generate Report Prompt (${selected.size})` : 'Generate Report Prompt'}</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 12, lineHeight: 18 }}>Pick one or more reports, then generate a copyable analysis prompt for Claude or ChatGPT.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {REPORT_CARDS.map((card) => {
          const sel = selected.has(card.id);
          return (
            <Pressable key={card.id} onPress={() => toggle(card.id)} style={{ width: '47.5%', borderWidth: 1, borderRadius: radius.card, backgroundColor: sel ? p.accentSoft : p.surface, borderColor: sel ? p.accent : p.border, padding: 14 }}>
              {sel ? <View style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></View> : null}
              <Icon name={card.icon as IconName} size={26} color={p.accent} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: p.text, marginTop: 8, paddingRight: 20 }}>{card.title}</Text>
              <Text style={{ fontSize: 12, color: p.textDim, marginTop: 4, lineHeight: 15 }}>{card.desc}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function PromptSheet({ title, rangeText, prompt, controls }: { title: string; rangeText: string; prompt: string; controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const copy = async () => { await Clipboard.setStringAsync(prompt); toast('Prompt copied to clipboard'); };
  const share = async () => {
    try {
      const uri = `${FileSystem.cacheDirectory}autonomic-report.txt`;
      await FileSystem.writeAsStringAsync(uri, prompt);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: title });
    } catch { toast('Share failed'); }
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4 }}>Copy this prompt and paste it into Claude or ChatGPT.</Text>
      <Text style={{ color: p.textDim, fontSize: 12, marginTop: 6, marginBottom: 10, fontVariant: ['tabular-nums'] }}>{`${rangeText} · ${prompt.length.toLocaleString()} characters`}</Text>
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, marginBottom: 16 }}>
        <Text style={{ color: p.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 }}>{prompt}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Share" variant="ghost" onPress={share} />
        <Button title="Copy prompt" variant="primary" onPress={copy} />
      </View>
      <View style={{ height: 24 }} />
    </View>
  );
}
