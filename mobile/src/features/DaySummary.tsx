/**
 * Day summary card: circular score gauge, category chip, vs-AM delta, guidance,
 * flags, and the streak card — ported from renderDaySummary. The "What powers
 * this" button opens the score-explanation sheet (openScoreExplain).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { ScoreGauge } from '../components/charts';
import { Icon } from '../components/Icon';
import { SheetControls, useSheets } from '../components/Sheet';
import { SumCard, MetricRow } from '../components/summary';
import { MilestoneProgressCard } from './Milestones';
import { ProtocolEditor } from './ProtocolEditor';
import { Button } from '../components/ui';
import { fonts, radius, type as T, usePalette } from '../theme';
import { SCORE_COLORS, GRADE_LABEL, GRADE_PTS, catFromBands } from '../lib/scoring';
import {
  OUTLOOK_GUIDE, TOMORROW, SCORE_TIPS, blueZone, protocolCriteria, readingPeriod, resolveProtocol,
  scoreCat, scoreSet, streakInfo, streakTier, type ScoreComp, type ScoreSetResult,
} from '../lib/scoring/day';
import { detectDownturn, type Downturn } from '../lib/scoring/downturn';
import { buildDownturnPrompt } from '../lib/analysis/reports';
import { PromptSheet } from './PromptSheet';
import { todayKey } from '../lib/dates';
import { getState, useAppState } from '../store/store';
import { setJournalSectionY, useExpandProtocolSignal } from '../store/nav';
import { useTier } from '../store/tier';
import { MONTHLY_SKU, YEARLY_SKU, priceOf, useIap } from '../store/iap';
import { usePaywall } from './Paywall';

import type { Band, ScoreCat } from '../lib/types';

const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Opaque blend of `t` parts color into base — flag/warning containers use this
// instead of a transparent tint so text stays readable over the hero's wash.
const mixHex = (color: string, base: string, t: number) => {
  const mc = /^#?([0-9a-f]{6})$/i.exec(color), mb = /^#?([0-9a-f]{6})$/i.exec(base);
  if (!mc || !mb) return base;
  const nc = parseInt(mc[1], 16), nb = parseInt(mb[1], 16);
  const ch = (sh: number) => Math.round(((nc >> sh) & 255) * t + ((nb >> sh) & 255) * (1 - t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/**
 * Shared collapse/expand motion for this view's accordions (streak card, pro
 * upsell, score-driver rows). Rotates a chevron in place (`chevStyle`) and
 * reveals a body by animating its measured height with a paired fade
 * (`bodyStyle`), on a plain timing curve — never a spring, so it can't overshoot.
 *
 * The body height is measured off an ABSOLUTELY-POSITIONED copy of the content
 * (spread `measureStyle` onto the body's inner view): an absolute child is laid
 * out at its natural height regardless of the parent's animated height, so
 * `contentH` is correct from the first frame. Measuring inside the clipped,
 * height-0 container instead reported 0 under the New Architecture until the
 * first expand, so the row snapped open hard on that first tap (the "bounce").
 *
 * Usage:
 *   const acc = useAccordion(open);
 *   <Animated.View style={chevStyle-target}/> // acc.chevStyle on the chevron
 *   <Animated.View style={[{ overflow: 'hidden' }, acc.bodyStyle]}>
 *     <View style={[acc.measureStyle, { paddingTop: 12 }]}>{body}</View>
 *   </Animated.View>
 */
