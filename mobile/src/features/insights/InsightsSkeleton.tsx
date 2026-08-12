/**
 * The placeholder Insights shows while its report is being built.
 *
 * Built the way `../ProgressSkeleton` is, for the same reason: a skeleton whose
 * height doesn't match what it becomes just moves the jank from the transition to
 * the moment the content lands. Three rules, and they are what make the difference
 * between this and a stack of grey boxes:
 *
 * 1. HEIGHT IS NEVER GUESSED. Every measurement comes from `./style`, which
 *    ../insights/Sections imports too, so the containers cannot drift apart. Text
 *    reserves its height through `TextGhost`, which lays the block over an
 *    invisible copy of the real string in the real style and lets font metrics and
 *    wrapping do the measuring — so a two-line headline reserves two lines.
 * 2. CHROME STAYS REAL. Anything whose text never depends on the data is rendered
 *    for real, not ghosted: the section headings, "Computed on device", the
 *    "BIGGEST CHANGE THIS MONTH" eyebrow, "Before" / "After" / "Confidence", the
 *    driver→metric arrow, "Show all", and the standing footer disclaimer. Those
 *    pieces then do not move at all when the report arrives.
 * 3. THE SHAPE IS REMEMBERED. How many correlations, observations and trend rows
 *    the user last saw is kept in `../../lib/insights/shape`, so the skeleton is
 *    the right LENGTH as well as the right density. Without it a user with two
 *    findings gets a five-row skeleton and the page collapses under them.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Ghost, TextGhost } from '../../components/ui';
import { usePalette } from '../../theme';
import { CHANGE_EYEBROW, FOOTER_COPY, PairArrow, Panel, Row, SectionLabel } from './Sections';
import * as S from './style';
import type { InsightsShape } from '../../lib/insights/shape';

/** A ghost sized to a real string in its real style. */
function TG({ style, sample, w }: { style: object; sample: string; w?: number | `${number}%` }) {
  return <TextGhost style={style} sample={sample} w={w} inset={2} r={5} />;
}

/** Reserves the confidence pips' row without lighting any of them. */
function PipsGhost({ width = S.PIP_W }: { width?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2, 3, 4].map((i) => <Ghost key={i} w={width} h={S.PIP_H} r={999} />)}
    </View>
  );
}

/** The headline card. Eyebrow, bar labels and "Confidence" are real. */
function ChangeGhost() {
  const p = usePalette();
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: S.EYEBROW_GAP }}>
        <Text style={[S.EYEBROW, { color: p.textDim }]}>{CHANGE_EYEBROW}</Text>
      </View>
      <View style={{ marginBottom: S.HEADLINE_GAP }}><TG style={S.HEADLINE} sample={S.SAMPLE.headline} w="92%" /></View>
      <View style={{ marginBottom: S.BODY_GAP }}><TG style={S.BODY} sample={S.SAMPLE.body} /></View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: S.BARS_GAP }}>
        {['Before', 'After'].map((label) => (
          <View key={label} style={{ flex: 1 }}>
            <Text style={[S.BAR_LABEL, { color: p.textDim, marginBottom: S.BAR_LABEL_GAP }]}>{label}</Text>
            <Ghost h={S.BAR_H} r={999} w={label === 'Before' ? '62%' : '100%'} />
            <View style={{ marginTop: S.BAR_VALUE_GAP }}><TG style={S.BAR_VALUE} sample={S.SAMPLE.barValue} w={84} /></View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_PAD }}>
        <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PipsGhost width={S.PIP_W_WIDE} />
          <TG style={S.CONF_WORD} sample={S.SAMPLE.confWord} w={68} />
        </View>
      </View>
    </Panel>
  );
}

/** A correlation row. The arrow between driver and metric is real. */
function CorrelationGhost() {
  return (
    <Row>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: S.PAIR_GAP }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          <View style={{ flexShrink: 1 }}><TG style={S.PAIR_TEXT} sample={S.SAMPLE.driver} /></View>
          <PairArrow />
          <TG style={S.PAIR_TEXT} sample={S.SAMPLE.metric} w={46} />
        </View>
        <TG style={S.R_VALUE} sample={S.SAMPLE.rValue} w={50} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <PipsGhost />
        <View style={{ flex: 1 }}><TG style={S.ROW_NOTE} sample={S.SAMPLE.rowNote} w="88%" /></View>
      </View>
    </Row>
  );
}

