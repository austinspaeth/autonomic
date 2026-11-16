/**
 * The folding iPhone's two navigation layouts (src/lib/fold.ts decides which):
 *
 * - `RailBar`: the closed phone. The floating bar turned vertical and stood in
 *   the bottom of the strip the outer display keeps clear beside the camera.
 *   Same glass, same sliding highlight, same items, just on the other axis.
 * - `SideNav`: the open phone in landscape. A column down the right holding the
 *   three views, today's score and the pacing budget, with Settings and the
 *   plan line at its foot.
 *
 * Both are drawn by the tab layout (app/(tabs)/_layout.tsx) in place of the
 * bottom bar, from the same tab list and the same press handler, so a tab
 * cannot behave differently depending on which bar you reached it from.
 *
 * The sidebar's score and pacing figure are NOT computed here. They are the
 * widget payload (`getLastWidgetPayload`, src/lib/widgets.ts), the one build
 * that already feeds the home screen widgets and the Apple Watch, so this
 * column, the widget beside it and the wrist can never show three answers.
 * A payload for another day is not today's and reads as awaiting, the widgets'
 * own rule.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, Icon, type IconName } from '../components/Icon';
import { ScoreGauge } from '../components/charts';
import { BudgetBar } from './budget/Bar';
import { HEADER_CONTENT_HEIGHT } from '../components/Header';
import { fonts, GRADE_COLORS, usePalette } from '../theme';
import { currentPacingFrame, getLastWidgetPayload, liveWidgetOpts, subscribeWidgetPayload, type WidgetPayload } from '../lib/widgets';
import { profileCtx } from '../lib/scoring';
import { resolveProtocol, scoreSet, type ScoreSetResult } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { trustedReadings } from '../lib/hrvQuality';
import { buildBudget, type BudgetView } from '../lib/budget';
import { getState } from '../store/store';
import { useSheets } from '../components/Sheet';
import { openBudgetSheet } from './budget/open';
import { ScoreExplain } from './DaySummary';
import { addDays, todayKey } from '../lib/dates';
import { useNow } from '../lib/useNow';
import { usePaywall } from './Paywall';
import { MONTHLY_SKU, priceOf, useIap } from '../store/iap';
import { getTrialDaysLeft, useAccessGrant, useTier } from '../store/tier';

export interface NavItem { key: string; label: string; icon: IconName; badge?: boolean }

interface NavProps {
  items: NavItem[];
  active: number;
  onPress: (i: number) => void;
  onSettings: () => void;
}

const SPRING = { damping: 19, stiffness: 210, mass: 1 };
const GLASS = Platform.OS === 'ios' ? 'rgba(6,6,9,0.82)' : '#0a0a0e';
const EDGE = '#34343b';
/** The header's own fill (components/Header.tsx), so the column and the header
 *  band beside it read as one piece of chrome. */
const COLUMN_BG = '#040406';

// Solid (filled) cog, hollow center via even-odd fill. Opens the menu sheet.
export function SolidCog({ size = 22, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={color}
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.5-.42h-3.84a.48.48 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.14.24.42.34.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.17.07.45-.02.59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
      />
    </Svg>
  );
}

/** Unseen-findings dot: violet, the palette's "noticed, not graded" colour. */
function Badge() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -2, right: -5, width: 7, height: 7, borderRadius: 999, backgroundColor: GRADE_COLORS.warning }}
    />
  );
}

/* ---------- the plan line, shared with the bottom bar's folder tab ---------- */

/**
 * The plan status the bottom bar's folder tab says ("9 days left of Pro trial ·
 * Keep it"), as data, so the sidebar can say the same thing in its own shape.
 * Null for anyone with nothing to be sold: Pro, or access held open by a code.
 */