function useAccordion(open: boolean, startOpen = false) {
  const rot = useSharedValue(startOpen ? 1 : 0);
  const openV = useSharedValue(startOpen ? 1 : 0);
  const [contentH, setContentH] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    // On the very first render, settle to the initial state instantly (a
    // start-open card shouldn't animate itself open on mount); animate every
    // toggle after that.
    const instant = !mounted.current;
    mounted.current = true;
    rot.value = instant ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: 220 });
    openV.value = instant
      ? (open ? 1 : 0)
      : withTiming(
          open ? 1 : 0,
          open
            ? { duration: 260, easing: Easing.out(Easing.cubic) }
            : { duration: 220, easing: Easing.inOut(Easing.cubic) },
        );
  }, [open, rot, openV]);

  const chevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 + rot.value * 90}deg` }] }));
  const bodyStyle = useAnimatedStyle(() => ({
    height: openV.value * contentH,
    opacity: interpolate(openV.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentH((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
  };
  return { chevStyle, bodyStyle, onContentLayout, measureStyle: MEASURE_STYLE };
}

/** Absolute inset so the measured body isn't constrained by the clipped, height-
 *  animated container it sits inside (see useAccordion). Full-width, natural
 *  height, top-anchored — the reveal clips it from the bottom. */
const MEASURE_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: 0 };

// Status-color highlight on the top-left border edge, fading down the sides
// into the normal border — like light shining onto the card. Mirrors the
// webapp's gradient-border trick (linear-gradient 165deg, color → border) using
// an SVG rounded-rect stroke overlay so it follows the corner radius. Pass
// color=null to fall back to a plain border (awaiting / low-confidence state).
let obId = 0;
const AnimatedRect = Animated.createAnimatedComponent(Rect);
function GradientBorderCard({ color, trigger, style, children }: { color: string | null; trigger?: string; style?: any; children: React.ReactNode }) {
  const p = usePalette();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [gid] = useState(() => `ob${obId++}`);
  const r = radius.card;
  // Glow "explosion": on mount and whenever `trigger`/`color` changes, the whole
  // border flashes full status color (thick + opaque), then eases down to reveal
  // the resting top-left gradient underneath. `glow` runs 1 → 0 over the settle.
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!color) return;
    glow.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(0, { duration: 3200, easing: Easing.out(Easing.cubic) }),
    );
  }, [color, trigger, glow]);
  const glowProps = useAnimatedProps(() => ({
    strokeOpacity: glow.value,
    strokeWidth: 1 + glow.value * 2,
  }));
  return (
    <View
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width, h: height }); }}
      style={[{ borderRadius: r, backgroundColor: p.surface, overflow: 'hidden' }, color ? null : { borderWidth: 1, borderColor: p.border }, style]}
    >
      {children}
      {color && size.w > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Defs>
              <SvgGradient id={gid} x1={size.w * 0.12} y1={0} x2={size.w * 0.55} y2={size.h} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={color} stopOpacity={1} />
                <Stop offset="0.14" stopColor={color} stopOpacity={0.4} />
                <Stop offset="1" stopColor={p.border} stopOpacity={1} />
              </SvgGradient>
            </Defs>
            <Rect x={0.5} y={0.5} width={size.w - 1} height={size.h - 1} rx={r - 0.5} ry={r - 0.5} fill="none" stroke={`url(#${gid})`} strokeWidth={1} />
            <AnimatedRect x={0.5} y={0.5} width={size.w - 1} height={size.h - 1} rx={r - 0.5} ry={r - 0.5} fill="none" stroke={color} animatedProps={glowProps} />
          </Svg>
        </View>
      )}
    </View>
  );
}

