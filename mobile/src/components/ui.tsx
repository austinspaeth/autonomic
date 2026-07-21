/**
 * Unified component library — one Card, one SectionHeader, one Row, one
 * MetricRow, one Segmented, one Stepper, one Button, reused everywhere.
 * Everything themed via usePalette(); light + dark both intentional.
 */
import React, { useRef } from 'react';
import {
  Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewProps, ViewStyle,
} from 'react-native';
import Reanimated, {
  Easing as REasing, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { GRADE_COLORS, radius, space, type as T, usePalette } from '../theme';
import type { ScoreCat } from '../lib/types';
import { Icon, IconName } from './Icon';
import { useSheets } from './Sheet';

export function Card({ children, style, onLayout }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onLayout?: ViewProps['onLayout'] }) {
  const p = usePalette();
  return (
    <View onLayout={onLayout} style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.sectionHead}>
      <Text style={[T.section, { color: p.textDim }]}>{title}</Text>
      {action}
    </View>
  );
}

/** Full-width dashed add action at the foot of a section list. */
export function AddDashButton({ onPress, label = '+ Add' }: { onPress: () => void; label?: string }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, borderRadius: radius.control, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ icon, title, sub, right, onPress, iconColor, noDivider }: {
  icon?: IconName; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; iconColor?: string; noDivider?: boolean;
}) {
  const p = usePalette();
  const content = (
    <View style={[styles.row, { borderTopColor: p.border }, noDivider && { borderTopWidth: 0 }]}>
      {icon && <View style={styles.rowIco}><Icon name={icon} size={21} color={iconColor || p.textDim} /></View>}
      <View style={styles.rowMain}>
        <Text style={{ color: p.text, fontSize: 16 }}>{title}</Text>
        {sub ? <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{content}</Pressable>;
}

export function ScoreDot({ cat, size = 9 }: { cat?: ScoreCat | null; size?: number }) {
  const p = usePalette();
  const c = cat && GRADE_COLORS[cat] ? GRADE_COLORS[cat] : p.border;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, marginRight: 7 }} />;
}

