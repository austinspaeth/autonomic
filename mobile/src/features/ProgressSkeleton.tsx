/**
 * Skeletons for the Progress document — used both while sections mount
 * progressively and under the range-change veil.
 *
 * They are built from the real `AnalysisCard`s rather than from a card count,
 * so a placeholder is the same shape *and the same height* as the card it
 * becomes: every piece of chrome that doesn't depend on the numbers stays real
 * — grade-dot slot, title, "?" help, "Show zones", the description, chart
 * labels, filter links — and only the data itself becomes a ghost block.
 *
 * Height is never guessed. Fixed-size content (the charts) reserves the exact
 * height `charts.tsx` renders; text reserves its height through `TextGhost`,
 * which lays the block over an invisible copy of the real Text in the real
 * style, so font metrics and wrapping do the measuring. The style constants
 * below are copies of the ones in `CardView` and must move with them.
 *
 * Anything whose *text* is data (stat values and their labels, which carry
 * dates and window sizes; trigger names; insight copy) is ghosted too. Under
 * the veil these cards come from the outgoing range, so rendering that text
 * would show the old range's numbers and then visibly rewrite them as the veil
 * lifts.
 */
import React from 'react';
import { Text, TextStyle, View } from 'react-native';
import { Ghost, HelpDot, TextGhost } from '../components/ui';
import { fonts, radius, usePalette } from '../theme';
import type { AnalysisCard, Chart } from '../lib/analysis/categories';

export function SectionSkeleton({ cards }: { cards: AnalysisCard[] }) {
  const p = usePalette();
  // Matches what the section itself renders with nothing to chart.
  if (!cards.length) return <Text style={{ color: p.textDim }}>No data logged yet for this category.</Text>;
  return <>{cards.map((c, i) => <CardSkeleton key={i} card={c} />)}</>;
}

/* Text styles lifted verbatim from `CardView` — the invisible samples must be
 * styled exactly like the real runs or the skeleton mis-measures. */
const STAT_VALUE: TextStyle = { fontSize: 25, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] };
const STAT_LABEL: TextStyle = { fontSize: 12 };
const METRIC_LABEL: TextStyle = { fontSize: 12, fontWeight: '600' };
const METRIC_VALUE: TextStyle = { fontSize: 25, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] };
const LEGEND_LABEL: TextStyle = { fontSize: 12, fontWeight: '600' };
const BAR_TEXT: TextStyle = { fontSize: 15 };
const INSIGHT_TEXT: TextStyle = { fontSize: 14, lineHeight: 18 };
/** Stand-in for a number: same digits either way, so width reads as plausible. */
const NUM = '888';

/** Rendered height of a chart, so the skeleton reserves what the real one takes.
 *  Mirrors the sizes in `charts.tsx` and the header rules in `CardView`. */
const CHART_HEADER_H = 20;   // readout row: 16 + 4 margin
const LINE_H = 140;          // LineChart default
const DUMBBELL_H = 180 + 37; // BpDumbbell default + its own big readout line
const BUCKETS_H = 124;       // the StackedBars above a bars group
function chartHeight(ch: Chart, headerless: boolean): number {
  if (ch.dumbbell) return DUMBBELL_H;
  return LINE_H + (ch.selectStat || headerless ? 0 : CHART_HEADER_H);
}

/** Inert copy of the `FilterLinks` row (BP period / ortho transition): the
 *  labels are fixed chrome, so they stay real — only the interaction is gone. */
function FilterLinksGhost({ labels }: { labels: string[] }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 }}>
      {labels.map((l, i) => (
        <View key={l} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: i === 0 ? '#fff' : p.textDim }}>{l}</Text>
          <View style={{ height: 2, borderRadius: 1, alignSelf: 'stretch', marginTop: 3, backgroundColor: i === 0 ? '#fff' : 'transparent' }} />
        </View>
      ))}
    </View>
  );
}