export function DaySummary({ dk }: { dk: string }) {
  const { openSheet } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const { sex, height } = state.profile;
  const ctx = useMemo(() => ({ sex, height }), [sex, height]);
  // scoreSet makes several passes over the day's readings; memoize so renders
  // not caused by a data change (sheets, animations) don't re-score.
  const { d, readings, all } = useMemo(() => {
    const day = state.days[dk] || ({ readings: [], activities: [] } as never);
    const rs = (day.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    return { d: day, readings: rs, all: scoreSet(rs, day, dk, state.days, ctx) };
  }, [state.days, dk, ctx]);

  // Any scorable input (HRV, BP, resting HR, sleep, activity) populates the
  // outlook right away; the confidence line inside the hero carries the caveat
  // rather than hiding the number behind an HRV requirement.
  const scored = all.score != null;

  return (
    <View>
      <GradientBorderCard color={!scored ? null : scoreCat(all.score!).color} trigger={dk} style={{ marginBottom: 12 }}>
        {!scored ? (
          <UnscoredHero dk={dk} hasReadings={readings.length > 0} />
        ) : (
          <ScoredHero dk={dk} readings={readings} d={d} all={all} ctx={ctx} onExplain={() => openSheet((c) => <ScoreExplain all={all} dk={dk} controls={c} />)} />
        )}
      </GradientBorderCard>
      {tier === 'free' ? <ProUpsellCard /> : null}
      <MilestoneProgressCard dk={dk} />
      <StreakCard dk={dk} />
    </View>
  );
}

// Mirrors ScoredHero's shape so the card doesn't change silhouette once a score
// lands: same header, same gauge in the same spot, greyed out and reading 0.
// No capture button here — the Readings section below owns that action; this
// card just points the way.
function UnscoredHero({ dk, hasReadings }: { dk: string; hasReadings: boolean }) {
  const p = usePalette();
  const future = dk > todayKey();
  // The dial is deliberately recessive until there's a score to show, so the
  // ring and its number sit well below the body copy in contrast.
  const grey = p.textDim;
  return (
    <View style={{ padding: 16 }}>
      <Text style={[T.section, { color: p.textDim }]}>Autonomic Outlook</Text>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <ScoreGauge score={0} color={grey} track={hexA(grey, 0.16)}>
          <Text style={{ fontSize: 57, fontWeight: '800', color: hexA(grey, 0.5), fontVariant: ['tabular-nums'], letterSpacing: -1 }}>0</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: hexA(grey, 0.42), marginTop: 4 }}>OUT OF 100</Text>
        </ScoreGauge>
      </View>
      <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '700', color: p.text }}>{future ? 'Future day' : 'Awaiting data'}</Text>
      <Text style={{ fontSize: 14, color: p.textDim, marginTop: 8, lineHeight: 20 }}>
        {future
          ? 'Nothing logged yet for this day.'
          : hasReadings
            ? 'Awaiting HRV values to score this day. Capture a reading below, under Readings, and keep logging as the day goes. The more data points, the more accurate the score.'
            : 'Start taking readings or logging data below to calculate an autonomic score for this day. The more data points, the more accurate the score.'}
      </Text>
    </View>
  );
}

function ScoredHero({ dk, readings, d, all, ctx, onExplain }: { dk: string; readings: any[]; d: any; all: ScoreSetResult; ctx: any; onExplain: () => void }) {
  const p = usePalette();
  const today = todayKey();
  const cat = scoreCat(all.score!);
  const morning = readings.filter((r) => readingPeriod(r) === 'morning');
  const evening = readings.filter((r) => readingPeriod(r) === 'evening');
  const hasEvening = evening.length > 0;
  // Second full scoreSet just for the AM delta; `readings` gets a fresh identity
  // whenever the day data changes, so it's a sufficient cache key.
  const mornScore = useMemo(
    () => (morning.length ? scoreSet(morning, d, dk, getState().days, ctx).score : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readings, d, dk, ctx],
  );
  const delta = mornScore != null ? all.score! - mornScore : null;
  const mode = hasEvening ? (dk < today ? 'Day Complete' : 'Reflectance') : 'Autonomic Outlook';
  // Trailing-week trend check; `readings`/`d` get fresh identities whenever the
  // days map changes, so they cache this exactly like mornScore above.
  const downturn = useMemo(
    () => {
      const s = getState();
      return detectDownturn(s.days, dk, ctx, resolveProtocol(s.settings.protocol), s.customTypes);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readings, d, dk, ctx],
  );

  let guide: string;
  if (hasEvening) {
    if (delta == null) guide = 'Evening reading logged. ' + (TOMORROW[cat.short] || '');
    else if (delta <= -20) guide = 'Major setback versus this morning. Multiple triggers likely stacked. ' + TOMORROW[cat.short];
    else if (delta <= -10) guide = 'Day cost more than the morning predicted. Check food, exertion, or stress. ' + TOMORROW[cat.short];
    else if (delta >= 10) guide = 'Day went better than the morning predicted. Note what worked and repeat it. ' + TOMORROW[cat.short];
    else guide = 'Day held its morning baseline; activity matched capacity. ' + TOMORROW[cat.short];
  } else {
    guide = OUTLOOK_GUIDE[cat.short];
    if ((readings.length >= 2 || readings.some((r) => readingPeriod(r) === 'midday')) && delta != null && Math.abs(delta) >= 5)
      guide = (delta < 0 ? 'Trending down from this morning. Watch food and activity through the afternoon. ' : 'Trending up from this morning. ') + guide;
  }
  if (all.confidence < 40) guide = 'Early read from limited data, so expect it to shift as more readings land. ' + guide;

  return (
    <Pressable onPress={onExplain} style={{ padding: 16, backgroundColor: hexA(cat.color, 0.1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[T.section, { color: p.textDim }]}>{mode}</Text>
        <View style={{ backgroundColor: cat.color, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }}>{cat.short}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <ScoreGauge score={all.score!} color={cat.color}>
          <Text style={{ fontSize: 57, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{all.score}</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: 4 }}>OUT OF 100</Text>
        </ScoreGauge>
        {delta != null && Math.abs(delta) >= 3 ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: delta > 0 ? SCORE_COLORS.good : SCORE_COLORS.bad, fontVariant: ['tabular-nums'], marginTop: -18 }}>
            {(delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' vs AM'}
          </Text>
        ) : null}
      </View>
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, marginBottom: 6, marginTop: delta != null && Math.abs(delta) >= 3 ? 0 : -14 }}>
        <Icon name="info" size={15} color={p.textDim} />
        <Text style={{ color: p.textDim, fontSize: 11, fontWeight: '600' }}>What powers this</Text>
      </View>
      <Text style={{ textAlign: 'center', fontSize: 14, color: p.textDim, fontWeight: '600' }}>{`${cat.label} · ${all.confidence}% confidence`}</Text>
      <Text style={{ fontSize: 15, marginTop: 14, lineHeight: 21, color: p.text }}>{guide}</Text>
      {blueZone(readings, ctx) ? (
        <Flag color={SCORE_COLORS.warning} text="Blue-zone risk. High readiness may mask fragility, so do less today, not more." />
      ) : null}
      {cat.short === 'Crash' ? <Flag color={SCORE_COLORS.crash} text="Mandatory recovery day. Full rest, hydration, and protocol." /> : null}
      {downturn ? <DownturnWarning w={downturn} dk={dk} /> : null}
    </Pressable>
  );
}

