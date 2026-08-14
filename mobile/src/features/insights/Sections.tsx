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
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, type IconName } from '../../components/Icon';
import { HelpDot } from '../../components/ui';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { fonts, radius, usePalette } from '../../theme';
import { getState } from '../../store/store';
import { useTier } from '../../store/tier';
import { usePaywall } from '../Paywall';
import { PromptSheet } from '../PromptSheet';
import { demoState, hasOwnData } from '../../lib/demo';
import { resolveProtocol } from '../../lib/scoring/day';
import { buildCorrelationsPrompt } from '../../lib/insights/prompt';
import { INSIGHTS_HELP, VISIBLE_CORRELATIONS } from '../../lib/insights';
import type { BiggestChange, ConfidencePart, Correlation, DataConfidence, DetailSeries, Observation, WatchItem } from '../../lib/insights';
import { ChangeSheet, CorrelationSheet } from './FindingSheet';
import * as S from './style';

const GOOD = S.GOOD;
const ROW_BG = S.ROW_BG;

/** Card descriptions, exported so ./InsightsSkeleton renders the SAME strings and
 *  the copy cannot move when the report lands. */
export const OBS_DESC = 'Smaller patterns and gaps the app noticed while you were logging.';
export const WATCH_DESC = 'Metrics that have genuinely moved over the last month, against the month before it.';

/* ---------- the card shell ---------- */

/**
 * One Insights card: the shell every section wears.
 *
 * Deliberately the same header shape as `CardView`: title, help dot, right-hand
 * action.
 */
export function InsightCard({ title, help, desc, action, onAction, onPress, onLayout, bg, children }: {
  /** Omitted inside a sheet whose own title already names the thing: a card
   *  headed "CORRELATION" one line under "Correlation details" is a label for a
   *  label. Without it the card opens on the finding itself. */
  title?: string;
  /** Omitted inside a sheet the user opened FROM a card that already carried the
   *  help dot: explaining the same thing twice, one tap apart, is clutter. */
  help?: keyof typeof INSIGHTS_HELP;
  /**
   * Measures the CARD, not a wrapper around it.
   *
   * This distinction was a real 12pt-per-card bug: `S.CARD` carries
   * `marginBottom: 12`, and a wrapper's frame includes a child's margin while the
   * child's own frame does not. Measuring the wrapper and then applying that height
   * to the card made every skeleton card 12pt too tall — 48pt of shift down the page.
   */
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The card's plain-language sentence. Omitted by the Biggest change card, which
   *  leads with the finding itself rather than a standing description. */
  desc?: string;
  /** Red text action on the right of the title, e.g. "Show all". */
  action?: string;
  onAction?: () => void;
  /** Makes the WHOLE card a button, with a chevron in its title row. Used by the
   *  Biggest change card, whose finding opens the same sheet a correlation does. */
  onPress?: () => void;
  /** Overrides the card fill. A sheet's own background IS `surface`, so a card
   *  left at the default vanishes into it. */
  bg?: string;
  children?: React.ReactNode;
}) {
  const p = usePalette();
  const inner = (
    <>
      {title ? (
        <View style={S.CARD_HEAD}>
          <Text style={[S.CARD_TITLE, { color: p.textDim }]}>{title}</Text>
          {help ? <HelpDot title={title} text={INSIGHTS_HELP[help]} /> : null}
          {action || onPress ? <View style={{ flex: 1 }} /> : null}
          {action ? (
            <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
              <Text style={[S.CARD_ACTION, { color: p.accent }]}>{action}</Text>
            </Pressable>
          ) : null}
          {onPress && !action ? <Icon name="chevronRight" size={16} color={p.textDim} /> : null}
        </View>
      ) : null}
      {desc ? <Text style={[S.CARD_DESC, { color: p.textDim }]}>{desc}</Text> : null}
      {children}
    </>
  );
  const style = [S.CARD, { backgroundColor: bg || p.surface, borderColor: p.border }];
  if (!onPress) return <View onLayout={onLayout} style={style}>{inner}</View>;
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="button" style={({ pressed }) => [...style, pressed && { opacity: 0.75 }]}>
      {inner}
    </Pressable>
  );
}

