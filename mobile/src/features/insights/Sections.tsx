/**
 * The Insights view's content, one component per section of the design.
 *
 * These are all presentational: every number, label and sentence arrives from
 * src/lib/insights already computed and already worded. That split is the point —
 * the copy for a health claim belongs next to the statistics that justify it, not
 * in a component that could quietly start rounding differently.
 *
 * Shared visual language, taken from the Claude Design comp:
 *   · section headings are small, uppercase, tracked-out and dim
 *   · confidence is always five pips, filled to the finding's strength
 *   · a finding that points the healthy way is green, one that doesn't is accent
 *     red — never both on the same row
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '../../components/Icon';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { radius, usePalette } from '../../theme';
import { getState } from '../../store/store';
import { useTier } from '../../store/tier';
import { usePaywall } from '../Paywall';
import { PromptSheet } from '../PromptSheet';
import { demoState, hasOwnData } from '../../lib/demo';
import { resolveProtocol } from '../../lib/scoring/day';
import { buildCorrelationsPrompt } from '../../lib/insights/prompt';
import type { BiggestChange, ConfidencePart, Correlation, DataConfidence, Observation, WatchItem } from '../../lib/insights';
import { VISIBLE_CORRELATIONS } from '../../lib/insights';
import * as S from './style';

const GOOD = S.GOOD;

/* ---------- shared bits ---------- */

/**
 * The uppercase section heading. Pure chrome, so the skeleton renders the REAL
 * one rather than a ghost of it: the text never depends on the data, and a
 * placeholder for a fixed string is a placeholder that can be wrong.
 */
export function SectionLabel({ text, right }: { text: string; right?: string }) {
  const p = usePalette();
  return (
    <View style={S.SECTION_BAND}>
      <Text style={[S.SECTION_LABEL, { color: p.textDim }]}>{text.toUpperCase()}</Text>
      {right ? <Text style={[S.SECTION_RIGHT, { color: p.textDim }]}>{right}</Text> : null}
    </View>
  );
}

/** Five pips, `filled` of them lit. The app's one confidence notation. */
export function Pips({ filled, color, width = S.PIP_W }: { filled: number; color: string; width?: number }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width, height: S.PIP_H, borderRadius: 999, backgroundColor: i < filled ? color : p.surface2 }} />
      ))}
    </View>
  );
}

/** The headline card's chrome. Shared with the skeleton via ./style. */
export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  const p = usePalette();
  return <View style={[S.PANEL, { backgroundColor: p.sunk, borderColor: p.border }, style]}>{children}</View>;
}

/** A list row's chrome: correlations, observations. Shared with the skeleton. */
export function Row({ children, style }: { children: React.ReactNode; style?: object }) {
  const p = usePalette();
  return <View style={[S.ROW, { backgroundColor: p.sunk, borderColor: p.border }, style]}>{children}</View>;
}

/** The headline card's eyebrow. Fixed text, so the skeleton renders it for real. */
export const CHANGE_EYEBROW = 'BIGGEST CHANGE THIS MONTH';

/** The `driver -> metric` glyph. Chrome, so the skeleton keeps it. */
export function PairArrow() {
  const p = usePalette();
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={p.textDim} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A tiny pulsing-free "new" dot. Static: the header owns the animated one, and
 *  two pulsing dots on one screen is a fairground. */
function NewDot() {
  const p = usePalette();
  return <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: p.accent }} />;
}

/* ---------- biggest change ---------- */

