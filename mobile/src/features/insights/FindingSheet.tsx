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
import { Section, SectionHead } from '../../components/summary';
import { usePalette, GRADE_COLORS } from '../../theme';
import { fmtShort } from '../../lib/dates';
import { acBandZones, acScoreZones, onDay } from '../../lib/analysis/buckets';
import { TREND_METRICS } from '../../lib/trends';
import { markColumn, type BiggestChange, type Correlation, type DetailSeries } from '../../lib/insights';
import { CorrelationsAiButton, FindingCard, type FindingTile } from './Sections';
import * as S from './style';

const GOOD = S.GOOD;

/** The shaded days. Violet, the palette's one "noticed, not graded" colour: the
 *  factor is neither good nor bad in itself, and tinting it green or red would
 *  pre-judge the very thing the chart is being read to decide. */
const MARK = GRADE_COLORS.warning;

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
function EvidenceChart({ series, good }: { series: DetailSeries; good: boolean }) {
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
          series.lag === 1
            ? 'Each point is one day. The association was found in the NEXT day’s reading, so a shaded day is the day before the one it moved.'
            : 'Each point is one day.'
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
  pips: number;
  confidence: string;
  good: boolean;
  series: DetailSeries | null;
}

function Body({ title, findings, footer }: {
  title: string;
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
            good={f.good}
          />
          {f.series ? <EvidenceChart series={f.series} good={f.good} /> : null}
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
