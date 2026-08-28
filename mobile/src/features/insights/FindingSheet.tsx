/**
 * ONE finding, opened: the claim's own numbers, then the days behind them.
 *
 * Every row on the Insights screen is a compressed sentence — "Liquid IV → Water
 * consumption, +0.4 L". This is where that sentence is checked. It wears the
 * Biggest change card's own shape at the top (three stat tiles and the confidence
 * strip) so a finding looks the same wherever it is read, and then draws the thing
 * neither the row nor the card can: the outcome day by day, with the days the
 * factor was present shaded behind it. The claim is a comparison of two groups of
 * days, and this is those two groups.
 *
 * The chart draws `insights/detail`'s columns and nothing else. It must not
 * re-extract the metric from the journal: a second extraction is a second chance
 * to disagree with the statistics the tiles are showing, and a chart that
 * contradicts its own headline is worse than no chart.
 *
 * Three rules the shading follows, all from ./detail:
 *   · An UNKNOWN day is never shaded. Before someone started logging supplements,
 *     every day is unknown — shading those as "didn't take it" would invent the
 *     comparison the whole engine refuses to invent.
 *   · A continuous factor is split at its own median ("more water than usual"),
 *     because a shaded day has to mean something and there is no fixed target that
 *     means the same thing for everybody.
 *   · A lag is NOT applied to the shading. A next-day association is still drawn
 *     against the day the user did the thing, because that is the day they
 *     recognise; the header says which lag it was.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { LineChart, ZonesToggle } from '../../components/charts';
import { Icon } from '../../components/Icon';
import { Section, SectionHead } from '../../components/summary';
import { usePalette, GRADE_COLORS, radius } from '../../theme';
import { fmtShort } from '../../lib/dates';
import { acBandZones, acScoreZones, onDay } from '../../lib/analysis/buckets';
import { TREND_METRICS } from '../../lib/trends';
import { markColumn, type BiggestChange, type Correlation, type DetailSeries, type WatchItem } from '../../lib/insights';
import { CorrelationsAiButton, FindingCard, type FindingTile } from './Sections';
import * as S from './style';

const GOOD = S.GOOD;

/** The shaded days. Violet, the palette's one "noticed, not graded" colour: the
 *  factor is neither good nor bad in itself, and tinting it green or red would
 *  pre-judge the very thing the chart is being read to decide. */
const MARK = GRADE_COLORS.warning;

/**
 * The one line that has to be read before the numbers below it.
 *
 * Everything under it compares two groups of days, and the engine's copy stays
 * associational for that reason ("magnesium days show higher RMSSD", never
 * "magnesium raises it"). But three big numbers, a confidence strip and a shaded
 * chart read as proof, and the app cannot know what else was true on those days.
 *
 * It LEADS rather than closes, because a caveat under the chart arrives after the
 * conclusion has been drawn. It is one sentence, because a paragraph here is
 * scrolled past and takes the finding's own numbers below the fold with it. Not on
 * the Trend watch sheet: that claim is one metric against its own past, with no
 * second variable to mistake for a cause.
 */
function CausationNote() {
  const p = usePalette();
  return (
    <View style={{
      flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 11, marginBottom: 12,
      borderRadius: radius.card, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border,
    }}>
      <Icon name="info" size={15} color={p.textDim} />
      <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 17, color: p.textDim }}>
        Correlation is not causation. Treat this as a lead to test, not an answer.
      </Text>
    </View>
  );
}

/* ---------- the shared body ---------- */

/**
 * The chart card: the outcome by day, the factor's days shaded behind it.
 *
 * Selection is parent-owned in exactly the Progress pattern — `hideHeader` on the
 * chart, an index in state, and a header that mirrors it — so scrubbing moves the
 * readout above the plot rather than drawing a second one inside it. The readout
 * also says whether the selected day was one of the shaded ones, which is the
 * question somebody scrubbing this chart is actually asking.
 */
