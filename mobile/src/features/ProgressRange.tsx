/**
 * Progress's range control — the four tabs, the overflow that opens a custom
 * window, and the chip that replaces them once one is applied.
 *
 * Two rules shape it (Claude Design "Custom Range Filter"):
 *
 * 1. **The overflow rides on the tabs' own capsule.** Day/Week/Month/Year give
 *    up their padding so a 42pt button fits beside them (`trailing` on
 *    `Segmented`); nothing is added above or below, so the header band's height
 *    never moves. It is three dots rather than a calendar glyph on purpose — a
 *    calendar would read as a fifth sibling of the four ranges, and this is
 *    "more ways to filter", not another range.
 * 2. **An applied range REPLACES the tabs rather than sitting beside them.**
 *    Four greyed tabs next to a date range leaves it ambiguous which is in
 *    effect. The two states cross-fade in the same slot, so the swap reads as
 *    the control changing rather than as the header re-laying out.
 *
 * The chip itself is tappable (reopens the sheet with the current values, so
 * changing just the grouping is one tap) and its ✕ is a separate target that
 * returns to Day. Neither is red: nothing here needs emphasis.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing as REasing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '../components/Icon';
import { Button, Segmented } from '../components/ui';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { addDays, fmtSlashShort, keyOf, todayKey } from '../lib/dates';
import { MAX_CUSTOM_BUCKETS, customBucketCount, type CustomRange, type Mode } from '../lib/analysis/buckets';
import { Calendar } from './Calendar';

export const MODE_LABEL: Record<Mode, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

const RANGE_OPTIONS: { val: Mode; label: string }[] = [
  { val: 'day', label: 'Day' },
  { val: 'week', label: 'Week' },
  { val: 'month', label: 'Month' },
  { val: 'year', label: 'Year' },
];

/** "1/25/26 – 3/26/26". The en dash, not a hyphen: this is a span, not a minus. */
export const rangeText = (c: CustomRange) => `${fmtSlashShort(c.from)} – ${fmtSlashShort(c.to)}`;

const CROSSFADE = { duration: 200, easing: REasing.out(REasing.quad) };

/* ────────────────────────────── the header bar ────────────────────────────── */

export function ProgressRangeBar({ mode, custom, onChangeMode, onSettled, onApply, onClear }: {
  mode: Mode;
  custom: CustomRange | null;
  onChangeMode: (m: Mode) => void;
  onSettled: () => void;
  onApply: (c: CustomRange, group: Mode) => void;
  onClear: () => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <CustomRangeSheet controls={c} initial={custom} initialGroup={mode} onApply={onApply} />,
    { fitContent: true },
  );

  // 0 = tabs, 1 = chip. Both layers stay mounted through the fade; the tabs are
  // the one in flow, so the bar's height is theirs at every point in it.
  const t = useSharedValue(custom ? 1 : 0);
  useEffect(() => { t.value = withTiming(custom ? 1 : 0, CROSSFADE); }, [custom, t]);
  const tabsStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 1 - 0.03 * t.value }] }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.97 + 0.03 * t.value }] }));

  // The chip's text is held through the fade-out, so clearing doesn't blank the
  // dates for the 200ms the tabs take to arrive.
  const [shown, setShown] = useState(custom);
  useEffect(() => { if (custom) setShown(custom); }, [custom]);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ position: 'relative' }}>
        <Animated.View pointerEvents={custom ? 'none' : 'auto'} style={tabsStyle}>
          <Segmented
            options={RANGE_OPTIONS}
            value={mode}
            onChange={onChangeMode}
            onSettled={onSettled}
            trailing={{ icon: 'dots', onPress: open, accessibilityLabel: 'More ways to filter' }}
          />
        </Animated.View>
        <Animated.View
          pointerEvents={custom ? 'auto' : 'none'}
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' }, chipStyle]}
        >
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1,
            borderRadius: radius.pill, paddingLeft: 14, paddingRight: 3, height: '100%',
          }}>
            <Icon name="calendar" size={17} color={p.textDim} strokeWidth={2} />
            <Pressable
              onPress={open}
              accessibilityRole="button"
              style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 7 }, pressed && { opacity: 0.6 }]}
            >
              <Text numberOfLines={1} style={{ color: p.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {shown ? rangeText(shown) : ''}
              </Text>
              <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 13 }}>by {MODE_LABEL[mode]}</Text>
            </Pressable>
            <Pressable
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear custom range"
              hitSlop={10}
              style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
            >
              <Icon name="x" size={19} color={p.textDim} strokeWidth={2.4} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/* ──────────────────────────────── the sheet ──────────────────────────────── */

