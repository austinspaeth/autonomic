// ReportsScreen — the "AI Insights" view. A range SegmentedControl + a grid of
// selectable report cards; a sliding "Generate Report Prompt" bar assembles the
// prompt for the selected card(s) and opens a drawer showing it with a copy
// affordance. Ported from legacy docs/index.html:
//   buildPrompt        (~6857-6890)
//   renderReports      (~6893-6919)
//   toggleReport       (~6921-6931)
//   updateGenbar       (~6934-6941)
//   generateReport     (~6943-6951)
//   openPromptDrawer   (~6953-6964)
//
// Decouplings:
//   - The selection / range / genbar that legacy held in module globals
//     (reportSelected Set, reportRange) + imperative DOM are local React state.
//   - copyText/fallbackCopy (legacy ~6966-6990) used the DOM clipboard. expo-
//     clipboard isn't installed, so the drawer shows the prompt as selectable
//     Text (long-press to select/copy) instead of a Copy button. See notes.
//   - The "day" range used the journal's currentKey; there's no shared current
//     day here, so it uses today's key.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { keyOf } from '@core/date/dateUtils';
import type { Day, DateKey, Profile } from '@core/types';
import { useRepoSelector } from '@data/RepositoryProvider';
import { Box, Text, Pressable, Icon } from '@ui/primitives';
import { Screen } from '@ui/components/Screen';
import { SegmentedControl } from '@ui/forms/SegmentedControl';
import { H2 } from '@ui/components/SheetText';
import { openSheet, closeSheet } from '@ui/sheets/useSheets';
import { ModalFooter } from '@ui/sheets/ModalFooter';
import { Button } from '@ui/components/Button';
import { toast } from '@ui/components/Toast';
import { useTheme } from '@ui/theme/ThemeProvider';
import { REPORT_CARDS, type ReportCard } from './reportCards';
import {
  type ReportRange,
  reportDateRange,
  renderSections,
  universalHeader,
  entryCount,
  hasAnyData,
} from './reportSections';

type Days = Record<DateKey, Day>;

// Build a prompt covering one or more report cards. A single card produces a
// focused prompt; multiple cards are stitched into one combined report - a
// shared data block (the union of every selected card's sections, each rendered
// once) followed by a per-area focus section. (legacy buildPrompt ~6857)
function buildPrompt(days: Days, profile: Profile, range: ReportRange, currentKey: DateKey, cards: ReportCard[]): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => days[k]).sort();
  const header = universalHeader(profile, rangeText);
  const sparse =
    hasAnyData(days, keys) && entryCount(days, keys) < 4
      ? '\n\nNOTE: Limited data available for this period - analysis may be less comprehensive.\n'
      : '';

  if (cards.length === 1) {
    const card = cards[0];
    let body = `FOCUS: ${card.focus}`;
    if (card.context) body += `\n\n${card.context}`;
    body += `\n\nDATA FOR PERIOD:\n\n${renderSections(days, keys, profile, card.sections)}`;
    if (card.instructions) body += `\n\n${card.instructions}`;
    return `${header}${sparse}\n\n${body}`;
  }

  // Union of all sections, each rendered once (preserves first-seen order).
  const sectionKeys: string[] = [];
  cards.forEach((c) => c.sections.forEach((s) => { if (!sectionKeys.includes(s)) sectionKeys.push(s); }));
  const titles = cards.map((c) => c.title);
  const intro = `This is a CUSTOM, MULTI-PART report the user assembled, covering ${cards.length} focus areas:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Address each focus area as its own clearly-labeled top-level section in your response, in the order listed, using the titles above as headings. Within each section, follow the response structure described above (Analysis, Trends Identified, Recovery Position, Projections, Recommendations, Citations) where relevant to that area. The shared data below covers all areas - the same data point may inform more than one. Don't repeat identical analysis across sections; cross-reference instead. End with a brief integrated summary that ties the focus areas together.`;
  const data = `SHARED DATA FOR PERIOD (covers every focus area below):\n\n${renderSections(days, keys, profile, sectionKeys)}`;
  const focusBlocks = cards
    .map((c, i) => {
      let b = `=== ${i + 1}. ${c.title.toUpperCase()} ===\nFOCUS: ${c.focus}`;
      if (c.context) b += `\n\n${c.context}`;
      if (c.instructions) b += `\n\nANALYSIS REQUESTED:\n${c.instructions}`;
      return b;
    })
    .join('\n\n');
  return `${header}${sparse}\n\n${intro}\n\n${data}\n\nFOCUS AREAS:\n\n${focusBlocks}`;
}

