/**
 * The AI hand-off at the bottom of Insights: one floating button, and the sheet
 * behind it.
 *
 * The reports used to BE this screen: twelve prompt buttons that answered nothing
 * themselves. Now the screen answers on its own and the reports are one pill, so
 * they stay one tap away without being the first thing anybody sees.
 *
 * The label is FIXED. An earlier version cycled through what it could do while
 * animating its own width, which drew the eye away from the findings on a screen
 * whose whole point is the findings, and moved under the thumb. A persistent
 * affordance should sit still and say one thing.
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useAccordion } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { ACCENT, radius, usePalette } from '../../theme';
import { pillSlotTaken, subscribePillSlot } from '../../store/pillSlot';
import { getState } from '../../store/store';
import { todayKey } from '../../lib/dates';
import { resolveProtocol } from '../../lib/scoring/day';
import { dayHasOwnData, demoState, hasOwnData } from '../../lib/demo';
import {
  REPORT_CARDS, buildDataExport, buildDoctorPrompt, buildPrompt, reportDateRange,
  type ReportRange,
} from '../../lib/analysis/reports';
import { PromptSheet } from '../PromptSheet';

/* ---------- pill chrome, matched to HealthUpdates / WhatsNew ---------- */

const PILL_H = 54;
const BORDER = 1;
const RECEDE_SCALE = 0.9;
const RECEDE_LIFT = 13;
const RECEDE_SPRING = { damping: 21, stiffness: 210, mass: 0.9 } as const;

export const ASK_AI_LABEL = 'Get AI Insights & Reports';
/** The sheet's own title. Shorter than the button's, which has to say "Get". */
export const AI_SHEET_TITLE = 'AI Insights & Reports';

export function AskAiPill() {
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();

  // Yields to the priority pills (health import, watch sync) exactly the way the
  // What's new pill does, rather than competing for the slot.
  const taken = useSyncExternalStore(subscribePillSlot, pillSlotTaken, pillSlotTaken);
  const recede = useSharedValue(pillSlotTaken() ? 1 : 0);
  useEffect(() => { recede.value = withSpring(taken ? 1 : 0, RECEDE_SPRING); }, [taken, recede]);
  const style = useAnimatedStyle(() => {
    const scale = 1 - (1 - RECEDE_SCALE) * recede.value;
    return {
      opacity: 1 - 0.2 * recede.value,
      transform: [{ translateY: -RECEDE_LIFT * recede.value }, { scale }],
    };
  });

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88 }, style]}>
      <View style={styles.pill}>
        <Pressable
          // While receded the pill is decoration behind the one that owns the
          // slot; tapping the sliver would be a mis-tap, not an intent.
          onPress={taken ? undefined : () => openSheet((c) => <AiReportsSheet controls={c} />, { fitContent: true })}
          accessibilityRole="button"
          accessibilityLabel={ASK_AI_LABEL}
        >
          <Blurred>
            <View style={styles.row}>
              {/* Accent glyph on a neutral pill: the red marks this as the one AI
                  affordance on the screen, while the grey hairline keeps the pill
                  itself from reading as an alert. */}
              <Icon name="ai" size={20} color={ACCENT} strokeWidth={2} />
              <Text numberOfLines={1} style={styles.label}>{ASK_AI_LABEL}</Text>
              <Icon name="chevronRight" size={18} color="#9a9aa0" strokeWidth={2.2} />
            </View>
          </Blurred>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * Black glass on iOS: a dark BlurView over a near-opaque black tint, the same
 * treatment the tab bar and the other floating pills wear, so this reads as part
 * of the same chrome rather than as a button dropped on top of it.
 *
 * Android gets the flat near-black fill instead. `expo-blur` there is plain
 * translucency unless the experimental Dimezis path is opted into, and it reads as
 * a grey slab, which is worse than no blur at all.
 */
function Blurred({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'android') return <View style={[styles.stack, { backgroundColor: '#0a0a0e' }]}>{children}</View>;
  return <BlurView intensity={40} tint="dark" style={styles.stack}>{children}</BlurView>;
}

