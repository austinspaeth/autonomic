/**
 * The Insights view's content: four cards, in Progress's card grammar.
 *
 * WHAT CHANGED AND WHY, because the previous build read as a different app: every
 * section used to be a floating uppercase label over a stack of separate
 * mini-cards, which nothing else here does. Each section is now ONE card holding
 * its own title, a "?" help dot, an optional red text action, one plain-language
 * sentence, and then hairline-divided rows — the same object `CardView` renders on
 * Progress, and the same rows the Journal lists entries with. Card chrome, title
 * size, description size and the stat tiles all come from ./style, which lifts
 * them from `CardView` directly.
 *
 * Two deliberate departures from the Claude Design comp:
 *   · Its borderless 22pt cards on 14pt gutters are replaced by the app's bordered
 *     `radius.card` on 16pt. The comp's own notes ask for the app's grammar, and
 *     this is what that grammar is.
 *
 * These components are presentational. Every number, label and sentence arrives
 * from src/lib/insights already computed and already worded: the copy for a health
 * claim belongs next to the statistics that justify it, not in a component that
 * could quietly start rounding differently.
 */
import React, { useMemo } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, type IconName } from '../../components/Icon';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { fonts, usePalette } from '../../theme';
import { VISIBLE_CORRELATIONS, groupCorrelations } from '../../lib/insights';
import type { BiggestChange, ConfidencePart, Correlation, DataConfidence, DetailSeries, NoImpactItem, Observation, PressureInsight, WatchItem } from '../../lib/insights';
import { pressureHeadline } from '../../lib/insights/pressureCopy';
import { TREND_METRICS } from '../../lib/trends';
import { ChangeSheet, CorrelationSheet, PressureSheet, WatchSheet } from './FindingSheet';
import { Bar, CardButton, CardRow, CorrelationsAiButton, FindingCard, InsightCard } from './Card';
import * as S from './style';

// Re-exported so the modules that already import the card pieces from here
// (budget sheets, the skeleton, the screen) keep working unchanged.
export { CardRow, CorrelationsAiButton, FindingCard, InsightCard } from './Card';
export type { FindingTile } from './Card';

const GOOD = S.GOOD;

/** Card descriptions, exported so ./InsightsSkeleton renders the SAME strings and
 *  the copy cannot move when the report lands. */
export const OBS_DESC = 'Smaller patterns and gaps the app noticed while you were logging.';
export const NO_IMPACT_DESC = 'Things you have taken long enough to test that show no measurable effect on anything tracked here. Absence of a detected effect, not proof of none.';
export const WATCH_DESC = 'Metrics that have genuinely moved over the last month, against the month before it.';


/**
 * The barometric pressure card: the Biggest change card's own shape, over the
 * strongest pressure link, the whole card a button into `PressureSheet`.
 *
 * It exists only once a link has been found and it then stays (see
 * `PressureInsight`), so unlike every other card here it is never a row in a list:
 * it is one standing claim about this person, and it wears the object the app uses
 * for its single most important claim. A "+N" line says when more than one measure
 * moved, and the sheet stacks them all.
 */
