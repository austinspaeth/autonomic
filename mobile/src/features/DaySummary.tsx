/**
 * Day summary card: circular score gauge, category chip, vs-AM delta, guidance,
 * flags, and the streak card — ported from renderDaySummary. The "What powers
 * this" button opens the score-explanation sheet (openScoreExplain).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { ScoreGauge } from '../components/charts';
import { Icon } from '../components/Icon';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { SumCard, MetricRow } from '../components/summary';
import { MilestoneProgressCard } from './Milestones';
import { Button, Stepper } from '../components/ui';
import { radius, type as T, usePalette } from '../theme';
import { SCORE_COLORS, GRADE_LABEL, GRADE_PTS, catFromBands } from '../lib/scoring';
import {
  OUTLOOK_GUIDE, TOMORROW, SCORE_TIPS, blueZone, readingPeriod, resolveProtocol,
  scoreCat, scoreSet, streakInfo, streakTier, type ScoreComp, type ScoreSetResult,
} from '../lib/scoring/day';
import { typesFor } from '../lib/typeCatalog';
import { todayKey } from '../lib/dates';
import { getState, mutate, useAppState } from '../store/store';

import type { Band, Protocol, ScoreCat } from '../lib/types';

const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

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
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const { sex, height } = state.profile;
  const ctx = useMemo(() => ({ sex, height }), [sex, height]);
  const today = todayKey();
  // scoreSet makes several passes over the day's readings; memoize so renders
  // not caused by a data change (sheets, animations) don't re-score.
  const { d, readings, all } = useMemo(() => {
    const day = state.days[dk] || ({ readings: [], activities: [] } as never);
    const rs = (day.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    return { d: day, readings: rs, all: scoreSet(rs, day, dk, state.days, ctx) };
  }, [state.days, dk, ctx]);

  return (
    <View>
      <GradientBorderCard color={all.score == null || all.confidence < 40 ? null : scoreCat(all.score).color} trigger={dk} style={{ marginBottom: 12 }}>
        {all.score == null || all.confidence < 40 ? (
          <View style={{ padding: 16 }}>
            <Text style={[T.section, { color: p.textDim }]}>Autonomic Outlook</Text>
            {!readings.length ? (
              <>
                <Text style={{ fontSize: 22, fontWeight: '700', color: p.text, marginTop: 6 }}>{dk > today ? 'Future day' : 'Awaiting morning data'}</Text>
                {/* No capture button here — the Readings section below owns that
                    action; this card just points the way, plainly. */}
                <Text style={{ fontSize: 15, color: dk > today ? p.textDim : p.text, marginTop: 6, lineHeight: 21, fontWeight: dk > today ? '400' : '600' }}>
                  {dk > today ? 'Nothing logged yet for this day.' : 'Capture an HRV reading below, under Readings, to unlock today’s autonomic outlook.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 22, fontWeight: '700', color: p.text, marginTop: 6 }}>Insufficient data</Text>
                <Text style={{ fontSize: 14, color: p.textDim, marginTop: 5, lineHeight: 19 }}>
                  {(all.score != null ? `Provisional ${all.score} / 100 at ${all.confidence}% confidence. ` : '') + (all.hasStruct ? 'Add more readings to firm up the score.' : all.hasUnstruct ? 'Awaiting a structured reading for higher confidence.' : 'Add a morning HRV reading for higher confidence.')}
                </Text>
              </>
            )}
          </View>
        ) : (
          <ScoredHero dk={dk} readings={readings} d={d} all={all} ctx={ctx} onExplain={() => openSheet((c) => <ScoreExplain all={all} dk={dk} controls={c} />)} />
        )}
      </GradientBorderCard>
      <StreakCard dk={dk} />
      <MilestoneProgressCard dk={dk} />
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
          <Text style={{ fontSize: 57, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{all.score}</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: 4 }}>OUT OF 100</Text>
        </ScoreGauge>
        {delta != null && Math.abs(delta) >= 3 ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: delta > 0 ? SCORE_COLORS.good : SCORE_COLORS.bad, fontVariant: ['tabular-nums'] }}>
            {(delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' vs AM'}
          </Text>
        ) : null}
      </View>
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, marginBottom: 6 }}>
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