export function usePlanStatus(): { trial: boolean; headline: string; detail: string; cta: string; open: () => void } | null {
  const tier = useTier();
  const gifted = useAccessGrant();
  const { products } = useIap();
  const open = usePaywall('plan-bar', 'monthly');
  // Days left is a function of the clock, and the tier store only notifies when
  // the tier itself flips, so re-read it whenever the app comes back.
  const [, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTick((t) => t + 1); });
    return () => sub.remove();
  }, []);
  if (tier === 'pro' || gifted) return null;
  const trial = tier === 'trial';
  const days = getTrialDaysLeft();
  return {
    trial,
    headline: trial ? `${days} day${days === 1 ? '' : 's'} left` : 'Free plan',
    detail: trial ? 'of Pro trial' : `· ${priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU)}/mo for Pro`,
    cta: trial ? 'Keep it' : 'Upgrade Now',
    open,
  };
}

/* ---------- closed phone: the vertical rail ---------- */

/** The rail's width inside the strip; it never fills the strip edge to edge. */
const RAIL_W = 62;
const RAIL_PAD = 5;
/** The highlight behind a rail item is a squircle, not a pill: on a tall,
 *  narrow item a full radius reads as a circle squashed into it. */
const RAIL_ITEM_R = 16;

export function RailBar({ items, active, onPress, onSettings, edge, strip, brand }: NavProps & {
  edge: 'left' | 'right'; strip: number;
  /** The bar's own brand mark (seasonal variants and all), stacked on top. */
  brand?: React.ReactNode;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const w = Math.min(RAIL_W, strip - 8);

  // Measured per-item geometry drives the sliding highlight, as on the bar.
  const [layouts, setLayouts] = useState<{ y: number; h: number }[]>([]);
  const pillY = useSharedValue(0);
  const pillH = useSharedValue(0);
  useEffect(() => {
    const l = layouts[active];
    if (!l) return;
    if (pillH.value === 0) { pillY.value = l.y; pillH.value = l.h; }
    else { pillY.value = withSpring(l.y, SPRING); pillH.value = withSpring(l.h, SPRING); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, layouts]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pillY.value }], height: pillH.value }));

  // No outline: the strip is already its own column beside the content, so the
  // glass needs no edge to separate it from anything.
  const shell = {
    width: w, borderRadius: w / 2, overflow: 'hidden' as const,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  };
  const body = (
    <View style={{ padding: RAIL_PAD, gap: 2, backgroundColor: GLASS }}>
      {brand ? <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 16 }}>{brand}</View> : null}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: RAIL_PAD, right: RAIL_PAD, top: 0, borderRadius: RAIL_ITEM_R, borderCurve: 'continuous', backgroundColor: p.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)' }, pillStyle]}
      />
      {items.map((it, i) => {
        const focused = i === active;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={it.label}
            onPress={() => onPress(i)}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setLayouts((prev) => {
                if (prev[i] && prev[i].y === y && prev[i].h === height) return prev;
                const next = prev.slice();
                next[i] = { y, h: height };
                return next;
              });
            }}
            style={{ paddingVertical: 9, borderRadius: RAIL_ITEM_R, borderCurve: 'continuous', alignItems: 'center' }}
          >
            <View>
              <Icon name={it.icon} size={22} color={focused ? p.text : p.textDim} />
              {it.badge ? <Badge /> : null}
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 10, fontWeight: '600', color: focused ? p.text : p.textDim, marginTop: 3 }}>{it.label}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={onSettings}
        style={{ paddingVertical: 12, alignItems: 'center' }}
      >
        <SolidCog size={22} color={p.textDim} />
      </Pressable>
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', bottom: insets.bottom + 12, [edge]: Math.max(4, (strip - w) / 2) }}
    >
      {Platform.OS === 'android'
        ? <View style={[shell, { backgroundColor: '#0a0a0e' }]}>{body}</View>
        : <BlurView intensity={40} tint="dark" style={shell}>{body}</BlurView>}
    </View>
  );
}

/* ---------- open phone, landscape: the column ---------- */

