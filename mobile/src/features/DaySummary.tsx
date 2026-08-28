/**
 * Day summary card: circular score gauge, category chip, vs-AM delta, guidance,
 * flags, and the streak card — ported from renderDaySummary. The "What powers
 * this" button opens the score-explanation sheet (openScoreExplain).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { ScoreGauge } from '../components/charts';
import { BrandMark, Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { SumCard, MetricRow } from '../components/summary';
import { useAccordion } from '../components/ui';
import { AnnualOfferCard } from './AnnualOffer';
import { FounderOfferCard } from './FounderOffer';
import { TrendCard } from './TrendCard';
import { HrvSetup } from './hrv/Setup';
import { MilestoneProgressCard } from './Milestones';
import { ProtocolEditor } from './ProtocolEditor';
import { radius, type as T, usePalette } from '../theme';
import { SCORE_COLORS, GRADE_LABEL, GRADE_PTS, catFromBands } from '../lib/scoring';
import {
  OUTLOOK_GUIDE, TOMORROW, SCORE_TIPS, blueZone, protocolCriteria, readingPeriod, resolveProtocol,
  scoreCat, scoreSet, streakInfo, streakTier, type ScoreComp, type ScoreSetResult,
} from '../lib/scoring/day';
import { detectDownturn, type Downturn } from '../lib/scoring/downturn';
import { detectStrain, type Strain } from '../lib/scoring/strain';
import { hasHrvReading, trustedReadings } from '../lib/hrvQuality';
import { buildDownturnPrompt, buildStrainPrompt } from '../lib/analysis/reports';
import { PromptSheet } from './PromptSheet';
import { todayKey } from '../lib/dates';
import { getState, useAppState } from '../store/store';
import { setJournalSectionY, useExpandProtocolSignal } from '../store/nav';
import { useTier } from '../store/tier';
import { usePaywall } from './Paywall';

import type { AppState, Band, ScoreCat } from '../lib/types';
import type { ScoreContext } from '../lib/scoring';

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

// Warning/crash containers blend their severity color into this near-black
// instead of `p.surface`, so the fill reads as a dark tinted panel rather than
// a washed-out surface. Same mix ratios as elsewhere, darker base.
const WARN_BASE = '#0d0d0f';


// Status-color highlight on one top border edge, fading down the sides into
// the normal border — like light shining onto the card. Mirrors the webapp's
// gradient-border trick (linear-gradient 165deg, color → border) using an SVG
// rounded-rect stroke overlay so it follows the corner radius. Pass color=null
// to fall back to a plain border (awaiting / low-confidence state).
//
// `corner` picks which top corner the light comes from. The Outlook lights its
// top-left; the baseline card that stands in for it lights its top-RIGHT, so
// the two never read as the same card wearing a different headline — one slot,
// two states, and the light says which.
let obId = 0;
const AnimatedRect = Animated.createAnimatedComponent(Rect);
function GradientBorderCard({ color, trigger, corner = 'topLeft', glow: wash, flash, style, children }: { color: string | null; trigger?: string; corner?: 'topLeft' | 'topRight'; glow?: boolean; flash?: boolean; style?: any; children: React.ReactNode }) {
  const p = usePalette();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [gid] = useState(() => `ob${obId++}`);
  const r = radius.card;
  // Glow "explosion": on mount and whenever `trigger`/`color` changes, the whole
  // border flashes full status color (thick + opaque), then eases down to reveal
  // the resting top-left gradient underneath. `glow` runs 1 → 0 over the settle.
  const glow = useSharedValue(0);
  // The surface fill runs on its own, SHORTER clock than the border. The border
  // is a hairline settling into place and can take its time; a tinted fill over
  // live text is the loudest thing on the screen, so it gets out of the way
  // first and leaves the border still arriving.
  const fill = useSharedValue(0);
  useEffect(() => {
    if (!color) return;
    glow.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(0, { duration: 3200, easing: Easing.out(Easing.cubic) }),
    );
    fill.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(0, { duration: 1700, easing: Easing.out(Easing.cubic) }),
    );
  }, [color, trigger, glow, fill]);
  const glowProps = useAnimatedProps(() => ({
    strokeOpacity: glow.value,
    strokeWidth: 1 + glow.value * 2,
  }));
  // `flash` gives the SURFACE its own arrival beside the border's: the whole
  // card starts filled with the status colour and, over a shorter settle, that
  // fill collapses into the resting corner wash underneath it. Two stacked layers
  // rather than one animated gradient — the flash layer is a radial wide enough
  // to cover the card (so at full opacity it reads as a solid coloured card),
  // and fading its opacity to 0 reveals the tight top-corner wash beneath. A
  // View opacity is cheap; animating an SVG gradient's radii is not.
  const flashStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  // Mixed INTO the surface rather than laid over it: a fill of the raw status
  // colour is a bright panel, and the tight corner wash it collapses into then
  // has nothing to pop against. Blending toward the dark surface first keeps the
  // arrival a dark tinted card, so the corner is the brightest thing left.
  const fillColor = color ? mixHex(color, p.surface, 0.24) : p.surface;
  return (
    <View
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width, h: height }); }}
      style={[{ borderRadius: r, backgroundColor: p.surface, overflow: 'hidden' }, color ? null : { borderWidth: 1, borderColor: p.border }, style]}
    >
      {/* An optional WASH of the same colour bleeding out of the lit corner, under
          the content. The border alone is a hairline: on the baseline card, which
          has to be the thing a brand-new user looks at first, it was not enough to
          separate the slot from the plain cards below it. Kept low-alpha and
          fading to nothing well before the far edge — this sits behind live text,
          so it may raise the surface, never tint it. The alpha is deliberately low
          enough that the corner reads as warm grey rather than as red: any stronger
          and the card starts to look like the warning cards, which are the one thing
          in this slot that IS meant to be alarming. */}
      {color && wash && size.w > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Defs>
              <RadialGradient
                id={`${gid}w`}
                cx={corner === 'topRight' ? size.w : 0}
                cy={0}
                rx={size.w * 0.8}
                ry={size.h * 0.9}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={color} stopOpacity={0.14} />
                <Stop offset="0.4" stopColor={color} stopOpacity={0.045} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${gid}w)`} />
          </Svg>
        </View>
      )}
      {color && flash && size.w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, flashStyle]} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Defs>
              <RadialGradient
                id={`${gid}f`}
                cx={corner === 'topRight' ? size.w : 0}
                cy={0}
                rx={size.w * 2.2}
                ry={size.h * 2.6}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={fillColor} stopOpacity={0.95} />
                <Stop offset="0.55" stopColor={fillColor} stopOpacity={0.75} />
                <Stop offset="1" stopColor={fillColor} stopOpacity={0.5} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${gid}f)`} />
          </Svg>
        </Animated.View>
      )}
      {children}
      {color && size.w > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Defs>
              <SvgGradient
                id={gid}
                x1={corner === 'topRight' ? size.w * 0.88 : size.w * 0.12}
                y1={0}
                x2={corner === 'topRight' ? size.w * 0.45 : size.w * 0.55}
                y2={size.h}
                gradientUnits="userSpaceOnUse"
              >
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
  const { sex, height } = state.profile;
  const ctx = useMemo(() => ({ sex, height }), [sex, height]);
  // scoreSet makes several passes over the day's readings; memoize so renders
  // not caused by a data change (sheets, animations) don't re-score.
  const { d, readings, all } = useMemo(() => {
    const day = state.days[dk] || ({ readings: [], activities: [] } as never);
    // Imported HRV without enough real RR is not shown or scored anywhere.
    const rs = trustedReadings(day.readings).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    return { d: day, readings: rs, all: scoreSet(rs, day, dk, state.days, ctx) };
  }, [state.days, dk, ctx]);

  // Any scorable input (HRV, BP, resting HR, sleep, activity) populates the
  // outlook right away; the confidence line inside the hero carries the caveat
  // rather than hiding the number behind an HRV requirement.
  const scored = all.score != null;

  // Trailing-week trend check. Lives out here rather than inside the hero: the
  // warning is its own card below the Outlook, sized like Milestones/Protocol.
  const downturn = useMemo(
    () => detectDownturn(state.days, dk, ctx, resolveProtocol(state.settings.protocol), state.customTypes),
    [state.days, dk, ctx, state.settings.protocol, state.customTypes],
  );

  // The second way the same card fires: the score has NOT broken, but the
  // markers that move before it have. Only asked when there is no downturn —
  // the score sliding is the stronger statement, and two warning cards stacked
  // on one screen is the thing this card exists to avoid.
  const strain = useMemo(
    () => (downturn ? null : detectStrain(state.days, dk, ctx)),
    [downturn, state.days, dk, ctx],
  );

  // Until the journal holds one real HRV reading there is no baseline for a
  // score to mean anything against, so the Outlook slot carries the ask instead
  // of a dial. Not a banner above the score — the whole point is that the score
  // is not yet worth showing.
  const baselineWaiting = !hasHrvReading(state.days);

  return (
    <View>
      {baselineWaiting ? (
        <BaselineWaitingCard />
      ) : (
        <GradientBorderCard color={!scored ? null : scoreCat(all.score!).color} trigger={dk} glow flash style={{ marginBottom: 12 }}>
          {!scored ? (
            <UnscoredHero dk={dk} hasReadings={readings.length > 0} />
          ) : (
            <ScoredHero dk={dk} readings={readings} d={d} all={all} ctx={ctx} onExplain={() => openSheet(() => <ScoreExplain all={all} dk={dk} />)} />
          )}
        </GradientBorderCard>
      )}
      {/* Directly under the Outlook: the half-off year, time-boxed to 24h. */}
      <AnnualOfferCard />
      {/* The one-day founding-member offer. It and the card above share ONE
          cool-down clock (src/lib/upsell/pacing): whichever opens first stamps
          it, and nothing else may be raised for a week — so these two can never
          be on screen together. They used to be able to: the annual card's 24h
          unlock reports 'trial', which is exactly the state this one waits for,
          so opening the half-price year made the founder card due underneath
          it. */}
      <FounderOfferCard />
      {downturn ? (
        <WarningCard severity={downturn.severity} headline={downturn.headline}
          onPress={() => openSheet(() => <DownturnExplain w={downturn} dk={dk} />)} />
      ) : strain ? (
        <WarningCard severity={strain.severity} headline={strain.headline}
          onPress={() => openSheet(() => <StrainExplain w={strain} dk={dk} />)} />
      ) : null}
      <TrendCard dk={dk} />
      <MilestoneProgressCard dk={dk} />
      <StreakCard dk={dk} />
    </View>
  );
}

