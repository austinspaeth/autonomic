/**
 * Unified component library — one Card, one SectionHeader, one Row, one
 * MetricRow, one Segmented, one Stepper, one Button, reused everywhere.
 * Everything themed via usePalette(); light + dark both intentional.
 */
import React from 'react';
import {
  type LayoutChangeEvent, Linking, Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewProps, ViewStyle,
} from 'react-native';
import Reanimated, {
  Easing as REasing, Extrapolation, interpolate, interpolateColor, runOnJS, useAnimatedStyle,
  useSharedValue, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { CAUTION_GOLD, CAUTION_GOLD_SOFT, CAUTION_INK, GRADE_COLORS, radius, space, type as T, usePalette } from '../theme';
import { fmtDateLong, isPastDay } from '../lib/dates';
import type { ScoreCat } from '../lib/types';
import { helpUrl, type HelpContent } from '../lib/help';
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
/**
 * Options may be `locked` (freemium): a locked segment renders a small lock
 * glyph beside its label and taps fire `onLockedPress` instead of `onChange`,
 * so the pill never moves onto it.
 *
 * The pill *and* the label colours are driven by one Reanimated shared value
 * written straight from the press handler, so the whole selection animates on
 * the UI thread and never waits on React. That matters on Progress, where
 * picking a range commits an expensive re-render: a shared-value write reaches
 * the UI thread immediately, whereas anything derived from the `value` prop
 * (the old `active ? '#fff' : dim` label colour) couldn't repaint until that
 * commit landed, so the control looked frozen mid-tap. The effect below only
 * catches selection changes driven from *outside* the control (e.g. the tier
 * downgrade that forces Progress back to Day).
 */
// Reanimated equivalent of the previous RN `Animated.spring` at speed 16 /
// bounciness 8 — same feel, converted through Origami tension/friction.
const PILL_SPRING = { stiffness: 427, damping: 27.6, mass: 1 };

/** Width of the optional trailing overflow button inside the capsule. The even
 *  cells give it up rather than the control growing, so the header band's height
 *  and the pill's own geometry are unchanged by its presence. */
const SEG_TRAILING_W = 42;

export function Segmented<T extends string>({ options, value, onChange, onLockedPress, onSettled, style, compact, trailing }: {
  options: { val: T; label: string; locked?: boolean }[]; value: T; onChange: (v: T) => void;
  onLockedPress?: (v: T) => void; onSettled?: () => void; style?: StyleProp<ViewStyle>; compact?: boolean;
  /** An overflow control riding on the same capsule, right of the last segment.
   *  It is NOT a segment: the pill never travels to it and it carries no
   *  selected state — it opens something rather than choosing a value. */
  trailing?: { icon: IconName; onPress: () => void; accessibilityLabel?: string };
}) {
  const p = usePalette();
  const [w, setW] = React.useState(0);
  // Compact cells hug their labels, so the pill has to chase measured rects
  // (an animated width) instead of sliding across uniform cells.
  const [cells, setCells] = React.useState<{ x: number; w: number }[]>([]);
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.val === value));
  const sel = useSharedValue(idx);
  const target = React.useRef(idx);
  // `onSettled` fires when the pill spring actually comes to rest (an
  // interrupted spring never reports — only the final one does). Progress uses
  // it to hold the expensive range commit until the pill has finished moving,
  // so the animation never has a heavy commit landing in the middle of it.
  const settledRef = React.useRef(onSettled);
  settledRef.current = onSettled;
  const notifySettled = React.useCallback(() => { settledRef.current?.(); }, []);
  const springTo = React.useCallback((i: number) => {
    target.current = i;
    sel.value = withSpring(i, PILL_SPRING, (fin) => { if (fin) runOnJS(notifySettled)(); });
  }, [sel, notifySettled]);
  React.useEffect(() => {
    if (target.current !== idx) springTo(idx);
  }, [idx, springTo]);
  // Compact variant (used inline beside a section title): tighter padding + type,
  // small enough to sit right-aligned next to a 20pt title without overflowing.
  const pad = compact ? 2 : 4;
  const padV = compact ? 6 : 9;
  const font = compact ? 12 : 15;
  const cell = w > 0 ? (w - pad * 2 - (trailing ? SEG_TRAILING_W : 0)) / n : 0;
  const measured = compact && n > 1 && cells.filter(Boolean).length === n;
  // Interpolation inputs for the compact pill. Padded to the stop list (and to
  // at least two stops) so the worklet stays valid before the cells are
  // measured, and in the even variant where they're never measured at all —
  // the pill itself only renders once `measured`, but the worklet always runs.
  const stops = React.useMemo(() => (n > 1 ? options.map((_, i) => i) : [0, 1]), [options, n]);
  const xs = React.useMemo(() => stops.map((_, i) => cells[i]?.x ?? 0), [stops, cells]);
  const ws = React.useMemo(() => stops.map((_, i) => cells[i]?.w ?? 0), [stops, cells]);
  const compactPill = useAnimatedStyle(() => ({
    width: interpolate(sel.value, stops, ws),
    transform: [{ translateX: interpolate(sel.value, stops, xs) }],
  }));
  const evenPill = useAnimatedStyle(() => ({ transform: [{ translateX: sel.value * cell }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ position: 'relative', flexDirection: 'row', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.pill, padding: pad }, style]}
    >
      {compact ? (
        measured && (
          <Reanimated.View
            style={[{ position: 'absolute', top: pad, bottom: pad, left: 0, borderRadius: radius.pill, backgroundColor: p.accent }, compactPill]}
          />
        )
      ) : (
        cell > 0 && (
          <Reanimated.View
            style={[{ position: 'absolute', top: pad, bottom: pad, left: pad, width: cell, borderRadius: radius.pill, backgroundColor: p.accent }, evenPill]}
          />
        )
      )}
      {options.map((o, i) => (
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
            <SegLabel label={o.label} index={i} sel={sel} font={font} dim={p.textDim} />
          )}
        </Pressable>
      ))}
      {trailing ? (
        <Pressable
          onPress={trailing.onPress}
          accessibilityRole="button"
          accessibilityLabel={trailing.accessibilityLabel}
          style={({ pressed }) => [{ width: SEG_TRAILING_W, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, pressed && { opacity: 0.6 }]}
        >
          <Icon name={trailing.icon} size={19} color={p.textDim} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** One segment's label, cross-fading between dim and white as the pill passes
 *  under it — on the UI thread, so it tracks the pill exactly. */
function SegLabel({ label, index, sel, font, dim }: {
  label: string; index: number; sel: SharedValue<number>; font: number; dim: string;
}) {
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [index - 1, index, index + 1], [dim, '#fff', dim]),
  }));
  return <Reanimated.Text style={[{ fontSize: font, fontWeight: '600' }, style]}>{label}</Reanimated.Text>;
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

