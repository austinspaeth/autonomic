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
import type { BiggestChange, ConfidencePart, Correlation, DataConfidence, Observation, WatchItem } from '../../lib/insights';
import * as S from './style';

const GOOD = S.GOOD;

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
export function InsightCard({ title, help, desc, action, onAction, onLayout, children }: {
  title: string;
  help: keyof typeof INSIGHTS_HELP;
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
  children?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View onLayout={onLayout} style={[S.CARD, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={S.CARD_HEAD}>
        <Text style={[S.CARD_TITLE, { color: p.textDim }]}>{title}</Text>
        <HelpDot title={title} text={INSIGHTS_HELP[help]} />
        {action ? (
          <>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
              <Text style={[S.CARD_ACTION, { color: p.accent }]}>{action}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {desc ? <Text style={[S.CARD_DESC, { color: p.textDim }]}>{desc}</Text> : null}
      {children}
    </View>
  );
}

/** A bubble row. Tappable only when it has somewhere to go — a chevron on a row
 *  that does nothing is a promise the app doesn't keep. */
function CardRow({ onPress, tall, onLayout, children }: {
  onPress?: () => void;
  tall?: boolean;
  /** Reports this row's height, so the skeleton's bubble can sit exactly where it
   *  will. Every row, not just the first: observation rows genuinely differ in height. */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const p = usePalette();
  const base = [tall ? S.ROW_TALL : S.ROW, { backgroundColor: p.bg, borderColor: p.border }];
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
      style={({ pressed }) => [S.CARD_BUTTON, { borderColor: p.border, backgroundColor: p.surface2 }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[S.CARD_BUTTON_TEXT, { color: p.text }]}>{label}</Text>
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

/* ---------- biggest change ---------- */

export function BiggestChangeCard({ change, onLayout }: { change: BiggestChange; onLayout?: (e: LayoutChangeEvent) => void }) {
  const p = usePalette();
  const color = change.good ? GOOD : p.accent;
  return (
    <InsightCard title="Biggest change" help="change" onLayout={onLayout}>
      {/* The finding leads, then its explanation. This card has no standing
          description: the headline IS the sentence, and a fixed line above it would
          push the one thing worth reading down the card. */}
      <Text style={[S.HEADLINE, { color: p.text }]}>{change.headline}</Text>
      <Text style={[S.BODY, { color: p.textDim }]}>{change.body}</Text>
      <View style={S.TILE_ROW}>
        <Tile value={change.beforeValue} unit={change.unit} label="Before" />
        <Tile value={change.afterValue} unit={change.unit} label="After" color={color} />
        <Tile value={change.changeValue} unit={change.changeUnit} label="Change" color={color} />
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_TOP }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.CONF_GAP }}>
          <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
          <Text style={[S.CONF_LABEL, { color, fontWeight: '700' }]}>{change.confidence}</Text>
        </View>
        <Bar pct={(change.pips / 5) * 100} color={color} />
      </View>
    </InsightCard>
  );
}

/* ---------- correlations ---------- */

/** The `driver -> metric` glyph. Chrome, so the skeleton keeps it. */
export function PairArrow() {
  const p = usePalette();
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
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
function CorrelationRow({ c, onLayout, sub }: {
  c: Correlation;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** An extra line under the strength bar, in the row's own note style. */
  sub?: string;
}) {
  const p = usePalette();
  const color = c.good ? GOOD : p.accent;
  return (
    <CardRow onLayout={onLayout}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: S.PAIR_GAP }}>
          <Text numberOfLines={1} style={[S.PAIR_DRIVER, { color: p.text, flexShrink: 1 }]}>{c.driver}</Text>
          <PairArrow />
          <Text numberOfLines={1} style={[S.PAIR_METRIC, { color: p.textDim }]}>{c.metric}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Bar pct={(c.pips / 5) * 100} color={color} width={S.STRENGTH_BAR_W} height={S.STRENGTH_BAR_H} />
          <Text numberOfLines={1} style={[S.ROW_NOTE, { color: p.textDim, flex: 1 }]}>{c.note}</Text>
        </View>
        {sub ? <Text style={[S.ROW_NOTE, { color: p.textDim, marginTop: S.PAIR_GAP }]}>{sub}</Text> : null}
      </View>
      <Text numberOfLines={1} style={[S.R_VALUE, { color, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }]}>{c.deltaText}</Text>
    </CardRow>
  );
}

export function Correlations({ list, change, onRowLayout, onLayout }: {
  list: Correlation[];
  change: BiggestChange | null;
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
        <CorrelationRow key={c.id} c={c} onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined} />
      ))}
      {more ? (
        <CardButton
          label={`Show all ${list.length} correlations`}
          onPress={() => openSheet(() => <AllCorrelationsSheet list={list} change={change} />)}
        />
      ) : null}
    </InsightCard>
  );
}

/**
 * The full ranked list.
 *
 * The SAME rows as the card, in the same bubbles at the same type scale, because this
 * is the same list continued rather than a second presentation of it. Each row carries
 * the finding's `headline` underneath as well: the sheet is where somebody has gone to
 * actually read them, and there is room here for the sentence the card has to leave
 * out. It ends with the AI hand-off, since the device can rank associations but cannot
 * tell the user which four of them are one underlying trend wearing different clothes.
 */
function AllCorrelationsSheet({ list, change }: { list: Correlation[]; change: BiggestChange | null }) {
  const p = usePalette();
  return (
    <View>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>All correlations</Text>
      {/* Held clear of the sheet's own close button, which sits over the
          top-right corner of this block. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 16, maxWidth: '82%' }}>
        {`${list.length} associations found in your own log, most trusted first. Each number is the typical difference between the two groups in that metric's own units. These are patterns, not causes.`}
      </Text>
      {list.map((c) => (
        <CorrelationRow key={c.id} c={c} sub={c.headline} />
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
function CorrelationsAiButton({ list, change }: { list: Correlation[]; change: BiggestChange | null }) {
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
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>Get AI Insights on these correlations</Text>
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
          <CardRow key={o.id} tall onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}>
            <View style={{ width: S.TONE_BOX, height: S.TONE_BOX, borderRadius: 12, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={tone.icon} size={16} color={color} strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.ROW_TITLE, { color: p.text, marginBottom: S.ROW_TITLE_GAP }]}>{o.title}</Text>
              <Text style={[S.ROW_SUB, { color: p.textDim }]}>{o.body}</Text>
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

export function TrendWatch({ list, onPress, onRowLayout, onLayout }: {
  list: WatchItem[];
  onPress: (item: WatchItem) => void;
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
        return (
          <CardRow key={t.metric} onPress={() => onPress(t)} onLayout={onRowLayout ? (e) => onRowLayout(i, e) : undefined}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.ROW_TITLE, { color: p.text }]}>{t.title}</Text>
              <Text numberOfLines={1} style={[S.WATCH_SUB, { color: p.textDim, marginTop: S.WATCH_TITLE_GAP }]}>{t.sub}</Text>
            </View>
            <Spark series={t.series} color={color} />
            <Text style={[S.WATCH_VALUE, { color, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }]}>{t.value}</Text>
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