/**
 * The Outlook slot before the first reading exists.
 *
 * Everything downstream — the score, Progress, Trend Watch, every correlation —
 * is built out of HRV, so an install with none of it has an app full of empty
 * rooms. Showing a 0/100 dial there is worse than showing nothing: it reads as
 * a verdict on the user rather than as a missing input. So the slot states what
 * is waiting, shows the three things that stay blank until it arrives, and
 * carries the one button that fixes it.
 *
 * It wears the Outlook's own gradient border lit from the top RIGHT, so it is
 * legibly the same object in the same slot and legibly not the score. The three
 * tiles are SKELETONS rather than checkboxes: the claim is "these are empty",
 * not "here are your chores". No dismiss — this card is the only route back,
 * and it retires itself the moment a reading lands.
 */
/* Labels break where they are WRITTEN, not where the tile happens to run out.
   Three tiles side by side on a narrow phone put "Autonomic score" on two lines
   and "Progress charts" on one, so the three ghost bars sat at different heights
   and the row read as three unrelated boxes. A hard break gives every tile the
   same two lines, with the noun the tile is actually about on the second one. */
const WAITING_ROWS = [
  { label: 'Autonomic\nscore', width: '68%' as const, delay: 0 },
  { label: 'Progress\ncharts', width: '48%' as const, delay: 900 },
  { label: 'Trends &\ncorrelations', width: '80%' as const, delay: 1800 },
];