const styles = StyleSheet.create({
  // zIndex 1 against the priority pills' 2: this is always the layer behind.
  // Mount order alone would do it on iOS, but Android resolves overlap by
  // elevation first and every pill shares elevation 8, so say it explicitly.
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  pill: {
    // Neutral grey hairline, matched to the health-import and what's-new pills.
    // An accent-red outline made a persistent affordance look like an alert.
    height: PILL_H, borderRadius: 999, overflow: 'hidden', borderWidth: BORDER, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  stack: { backgroundColor: 'rgba(6,6,9,0.82)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: PILL_H - BORDER * 2, paddingLeft: 20, paddingRight: 16, justifyContent: 'center' },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

/* ---------- the sheet ---------- */

/**
 * The state reports are built from: the user's own, or the sample month while
 * they have logged nothing. Resolved at press time off fresh store state so it
 * can never disagree with what the view decided to render.
 */
const reportState = () => { const s = getState(); return hasOwnData(s.days) ? s : demoState(s); };

const RANGES: { val: ReportRange; label: string }[] = [
  { val: 'day', label: 'Today' },
  { val: 'week', label: 'Past week' },
  { val: 'month', label: 'Past month' },
  { val: 'year', label: 'Past year' },
];

/**
 * Three reports, and only three.
 *
 * The old screen offered twelve, which is a menu rather than a choice, and eleven
 * of them were variations on "analyse my data" that the view now answers itself.
 * What is left is what a language model can do that the device cannot: write prose.
 *
 * The two long-form reports are all time and say so, because a health report built
 * from one day is not a health report. The data-only prompt expands into its four
 * ranges in place, because that one is a copy of the user's own numbers and they
 * already know which stretch they want.
 *
 * No close button. The sheet has its own dismiss, and a second one at the bottom
 * of a short card is a row that does nothing but take up space.
 */
export function AiReportsSheet(_props: { controls?: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [expanded, setExpanded] = useState(false);
  const acc = useAccordion(expanded);

  /**
   * How much data each period actually holds.
   *
   * This replaces a `toast('No data available for this period')` that could never
   * be seen: the sheet stack is an RN Modal, which paints above the toast layer, so
   * tapping "Today" on a day with nothing logged silently did nothing at all.
   * Showing the count up front makes the choice informed instead, and an empty
   * period simply can't be chosen.
   *
   * Counted with `dayHasOwnData` rather than `entryCount`, which counts loggable
   * entries and so reads zero for a day whose only content is water, a note or a
   * meal — content the export renders perfectly well. Resolved once when the sheet
   * opens; the journal cannot change while it is on screen.
   */
  const periods = useMemo(() => {
    const state = reportState();
    return RANGES.map((r) => {
      const { keys } = reportDateRange(r.val, todayKey(), state.days);
      return { ...r, n: keys.filter((k) => dayHasOwnData(state.days[k])).length };
    });
  }, []);

  const open = (kind: 'data' | 'overall' | 'doctor', range: ReportRange = 'all') => {
    const state = reportState();
    // The builders resolve their own keys from the range; only the label is needed
    // here. Nothing is gated on emptiness any more — an empty period is disabled in
    // the picker below, which is a visible answer rather than an invisible one.
    const { rangeText } = reportDateRange(range, todayKey(), state.days);
    const ctx = {
      sex: state.profile.sex,
      height: state.profile.height,
      protocol: resolveProtocol(state.settings.protocol),
      customTypes: state.customTypes,
    };

    if (kind === 'data') {
      openSheet((c) => (
        <PromptSheet
          title="Data for prompt"
          rangeText={rangeText}
          prompt={buildDataExport(state, ctx, range, todayKey())}
          controls={c}
          subtitle="Structured data only, no analysis prompt. Paste it into an AI to get specific reports or data back."
        />
      ));
      return;
    }

    if (kind === 'doctor') {
      openSheet((c) => <PromptSheet title="Medical summary for doctor" rangeText={rangeText} prompt={buildDoctorPrompt(state, ctx, range, todayKey())} controls={c} />);
      return;
    }

    const card = REPORT_CARDS.find((x) => x.id === 'overall')!;
    openSheet((c) => <PromptSheet title="Full health report" rangeText={rangeText} prompt={buildPrompt(state, ctx, [card], range, todayKey())} controls={c} />);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Icon name="ai" size={18} color={p.accent} strokeWidth={2} />
        <Text style={{ color: p.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>{AI_SHEET_TITLE}</Text>
      </View>
      {/* Held short of the sheet's own close button, which sits in the top-right
          corner over this text. */}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginBottom: 16, maxWidth: '82%' }}>
        The findings on this screen are already yours. These send your data out for a written read.
      </Text>

      {/* One container, and the periods slide open inside it. `useAccordion` is
          the app's shared collapse motion (Journal streak card, annual offer), so
          this opens exactly like every other expanding row: chevron rotating in
          place, measured height on a plain timing curve, never a spring. */}
      <View style={{ backgroundColor: p.sunk, borderColor: p.border, borderWidth: 1, borderRadius: 16, marginBottom: 9, overflow: 'hidden' }}>
        <ReportRow
          icon="download"
          title="Data for prompt"
          sub={expanded ? 'Pick a period' : 'Your numbers, no analysis prompt'}
          onPress={() => setExpanded((v) => !v)}
          chevStyle={acc.chevStyle}
          bare
        />
        <Animated.View style={[{ overflow: 'hidden' }, acc.bodyStyle]}>
          <View style={[acc.measureStyle, { paddingHorizontal: 11, paddingBottom: 11, gap: 7 }]} onLayout={acc.onContentLayout}>
            {periods.map((r) => {
              const empty = r.n === 0;
              return (
                <Pressable
                  key={r.val}
                  disabled={empty}
                  // Collapse on choose: the picker has served its purpose, and
                  // coming back to an already-open accordion reads as a stuck menu.
                  onPress={() => { setExpanded(false); open('data', r.val); }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: empty }}
                  accessibilityLabel={empty ? `${r.label}, nothing logged` : `${r.label}, ${r.n} days of data`}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      borderWidth: 1, borderColor: p.border, borderRadius: radius.control,
                      backgroundColor: p.surface2, paddingVertical: 12, paddingHorizontal: 14,
                    },
                    empty && { opacity: 0.45 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={{ color: p.text, fontSize: 14.5, fontWeight: '600' }}>{r.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: p.textDim, fontSize: 12.5 }}>
                      {empty ? 'nothing logged' : r.val === 'day' ? 'logged today' : `${r.n} ${r.n === 1 ? 'day' : 'days'}`}
                    </Text>
                    {empty ? null : <Icon name="chevronRight" size={15} color={p.textDim} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>

      <ReportRow icon="chart" title="Full health report" sub="Every tracked area, all time" onPress={() => open('overall')} />
      <ReportRow icon="clipboard" title="Medical summary for doctor" sub="Print-ready clinical document, all time" onPress={() => open('doctor')} />

      <Text style={{ color: p.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 8 }}>
        Nothing is sent anywhere by the app. Each of these builds a prompt you copy and paste yourself.
      </Text>
      {/* Reserve the room the sheet's footer would have taken, so the last row
          isn't flush against the bottom edge. */}
      <View style={{ height: 10 }} />
    </View>
  );
}

function ReportRow({ icon, title, sub, onPress, chevStyle, bare }: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  sub: string;
  onPress: () => void;
  /** When present, the chevron points DOWN and rotates via `useAccordion`. */
  chevStyle?: StyleProp<ViewStyle>;
  /** Rendered inside a container that already draws the card chrome. */
  bare?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
        !bare && { marginBottom: 9, backgroundColor: p.sunk, borderColor: p.border, borderWidth: 1, borderRadius: 16 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={15} color={p.accent} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: p.text, fontSize: 14.5, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 2 }}>{sub}</Text>
      </View>
      {chevStyle
        ? <Animated.View style={chevStyle}><Icon name="chevron" size={16} color={p.textDim} /></Animated.View>
        : <Icon name="chevronRight" size={16} color={p.textDim} />}
    </Pressable>
  );
}