/** Trend warning shown at the bottom of the Outlook card when the trailing
 *  week is clearly worsening: compact icon + title + drop stat row. Tapping
 *  opens the explanation sheet with the journal findings behind it. */
function DownturnWarning({ w, dk }: { w: Downturn; dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const color = w.severity === 'alert' ? SCORE_COLORS.crash : SCORE_COLORS.bad;
  return (
    <Pressable
      onPress={() => openSheet(() => <DownturnExplain w={w} dk={dk} />)}
      style={({ pressed }) => [
        { marginTop: 12, padding: 12, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: mixHex(color, p.surface, 0.14), borderWidth: 1, borderColor: hexA(color, 0.55) },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: mixHex(color, p.surface, 0.3) }}>
        <Icon name="trendDown" size={17} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color }}>{w.title}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: hexA(color, 0.8), fontVariant: ['tabular-nums'], marginTop: 1 }}>
          {`Down ${w.drop} points over the last ${w.spanDays} days`}
        </Text>
      </View>
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Icon name="chevron" size={17} color={hexA(color, 0.55)} />
      </View>
    </Pressable>
  );
}

/** Sheet behind the downturn warning: the full explanation, every journal
 *  finding that could be driving the slide, an AI-investigation prompt
 *  builder, and a rest/doctor note. */