function EvidenceChart({ series, good, trendLine, desc }: {
  series: DetailSeries;
  good: boolean;
  /** Draw a straight least-squares fit over the whole range. Trend watch turns it
   *  on: its claim IS the direction of travel, and a 60-day trace of a noisy
   *  metric cannot be read for one by eye. A correlation's chart does not, because
   *  its claim is about two GROUPS of days and a line through time would invite a
   *  second, different reading of the same picture. */
  trendLine?: boolean;
  /** Overrides the chart's standing sentence. */
  desc?: string;
}) {
  const p = usePalette();
  const [sel, setSel] = useState<number | null>(null);
  const [showZones, setShowZones] = useState(false);
  const def = TREND_METRICS[series.metric];
  const marks = markColumn(series);
  // The metric's OWN grade ladder, named in the trend registry — never a set of
  // boundaries invented here. A metric with no defensible ladder (litres of
  // water, a count of movements) simply has no zones and no link to show, which
  // is the same rule the Progress cards follow.
  const zones = def.bands ? (def.bands === 'score' ? acScoreZones() : acBandZones(def.bands)) : null;

  const last = (() => { for (let i = series.values.length - 1; i >= 0; i--) if (series.values[i] != null) return i; return -1; })();
  const at = sel != null && sel >= 0 && sel < series.values.length && series.values[sel] != null ? sel : last;
  if (at < 0) return null;
  const value = series.values[at] as number;
  const onThatDay = marks[at];

  const buckets = series.keys.map((k) => ({ label: fmtShort(k) }));
  const shadedLabel = series.factorLabel
    ? series.factorKind === 'continuous'
      ? `Shaded: days with more ${series.factorLabel.toLowerCase()} than usual`
      : `Shaded: days you logged ${series.factorLabel.toLowerCase()}`
    : null;

  return (
    <Section>
      <SectionHead
        title={def.label}
        value={def.fmt(value)}
        unit={series.unit}
        when={onDay(fmtShort(series.keys[at]))}
        right={zones ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : undefined}
        desc={
          desc ??
          (series.lag === 1
            ? 'Each point is one day. The association was found in the NEXT day’s reading, so a shaded day is the day before the one it moved.'
            : 'Each point is one day.')
        }
      />
      <View style={{ marginTop: 10 }}>
        <LineChart
          buckets={buckets}
          series={[{ values: series.values, color: good ? GOOD : p.accent }]}
          zones={zones}
          zonesOn={showZones}
          marks={marks}
          markColor={MARK}
          divider={series.onsetIndex}
          trendLine={trendLine ? (good ? GOOD : p.accent) : undefined}
          height={170}
          hideHeader
          onSelect={setSel}
        />
      </View>
      {shadedLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <View style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: MARK, opacity: 0.45 }} />
          <Text style={{ color: p.textDim, fontSize: 12, flexShrink: 1 }}>{shadedLabel}</Text>
        </View>
      ) : null}
      {onThatDay != null ? (
        <Text style={{ color: p.textDim, fontSize: 12, marginTop: 6 }}>
          {`${fmtShort(series.keys[at])}: ${onThatDay > 0 ? 'shaded day' : 'not a shaded day'}`}
        </Text>
      ) : null}
    </Section>
  );
}

/**
 * The sheet: what was found, then the days it was found in, then the hand-off.
 *
 * The finding wears `FindingCard` — the literal component the Biggest change card
 * is — rather than a second rendering of it, so the type scale, the tiles and the
 * confidence strip cannot drift between the card and the sheet it opens.
 */
interface BodyFinding {
  headline: string;
  tiles: FindingTile[];
  /** Omitted together by a finding with no statistical test behind it — see
   *  `FindingCard`. Those carry `note`. */
  pips?: number;
  confidence?: string;
  note?: string;
  good: boolean;
  series: DetailSeries | null;
  trendLine?: boolean;
  chartDesc?: string;
}

function Body({ title, intro, findings, footer }: {
  title: string;
  /** Rendered between the title and the first card. `CausationNote` on the two
   *  association sheets; nothing on Trend watch. */
  intro?: React.ReactNode;
  /**
   * Strongest first. A driver that moved several outcome families opens as ONE
   * sheet stacking every finding — each wearing the same card + evidence chart a
   * lone finding gets — because "quercetin helps three things" is one story and
   * three separate sheets would make the reader reassemble it.
   */
  findings: BodyFinding[];
  footer?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View>
      {/* Held clear of the sheet's own close button, which sits over the top-right
          corner of this block. */}
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3, maxWidth: '82%', marginBottom: 14 }}>{title}</Text>
      {intro}
      {findings.map((f, i) => (
        <View key={i} style={i > 0 ? { marginTop: 6 } : undefined}>
          {/* No title and no help dot: the sheet's own title names the thing one line
              above, and the card the user tapped to get here already carried the "?".
              So the card opens on the finding. `surface2` because the sheet's own
              background is `surface`. */}
          <FindingCard
            bg={p.surface2}
            headline={f.headline}
            tiles={f.tiles}
            pips={f.pips}
            confidence={f.confidence}
            note={f.note}
            good={f.good}
          />
          {f.series ? <EvidenceChart series={f.series} good={f.good} trendLine={f.trendLine} desc={f.chartDesc} /> : null}
        </View>
      ))}
      {footer}
    </View>
  );
}

/* ---------- the two entry points ---------- */

/**
 * A correlation, opened from its row.
 *
 * The tiles are the two GROUPS the test compared, in the metric's own unit, plus
 * the gap between them — the same three numbers the change card shows, asking the
 * same question of a standing association rather than of an event.
 */