type Preset = { label: string; range: () => CustomRange };
const PRESETS: Preset[] = [
  { label: 'Last 30 days', range: () => ({ from: addDays(todayKey(), -29), to: todayKey() }) },
  { label: 'Last 90', range: () => ({ from: addDays(todayKey(), -89), to: todayKey() }) },
  { label: 'This year', range: () => ({ from: keyOf(new Date(new Date().getFullYear(), 0, 1)), to: todayKey() }) },
];

/**
 * Two questions, in that order: which dates, then how to compare them. The
 * grouping row reuses the same four words as the main bar, so nothing new has
 * to be learned — and the presets carry most of the traffic without a date
 * picker being opened at all.
 */
export function CustomRangeSheet({ controls, initial, initialGroup, onApply }: {
  controls: SheetControls;
  initial: CustomRange | null;
  initialGroup: Mode;
  onApply: (c: CustomRange, group: Mode) => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [from, setFrom] = useState(() => initial?.from ?? addDays(todayKey(), -29));
  const [to, setTo] = useState(() => initial?.to ?? todayKey());
  const [group, setGroup] = useState<Mode>(initialGroup);

  // Read a backwards pair the way the engine does rather than refusing it: the
  // picker can only be tapped one field at a time, so "to before from" is a
  // waypoint on the way to a valid range, not a mistake to scold.
  const range = useMemo<CustomRange>(() => (from <= to ? { from, to } : { from: to, to: from }), [from, to]);
  const buckets = useMemo(() => customBucketCount(group, range), [group, range]);
  const tooMany = buckets > MAX_CUSTOM_BUCKETS;

  const pickDate = (which: 'from' | 'to') => openSheet(
    (c) => (
      <Calendar
        current={which === 'from' ? from : to}
        onPick={which === 'from' ? setFrom : setTo}
        controls={c}
        title={which === 'from' ? 'Range starts' : 'Range ends'}
        showToday={false}
      />
    ),
    { fitContent: true },
  );

  const label = { fontSize: 11.5, fontWeight: '700' as const, letterSpacing: 0.9, color: p.textDim };

  return (
    <View>
      {/* No standfirst under the title: the two labelled date fields and the
          "Compare by" row directly below say what the sheet does, and a
          sentence restating them is a paragraph to read before the controls. */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, paddingRight: 58, marginBottom: 20 }}>Custom range</Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <DateField label="FROM" value={from} onPress={() => pickDate('from')} />
        <Text style={{ color: p.textDim, fontSize: 15, height: 50, lineHeight: 50 }}>to</Text>
        <DateField label="TO" value={to} onPress={() => pickDate('to')} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 22 }}>
        {PRESETS.map((preset) => {
          const r = preset.range();
          const on = r.from === range.from && r.to === range.to;
          return (
            <Pressable
              key={preset.label}
              onPress={() => { setFrom(r.from); setTo(r.to); }}
              style={({ pressed }) => [{
                flex: 1, height: 36, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accentSoft : 'transparent',
              }, pressed && { opacity: 0.6 }]}
            >
              <Text numberOfLines={1} style={{ color: on ? p.accent : p.text, fontSize: 13, fontWeight: '600' }}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[label, { marginBottom: 8 }]}>COMPARE BY</Text>
      <Segmented options={RANGE_OPTIONS} value={group} onChange={setGroup} />

      {/* Only the refusal is said. A running "30 points across 30 days" readout
          restated the two things already on screen — the dates above and the
          grouping beside it — so it read as chrome, not as information. The
          window being too fine to chart is the one thing the user cannot see
          for themselves, and it is why Apply is refused rather than the
          grouping being quietly coarsened into something they didn't ask for. */}
      {tooMany ? (
        <Text style={{ fontSize: 13, lineHeight: 19, color: p.accent, marginTop: 12 }}>
          That is {buckets} points to chart. Compare by week or month instead.
        </Text>
      ) : null}

      <SheetFooter>
        <Button
          title="Apply range"
          variant="primary"
          disabled={tooMany}
          onPress={() => { onApply(range, group); controls.closeAll(); }}
        />
      </SheetFooter>
    </View>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, color: p.textDim, marginBottom: 7 }}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 9, height: 50, paddingHorizontal: 13,
          borderRadius: radius.control, borderWidth: 1,
          borderColor: p.border, backgroundColor: p.sunk,
        }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="calendar" size={16} color={p.textDim} strokeWidth={2} />
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmtSlashShort(value)}</Text>
      </Pressable>
    </View>
  );
}