function BaselineWaitingCard() {
  const p = usePalette();
  const { openSheet } = useSheets();
  return (
    <GradientBorderCard color={p.accent} corner="topRight" glow style={{ marginBottom: 12 }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 14 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: hexA(p.accent, 0.08), borderWidth: 1, borderColor: hexA(p.accent, 0.33), alignItems: 'center', justifyContent: 'center' }}>
            <BrandMark size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[T.section, { color: hexA(p.accent, 0.85), marginBottom: 2 }]}>First reading</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: p.text }}>Your baseline is waiting</Text>
          </View>
        </View>

        <Text style={{ fontSize: 13.5, lineHeight: 20, color: p.textDim, marginBottom: 16 }}>
          Nearly everything the app shows you is built from this reading. Scores, trends and correlations all stay
          empty until there is one to compare against.
        </Text>

        <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 14, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 11 }}>
            {WAITING_ROWS.map((w) => (
              <View key={w.label} style={{ flex: 1, backgroundColor: p.sunk, borderRadius: 14, padding: 11 }}>
                <GhostBar width={w.width} delay={w.delay} />
                <Text style={{ fontSize: 11.5, lineHeight: 15, color: p.textDim }}>{w.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: p.textDim }}>These fill in as you log. Nothing appears until you take a reading.</Text>
        </View>

        <Pressable
          onPress={() => openSheet((c) => <HrvSetup controls={c} />)}
          style={({ pressed }) => [
            { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius.control, backgroundColor: p.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '700' }}>Start my first reading</Text>
        </Pressable>
      </View>
    </GradientBorderCard>
  );
}

/** One placeholder bar, breathing slowly. Deliberately not a spinner: nothing
 *  is loading, these sections are genuinely empty. */
function GhostBar({ width, delay }: { width: `${number}%`; delay: number }) {
  const t = useSharedValue(0.45);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.45, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    ));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({ opacity: t.value }));
  return <Animated.View style={[{ width, height: 11, borderRadius: 999, backgroundColor: '#34343a', marginBottom: 10 }, style]} />;
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
          <Text style={{ fontSize: 57, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 57, marginTop: 8 }}>{all.score}</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: -2 }}>OUT OF 100</Text>
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
    </Pressable>
  );
}