function useWidgetPayload(): WidgetPayload | null {
  return useSyncExternalStore(subscribeWidgetPayload, getLastWidgetPayload, getLastWidgetPayload);
}

/** The gauge draws on a fixed 176pt geometry; the column shows it small. */
const GAUGE_SCALE = 0.36;
const GAUGE_W = Math.round(176 * GAUGE_SCALE);
/** The 270° arc leaves its own gap at the bottom of the gauge's square, so the
 *  box is only as tall as the arc and the text beside it centres on the arc
 *  rather than on the empty corner beneath it. */
const GAUGE_H = Math.round(150 * GAUGE_SCALE);

/** Today's score, scored the way the Journal's Outlook scores it, for the
 *  explain sheet. Null when the day has no score yet. */
function todayScoreSet(): { all: ScoreSetResult; dk: string } | null {
  const state = getState();
  const dk = todayKey();
  const ctx = profileCtx(state.profile);
  const day = state.days[dk] || ({ readings: [], activities: [] } as never);
  const rs = trustedReadings(day.readings).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
  const all = scoreSet(rs, day, dk, state.days, ctx);
  return all.score == null ? null : { all, dk };
}

/** Today's full budget view, built on the inputs the Journal strip builds it
 *  from, for the budget sheet. Built at tap time: the payload carries frames,
 *  not the view the sheet draws. */
function todayBudget(): { budget: BudgetView; dk: string } {
  const state = getState();
  const dk = todayKey();
  const ctx = profileCtx(state.profile);
  const o = liveWidgetOpts();
  const downturn = detectDownturn(state.days, dk, ctx, resolveProtocol(state.settings.protocol), state.customTypes);
  const strain = downturn ? null : detectStrain(state.days, dk, ctx);
  const budget = buildBudget(state, dk, ctx, {
    now: new Date(), addDays,
    downturn: !!downturn,
    strain: strain ? strain.severity : null,
    past: false,
    stepsGranted: o.stepsGranted,
    standTestAsked: o.standTestAsked,
    userUnpaused: o.userUnpaused,
    pausedDays: o.pausedDays,
  });
  return { budget, dk };
}

/**
 * Today's score and pacing figure, both drawn from the widget payload, compact:
 * a small gauge with the grade centred beside it, then the pacing row in the
 * Journal strip's own grammar (features/budget/Strip: the PACING label beside
 * the figure, the real `BudgetBar` under it). Each half opens what it opens in
 * the Journal: the score its explain sheet, the pacing row the budget sheet
 * (or the Pro card on a free install, through the same choke point).
 */