function Flag({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 11, padding: 10, borderRadius: radius.control, backgroundColor: hexA(color, 0.15) }}>
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
  // streakInfo walks the whole day history; don't redo it for the accordion
  // toggle re-renders below.
  const si = useMemo(
    () => streakInfo(state.days, dk, resolveProtocol(state.settings.protocol), state.customTypes),
    [state.days, dk, state.settings.protocol, state.customTypes],
  );
  const tier = streakTier(si.current);
  const icon = si.current >= 14 ? 'moon' : si.current >= 7 ? 'rocket' : si.current >= 3 ? 'flame' : 'sparkles';
  const c = si.today;

  // Rotate the (down-pointing) chevron in place: -90° = pointing right when
  // collapsed, easing to 0° = pointing down when expanded. Position never moves.
  const rot = useSharedValue(0);
  useEffect(() => { rot.value = withTiming(expanded ? 1 : 0, { duration: 220 }); }, [expanded, rot]);
  const chevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 + rot.value * 90}deg` }] }));

  // Accordion the body open/closed by animating its measured height. The body
  // stays mounted (clipped to 0 height while collapsed) so onLayout can report
  // its natural height; `open` drives height 0 → contentH and a fade in step.
  const [contentH, setContentH] = useState(0);
  const open = useSharedValue(0);
  // Open eases out; close uses in-out so the height doesn't crawl sub-pixel
  // through its last frames (that tail read as jank). Fading the body out over
  // the top of the close keeps the crawl invisible either way.
  useEffect(() => {
    open.value = withTiming(
      expanded ? 1 : 0,
      expanded ? { duration: 260, easing: Easing.out(Easing.cubic) } : { duration: 220, easing: Easing.inOut(Easing.cubic) },
    );
  }, [expanded, open]);
  const bodyStyle = useAnimatedStyle(() => ({
    height: open.value * contentH,
    opacity: interpolate(open.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
  }));

  let sub = tier.msg;
  if (c) {
    if (c.clean) sub = 'Clean day. Streak continues.';
    else {
      const hardFail = c.criteria.some((x) => x.broken);
      if (si.isToday) sub = hardFail ? 'Too late for today. Try again to start fresh tomorrow.' : `Today is day ${si.current + 1}.`;
      else sub = 'Not a clean day.';
    }
  } else sub = 'No data logged for this day.';

  const stats = [`Longest ${si.longest}`];
  if (si.rate != null) stats.push(`30-day clean ${si.rate}%`);

  return (
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, overflow: 'hidden' }}>
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
          <View onLayout={(e) => setContentH(e.nativeEvent.layout.height)} style={{ paddingTop: 12 }}>
            <Text style={{ fontSize: 11, color: p.textDim, fontVariant: ['tabular-nums'] }}>{stats.join(' · ')}</Text>
            {c ? (
              <View style={{ marginTop: 12, gap: 9 }}>
                {c.criteria.map((x) => {
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

/* ---------- Protocol editor sheet ---------- */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={6} style={{ width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', backgroundColor: value ? p.accent : p.surface2, borderWidth: 1, borderColor: value ? p.accent : p.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 }, pressed && { opacity: 0.6 }]}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? p.accent : p.border, backgroundColor: checked ? p.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={13} color="#fff" /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, color: p.text }}>{label}</Text>
    </Pressable>
  );
}

/** One protocol requirement: title + on/off toggle, with config UI shown while on. */
function ReqSection({ title, desc, enabled, onToggle, children }: { title: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>{title}</Text>
          <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2, lineHeight: 16 }}>{desc}</Text>
        </View>
        <Toggle value={enabled} onChange={onToggle} />
      </View>
      {enabled && children ? <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 4 }}>{children}</View> : null}
    </View>
  );
}

function ProtocolEditor({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const state = useAppState();
  const [proto, setProto] = useState<Protocol>(() => resolveProtocol(state.settings.protocol));

  const medTypes = typesFor(state, 'meds');
  const actTypes = typesFor(state, 'activities');
  const toggleKey = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const onSave = () => {
    mutate((s) => { s.settings.protocol = proto; });
    controls.close();
  };
  const onReset = () => setProto(resolveProtocol(null));

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Clean-day protocol</Text>
      <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20, marginBottom: 18 }}>
        Choose what a clean day means for you. A day counts toward your streak when every requirement you turn on is met.
      </Text>

      <ReqSection
        title="No triggers"
        desc="Any logged trigger breaks the day."
        enabled={proto.triggers.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, triggers: { ...x.triggers, enabled: v } }))}
      />

      <ReqSection
        title="Water"
        desc="Hit a minimum daily water intake."
        enabled={proto.water.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, water: { ...x.water, enabled: v } }))}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, color: p.text }}>Daily goal</Text>
          <Stepper value={proto.water.liters} step={0.25} format={(v) => `${v} L`} onChange={(v) => setProto((x) => ({ ...x, water: { ...x.water, liters: v } }))} />
        </View>
      </ReqSection>

      <ReqSection
        title="Medications"
        desc="Choose which medications you must take."
        enabled={proto.meds.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, meds: { ...x.meds, enabled: v } }))}
      >
        {Object.entries(medTypes).map(([k, def]) => (
          <CheckRow key={k} label={def.label} checked={proto.meds.types.includes(k)} onToggle={() => setProto((x) => ({ ...x, meds: { ...x.meds, types: toggleKey(x.meds.types, k) } }))} />
        ))}
      </ReqSection>

      <ReqSection
        title="Activities"
        desc="Select the activities you must complete."
        enabled={proto.activities.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, activities: { ...x.activities, enabled: v } }))}
      >
        {Object.entries(actTypes).map(([k, def]) => (
          <CheckRow key={k} label={def.label} checked={proto.activities.types.includes(k)} onToggle={() => setProto((x) => ({ ...x, activities: { ...x.activities, types: toggleKey(x.activities.types, k) } }))} />
        ))}
      </ReqSection>

      <ReqSection
        title="Sleep"
        desc="Sleep at least this many hours."
        enabled={proto.sleep.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, sleep: { ...x.sleep, enabled: v } }))}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, color: p.text }}>Minimum</Text>
          <Stepper value={proto.sleep.hours} step={0.5} format={(v) => `${v} h`} onChange={(v) => setProto((x) => ({ ...x, sleep: { ...x.sleep, hours: v } }))} />
        </View>
      </ReqSection>

      <Pressable onPress={onReset} style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim }}>Reset to default</Text>
      </Pressable>

      <SheetFooter>
        <Button title="Save protocol" variant="primary" onPress={onSave} />
      </SheetFooter>
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
  const ceil = (c: ScoreComp) => (c.detail && c.detail.maxCat ? GRADE_PTS[c.detail.maxCat] : 95);
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
            <Text style={{ fontSize: 57, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{all.score}</Text>
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
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, marginBottom: 10, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SCORE_COLORS[c.cat as keyof typeof SCORE_COLORS] || p.border }} />
        <Text style={{ fontWeight: '600', fontSize: 15, color: p.text, flex: 1 }}>{c.label}</Text>
        <Text style={{ fontSize: 14, color: p.textDim, fontVariant: ['tabular-nums'] }}>{c.detail.value || ''}</Text>
        <Icon name="chevron" size={17} color={p.textDim} />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <View style={{ backgroundColor: contrib.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}><Text style={{ fontSize: 11, fontWeight: '700', color: contrib.col }}>{contrib.t}</Text></View>
            <Text style={{ fontSize: 12, color: p.textDim }}>{`${GRADE_LABEL[c.cat as keyof typeof GRADE_LABEL]} · weight ${c.w}%`}</Text>
          </View>
          <Text style={{ fontSize: 13, color: p.textDim, lineHeight: 18 }}>{improveLine(c)}</Text>
        </View>
      ) : null}
    </View>
  );
}