function DownturnExplain({ w, dk }: { w: Downturn; dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const tier = useTier();
  const openPaywall = usePaywall();
  const color = w.severity === 'alert' ? SCORE_COLORS.crash : SCORE_COLORS.bad;
  const investigate = () => {
    if (tier === 'free') { openPaywall(); return; }
    const s = getState();
    const ctx = { sex: s.profile.sex, height: s.profile.height, protocol: resolveProtocol(s.settings.protocol) };
    const { prompt, rangeText } = buildDownturnPrompt(s, ctx, dk, w);
    openSheet((c) => <PromptSheet title="Downturn Investigation" rangeText={rangeText} prompt={prompt} controls={c} />);
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Something&apos;s off</Text>
      <View style={{ borderRadius: radius.card, padding: 14, marginBottom: 16, backgroundColor: mixHex(color, p.surface, 0.14), borderWidth: 1, borderColor: hexA(color, 0.55) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: mixHex(color, p.surface, 0.3) }}>
            <Icon name="trendDown" size={17} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color, fontVariant: ['tabular-nums'] }}>{`Down ${w.drop} points`}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: hexA(color, 0.8), marginTop: 1 }}>{`over the last ${w.spanDays} days`}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 20, color: p.text, marginTop: 10 }}>{w.body}</Text>
      </View>
      <SumCard title="What could be driving it">
        {w.factors.length ? (
          w.factors.map((f) => <MetricRow key={f.label} label={f.label} value={f.value} cat={false} explain={f.detail} />)
        ) : (
          <>
            <PossibilityRow label="Nothing in your journal" explain="No triggers, protocol breaks, heavy activity, or short sleep were found in this stretch. When the logs are clean, the usual suspects are below." />
            <PossibilityRow label="Oncoming sickness" explain="Your autonomic system often shifts before symptoms start. Falling HRV with a rising resting heart rate, despite clean behavior, can be the first sign of getting sick." />
            <PossibilityRow label="Stress" explain="Mental and emotional load suppresses recovery the same way physical load does, and it rarely gets logged. Think back over the last few days." />
            <PossibilityRow label="An unlogged exposure" explain="A food trigger, a late meal, heat, or a rougher night than it felt like may simply not have made it into the journal." />
          </>
        )}
        <Pressable
          onPress={investigate}
          style={({ pressed }) => [
            { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: radius.control, backgroundColor: p.accent, marginTop: 2, marginBottom: 4 },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Icon name="sparkles" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Use AI to investigate</Text>
        </Pressable>
      </SumCard>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.card, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, marginBottom: 16 }}>
        <Icon name="moon" size={17} color={p.textDim} />
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: p.textDim }}>
          Get some rest and take it easy until the trend turns. If you are not feeling well, talk with your doctor.
        </Text>
      </View>
      <View style={{ height: 24 }} />
    </View>
  );
}

/** A candidate explanation in the downturn sheet: label + description, no
 *  value column (MetricRow would render a dash there). */
function PossibilityRow({ label, explain }: { label: string; explain: string }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 14, marginBottom: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>{label}</Text>
      <Text style={{ fontSize: 13, color: p.textDim, marginTop: 6, lineHeight: 17 }}>{explain}</Text>
    </View>
  );
}

function Flag({ color, text }: { color: string; text: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 11, padding: 10, borderRadius: radius.control, backgroundColor: mixHex(color, p.surface, 0.14), borderWidth: 1, borderColor: hexA(color, 0.55) }}>
      <Icon name="alert" size={15} color={color} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color }}>{text}</Text>
    </View>
  );
}

/**
 * Free-tier upsell widget (Claude Design "Subscription Widget" 10b), shown
 * right after the Autonomic Outlook card. Collapsible exactly like StreakCard
 * (same rotating chevron + measured-height accordion) but starts expanded.
 * Design colors map straight onto theme tokens — the mock's red IS the accent.
 */
const PRO_BENEFITS = [
  'Full historical metric analysis',
  'POTS testing & episode tracking',
  'AI analysis & doctor report',
  'Unlimited HRV readings',
];