/** A bubble row. Tappable only when it has somewhere to go — a chevron on a row
 *  that does nothing is a promise the app doesn't keep. Exported so the empty
 *  screen's rows are the same object as a correlation row rather than a copy. */
export function CardRow({ onPress, tall, onLayout, children }: {
  onPress?: () => void;
  tall?: boolean;
  /** Reports this row's height, so the skeleton's bubble can sit exactly where it
   *  will. Every row, not just the first: observation rows genuinely differ in height. */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const p = usePalette();
  // `ROW_BG`, not `bg`: a near-black bubble on the card read as a hole rather than
  // an object, and the black track of the strength bar inside it disappeared into
  // its own row. A step above the card keeps the bar's remainder visible.
  const base = [tall ? S.ROW_TALL : S.ROW, { backgroundColor: ROW_BG, borderColor: p.border }];
  if (!onPress) return <View onLayout={onLayout} style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="button" style={({ pressed }) => [...base, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

/** The full-width action a card can end with. */
function CardButton({ label, onPress }: { label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [S.CARD_BUTTON, { borderColor: p.accent, backgroundColor: p.accent }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[S.CARD_BUTTON_TEXT, { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

/** A solid fill on a dark track: the app's one strength notation, matching the
 *  milestone progress bar. Segmented pips were a chart type nothing else used. */
function Bar({ pct, color, width, height = S.CONF_BAR_H }: { pct: number; color: string; width?: number; height?: number }) {
  const p = usePalette();
  return (
    <View style={{ width, height, borderRadius: 999, backgroundColor: p.bg, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(4, Math.min(100, pct))}%`, height: '100%', borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

/** A stat tile, exactly as Progress draws one. */
function Tile({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={[S.TILE, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Text style={[S.TILE_VALUE, { fontFamily: fonts.numHeavy, color: color || p.text, fontVariant: ['tabular-nums'] }]}>
        {value}
        {unit ? <Text style={{ fontSize: 12, fontWeight: '600', color: p.textDim }}>{` ${unit}`}</Text> : null}
      </Text>
      <Text style={[S.TILE_LABEL, { color: p.textDim }]}>{label}</Text>
    </View>
  );
}

/* ---------- a finding, as a card ---------- */

export interface FindingTile { value: string; unit?: string; label: string; color?: string }

/**
 * ONE finding in card form: headline, three stat tiles, confidence strip.
 *
 * Exported because the detail sheet opens wearing this exact card, and two
 * hand-built versions of it drift the moment either is touched — which is how the
 * sheet ended up at the wrong type scale the first time. The Biggest change card
 * IS this component; a correlation's sheet is the same object with different
 * tiles.
 */
export function FindingCard({ title, help, headline, tiles, pips, confidence, good, onPress, onLayout, bg }: {
  title?: string;
  help?: keyof typeof INSIGHTS_HELP;
  headline: string;
  tiles: FindingTile[];
  pips: number;
  confidence: string;
  good: boolean;
  onPress?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  bg?: string;
}) {
  const p = usePalette();
  const color = good ? GOOD : p.accent;
  return (
    <InsightCard title={title} help={help} onLayout={onLayout} onPress={onPress} bg={bg}>
      {/* The finding leads and stands alone. This card has no standing description
          and no explanatory paragraph: the headline IS the sentence, and anything
          above or below it pushes the one thing worth reading down the card. */}
      <Text style={[S.HEADLINE, { color: p.text }, !title && { marginTop: 0 }]}>{headline}</Text>
      <View style={S.TILE_ROW}>
        {tiles.map((t) => <Tile key={t.label} value={t.value} unit={t.unit} label={t.label} color={t.color} />)}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_TOP }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.CONF_GAP }}>
          <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
          <Text style={[S.CONF_LABEL, { color, fontWeight: '700' }]}>{confidence}</Text>
        </View>
        <Bar pct={(pips / 5) * 100} color={color} />
      </View>
    </InsightCard>
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
          <Text numberOfLines={1} style={[S.PAIR_METRIC, { color: p.text, flexShrink: 1 }]}>{c.metric}</Text>
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
  const visible = list.slice(0, VISIBLE_CORRELATIONS);
  const more = list.length > visible.length;
  return (
    // No description: the rows say what they are, and the sentence only pushed the
    // findings down the card. No "Show all" link in the title either — the count is
    // worth stating, and a full-width button at the end reads as the end of the list
    // rather than as a header control.
    <InsightCard title="Correlations" help="correlations" onLayout={onLayout}>
      {visible.map((c, i) => (
        <CorrelationRow
          key={c.id}
          c={c}
          onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}
          onPress={() => openSheet(() => <CorrelationSheet c={c} series={detail[c.id] || null} />)}
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
  return (
    <View>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>All correlations</Text>
      {/* Held clear of the sheet's own close button, which sits over the
          top-right corner of this block. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 16, maxWidth: '82%' }}>
        {`${list.length} associations found in your own log, most trusted first. Each number is the typical difference between the two groups in that metric's own units. These are patterns, not causes.`}
      </Text>
      {list.map((c) => (
        <CorrelationRow
          key={c.id}
          c={c}
          onPress={() => openSheet(() => <CorrelationSheet c={c} series={detail[c.id] || null} />)}
        />
      ))}
      <View style={{ height: 16 }} />
      <CorrelationsAiButton list={list} change={change} />
    </View>
  );
}

/**
 * "Get AI Insights on these correlations" — the same row `src/components/summary`
 * puts under a reading, a workout and a POTS event, so the affordance is the one
 * the user has already met three times elsewhere.
 */
export function CorrelationsAiButton({ list, change, label }: {
  list: Correlation[];
  change: BiggestChange | null;
  /** Defaults to the plural. The detail sheet passes the singular, since it is
   *  handing over exactly one finding. */
  label?: string;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const tier = useTier();
  const openPaywall = usePaywall();
  const open = () => {
    if (tier === 'free') { openPaywall(); return; }
    const s = getState();
    const state = hasOwnData(s.days) ? s : demoState(s);
    const ctx = {
      sex: state.profile.sex,
      height: state.profile.height,
      protocol: resolveProtocol(state.settings.protocol),
      customTypes: state.customTypes,
    };
    const { prompt, rangeText } = buildCorrelationsPrompt(state, ctx, list, change);
    openSheet((c) => <PromptSheet title="Correlation Insights" rangeText={rangeText} prompt={prompt} controls={c} />);
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
          borderWidth: 1, borderRadius: radius.control, backgroundColor: p.surface2, borderColor: p.border,
          paddingVertical: 13, marginBottom: 12,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name="ai" size={19} color={p.accent} />
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{label || 'Get AI Insights on these correlations'}</Text>
    </Pressable>
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

export function TrendWatch({ list, onPress, canOpen, onRowLayout, onLayout }: {
  list: WatchItem[];
  onPress: (item: WatchItem) => void;
  /** Whether this row has a Progress chart to land on. A metric with no section
   *  mapped is not tappable and draws no chevron: the alternative is a row that
   *  looks like a button and does nothing. */
  canOpen?: (item: WatchItem) => boolean;
  onRowLayout?: (i: number, e: LayoutChangeEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const p = usePalette();
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
        const open = !canOpen || canOpen(t);
        return (
          <CardRow
            key={t.metric}
            onPress={open ? () => onPress(t) : undefined}
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
            {open ? <Icon name="chevronRight" size={16} color={p.textDim} /> : null}
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