function TodayCard({ onOpenJournal }: { onOpenJournal: () => void }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const payload = useWidgetPayload();
  // The pace marker walks with the clock; the frames already say where.
  const now = useNow(5 * 60_000, true);
  const today = payload && payload.date === todayKey() ? payload : null;
  const scored = !!today?.hasScore;
  const frame = today ? currentPacingFrame(today.pacing, now) : null;
  const scoreColor = scored ? today!.color : p.textDim;
  const barState = frame && (frame.state === 'healthy' || frame.state === 'ahead' || frame.state === 'over') ? frame.state : null;

  const openScore = () => {
    const s = todayScoreSet();
    // No score yet: the Journal is where that is explained and fixed.
    if (!s) { onOpenJournal(); return; }
    openSheet(() => <ScoreExplain all={s.all} dk={s.dk} />);
  };
  const openPacing = () => {
    const { budget, dk } = todayBudget();
    openBudgetSheet(openSheet, dk, budget);
  };

  return (
    <View style={[styles.card, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={scored ? `Autonomic score ${today!.score}, ${today!.label}. How this was calculated.` : 'Autonomic score awaiting data. Open the Journal.'}
        onPress={openScore}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10 }, pressed && { opacity: 0.7 }]}
      >
        <View style={{ width: GAUGE_W, height: GAUGE_H }}>
          <View style={{ position: 'absolute', width: 176, height: 176, left: (GAUGE_W - 176) / 2, top: (GAUGE_W - 176) / 2, transform: [{ scale: GAUGE_SCALE }] }}>
            <ScoreGauge score={scored ? today!.score : 0} color={scoreColor}>
              <Text style={{ fontSize: 64, fontFamily: fonts.numHeavy, color: scored ? p.text : p.textDim, fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 70, marginTop: 12 }}>
                {scored ? today!.score : '–'}
              </Text>
            </ScoreGauge>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: p.textDim }} numberOfLines={1}>
            Autonomic score
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: scored ? scoreColor : p.textDim, marginTop: 2 }} numberOfLines={1}>
            {scored ? today!.label : 'Awaiting data'}
          </Text>
        </View>
      </Pressable>

      {frame ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pacing budget. ${frame.figure} ${frame.sub}`}
          onPress={openPacing}
          style={({ pressed }) => [{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, marginTop: 10, paddingTop: 10 }, pressed && { opacity: 0.7 }]}
        >
          {frame.state === 'locked' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={13} color={p.textDim} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: p.textDim }} numberOfLines={1}>Pacing · Included with Pro</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: p.textDim }}>Pacing</Text>
                <Text style={{ fontFamily: fonts.numHeavy, fontSize: 12.5, fontVariant: ['tabular-nums'], color: frame.state === 'over' ? p.accent : p.text }} numberOfLines={1}>
                  {frame.figure}
                </Text>
                {frame.unit ? <Text style={{ fontSize: 11.5, color: p.textDim }}>{frame.unit}</Text> : null}
              </View>
              {barState ? (
                <View style={{ marginTop: 8 }}>
                  <BudgetBar state={barState} fill={frame.fill} expected={frame.pace} height={8} />
                </View>
              ) : null}
              {frame.sub ? <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 10 }} numberOfLines={1}>{frame.sub}</Text> : null}
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export function SideNav({ items, active, onPress, onSettings, width }: NavProps & { width: number }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const plan = usePlanStatus();

  return (
    <View
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width,
        paddingLeft: 12, paddingRight: insets.right + 12, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12,
        backgroundColor: COLUMN_BG, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: EDGE,
      }}
    >
      {/* The brand band is the header band's height, so the column's top edge
          and the header rule beside it line up. */}
      <View style={{ height: HEADER_CONTENT_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 8 }}>
        {/* The lockup the Settings brand card uses: the mark beside the name. */}
        <BrandMark size={22} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: p.text, letterSpacing: -0.3 }}>Autonomic</Text>
      </View>

      <View style={{ marginTop: 12, gap: 4 }}>
        {items.map((it, i) => {
          const focused = i === active;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={it.label}
              onPress={() => onPress(i)}
              style={({ pressed }) => [
                styles.row,
                focused && { backgroundColor: p.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' },
                pressed && !focused && { opacity: 0.6 },
              ]}
            >
              <View>
                <Icon name={it.icon} size={22} color={focused ? p.text : p.textDim} />
                {it.badge ? <Badge /> : null}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: focused ? p.text : p.textDim }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 18 }}>
        <TodayCard onOpenJournal={() => onPress(0)} />
      </View>

      <View style={{ flex: 1 }} />

      {plan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${plan.headline} ${plan.detail}. ${plan.cta}`}
          onPress={plan.open}
          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 10 }, pressed && { opacity: 0.7 }]}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, color: p.textDim }}>
            <Text style={{ fontWeight: '700', color: p.text }}>{plan.headline}</Text> {plan.detail}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ marginTop: 4, fontSize: 12, fontWeight: '700', color: p.accent, textDecorationLine: 'underline', textDecorationColor: 'rgba(224,49,39,0.33)' }}
          >
            {plan.cta}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={onSettings}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        <SolidCog size={22} color={p.textDim} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: p.textDim }}>Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
});