// Drawer body: the assembled prompt with a sub/meta line and the prompt text.
// (legacy openPromptDrawer ~6953)
function PromptBody({ title, rangeText, prompt }: { title: string; rangeText: string; prompt: string }) {
  const t = useTheme();
  return (
    <>
      <H2>{title}</H2>
      <Text style={{ color: t.textDim, fontSize: 13.5, marginBottom: 4 }}>
        Copy this prompt and paste it into Claude or ChatGPT.
      </Text>
      <Text style={{ color: t.textDim, fontSize: 12.5, marginBottom: 14 }}>
        {rangeText} · {prompt.length.toLocaleString()} characters
      </Text>
      <Box
        style={{
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: t.radiusSm,
          padding: 12,
          marginBottom: 8,
        }}
      >
        <Text
          selectable
          style={{
            color: t.text,
            fontSize: 12.5,
            lineHeight: 18,
            // Monospace-ish for the <pre> feel; falls back to system mono.
            fontFamily: 'Menlo',
          }}
        >
          {prompt}
        </Text>
      </Box>
    </>
  );
}

function openPromptDrawer(title: string, rangeText: string, prompt: string) {
  openSheet(() => <PromptBody title={title} rangeText={rangeText} prompt={prompt} />, {
    footer: (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Close" variant="ghost" onPress={() => closeTop()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Done" variant="primary" onPress={() => closeTop()} />
        </View>
      </View>
    ),
  });
}

// The footer buttons need a way to close the sheet; openSheet's render callback
// gets the api, but the footer is a static node. Use the module close helper.
function closeTop() {
  closeSheet();
}

// ---- Report card grid item ----
function ReportCardItem({ card, selected, onToggle }: { card: ReportCard; selected: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    // .report-card (docs CSS 913-946): border 1px var(--border), radius
    // var(--radius)=14, surface bg, box-shadow var(--shadow), padding 14,
    // flex column gap 7. .selected → border var(--accent), bg var(--accent-soft),
    // box-shadow 0 0 0 1px var(--accent) (emulated via a second 1px border ring
    // through borderColor=accent; the base 1px border already supplies the ring
    // weight that the legacy adds on top of the default border).
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={card.title}
      style={{
        flexBasis: '48%',
        flexGrow: 1,
        flexDirection: 'column',
        gap: 7,
        backgroundColor: selected ? t.accentSoft : t.surface,
        borderWidth: 1,
        borderColor: selected ? t.accent : t.border,
        borderRadius: t.radius,
        padding: 14,
        position: 'relative',
        ...t.shadow,
        ...(selected
          ? { boxShadow: `0px 0px 0px 1px ${t.accent}, 0px 1px 3px rgba(0,0,0,0.08)` }
          : null),
      }}
    >
      {/* .report-card-check (docs 939-946): top/right 12, 20×20, circle,
          accent bg, white check svg 14. */}
      {selected ? (
        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: t.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={14} color="#fff" />
        </View>
      ) : null}
      {/* .report-card-ico (docs 935): 26×26, var(--accent). */}
      <Icon name={card.icon} size={26} color={t.accent} />
      {/* .report-card-title (docs 937): 14px / 700, line-height 1.2, pad-right 22. */}
      <Text
        style={{
          color: t.text,
          fontSize: 14,
          fontWeight: '700',
          lineHeight: 17, // 1.2 × 14
          paddingRight: 22,
        }}
      >
        {card.title}
      </Text>
      {/* .report-card-desc (docs 938): 11.5px, var(--text-dim), line-height 1.35. */}
      <Text style={{ color: t.textDim, fontSize: 11.5, lineHeight: 15.5 }}>{card.desc}</Text>
    </Pressable>
  );
}

export function ReportsScreen({ scrollY }: { scrollY: SharedValue<number> }) {
  const t = useTheme();
  const days = useRepoSelector((r) => r.allDays());
  const profile = useRepoSelector((r) => r.getProfile());

  const [range, setRange] = useState<ReportRange>('week');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const todayKey = useMemo(() => keyOf(new Date()), []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generate = () => {
    const cards = REPORT_CARDS.filter((c) => selected.has(c.id));
    if (!cards.length) return;
    const { keys: allKeys, rangeText } = reportDateRange(range, todayKey);
    const keys = allKeys.filter((k) => days[k]);
    if (!hasAnyData(days, keys)) {
      toast('No data available for this period');
      return;
    }
    const title = cards.length === 1 ? cards[0].title : `Custom Report · ${cards.length} areas`;
    openPromptDrawer(title, rangeText, buildPrompt(days, profile, range, todayKey, cards));
  };

  const n = selected.size;

  return (
    <Screen scrollY={scrollY}>
      <View style={{ height: 8 }} />
      <SegmentedControl<ReportRange>
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        value={range}
        onChange={setRange}
      />
      {/* .report-grid (docs 905-911): margin-top 10, gap 10, 2-col. */}
      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {REPORT_CARDS.map((card) => (
          <ReportCardItem key={card.id} card={card} selected={selected.has(card.id)} onToggle={() => toggle(card.id)} />
        ))}
      </View>
      {n > 0 ? (
        <View style={{ marginTop: 18 }}>
          <Button
            title={n > 1 ? `Generate Report Prompt (${n})` : 'Generate Report Prompt'}
            variant="primary"
            onPress={generate}
          />
        </View>
      ) : (
        <Text style={{ color: t.textDim, fontSize: 13, textAlign: 'center', marginTop: 18 }}>
          Select one or more reports to generate a prompt.
        </Text>
      )}
    </Screen>
  );
}