/** A "worth a look" row: a title line over a wrapped body, no glyph. */
function ObservationGhost() {
  return (
    <Row>
      <View style={{ marginBottom: S.OBS_TITLE_GAP }}><TG style={S.OBS_TITLE} sample={S.SAMPLE.obsTitle} w="78%" /></View>
      <TG style={S.OBS_BODY} sample={S.SAMPLE.obsBody} />
    </Row>
  );
}

/** A trend watch row, including the sparkline's exact footprint. */
function WatchGhost() {
  const p = usePalette();
  return (
    <View style={[S.WATCH_ROW, { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: p.sunk, borderColor: p.border }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TG style={S.WATCH_TITLE} sample={S.SAMPLE.watchTitle} w="58%" />
        <View style={{ marginTop: S.WATCH_TITLE_GAP }}><TG style={S.WATCH_SUB} sample={S.SAMPLE.watchSub} w="80%" /></View>
      </View>
      <Ghost w={S.SPARK_W} h={S.SPARK_H} r={4} style={{ opacity: 0.55 }} />
      <TG style={S.WATCH_VALUE} sample={S.SAMPLE.watchValue} w={54} />
    </View>
  );
}

/** "Show all N" — real chrome, ghosted label because the count is data. */
function ShowAllGhost() {
  const p = usePalette();
  return (
    <View style={[S.SHOW_ALL, { borderColor: p.border }]}>
      <TG style={S.SHOW_ALL_TEXT} sample="Show all 24" w={92} />
    </View>
  );
}

/**
 * The whole placeholder document.
 *
 * `shape` comes from what the user last saw, so the row counts are theirs rather
 * than a guess. The sections themselves are conditional on it too: somebody whose
 * journal has never produced an observation should not be shown three of them
 * about to appear.
 */
export function InsightsSkeleton({ shape }: { shape: InsightsShape }) {
  const p = usePalette();
  return (
    <View accessibilityLabel="Working out your insights">
      {shape.change ? <ChangeGhost /> : null}

      {shape.correlations > 0 ? (
        <>
          <SectionLabel text="Other correlations" right="Computed on device" />
          {Array.from({ length: Math.min(shape.correlations, S.VISIBLE_ROWS) }, (_, i) => <CorrelationGhost key={i} />)}
          {shape.correlations > S.VISIBLE_ROWS ? <ShowAllGhost /> : null}
        </>
      ) : null}

      {shape.observations > 0 ? (
        <>
          <SectionLabel text="Worth a look" />
          {Array.from({ length: shape.observations }, (_, i) => <ObservationGhost key={i} />)}
        </>
      ) : null}

      {shape.watch > 0 ? (
        <>
          <SectionLabel text="Trend watch" right="Last 30 days" />
          {Array.from({ length: shape.watch }, (_, i) => <WatchGhost key={i} />)}
        </>
      ) : null}

      {/* Fixed copy, so it is rendered for real and never moves. */}
      <Text style={[S.FOOTER_TEXT, { color: p.textDim, marginTop: S.FOOTER_TOP, marginBottom: S.FOOTER_BOTTOM }]}>{FOOTER_COPY}</Text>
    </View>
  );
}

/**
 * What the view says when the engine genuinely found nothing.
 *
 * Distinct from the skeleton on purpose: "we are still looking" and "there is not
 * enough here yet" are different facts, and dressing the second as the first
 * leaves people waiting for a screen that will never fill in. It names the actual
 * requirement rather than asking vaguely for more data.
 */
export function InsightsEmpty({ daysLogged }: { daysLogged: number }) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 28, alignItems: 'center' }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
        Nothing solid to report yet
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
        {`You have ${daysLogged} ${daysLogged === 1 ? 'day' : 'days'} logged. Finding a pattern needs at least eight days with a thing and eight without it, so this screen fills in as you go. Nothing is hidden behind a threshold: when there is something real here, it appears.`}
      </Text>
    </View>
  );
}