function ProUpsellCard() {
  const p = usePalette();
  const openPaywall = usePaywall();
  const { products } = useIap();
  const [expanded, setExpanded] = useState(true);
  const { chevStyle, bodyStyle, onContentLayout, measureStyle } = useAccordion(expanded, true);

  const mPrice = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const yPrice = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);

  return (
    <View style={{ borderWidth: 1, borderColor: hexA(p.accent, 0.2), borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, overflow: 'hidden' }}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={{ padding: 15 }}>
        <View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.accentSoft }}>
            <Icon name="lock" size={21} color={p.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: p.text }}>Autonomic Pro</Text>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: hexA(p.accent, 0.25) }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: p.accent }}>Locked</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: p.textDim, marginTop: 2, lineHeight: 17 }}>Unlock everything Autonomic can do</Text>
          </View>
          <Animated.View style={chevStyle}>
            <Icon name="chevron" size={18} color={p.textDim} />
          </Animated.View>
        </View>
        <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
          <View onLayout={onContentLayout} style={[measureStyle, { paddingTop: 14 }]}>
            <View style={{ gap: 9 }}>
              {PRO_BENEFITS.map((b) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="check" size={15} color={p.accent} strokeWidth={2.6} />
                  <Text style={{ flex: 1, fontSize: 13, color: p.text }}>{b}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={openPaywall}
              style={({ pressed }) => [{ height: 46, borderRadius: 12, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Upgrade to Pro</Text>
            </Pressable>
            <Text style={{ fontSize: 11.5, color: p.textDim, textAlign: 'center', marginTop: 9 }}>{`${mPrice}/mo or ${yPrice}/yr · cancel anytime`}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

function StreakCard({ dk }: { dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [expanded, setExpanded] = useState(false);
  const state = useAppState();

  // The home-screen Protocol widget deep-links here (autonomic://?open=protocol):
  // the handler bumps this signal and scrolls to us; open the card when it fires
  // (skip the initial mount so we don't auto-expand on a normal launch).
  const expandSignal = useExpandProtocolSignal();
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    setExpanded(true);
  }, [expandSignal]);
  // streakInfo walks the whole day history; don't redo it for the accordion
  // toggle re-renders below.
  const si = useMemo(
    () => streakInfo(state.days, dk, resolveProtocol(state.settings.protocol), state.customTypes),
    [state.days, dk, state.settings.protocol, state.customTypes],
  );
  const tier = streakTier(si.current);
  const icon = si.current >= 14 ? 'moon' : si.current >= 7 ? 'rocket' : si.current >= 3 ? 'flame' : 'sparkles';
  const c = si.today;

  // Chevron rotates in place (-90° right when collapsed → 0° down when open) and
  // the body reveals by animating its measured height with a fade. See useAccordion.
  const { chevStyle, bodyStyle, onContentLayout, measureStyle } = useAccordion(expanded);

  let sub = tier.msg;
  if (c) {
    if (c.clean) sub = 'Clean day. Streak continues.';
    else {
      const hardFail = c.criteria.some((x) => x.broken);
      if (si.isToday) sub = hardFail ? 'Too late for today. Try again to start fresh tomorrow.' : `Today is day ${si.current + 1}.`;
      else sub = 'Not a clean day.';
    }
  } else sub = si.isToday ? `Today is day ${si.current + 1}.` : 'No data logged for this day.';

  // The checklist shows the day's own criteria once anything is logged; on a
  // still-empty today we synthesize them from the protocol so a new user sees
  // (and can work toward) their clean-day requirements right away. Past days
  // with no record stay in the blank "no data" state — all-unmet reads as
  // failure there, which isn't what a simply-unlogged day means.
  const criteria = c ? c.criteria : si.isToday ? protocolCriteria(state.days, dk, resolveProtocol(state.settings.protocol), state.customTypes) : [];

  const stats = [`Longest ${si.longest}`];
  if (si.rate != null) stats.push(`30-day clean ${si.rate}%`);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setJournalSectionY('protocol', e.nativeEvent.layout.y)}
      style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, overflow: 'hidden' }}
    >
      <Pressable onPress={() => setExpanded((v) => !v)} style={{ padding: 15 }}>
        {/* Header row: always vertically centered, so the chevron never shifts. */}
        <View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: si.current > 0 ? 'rgba(249,115,22,0.14)' : p.surface2 }}>
            <Icon name={icon} size={21} color={si.current > 0 ? '#f97316' : p.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: p.text }}>
              <Text style={{ fontWeight: '800' }}>{si.current} </Text>
              {`clean day${si.current === 1 ? '' : 's'} · `}
              <Text style={{ color: p.textDim, fontWeight: '600' }}>{tier.tier}</Text>
            </Text>
            <Text style={{ fontSize: 13, color: p.textDim, marginTop: 2, lineHeight: 17 }}>{sub}</Text>
          </View>
          <Animated.View style={chevStyle}>
            <Icon name="chevron" size={18} color={p.textDim} />
          </Animated.View>
        </View>
        <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
          <View onLayout={onContentLayout} style={[measureStyle, { paddingTop: 12 }]}>
            <Text style={{ fontSize: 11, color: p.textDim, fontVariant: ['tabular-nums'] }}>{stats.join(' · ')}</Text>
            {criteria.length ? (
              <View style={{ marginTop: 12, gap: 9 }}>
                {criteria.map((x) => {
                  let st: 'pending' | 'met' | 'broken' | 'todo';
                  if (x.pending) st = 'pending';
                  else if (x.pass) st = 'met';
                  else if (!si.isToday || x.broken) st = 'broken';
                  else st = 'todo';
                  const dotColor = st === 'met' ? '#22c55e' : st === 'broken' ? '#ef4444' : p.surface2;
                  return (
                    <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: dotColor, borderWidth: 1, borderColor: st === 'met' || st === 'broken' ? dotColor : p.border, alignItems: 'center', justifyContent: 'center' }}>
                        {st === 'met' ? <Icon name="check" size={10} color="#fff" /> : null}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: st === 'met' || st === 'broken' ? p.text : p.textDim }}>{x.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Pressable
              onPress={() => openSheet((ctl) => <ProtocolEditor controls={ctl} />)}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }, pressed && { opacity: 0.7 }]}
            >
              <Icon name="settings" size={15} color={p.textDim} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: p.text }}>Modify protocol</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/* ---------- Score explanation sheet ---------- */