/** The Journal's one warning card, sitting between the Outlook and the Trend
 *  card. TWO detectors feed it and it looks identical for both: ./downturn when
 *  the daily score is sliding, ../lib/scoring/strain when the score still reads
 *  fine but the markers that move before it have drifted. One object, because a
 *  user cannot act on the difference between "your score fell" and "your
 *  recovery markers moved" — both mean take it easy — and two cards stacked
 *  would turn a caution into a wall of alarm. Deliberately the SAME object as
 *  `<TrendCard/>` below it — neutral surface, sunk tile, one sentence, chevron
 *  — with the emoji carrying the severity (⚠️ watch, 🛑 alert) instead of a
 *  wash of red across the card.
 *
 *  It used to be tinted in the severity color, which made it the loudest thing
 *  on a screen someone opens while already feeling bad, and made good news and
 *  bad news look like two unrelated kinds of notice. The sheet behind it still
 *  carries the color — that's where the user went looking for it. */
function WarningCard({ severity, headline, onPress }: { severity: 'watch' | 'alert'; headline: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderWidth: 1, borderColor: p.border, borderRadius: radius.card,
          backgroundColor: p.surface, marginBottom: 12, padding: 15,
          flexDirection: 'row', alignItems: 'center', gap: 13,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border }}>
        <Text style={{ fontSize: 21 }}>{severity === 'alert' ? '🛑' : '⚠️'}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: p.text, lineHeight: 20 }}>{headline}</Text>
      <Icon name="chevronRight" size={20} color={p.textDim} />
    </Pressable>
  );
}

/** The colored headline tile both explain sheets open with: severity color,
 *  one bold readout, its window underneath, and the paragraph. The card in the
 *  Journal is deliberately neutral; the color lives here, where the user went
 *  looking for it. */
function WarnTile({ color, value, sub, body }: { color: string; value: string; sub: string; body: string }) {
  const p = usePalette();
  return (
    <View style={{ borderRadius: radius.card, padding: 14, marginBottom: 16, backgroundColor: mixHex(color, WARN_BASE, 0.14), borderWidth: 1, borderColor: hexA(color, 0.55) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: mixHex(color, WARN_BASE, 0.3) }}>
          <Icon name="trendDown" size={17} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color, fontVariant: ['tabular-nums'] }}>{value}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: hexA(color, 0.8), marginTop: 1 }}>{sub}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: p.text, marginTop: 10 }}>{body}</Text>
    </View>
  );
}

/** Pro-gated "Use AI to investigate", shared by both explain sheets. `build`
 *  runs at press time against fresh state, exactly as the downturn's did. */