export function PressureCard({ pressure, detail, onLayout }: {
  pressure: PressureInsight;
  detail: Record<string, DetailSeries>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const lead = pressure.findings[0];
  if (!lead) return null;
  const c = lead.c;
  const def = TREND_METRICS[c.outcome];
  const color = c.good ? GOOD : p.accent;
  const more = pressure.findings.length - 1;
  return (
    <FindingCard
      title="Barometric pressure"
      help="pressure"
      headline={pressureHeadline(c)}
      tiles={[
        { value: def.fmt(c.high), unit: c.unit, label: 'Low pressure days', color },
        { value: def.fmt(c.low), unit: c.unit, label: 'Other days' },
        { value: c.deltaValue, unit: c.unit, label: 'Difference', color },
      ]}
      pips={c.pips}
      confidence={c.confidence}
      note={more > 0 ? `Linked to ${more} more ${more === 1 ? 'measure' : 'measures'}, shown inside` : undefined}
      good={c.good}
      onLayout={onLayout}
      onPress={() => openSheet(() => <PressureSheet pressure={pressure} detail={detail} />)}
    />
  );
}

export function BiggestChangeCard({ change, series, onLayout }: {
  change: BiggestChange;
  /** The columns behind it. Null for the welcome card, which is fabricated and so
   *  has nothing to open. */
  series: DetailSeries | null;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const color = change.good ? GOOD : p.accent;
  // The card opens the SAME sheet a correlation row does: both are one finding,
  // and the difference between an event and an association is what the sheet
  // says, not a different place to read it.
  const open = change.kind === 'welcome' ? undefined : () => openSheet(() => <ChangeSheet change={change} series={series} />);
  return (
    <FindingCard
      title="Biggest change"
      help="change"
      headline={change.headline}
      tiles={[
        { value: change.beforeValue, unit: change.unit, label: 'Before' },
        { value: change.afterValue, unit: change.unit, label: 'After', color },
        { value: change.changeValue, unit: change.changeUnit, label: 'Change', color },
      ]}
      pips={change.pips}
      confidence={change.confidence}
      good={change.good}
      onPress={open}
      onLayout={onLayout}
    />
  );
}

/* ---------- correlations ---------- */

/** The `driver -> metric` glyph. Chrome, so the skeleton keeps it. */
export function PairArrow() {
  const p = usePalette();
  return (
    // Sized to the pair's own type (S.PAIR_DRIVER), so the two words and the arrow
    // between them read as one line rather than as text with a smaller glyph in it.
    <Svg width={S.PAIR_DRIVER.fontSize} height={S.PAIR_DRIVER.fontSize} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={p.textDim} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * ONE correlation, wherever it appears.
 *
 * Shared by the card and by the full list in the sheet, rather than each drawing its
 * own: they are the same object, so a reader who opens "Show all" should recognise the
 * rows they were just looking at, and two hand-built versions of a row drift the
 * moment either is touched. The sheet adds the associational sentence via `sub` — the
 * one thing it has room for that the card does not.
 *
 * THE READOUT IS THE DIFFERENCE, NOT THE COEFFICIENT. This row used to end in the
 * correlation itself ("+0.74"), which is not a quantity: a signed decimal with no unit
 * reads as a percentage, and even read correctly a rho is a statement about ordering
 * that nobody can act on. So the number is now the gap between the two groups' medians
 * in the metric's own unit ("+12 ms"), the bar and its word carry how good the
 * evidence is, and the coefficient survives only in the AI prompt.
 *
 * Not a button. There is no per-correlation screen to go to, and pointing the row at
 * the nearest Progress chart answered a different question than the row asked.
 */
function CorrelationRow({ c, onLayout, onPress }: {
  c: Correlation;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Opens the finding. A chevron is only drawn when this is given: on a row that
   *  goes nowhere it would be a promise the app doesn't keep. */
  onPress?: () => void;
}) {
  const p = usePalette();
  const color = c.good ? GOOD : p.accent;
  return (
    <CardRow onLayout={onLayout} onPress={onPress}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* WHAT was found, and nothing else: the pair on the left, the difference on
            the right. The strength notation that used to sit under it said the same
            thing on every row it was strong enough to survive filtering for, and
            spent a whole second line saying it. The ranking IS the strength — the
            list is ordered by it — and the sheet spells it out for a row worth
            opening. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text numberOfLines={1} style={[S.PAIR_DRIVER, { color: p.text, flexShrink: 1 }]}>{c.driver}</Text>
          <PairArrow />
          {/* Both halves of the pair are the row's subject, so both are full text;
              only the arrow between them recedes. */}
          {/* A next-day finding says so ON the row ("pNN50 next day"): the lag is
              half the claim, and it used to be spelled out only inside the sheet,
              so the row read as a same-day link it never was. */}
          <Text numberOfLines={1} style={[S.PAIR_METRIC, { color: p.text, flexShrink: 1 }]}>
            {c.metric}
            {c.lag ? <Text style={{ color: p.textDim }}> next day</Text> : null}
          </Text>
          <View style={{ flex: 1 }} />
          {/* Coloured by the DIRECTION OF IMPACT, not by the sign of the number:
              `c.good` already knows which way this metric wants to move, so a fall
              in symptoms is green and a fall in HRV is red. */}
          <Text numberOfLines={1} style={[S.R_VALUE, { color, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }]}>
            {c.deltaText}
          </Text>
        </View>
      </View>
      {onPress ? <Icon name="chevronRight" size={16} color={p.textDim} /> : null}
    </CardRow>
  );
}

export function Correlations({ list, change, detail, onRowLayout, onLayout }: {
  list: Correlation[];
  change: BiggestChange | null;
  /** The evidence columns, keyed by finding id — `InsightReport.detail`. */
  detail: Record<string, DetailSeries>;
  /** Fires per row, with its index. Feeds the skeleton's remembered row heights. */
  onRowLayout?: (i: number, e: LayoutChangeEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { openSheet } = useSheets();
  if (!list.length) return null;
  // One row per DRIVER, not per finding: a supplement that moved three metrics is
  // one story, and its sheet stacks all three. There is no "+N" badge on the row:
  // it took the width the driver and metric names needed ("Magnesiu… → RM…"), and
  // the sheet it opens already shows everything behind it. The visible
  // cap therefore counts drivers, while the button keeps the finding count —
  // "Show all 9 correlations" is a claim about findings, and it is still true.
  const groups = groupCorrelations(list);
  const visible = groups.slice(0, VISIBLE_CORRELATIONS);
  const more = groups.length > visible.length;
  return (
    // No description: the rows say what they are, and the sentence only pushed the
    // findings down the card. No "Show all" link in the title either — the count is
    // worth stating, and a full-width button at the end reads as the end of the list
    // rather than as a header control.
    <InsightCard title="Correlations" help="correlations" onLayout={onLayout}>
      {visible.map((g, i) => (
        <CorrelationRow
          key={g[0].id}
          c={g[0]}
          onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}
          onPress={() => openSheet(() => <CorrelationSheet findings={g.map((c) => ({ c, series: detail[c.id] || null }))} />)}
        />
      ))}
      {more ? (
        <CardButton
          label={`Show all ${list.length} correlations`}
          onPress={() => openSheet(() => <AllCorrelationsSheet list={list} change={change} detail={detail} />)}
        />
      ) : null}
    </InsightCard>
  );
}

/**
 * The weak tier, which answers two different empty screens and must not use one
 * voice for both.
 *
 * Only ever rendered when the Correlations card has nothing (the engine
 * guarantees `early` is empty otherwise). The rows themselves wear no badge — the
 * card's title and description carry the qualifier, and a pill on every row inside
 * a card that already says it would say it twice while costing the pair labels the
 * width they need. Each row opens the same finding sheet a correlation does, whose
 * confidence strip shows the single bar these are pinned to.
 *
 * The two variants differ in WHY they are hedged, and the caveat has to say the
 * true one. `'early'` is a young journal: there isn't much data yet and most of
 * these will fade, which is a promise that the screen improves. `'unconfirmed'`
 * is a long journal where the sweep cleared the board: these rows have all the
 * days they need and simply did not survive the false-discovery correction, so
 * the caveat is that they are questions rather than answers. Telling somebody
 * eighty days in that these are "first hints from your first days" would be
 * false about their journal and would misplace the reason for the hedge.
 */
export const EARLY_DESC = 'First hints from your first days of logging. These are held to a much lower bar than a correlation, and most will fade as more days arrive.';
export const UNCONFIRMED_DESC = 'Patterns in your data that did not clear the bar we hold a correlation to. Worth a question, not a conclusion. They may firm up, or disappear, as you keep logging.';

export function EarlySignals({ list, detail, onLayout }: {
  list: Correlation[];
  detail: Record<string, DetailSeries>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { openSheet } = useSheets();
  if (!list.length) return null;
  // One tier per build — the engine never mixes them — so the first row decides.
  const unconfirmed = list[0].tier === 'unconfirmed';
  return (
    <InsightCard
      title={unconfirmed ? 'Unconfirmed patterns' : 'Early signals'}
      help="early"
      desc={unconfirmed ? UNCONFIRMED_DESC : EARLY_DESC}
      onLayout={onLayout}
    >
      {list.map((c) => (
        <CorrelationRow
          key={c.id}
          c={c}
          onPress={() => openSheet(() => <CorrelationSheet findings={[{ c, series: detail[c.id] || null }]} />)}
        />
      ))}
    </InsightCard>
  );
}

/**
 * The full ranked list.
 *
 * The SAME rows as the card — the same component, the same bubbles, the same type
 * scale — because this is the list continued rather than a second presentation of
 * it. Each row opens the same detail sheet, which is where the finding's own
 * sentence and its chart live; repeating the headline under every row here made a
 * row that reads differently depending on which screen it is on. It ends with the
 * AI hand-off, since the device can rank associations but cannot tell the user
 * which four of them are one underlying trend wearing different clothes.
 */
function AllCorrelationsSheet({ list, change, detail }: { list: Correlation[]; change: BiggestChange | null; detail: Record<string, DetailSeries> }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  // The same grouping the card shows: this is the list continued, so a driver that
  // was one row with a "+2" out there must not unfold into three rows in here.
  const groups = groupCorrelations(list);
  return (
    <View>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>All correlations</Text>
      {/* Held clear of the sheet's own close button, which sits over the
          top-right corner of this block. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 16, maxWidth: '82%' }}>
        {`${list.length} associations found in your own log, most trusted first. Each number is the typical difference between the two groups in that metric's own units. These are patterns, not causes.`}
      </Text>
      {groups.map((g) => (
        <CorrelationRow
          key={g[0].id}
          c={g[0]}
          onPress={() => openSheet(() => <CorrelationSheet findings={g.map((c) => ({ c, series: detail[c.id] || null }))} />)}
        />
      ))}
      <View style={{ height: 16 }} />
      <CorrelationsAiButton list={list} change={change} />
    </View>
  );
}


/* ---------- worth a look ---------- */

/**
 * Three fixed glyphs, one per tone: a check, an info circle, a warning triangle.
 *
 * An earlier build gave every probe its own icon, which was eight different
 * metaphors for "we noticed something" and so carried no information; the build
 * after that dropped icons entirely. This is the comp's answer and the better one —
 * three fixed categories, so whether a row is good news, a note, or something to
 * attend to is readable before the words are.
 */
export const TONE: Record<Observation['tone'], { icon: IconName; color: (p: { accent: string }) => string }> = {
  good: { icon: 'check', color: () => GOOD },
  watch: { icon: 'info', color: () => S.NEUTRAL },
  alert: { icon: 'alert', color: (p) => p.accent },
};

/**
 * The heuristic observations.
 *
 * Rows are NOT buttons. Each one is already a complete statement — "your morning
 * readings run higher than your evening ones" — so there is nothing behind it to go
 * and see; the chevron promised a destination that was really just the nearest
 * Progress chart, which answers a different question than the row asked.
 */
export function WorthALook({ list, onRowLayout, onLayout }: {
  list: Observation[];
  onRowLayout?: (i: number, e: LayoutChangeEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
  if (!list.length) return null;
  return (
    <InsightCard
      title="Worth a look"
      help="observations"
      onLayout={onLayout}
      desc={OBS_DESC}
    >
      {list.map((o, i) => {
        const tone = TONE[o.tone];
        const color = tone.color(p);
        return (
          // The title alone. Each observation's body is a full sentence of
          // statistics, and five of them stacked turned the card into a page of
          // prose in a view whose whole grammar is one-line rows.
          <CardRow key={o.id} onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}>
            <View style={{ width: S.TONE_BOX, height: S.TONE_BOX, borderRadius: 9, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={tone.icon} size={14} color={color} strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.ROW_TITLE, { color: p.text }]}>{o.title}</Text>
            </View>
          </CardRow>
        );
      })}
    </InsightCard>
  );
}

/* ---------- no detectable impact ---------- */

/**
 * The null results: meds and supplements that were genuinely tested and moved
 * nothing. Rows are NOT buttons — each is a complete statement, and there is no
 * evidence chart for an effect that isn't there. The help dot carries the two
 * caveats the card cannot say often enough: "no detectable effect" is not
 * "no effect", and nobody should stop a prescription over a row here.
 */
export function NoImpact({ list, onRowLayout, onLayout }: {
  list: NoImpactItem[];
  onRowLayout?: (i: number, e: LayoutChangeEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
  if (!list.length) return null;
  return (
    <InsightCard
      title="No detected impact"
      help="noImpact"
      onLayout={onLayout}
      desc={NO_IMPACT_DESC}
    >
      {list.map((item, i) => (
        <CardRow key={item.driverKey} onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text numberOfLines={1} style={[S.PAIR_DRIVER, { color: p.text, flexShrink: 1 }]}>{item.driver}</Text>
              <View style={{ flex: 1 }} />
              {/* The readout is the EVIDENCE for the null, not a judgement of it:
                  how long, tested against how much. Dim, because there is no
                  direction to colour. */}
              <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {item.note}
              </Text>
            </View>
          </View>
        </CardRow>
      ))}
    </InsightCard>
  );
}

/* ---------- trend watch ---------- */

/** A 64x26 line through the window's present values. Nulls are skipped rather
 *  than interpolated: a gap in the journal is not a value. */
function Spark({ series, color }: { series: (number | null)[]; color: string }) {
  const d = useMemo(() => {
    const pts = series.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
    if (pts.length < 2) return '';
    const W = S.SPARK_W, H = S.SPARK_H;
    const lo = Math.min(...pts.map((x) => x.v)), hi = Math.max(...pts.map((x) => x.v));
    const span = hi - lo || 1;
    const x = (i: number) => (series.length > 1 ? (i / (series.length - 1)) * W : 0);
    const y = (v: number) => 3 + (1 - (v - lo) / span) * (H - 6);
    return pts.map((pt, n) => `${n ? 'L' : 'M'}${x(pt.i).toFixed(1)} ${y(pt.v).toFixed(1)}`).join(' ');
  }, [series]);
  if (!d) return <View style={{ width: S.SPARK_W, height: S.SPARK_H }} />;
  return (
    <Svg width={S.SPARK_W} height={S.SPARK_H} viewBox={`0 0 ${S.SPARK_W} ${S.SPARK_H}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrendWatch({ list, onRowLayout, onLayout }: {
  list: WatchItem[];
  onRowLayout?: (i: number, e: LayoutChangeEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  if (!list.length) return null;
  return (
    <InsightCard
      title="Trend watch"
      help="watch"
      onLayout={onLayout}
      desc={WATCH_DESC}
    >
      {list.map((t, i) => {
        const color = t.good ? GOOD : p.accent;
        return (
          <CardRow
            key={t.metric}
            // The row opens the FINDING, exactly as a correlation row does. It used
            // to jump to Progress with a forced range and a scroll target, which is
            // a different screen answering a different question, and it left the
            // reader to find their way back. Every row on this screen now stays on
            // this screen.
            onPress={() => openSheet(() => <WatchSheet item={t} />)}
            onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}
          >
            {/* Title, sparkline, and the CHANGE — not the level. The sentence that
                used to sit under the title said the same thing in words ("Up 8.3 ms
                vs last month"), so the row said it twice and stood a line taller
                than every other row in the view. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.ROW_TITLE, { color: p.text }]}>{t.title}</Text>
            </View>
            <Spark series={t.series} color={color} />
            <Text style={[S.WATCH_VALUE, { color, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }]}>{t.change}</Text>
            <Icon name="chevronRight" size={16} color={p.textDim} />
          </CardRow>
        );
      })}
    </InsightCard>
  );
}

/* ---------- data confidence ---------- */

/** The header ring. 20pt, stroke 3, starting at twelve o'clock. */
export function ConfidenceRing({ pct, size = 20 }: { pct: number; size?: number }) {
  const p = usePalette();
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 70 ? GOOD : pct >= 40 ? '#e0a030' : p.accent;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.surface2} strokeWidth={3} />
      <Circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct / 100)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/**
 * What the ring means, and the one thing that would move it.
 *
 * Shows every component with its weight, because "63%" on its own invites the
 * reading that the DATA is 63% right rather than that 63% of it is there.
 */
export function ConfidenceSheet({ confidence }: { confidence: DataConfidence; controls?: SheetControls }) {
  const p = usePalette();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ConfidenceRing pct={confidence.pct} size={30} />
        <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>{`Data confidence ${confidence.pct}%`}</Text>
      </View>
      {/* Held clear of the sheet's own close button in the top-right corner. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 14, maxWidth: '82%' }}>
        How much of the last 30 days this screen had to work with. It measures coverage, not how healthy you are.
      </Text>
      {confidence.parts.map((part: ConfidencePart) => (
        <View key={part.key} style={{ borderTopWidth: 1, borderTopColor: p.border, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>{part.label}</Text>
            <Text style={{ color: p.textDim, fontSize: 12.5, fontWeight: '600' }}>{`${Math.round(part.ratio * 100)}% of ${Math.round(part.weight * 100)}`}</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <Bar pct={part.ratio * 100} color={part.ratio >= 0.85 ? GOOD : p.accent} height={5} />
          </View>
          <Text style={{ color: p.textDim, fontSize: 12, marginTop: 6 }}>{part.detail}</Text>
        </View>
      ))}
      {confidence.topFix ? (
        <View style={{ marginTop: 14, backgroundColor: p.accentSoft, borderRadius: 14, padding: 13 }}>
          <Text style={{ color: p.text, fontSize: 12.5, fontWeight: '700', marginBottom: 4 }}>Biggest gap</Text>
          <Text style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>{confidence.topFix}</Text>
        </View>
      ) : null}
      <View style={{ height: 10 }} />
    </View>
  );
}

/* ---------- the standing disclaimer ---------- */

export const FOOTER_COPY = 'Everything here is computed on your device from your own log. These are patterns that happen together, which is not the same as one causing the other, and none of it is medical advice.';

/**
 * Rendered once, at the foot of the view.
 *
 * Every headline above it is already worded as an association, but this is a screen
 * whose whole job is to point at things that move together, and the step from
 * "these move together" to "this caused that" is one a reader takes for free.
 * Saying so once, plainly, at the bottom is the honest cost of the feature.
 */
export function InsightsFooter() {
  const p = usePalette();
  return <Text style={[S.FOOTER_TEXT, { color: p.textDim, marginTop: S.FOOTER_TOP, marginBottom: S.FOOTER_BOTTOM }]}>{FOOTER_COPY}</Text>;
}