/**
 * The one disabled treatment, app-wide.
 *
 * It used to be `opacity: 0.45` over whatever the variant was, which on a red
 * primary reads as a slightly muted red button rather than as an unavailable
 * one — people tap it, nothing happens, and nothing says why. A disabled
 * control should not look like a quiet version of the live one: it should look
 * like a different kind of object.
 *
 * So a disabled button drops its variant entirely and wears a MEDIUM grey with
 * a semi-transparent label, plus a barely-there diagonal hatch. The hatch is
 * the part that carries it at a glance — it is a texture no live control in the
 * app has, so "not available" is legible before the colour is even read. Kept
 * at ~4% so it never becomes a pattern anyone has to look at.
 */
const DISABLED_BG = '#4a4a51';
const DISABLED_BORDER = '#5b5b63';
const DISABLED_TEXT = 'rgba(255,255,255,0.44)';
const HATCH_ID = 'btnDisabledHatch';
const HATCH_STEP = 7;
/* Deliberately OVERSIZED and clipped by the button's `overflow: hidden`, rather
   than sized to the button. A percentage width/height on the Svg (and on the
   Rect inside it) does not resolve against the absolute-filled box the way it
   reads: it covered only the top half of every button. Nothing here needs to
   know the real size, so the cheap fix is to out-measure any button that could
   exist and let the clip do the work. */
const HATCH_BOX = 1200;

/** The hatch itself. One shared pattern id: every instance draws exactly the
 *  same thing, so a collision between two of them is a no-op (unlike the score
 *  card's gradients, which differ per card and so count their ids). */