const fmtMetricVal = (v: number | null, u?: string) => (v == null ? '-' : Number.isInteger(v) ? String(v) : Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1)) + (u ? ` ${u}` : '');

function zoneAdvice(raw: number | null, bands: Band[] | null, unit?: string) {
  if (raw == null || !bands) return null;
  const cur = catFromBands(raw, bands);
  let lo = -Infinity, hi = Infinity, prev = -Infinity, found = false;
  for (const b of bands) {
    if (b.cat === 'great') { if (!found) { lo = prev; found = true; } hi = b.max; }
    else if (found) break;
    prev = b.max;
  }
  const fmtEdge = (x: number) => (Number.isInteger(x) ? String(x) : Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(1));
  const u = unit ? ` ${unit}` : '';
  let ideal: string | null;
  if (!found) ideal = null;
  else if (lo === -Infinity) ideal = `${fmtEdge(hi)}${u} or below`;
  else if (hi === Infinity) ideal = `${fmtEdge(lo)}${u} or higher`;
  else ideal = `${fmtEdge(lo)}–${fmtEdge(hi)}${u}`;
  if (cur === 'great') return { cur, ideal, done: true, dir: '' };
  let dir = 'into range';
  if (found) { if (raw <= lo) dir = `higher (toward ${fmtEdge(lo)}${u} and up)`; else if (raw >= hi) dir = `lower (toward ${fmtEdge(hi)}${u} and below)`; }
  return { cur, ideal, done: false, dir };
}