export function BiggestChangeCard({ change, isNew }: { change: BiggestChange; isNew: boolean }) {
  const p = usePalette();
  const color = change.good ? GOOD : p.accent;
  // The two bars are sized against each other so the shorter one still reads as a
  // bar rather than a hairline — this is a comparison, not a measurement.
  const max = Math.max(Math.abs(change.before), Math.abs(change.after)) || 1;
  const beforeW = Math.max(18, (Math.abs(change.before) / max) * 100);
  const afterW = Math.max(18, (Math.abs(change.after) / max) * 100);

  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: S.EYEBROW_GAP }}>
        <Text style={[S.EYEBROW, { color: p.textDim }]}>{CHANGE_EYEBROW}</Text>
        {isNew ? <NewDot /> : null}
      </View>
      <Text style={[S.HEADLINE, { color: p.text, marginBottom: S.HEADLINE_GAP }]}>{change.headline}</Text>
      <Text style={[S.BODY, { color: p.textDim, marginBottom: S.BODY_GAP }]}>{change.body}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: S.BARS_GAP }}>
        <View style={{ flex: 1 }}>
          <Text style={[S.BAR_LABEL, { color: p.textDim, marginBottom: S.BAR_LABEL_GAP }]}>{change.beforeLabel}</Text>
          <View style={{ height: S.BAR_H, borderRadius: 999, backgroundColor: p.surface2, width: `${beforeW}%` }} />
          <Text style={[S.BAR_VALUE, { color: p.textDim, marginTop: S.BAR_VALUE_GAP }]}>{change.beforeText}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.BAR_LABEL, { color: p.textDim, marginBottom: S.BAR_LABEL_GAP }]}>{change.afterLabel}</Text>
          <View style={{ height: S.BAR_H, borderRadius: 999, backgroundColor: color, width: `${afterW}%` }} />
          <Text style={[S.BAR_VALUE, { color, marginTop: S.BAR_VALUE_GAP }]}>{change.afterText}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_PAD }}>
        <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pips filled={change.pips} color={color} width={S.PIP_W_WIDE} />
          <Text style={[S.CONF_WORD, { color: p.text }]}>{change.confidence}</Text>
        </View>
      </View>
    </Panel>
  );
}

/* ---------- correlations ---------- */

function CorrelationRow({ c }: { c: Correlation }) {
  const p = usePalette();
  const color = c.good ? GOOD : p.accent;
  return (
    <Row>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: S.PAIR_GAP }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[S.PAIR_TEXT, { color: p.text, flexShrink: 1 }]}>{c.driver}</Text>
          <PairArrow />
          <Text numberOfLines={1} style={[S.PAIR_TEXT, { color: p.textDim }]}>{c.metric}</Text>
        </View>
        <Text style={[S.R_VALUE, { color }]}>{c.rText}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pips filled={c.pips} color={color} />
        <Text numberOfLines={1} style={[S.ROW_NOTE, { color: p.textDim, flex: 1 }]}>{c.detail} · {c.note}</Text>
      </View>
    </Row>
  );
}