function InvestigateButton({ label, title, build }: {
  label: string;
  title: string;
  build: (s: AppState, ctx: ScoreContext) => { prompt: string; rangeText: string };
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const tier = useTier();
  const openPaywall = usePaywall('outlook-ai');
  const press = () => {
    if (tier === 'free') { openPaywall(); return; }
    const s = getState();
    const ctx = { sex: s.profile.sex, height: s.profile.height, protocol: resolveProtocol(s.settings.protocol) };
    const { prompt, rangeText } = build(s, ctx);
    openSheet((c) => <PromptSheet title={title} rangeText={rangeText} prompt={prompt} controls={c} />);
  };
  return (
    <Pressable
      onPress={press}
      style={({ pressed }) => [
        { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: radius.control, backgroundColor: p.accent, marginTop: 2, marginBottom: 4 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name="sparkles" size={16} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** The closing note on both explain sheets. */
function RestNote({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.card, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, marginBottom: 16 }}>
      <Icon name="moon" size={17} color={p.textDim} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: p.textDim }}>{text}</Text>
    </View>
  );
}

/** Sheet behind the warning card when a SCORE downturn fired: the full
 *  explanation, every journal finding that could be driving the slide, an
 *  AI-investigation prompt builder, and a rest/doctor note. */
function DownturnExplain({ w, dk }: { w: Downturn; dk: string }) {
  const p = usePalette();
  const color = w.severity === 'alert' ? SCORE_COLORS.crash : SCORE_COLORS.bad;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Something&apos;s off</Text>
      <WarnTile color={color} value={`Down ${w.drop} points`} sub={`over the last ${w.spanDays} days`} body={w.body} />
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
        <InvestigateButton label="Use AI to investigate" title="Downturn Investigation"
          build={(s, ctx) => buildDownturnPrompt(s, ctx, dk, w)} />
      </SumCard>
      <RestNote text="Get some rest and take it easy until the trend turns. If you are not feeling well, talk with your doctor." />
      <View style={{ height: 24 }} />
    </View>
  );
}

/** Sheet behind the warning card when the STRAIN detector fired.
 *
 *  Same shape as the downturn sheet, one section longer: because the score has
 *  not moved, the sheet has to answer "what are you even looking at" before it
 *  answers "what should I do", so each marker row carries the reading, its own
 *  baseline and why that marker matters. There is no "possibilities" fallback
 *  here — a strain warning cannot fire without at least two findings, so the
 *  empty case does not exist. */
function StrainExplain({ w, dk }: { w: Strain; dk: string }) {
  const p = usePalette();
  const color = w.severity === 'alert' ? SCORE_COLORS.crash : SCORE_COLORS.bad;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{w.title}</Text>
      <WarnTile color={color} value={w.readout.value} sub={w.readout.sub} body={w.body} />
      <SumCard title="What moved">
        {w.factors.map((f) => <MetricRow key={f.label} label={f.label} value={f.value} cat={false} explain={f.detail} />)}
        <InvestigateButton label="Use AI to investigate" title="Strain Investigation"
          build={(s, ctx) => buildStrainPrompt(s, ctx, dk, w)} />
      </SumCard>
      <RestNote text="Nothing here is a diagnosis. Markers drifting together usually means a few lighter days, extra fluids and an earlier night. If it keeps going or you feel unwell, talk with your doctor." />
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
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 11, padding: 10, borderRadius: radius.control, backgroundColor: mixHex(color, WARN_BASE, 0.14), borderWidth: 1, borderColor: hexA(color, 0.55) }}>
      <Icon name="alert" size={15} color={color} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color }}>{text}</Text>
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

function ScoreExplain({ all, dk }: { all: ScoreSetResult; dk: string }) {
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

  // Confidence is the share of the full input set that was available today.
  // Anything below is a component the score never saw, so it's what we're
  // unsure of — group the missing inputs by the single action that captures
  // them and show the confidence each would restore.
  const CONF_INPUTS: { label: string; w: number; src: string }[] = [
    { label: 'HRV (RMSSD)', w: 25, src: 'hrv' },
    { label: 'Total power', w: 15, src: 'guided' },
    { label: 'pNN50', w: 10, src: 'guided' },
    { label: 'VLF power', w: 10, src: 'guided' },
    { label: 'LF peak', w: 10, src: 'guided' },
    { label: 'Blood pressure', w: 8, src: 'bp' },
    { label: 'Resting HR', w: 7, src: 'rhr' },
    { label: 'Sleep', w: 8, src: 'sleep' },
    { label: 'Activity', w: 2, src: 'activity' },
  ];
  const CONF_SOURCES: Record<string, string> = {
    guided: 'Capture a guided HRV reading',
    hrv: 'Take an HRV reading',
    bp: 'Log a blood pressure reading',
    rhr: 'Log a resting heart rate',
    sleep: 'Log last night’s sleep',
    activity: 'Log today’s activity',
  };
  const present = new Set(comps.map((c) => c.label));
  const missing = CONF_INPUTS.filter((f) => !present.has(f.label));
  const confGaps = Object.keys(CONF_SOURCES)
    .map((src) => {
      const items = missing.filter((m) => m.src === src);
      return { src, action: CONF_SOURCES[src], w: items.reduce((s, m) => s + m.w, 0), labels: items.map((m) => m.label) };
    })
    .filter((g) => g.w > 0)
    .sort((a, b) => b.w - a.w);

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
            <Text style={{ fontSize: 57, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 57, marginTop: 8 }}>{all.score}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: -2 }}>OUT OF 100</Text>
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
      <SumCard title="What would raise confidence">
        {confGaps.length ? confGaps.map((g) => (
          <MetricRow
            key={g.src}
            label={g.action}
            value={`+${g.w}%`}
            cat={false}
            explain={`Not captured today, so the score is estimated without ${g.labels.join(', ')}. Adding it would raise confidence by about ${g.w} points.`}
          />
        )) : (
          <MetricRow label="Full input set logged" value="" cat={false} explain="Every scored input was available today, so nothing is missing. This is as confident as the score gets." />
        )}
      </SumCard>
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