function DisabledHatch() {
  return (
    <Svg
      width={HATCH_BOX}
      height={HATCH_BOX}
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      <Defs>
        <Pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={HATCH_STEP} height={HATCH_STEP}>
          {/* Bottom-left to top-right, drawn corner to corner so it tiles
              seamlessly at any button width. Black rather than white: on a
              medium grey the darker line is the one that reads as texture
              instead of as a sheen. */}
          <Line x1={0} y1={HATCH_STEP} x2={HATCH_STEP} y2={0} stroke="#000000" strokeOpacity={0.09} strokeWidth={1.1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={HATCH_BOX} height={HATCH_BOX} fill={`url(#${HATCH_ID})`} />
    </Svg>
  );
}

export function Button({ title, onPress, variant = 'default', icon, style, disabled, onLongPress, delayLongPress }: {
  title: string; onPress: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'dashed' | 'caution'; style?: StyleProp<ViewStyle>; disabled?: boolean;
  /** Optional glyph before the label; inherits the label's colour. */
  icon?: IconName;
  /** Optional hidden affordance (e.g. hold to open diagnostics). */
  onLongPress?: () => void; delayLongPress?: number;
}) {
  const p = usePalette();
  // Disabled is not a shade of the variant, it REPLACES it — one grey skin for
  // every button in the app, whatever it looks like when it is live.
  const bg = disabled ? DISABLED_BG
    : variant === 'primary' ? p.accent : variant === 'danger' ? '#d63b3b' : variant === 'caution' ? CAUTION_GOLD : variant === 'ghost' || variant === 'dashed' ? 'transparent' : p.surface2;
  const border = disabled ? DISABLED_BORDER
    : variant === 'primary' ? p.accent : variant === 'danger' ? '#d63b3b' : variant === 'caution' ? CAUTION_GOLD : p.border;
  const color = disabled ? DISABLED_TEXT
    : variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'caution' ? CAUTION_INK : variant === 'dashed' ? p.accent : p.text;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      style={({ pressed }) => [
        // overflow: the hatch is drawn at full size and clipped to the radius,
        // rather than being inset to guess at the corners.
        { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', borderRadius: radius.control, borderWidth: variant === 'dashed' && !disabled ? 1.5 : 1, borderStyle: variant === 'dashed' && !disabled ? 'dashed' : 'solid', backgroundColor: bg, borderColor: border, paddingVertical: 13, alignItems: 'center', overflow: 'hidden' },
        pressed && !disabled && { opacity: 0.7 },
        style,
      ]}
    >
      {disabled ? <DisabledHatch /> : null}
      {icon ? <Icon name={icon} size={17} color={color} /> : null}
      <Text style={{ color, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Back-dated day editing ---------- */
/**
 * The commit control for anything written into ONE journal day. On today it is
 * the ordinary red primary. On any earlier day it turns gold, takes a caution
 * mark and says what it is about to do ("Save for previous day") — the journal
 * can be scrolled days back from a calendar tap, the date lives in a header
 * that is long gone by the time a sheet is open, and a back-dated write is
 * otherwise indistinguishable from logging right now. `pastTitle` overrides the
 * default `"<title> for previous day"` where that phrasing doesn't read.
 */
export function DaySaveButton({ dk, title, pastTitle, onPress, disabled, style }: {
  dk: string; title: string; pastTitle?: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const past = isPastDay(dk);
  return (
    <Button
      title={past ? (pastTitle ?? `${title} for previous day`) : title}
      variant={past ? 'caution' : 'primary'}
      icon={past ? 'alert' : undefined}
      onPress={onPress}
      disabled={disabled}
      style={style}
    />
  );
}

/**
 * The same warning as a line of text, for a sheet whose fields commit AS THEY
 * CHANGE (the sleep editor) and so have no Save button to re-dress. Renders
 * nothing on today.
 */
export function PastDayNotice({ dk, text, style }: { dk: string; text?: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  if (!isPastDay(dk)) return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CAUTION_GOLD_SOFT, borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)', borderRadius: radius.control, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 }, style]}>
      <Icon name="alert" size={16} color={CAUTION_GOLD} />
      <Text style={{ flex: 1, color: p.text, fontSize: 13, lineHeight: 18 }}>
        {text ?? `You're editing ${fmtDateLong(dk)}, not today. Changes are saved to that day.`}
      </Text>
    </View>
  );
}

/* ---------- Help dot ---------- */
/** Circled "?" beside a section title; opens a small sheet with an explanation. */
export function HelpDot({ title, text }: { title: string; text: HelpContent }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(() => <HelpSheet title={title} text={text} />, { fitContent: true });
  return (
    <Pressable onPress={open} hitSlop={8} style={{ width: 19, height: 19, borderRadius: 10, borderWidth: 1.2, borderColor: p.textDim, alignItems: 'center', justifyContent: 'center', marginLeft: 8, opacity: 0.75 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: p.textDim, lineHeight: 13 }}>?</Text>
    </Pressable>
  );
}

/**
 * The info card itself, and the same three parts every time: title, "What it
 * is", "Why it matters to me", then a Learn more button onto the article on
 * autonomic.care. Copy lives beside the metric it explains (`HRV_HELP`,
 * `BP_HELP`, `AnalysisCard.help`, ...), typed as `HelpContent` so a card cannot
 * ship as one undifferentiated paragraph.
 *
 * The sheet's ✕ floats over the top-right corner (`Sheet.tsx`), so the title
 * reserves room for it rather than running underneath.
 */
function HelpSheet({ title, text }: { title: string; text: HelpContent }) {
  const p = usePalette();
  const { closeSheet } = useSheets();
  const url = helpUrl(text, title, Platform.OS);
  // Sits between the title and the body: brighter than the paragraph it heads,
  // dimmer than the sheet title. The rule hugs the text (`alignSelf`) rather
  // than spanning the sheet, so it reads as an underline, not a divider, and
  // takes the label's own colour — the shared `opacity` dims both together.
  const label = (s: string) => (
    <Text style={{
      alignSelf: 'flex-start', fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1,
      color: p.text, opacity: 0.7, borderBottomWidth: 2, borderBottomColor: p.text, paddingBottom: 5, marginBottom: 9,
    }}>{s}</Text>
  );
  const para = (s: string) => <Text style={{ color: p.textDim, fontSize: 14.5, lineHeight: 22 }}>{s}</Text>;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16, paddingRight: 46 }}>{title}</Text>
      {label('What it is')}
      {para(text.what)}
      <View style={{ height: 16 }} />
      {label('Why it matters to me')}
      {para(text.why)}
      {url ? (
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <Button
            title="Learn more"
            onPress={() => { closeSheet(); Linking.openURL(url).catch(() => { /* no browser */ }); }}
          />
        </View>
      ) : <View style={{ height: 10 }} />}
    </View>
  );
}

/* ---------- Skeleton block ---------- */
/** A dim rounded rect standing in for a piece of content that hasn't been built
 *  yet. Skeletons keep the chrome around it real (titles, help dots, labels)
 *  and swap only the data for these, so a placeholder lays out at the height of
 *  the thing it becomes — see `src/features/ProgressSkeleton.tsx`. */
export function Ghost({ w, h, r = 6, style }: {
  w?: number | `${number}%`; h: number; r?: number; style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  return <View style={[{ width: w ?? '100%', height: h, borderRadius: r, backgroundColor: p.surface2 }, style]} />;
}

/** Ghost of a *text* run. Guessing a height for text never matches (font
 *  metrics, line height, wrapping), so this lays the block over an invisible
 *  copy of the real Text — same style, same sample string — and lets that set
 *  the height. Give it the exact style the real value/label uses and the
 *  skeleton row is exactly as tall as the row it becomes. */
export function TextGhost({ style, sample, w, inset = 3, r = 6 }: {
  style?: StyleProp<TextStyle>; sample: string; w?: number | `${number}%`; inset?: number; r?: number;
}) {
  const p = usePalette();
  return (
    <View>
      <Text style={[style, { opacity: 0 }]}>{sample}</Text>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: inset, bottom: inset, width: w ?? '100%', borderRadius: r, backgroundColor: p.surface2 }}
      />
    </View>
  );
}

/* ---------- Link toggle ---------- */
/**
 * The series picker the chart cards wear: plain text links with a short
 * underline under the active one, no container (unlike `Segmented`, which is a
 * control the user is answering with — this only changes what a chart is
 * showing). Wraps rather than scrolls, so a fifth option drops to a second row
 * instead of hiding off the edge.
 *
 * Shared so the Progress metric cards (Both / Baseline / Training / Compare)
 * and the sleep report's stage chart (Deep / REM / Core / Awake / Compare) are
 * the same control and not two that merely resemble each other.
 */
export function LinkToggle<T extends string>({ options, value, onChange }: {
  options: { val: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
      {options.map((o) => {
        const on = o.val === value;
        return (
          <Pressable key={o.val} onPress={() => onChange(o.val)} hitSlop={6} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : p.textDim }}>{o.label}</Text>
            <View style={{ height: 2, borderRadius: 1, alignSelf: 'stretch', marginTop: 3, backgroundColor: on ? '#fff' : 'transparent' }} />
          </Pressable>
        );
      })}
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

/* ---------- Accordion motion ---------- */
/**
 * Shared collapse/expand motion for the app's accordion cards (Journal streak
 * card, the pro upsell, the annual offer, score-driver rows). Rotates a chevron
 * in place (`chevStyle`) and reveals a body by animating its measured height
 * with a paired fade (`bodyStyle`), on a plain timing curve — never a spring, so
 * it can't overshoot.
 *
 * The body height is measured off an ABSOLUTELY-POSITIONED copy of the content
 * (spread `measureStyle` onto the body's inner view): an absolute child is laid
 * out at its natural height regardless of the parent's animated height, so
 * `contentH` is correct from the first frame. Measuring inside the clipped,
 * height-0 container instead reported 0 under the New Architecture until the
 * first expand, so the row snapped open hard on that first tap (the "bounce").
 *
 * Lives here rather than beside its first caller because two feature files now
 * use it, and a features/ → features/ import between them would be a cycle.
 *
 * Usage:
 *   const acc = useAccordion(open);
 *   <Animated.View style={acc.chevStyle}/>       // on the chevron
 *   <Animated.View style={[{ overflow: 'hidden' }, acc.bodyStyle]}>
 *     <View style={[acc.measureStyle, { paddingTop: 12 }]}>{body}</View>
 *   </Animated.View>
 *
 * `chevron` overrides the rotation the arrow travels through, in degrees. The
 * default (-90 → 0) is the app's row convention: a `chevron` icon points right
 * while collapsed and down while open. A card that reads as "there is more
 * below, tap to open" instead passes { from: 0, to: 180 } for down → up.
 */
export function useAccordion(open: boolean, startOpen = false, chevron: { from?: number; to?: number } = {}) {
  const chevFrom = chevron.from ?? -90;
  const chevTo = chevron.to ?? 0;
  const rot = useSharedValue(startOpen ? 1 : 0);
  const openV = useSharedValue(startOpen ? 1 : 0);
  const [contentH, setContentH] = React.useState(0);
  const mounted = React.useRef(false);

  React.useEffect(() => {
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
            ? { duration: 260, easing: REasing.out(REasing.cubic) }
            : { duration: 220, easing: REasing.inOut(REasing.cubic) },
        );
  }, [open, rot, openV]);

  const chevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevFrom + rot.value * (chevTo - chevFrom)}deg` }] }));
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

/* ---------- Destructive confirmation ---------- */
/**
 * The small card modal every delete goes through: one question, one way out,
 * one way through. Open it with `fitContent` so it sits as a card rather than a
 * full sheet — it asks a single question and a half-height sheet would read as
 * a screen.
 *
 * `onConfirm` runs after this card closes itself, so the caller decides what
 * happens to the stack beneath (an entry card whose entry is now gone must go
 * with it — see `confirmDelete` in features/forms.tsx).
 */
export function ConfirmDeleteSheet({ title, message, confirmTitle = 'Delete', onConfirm, controls }: {
  title: string; message?: string; confirmTitle?: string; onConfirm: () => void;
  controls: { close: () => void };
}) {
  const p = usePalette();
  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: message ? 8 : 20 }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20, marginBottom: 20 }}>{message}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button title="Cancel" onPress={() => controls.close()} />
        <Button title={confirmTitle} variant="danger" onPress={() => { controls.close(); onConfirm(); }} />
      </View>
    </View>
  );
}