export function CorrelationSheet({ findings }: { findings: { c: Correlation; series: DetailSeries | null }[] }) {
  const p = usePalette();
  const list = findings.map((f) => f.c);
  return (
    <Body
      title="Correlation details"
      intro={<CausationNote />}
      findings={findings.map(({ c, series }) => {
        const def = TREND_METRICS[c.outcome];
        const color = c.good ? GOOD : p.accent;
        return {
          headline: c.headline,
          tiles: [
            { value: def.fmt(c.low), unit: c.unit, label: c.lowLabel },
            { value: def.fmt(c.high), unit: c.unit, label: c.highLabel, color },
            { value: c.deltaValue, unit: c.unit, label: 'Difference', color },
          ],
          pips: c.pips,
          confidence: c.confidence,
          good: c.good,
          series,
        };
      })}
      // The same hand-off the full list ends with, narrowed to this driver's
      // findings: the device can rank an association but cannot tell the user
      // which confound explains it, which is the whole reason that button exists.
      footer={
        <CorrelationsAiButton
          list={list}
          change={null}
          label={list.length > 1 ? 'Get AI Insights on these findings' : 'Get AI Insights on this correlation'}
        />
      }
    />
  );
}

/** The Biggest change card, opened. Its tiles are already computed for the card,
 *  so they are reused verbatim rather than rebuilt from the raw numbers. */
export function ChangeSheet({ change, series }: { change: BiggestChange; series: DetailSeries | null }) {
  const p = usePalette();
  const color = change.good ? GOOD : p.accent;
  return (
    <Body
      title="Correlation details"
      // An onset is a before/after rather than an on/off, but it is the same kind
      // of claim: the weeks after someone started something differ from the weeks
      // before in more than the one thing they started.
      intro={<CausationNote />}
      findings={[{
        headline: change.headline,
        tiles: [
          { value: change.beforeValue, unit: change.unit, label: change.beforeLabel },
          { value: change.afterValue, unit: change.unit, label: change.afterLabel, color },
          { value: change.changeValue, unit: change.changeUnit, label: 'Change', color },
        ],
        pips: change.pips,
        confidence: change.confidence,
        good: change.good,
        series,
      }]}
    />
  );
}

/**
 * A Trend watch row, opened.
 *
 * This card used to hand off to Progress — it switched tab, forced the range to
 * Month and scrolled to a section, which is three surprises for one tap and left
 * the reader in a different view holding a different question. It now opens where
 * every other Insights row opens: the claim's own numbers, then the days behind
 * them, in the same card the Biggest change and a correlation wear.
 *
 * The two differences from a correlation, both of them from what the claim IS:
 *   · No confidence strip. A windowed median against the window before it is not
 *     a hypothesis test, so the card states its COVERAGE instead of inventing a
 *     confidence for the sake of the layout.
 *   · A trend line. The claim is a direction of travel across 60 days of a noisy
 *     daily metric, which is exactly what the trace alone cannot be read for.
 */
export function WatchSheet({ item }: { item: WatchItem }) {
  const p = usePalette();
  const color = item.good ? GOOD : p.accent;
  const def = TREND_METRICS[item.metric];
  // The columns the comparison was computed from, in the shape the shared chart
  // reads. There is no factor here, so nothing is shaded: the divider at the
  // window boundary is the whole annotation, and it is the split the claim rests on.
  const series: DetailSeries = {
    keys: item.keys,
    values: item.series,
    on: item.keys.map(() => null),
    factorKind: null,
    factorLabel: null,
    metric: item.metric,
    metricLabel: def.label,
    unit: item.unit,
    onsetIndex: item.splitIndex > 0 && item.splitIndex < item.keys.length ? item.splitIndex : null,
    lag: 0,
  };
  const tiles: FindingTile[] = [
    { value: item.beforeValue, unit: item.unit, label: item.beforeLabel },
    { value: item.afterValue, unit: item.unit, label: item.afterLabel, color },
  ];
  // A dispersion metric gets no change tile: its delta is a change in scatter,
  // which is not a quantity anybody can picture (see lib/trends).
  if (item.changeValue) tiles.push({ value: item.changeValue, unit: item.unit, label: 'Change', color });

  return (
    <Body
      title={`${item.title} trend`}
      findings={[{
        headline: item.sub,
        tiles,
        note: `${item.recentN} logged ${item.recentN === 1 ? 'day' : 'days'} vs ${item.priorN} the month before`,
        good: item.good,
        series,
        trendLine: true,
        chartDesc: 'Each point is one day. The dashed line is the overall direction across the range; the vertical rule is where last month begins.',
      }]}
    />
  );
}