export function Correlations({ list, change }: { list: Correlation[]; change: BiggestChange | null }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  if (!list.length) return null;
  const visible = list.slice(0, VISIBLE_CORRELATIONS);
  const rest = list.length - visible.length;
  return (
    <View>
      <SectionLabel text="Other correlations" right="Computed on device" />
      {visible.map((c) => <CorrelationRow key={c.id} c={c} />)}
      {rest > 0 ? (
        <Pressable
          onPress={() => openSheet(() => <AllCorrelationsSheet list={list} change={change} />)}
          accessibilityRole="button"
          style={[S.SHOW_ALL, { borderColor: p.border }]}
        >
          <Text style={[S.SHOW_ALL_TEXT, { color: p.text }]}>{`Show all ${list.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The full ranked list.
 *
 * Uses each finding's `headline` rather than the compact `driver → metric` row,
 * because this is the view somebody opens when they want to actually read them,
 * and it carries the standing disclaimer, since a wall of twenty associations is
 * exactly where somebody might start reading causes into them.
 *
 * It ends with the AI hand-off rather than a close button. The sheet already has
 * its own dismiss, and a second opinion is the genuinely useful next step from a
 * list this long: the device can rank associations but it cannot tell the user
 * which four of them are the same underlying trend wearing different clothes.
 */
function AllCorrelationsSheet({ list, change }: { list: Correlation[]; change: BiggestChange | null }) {
  const p = usePalette();
  return (
    <View>
      <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>All correlations</Text>
      {/* Held clear of the sheet's own close button, which sits over the
          top-right corner of this block. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 16, maxWidth: '82%' }}>
        {`${list.length} associations found in your own log, strongest first. These are patterns, not causes.`}
      </Text>
      {list.map((c) => {
        const color = c.good ? GOOD : p.accent;
        return (
          <View key={c.id} style={{ borderTopWidth: 1, borderTopColor: p.border, paddingVertical: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: p.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{c.headline}</Text>
              <Text style={{ color, fontSize: 15, fontWeight: '700' }}>{c.rText}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 }}>
              <Pips filled={c.pips} color={color} width={12} />
              <Text style={{ color: p.textDim, fontSize: 12, flex: 1 }}>{c.confidence} · {c.detail} · {c.note}</Text>
            </View>
          </View>
        );
      })}
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
 * No glyphs, and no tone colour either.
 *
 * Each probe used to carry its own icon, but they were eight different metaphors
 * for "we noticed something", which is not a distinction worth a column of tiles.
 * Colouring the title by tone instead was worse: an amber or red heading turns
 * "No POTS test in 42 days" into something that reads like an error, when it is
 * a note about the analysis. The titles are plain and the copy carries the weight.
 */
export function WorthALook({ list }: { list: Observation[] }) {
  const p = usePalette();
  if (!list.length) return null;
  return (
    <View>
      <SectionLabel text="Worth a look" />
      {list.map((o) => (
        <Row key={o.id}>
          <Text style={[S.OBS_TITLE, { color: p.text, marginBottom: S.OBS_TITLE_GAP }]}>{o.title}</Text>
          <Text style={[S.OBS_BODY, { color: p.textDim }]}>{o.body}</Text>
        </Row>
      ))}
    </View>
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

export function TrendWatch({ list, onPress }: { list: WatchItem[]; onPress?: (item: WatchItem) => void }) {
  const p = usePalette();
  if (!list.length) return null;
  return (
    <View>
      <SectionLabel text="Trend watch" right="Last 30 days" />
      {list.map((t) => {
        const color = t.good ? GOOD : p.accent;
        return (
          <Pressable
            key={t.metric}
            onPress={onPress ? () => onPress(t) : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            style={[S.WATCH_ROW, { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: p.sunk, borderColor: p.border }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.WATCH_TITLE, { color: p.text }]}>{t.title}</Text>
              <Text numberOfLines={1} style={[S.WATCH_SUB, { color: p.textDim, marginTop: S.WATCH_TITLE_GAP }]}>{t.sub}</Text>
            </View>
            <Spark series={t.series} color={color} />
            <Text style={[S.WATCH_VALUE, { color }]}>{t.value}</Text>
          </Pressable>
        );
      })}
    </View>
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
          <View style={{ height: 5, borderRadius: 999, backgroundColor: p.surface2, marginTop: 8, overflow: 'hidden' }}>
            <View style={{ height: 5, borderRadius: 999, backgroundColor: part.ratio >= 0.85 ? GOOD : p.accent, width: `${Math.round(part.ratio * 100)}%` }} />
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

/**
 * Rendered once, at the foot of the view.
 *
 * Every headline above it is already worded as an association, but this is a
 * screen whose whole job is to point at things that move together, and the step
 * from "these move together" to "this caused that" is one a reader takes for
 * free. Saying so once, plainly, at the bottom is the honest cost of the feature.
 */
export const FOOTER_COPY = 'Everything here is computed on your device from your own log. These are patterns that happen together, which is not the same as one causing the other, and none of it is medical advice.';

export function InsightsFooter() {
  const p = usePalette();
  return (
    <Text style={[S.FOOTER_TEXT, { color: p.textDim, marginTop: S.FOOTER_TOP, marginBottom: S.FOOTER_BOTTOM }]}>{FOOTER_COPY}</Text>
  );
}