function CardSkeleton({ card }: { card: AnalysisCard }) {
  const p = usePalette();
  // Filtered cards default to their "all" variant, which is what mounts.
  const ortho = card.orthoFilter ? card.orthoFilter.all : null;
  const stats = ortho ? ortho.stats : (card.stats ?? []);
  const charts = ortho ? ortho.charts : (card.charts ?? []);
  const insights = ortho ? ortho.insights : (card.insights ?? []);
  const metricsRow = ortho ? ortho.metricsRow : card.metricsRow;
  const selChart = charts.find((c) => c.selectStat);
  const showZonesLink = !!selChart?.zones || !!metricsRow?.zones;
  // `card.sub` is often the range label ("last 30 days"), which the veil would
  // show stale — only the static description survives into the skeleton.
  const desc = card.desc;

  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {card.cat ? <Ghost w={10} h={10} r={5} style={{ marginRight: 7 }} /> : null}
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{card.title}</Text>
        {card.help ? <HelpDot title={card.title} text={card.help} /> : null}
        {showZonesLink ? (
          <>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: p.accent }}>Show zones</Text>
          </>
        ) : null}
      </View>

      {card.tiles && desc ? <Desc text={desc} /> : null}

      {stats.length ? (
        card.tiles ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 6 }}>
            {stats.map((s, i) => (
              <View key={i} style={{ flex: 1, minWidth: 96, backgroundColor: p.bg, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 }}>
                <TextGhost style={STAT_VALUE} sample={NUM} w={52} />
                <View style={{ marginTop: 2 }}><TextGhost style={STAT_LABEL} sample={s.label} w="80%" inset={2} r={4} /></View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 12, marginTop: 8 }}>
            {stats.map((s, i) => (
              <View key={i}>
                <TextGhost style={STAT_VALUE} sample={NUM} w={52} />
                <View style={{ marginTop: 2 }}><TextGhost style={STAT_LABEL} sample={s.label} inset={2} r={4} /></View>
              </View>
            ))}
          </View>
        )
      ) : null}

      {card.bpFilter ? <FilterLinksGhost labels={['All', 'Morning', 'Evening']} /> : null}

      {!card.tiles && desc ? <Desc text={desc} /> : null}

      {metricsRow ? (
        // The real row is `alignItems: 'flex-end'` with the suffix beside it;
        // the metrics themselves set its height, so the suffix is left out.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28, marginTop: 12 }}>
          {metricsRow.metrics.map((m, i) => (
            <View key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {m.color ? <Ghost w={9} h={9} r={5} /> : null}
                <TextGhost style={METRIC_LABEL} sample={m.label} inset={2} r={4} />
              </View>
              <View style={{ marginTop: 3 }}><TextGhost style={METRIC_VALUE} sample={NUM} w={52} /></View>
            </View>
          ))}
        </View>
      ) : null}

      {card.orthoFilter ? <FilterLinksGhost labels={['All', 'Lay→stand', 'Sit→stand', 'Stairs']} /> : null}

      {charts.map((ch, i) => (
        <View key={i} style={{ marginTop: 14 }}>
          {ch.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{ch.label}</Text> : null}
          <Ghost h={chartHeight(ch, !!metricsRow)} r={radius.control} style={{ opacity: 0.55 }} />
          {ch.legend ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
              {ch.legend.map(([name]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ghost w={9} h={9} r={5} />
                  <TextGhost style={LEGEND_LABEL} sample={name} inset={2} r={4} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      {(card.bars ?? []).map((bg, i) => (
        <View key={i} style={{ marginTop: 14 }}>
          {bg.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{bg.label}</Text> : null}
          {i === 0 && card.barBuckets ? (
            <Ghost h={BUCKETS_H + CHART_HEADER_H} r={radius.control} style={{ opacity: 0.55, marginBottom: 4 }} />
          ) : null}
          {bg.rows.map((r, ri) => (
            // Matching a `Bars` row: name column, track, count — all ghosted
            // (the row names are the logged types, i.e. data).
            <View key={ri} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <View style={{ width: '38%' }}><TextGhost style={BAR_TEXT} sample={r.name} w="85%" /></View>
              <View style={{ flex: 1 }}><Ghost h={8} r={999} /></View>
              <View style={{ width: 40 }}><TextGhost style={BAR_TEXT} sample={NUM} /></View>
            </View>
          ))}
        </View>
      ))}

      {insights.map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginTop: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: p.border }} />
          {/* Insight copy is one or two lines; two is the common case. */}
          <View style={{ flex: 1 }}><TextGhost style={INSIGHT_TEXT} sample={'\u00A0\n\u00A0'} w="92%" /></View>
        </View>
      ))}
    </View>
  );
}

function Desc({ text }: { text: string }) {
  const p = usePalette();
  return <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{text}</Text>;
}