export function Pill({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 6 }}>
      <Text style={{ color: p.textDim, fontSize: 13, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

export function RowValue({ text, cat }: { text: string; cat?: ScoreCat | null }) {
  const p = usePalette();
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {cat && GRADE_COLORS[cat] ? <ScoreDot cat={cat} /> : null}
      <Text style={{ color: p.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.textDim, fontSize: 15, paddingVertical: 6 }}>{children}</Text>;
}

/* ---------- Segmented control with an animated pill ---------- */
/** Options may be `locked` (freemium): a locked segment renders a small lock
 *  glyph beside its label and taps fire `onLockedPress` instead of `onChange`,
 *  so the pill never moves onto it. */
export function Segmented<T extends string>({ options, value, onChange, onLockedPress, style, compact }: {
  options: { val: T; label: string; locked?: boolean }[]; value: T; onChange: (v: T) => void;
  onLockedPress?: (v: T) => void; style?: StyleProp<ViewStyle>; compact?: boolean;
}) {
  const p = usePalette();
  const [w, setW] = React.useState(0);
  // Compact cells hug their labels, so the pill has to chase measured rects
  // (a width animation — JS driver) instead of sliding across uniform cells.
  const [cells, setCells] = React.useState<{ x: number; w: number }[]>([]);
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.val === value));
  const anim = useRef(new Animated.Value(idx)).current;
  // The pill starts moving in the press handler, not the value-change effect:
  // a range switch can trigger an expensive re-render upstream, and an effect-
  // started spring would sit frozen until that render commits. Started on press,
  // the native-driver spring runs on the UI thread no matter how busy JS is.
  const target = useRef(idx);
  const springTo = React.useCallback((i: number) => {
    target.current = i;
    Animated.spring(anim, { toValue: i, useNativeDriver: !compact, speed: 16, bounciness: 8 }).start();
  }, [anim, compact]);
  React.useEffect(() => {
    if (target.current !== idx) springTo(idx);
  }, [idx, springTo]);
  // Compact variant (used inline beside a section title): tighter padding + type,
  // small enough to sit right-aligned next to a 20pt title without overflowing.
  const pad = compact ? 2 : 4;
  const padV = compact ? 6 : 9;
  const font = compact ? 12 : 15;
  const cell = w > 0 ? (w - pad * 2) / n : 0;
  const measured = compact && n > 1 && cells.filter(Boolean).length === n;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ position: 'relative', flexDirection: 'row', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.pill, padding: pad }, style]}
    >
      {compact ? (
        measured && (
          <Animated.View
            style={{
              position: 'absolute', top: pad, bottom: pad, left: 0, borderRadius: radius.pill, backgroundColor: p.accent,
              width: anim.interpolate({ inputRange: options.map((_, i) => i), outputRange: cells.map((c) => c.w) }),
              transform: [{ translateX: anim.interpolate({ inputRange: options.map((_, i) => i), outputRange: cells.map((c) => c.x) }) }],
            }}
          />
        )
      ) : (
        cell > 0 && (
          <Animated.View
            style={{ position: 'absolute', top: pad, bottom: pad, left: pad, width: cell, borderRadius: radius.pill, backgroundColor: p.accent, transform: [{ translateX: Animated.multiply(anim, cell) }] }}
          />
        )
      )}
      {options.map((o, i) => {
        const active = o.val === value;
        return (
          <Pressable
            key={o.val}
            onPress={() => {
              if (o.locked) { onLockedPress?.(o.val); return; }
              springTo(i);
              onChange(o.val);
            }}
            onLayout={compact ? (e) => {
              const { x, width } = e.nativeEvent.layout;
              setCells((prev) => {
                if (prev[i] && prev[i].x === x && prev[i].w === width) return prev;
                const next = prev.slice();
                next[i] = { x, w: width };
                return next;
              });
            } : undefined}
            style={{ paddingVertical: padV, paddingHorizontal: compact ? 13 : 0, alignItems: 'center', zIndex: 1, ...(compact ? null : { flex: 1 }) }}
          >
            {o.locked ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="lock" size={compact ? 10 : 12} color={p.textDim} strokeWidth={2.2} />
                <Text style={{ color: p.textDim, fontSize: font, fontWeight: '600' }}>{o.label}</Text>
              </View>
            ) : (
              <Text style={{ color: active ? '#fff' : p.textDim, fontSize: font, fontWeight: '600' }}>{o.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Progress bar ---------- */
/** Slim rounded bar whose fill tweens to each new value instead of jumping. */
export function ProgressBar({ pct, color, track, height = 6, style }: {
  pct: number; color: string; track: string; height?: number; style?: StyleProp<ViewStyle>;
}) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const v = useSharedValue(clamp(pct));
  React.useEffect(() => {
    v.value = withTiming(clamp(pct), { duration: 350, easing: REasing.out(REasing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Reanimated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}

/* ---------- Stepper ---------- */
export function Stepper({ value, step, onChange, format }: { value: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const p = usePalette();
  const round = (x: number) => Math.round(x * 100) / 100;
  const btn = (label: string, next: () => void) => (
    <Pressable onPress={next} style={({ pressed }) => [{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: p.text, fontSize: 19, lineHeight: 20 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn('−', () => onChange(Math.max(0, round(value - step))))}
      <Text style={{ minWidth: 46, textAlign: 'center', fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'] }}>{format ? format(value) : String(value)}</Text>
      {btn('+', () => onChange(round(value + step)))}
    </View>
  );
}

/* ---------- Buttons ---------- */
export function Button({ title, onPress, variant = 'default', style, disabled }: {
  title: string; onPress: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'dashed'; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.accent : variant === 'danger' ? '#d63b3b' : variant === 'ghost' || variant === 'dashed' ? 'transparent' : p.surface2;
  const border = variant === 'primary' ? p.accent : variant === 'danger' ? '#d63b3b' : p.border;
  const color = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'dashed' ? p.accent : p.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { flex: 1, borderRadius: radius.control, borderWidth: variant === 'dashed' ? 1.5 : 1, borderStyle: variant === 'dashed' ? 'dashed' : 'solid', backgroundColor: bg, borderColor: border, paddingVertical: 13, alignItems: 'center' },
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={{ color, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Help dot ---------- */
/** Circled "?" beside a section title; opens a small sheet with an explanation. */
export function HelpDot({ title, text }: { title: string; text: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(() => <HelpSheet title={title} text={text} />, { fitContent: true });
  return (
    <Pressable onPress={open} hitSlop={8} style={{ width: 19, height: 19, borderRadius: 10, borderWidth: 1.2, borderColor: p.textDim, alignItems: 'center', justifyContent: 'center', marginLeft: 8, opacity: 0.75 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: p.textDim, lineHeight: 13 }}>?</Text>
    </Pressable>
  );
}
function HelpSheet({ title, text }: { title: string; text: string }) {
  const p = usePalette();
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 10 }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14.5, lineHeight: 22 }}>{text}</Text>
      <View style={{ height: 10 }} />
    </View>
  );
}

/* ---------- Chip ---------- */
export function Chip({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: radius.pill }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, marginBottom: space.md, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  rowIco: { width: 26, alignItems: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
});

export { space, radius, T, GRADE_COLORS };