function ScoreExplain({ all, dk, controls }: { all: ScoreSetResult; dk: string; controls: SheetControls }) {
  const p = usePalette();
  const cat = scoreCat(all.score!);
  const ptsToCat = (pt: number): ScoreCat => (pt >= 88 ? 'great' : pt >= 70 ? 'good' : pt >= 48 ? 'ok' : pt >= 23 ? 'bad' : 'crash');
  const comps = all.comps.map((c) => ({ ...c, cat: ptsToCat(c.p) }));
  const byW = (a: ScoreComp, b: ScoreComp) => b.w - a.w;
  const helped = comps.filter((c) => c.cat === 'great' || c.cat === 'good').sort(byW);
  const hurt = comps.filter((c) => c.cat === 'bad' || c.cat === 'crash').sort(byW);
  const neutral = comps.filter((c) => c.cat === 'ok').sort(byW);
  const ceil = (c: ScoreComp) => (c.detail && c.detail.maxCat ? GRADE_PTS[c.detail.maxCat] : GRADE_PTS.great);
  const avail = all.confidence || 100;
  const headroom = comps.map((c) => ({ c, gain: (c.w * (ceil(c) - c.p)) / avail })).filter((x) => x.gain > 0.05).sort((a, b) => b.gain - a.gain);

  const improveLine = (c: (typeof comps)[number]) => {
    const m = (c.detail.metrics || []).find((x) => x.raw != null && catFromBands(x.raw, x.bands) !== 'great');
    if (m) {
      const adv = zoneAdvice(m.raw, m.bands, m.unit);
      if (adv && !adv.done && adv.ideal) return `${m.label} is ${fmtMetricVal(m.raw, m.unit)} (${GRADE_LABEL[adv.cur!]}). Move it ${adv.dir}; the ideal range is ${adv.ideal}.`;
    }
    return c.detail.note || SCORE_TIPS[c.label] || '';
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>How this was calculated</Text>
      <View style={{ borderRadius: radius.card, padding: 16, marginBottom: 16, backgroundColor: hexA(cat.color, 0.1), borderWidth: 1, borderColor: hexA(cat.color, 0.45) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[T.section, { color: p.textDim }]}>Your Score</Text>
          <View style={{ backgroundColor: cat.color, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }}>{cat.short}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <ScoreGauge score={all.score!} color={cat.color}>
            <Text style={{ fontSize: 57, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{all.score}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: 4 }}>OUT OF 100</Text>
          </ScoreGauge>
        </View>
        <Text style={{ textAlign: 'center', fontSize: 13, color: p.textDim, fontWeight: '600' }}>{`Confidence ${all.confidence}%, the share of the full input set available to score today.`}</Text>
      </View>
      {helped.length ? <SumCard title="What helped">{helped.map((c) => <CompRow key={c.label} c={c} improveLine={improveLine} />)}</SumCard> : null}
      {hurt.length ? <SumCard title="What hurt">{hurt.map((c) => <CompRow key={c.label} c={c} improveLine={improveLine} />)}</SumCard> : null}
      {neutral.length ? <SumCard title="Middle of the range">{neutral.map((c) => <CompRow key={c.label} c={c} improveLine={improveLine} />)}</SumCard> : null}
      <SumCard title="What would raise your score">
        {headroom.length ? headroom.slice(0, 4).map(({ c, gain }) => (
          <MetricRow key={c.label} label={c.label} value={`+${gain.toFixed(1)} pt`} cat={c.cat} explain={improveLine(c)} />
        )) : <MetricRow label="At the ceiling" value="" cat={false} explain="Every scored input is already in its top zone. Keep the inputs consistent to hold it." />}
      </SumCard>
      <View style={{ height: 8 }} />
      <Button title="Close" onPress={controls.close} />
      <View style={{ height: 24 }} />
    </View>
  );
}

function CompRow({ c, improveLine }: { c: any; improveLine: (c: any) => string }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const contrib = c.p >= 80 ? { t: 'Lifting your score', bg: 'rgba(74,222,128,.16)', col: '#4ade80' } : c.p >= 60 ? { t: 'About neutral', bg: 'rgba(234,179,8,.16)', col: '#eab308' } : { t: 'Pulling your score down', bg: 'rgba(249,115,22,.16)', col: '#f97316' };

  // Rotate the chevron in place and reveal the body by animating its measured
  // height with a fade. See useAccordion for why the body is measured absolutely.
  const { chevStyle, bodyStyle, onContentLayout, measureStyle } = useAccordion(open);

  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, marginBottom: 10, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SCORE_COLORS[c.cat as keyof typeof SCORE_COLORS] || p.border }} />
        <Text style={{ fontWeight: '600', fontSize: 15, color: p.text, flex: 1 }}>{c.label}</Text>
        <Text style={{ fontSize: 14, color: p.textDim, fontVariant: ['tabular-nums'] }}>{c.detail.value || ''}</Text>
        <Animated.View style={chevStyle}>
          <Icon name="chevron" size={17} color={p.textDim} />
        </Animated.View>
      </Pressable>
      <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
        <View onLayout={onContentLayout} style={[measureStyle, { paddingHorizontal: 14, paddingBottom: 14 }]}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <View style={{ backgroundColor: contrib.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}><Text style={{ fontSize: 11, fontWeight: '700', color: contrib.col }}>{contrib.t}</Text></View>
            <Text style={{ fontSize: 12, color: p.textDim }}>{`${GRADE_LABEL[c.cat as keyof typeof GRADE_LABEL]} · weight ${c.w}%`}</Text>
          </View>
          <Text style={{ fontSize: 13, color: p.textDim, lineHeight: 18 }}>{improveLine(c)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
