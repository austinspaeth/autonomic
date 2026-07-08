import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Screen } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { Card, Segmented } from '../../src/components/ui';
import { Bars, BpDumbbell, LineChart } from '../../src/components/charts';
import { radius, usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { buildCategories, type AnalysisCard } from '../../src/lib/analysis/categories';
import type { Mode } from '../../src/lib/analysis/buckets';
import { HrvProgress, HRV_FILTERS, type Filt } from '../../src/features/HrvProgress';

export default function AnalysisScreen() {
  const p = usePalette();
  const state = useAppState();
  const [mode, setMode] = useState<Mode>('day');
  // HRV filter lives here (not inside HrvProgress) so the same All/Morning/Night
  // toggle can appear both inline beside the section title and in the pinned bar.
  const [hrvFilt, setHrvFilt] = useState<Filt>('all');
  const sex = state.profile.sex;
  const height = state.profile.height;

  // Build every category's cards once per (days, mode, profile). Memoized so the
  // scroll-driven "active section" re-render doesn't rebuild all the charts.
  const sections = useMemo(() => {
    const cats = buildCategories(state.days, mode, { sex, height });
    return cats.map((c) => ({ id: c.id, icon: c.icon, title: c.title, desc: c.desc, buckets: c.buckets, cards: c.build() }));
  }, [state.days, mode, sex, height]);

  // Outlook always synthesizes a score, so it isn't proof of real data. Treat the
  // whole view as empty unless some *other* category has something logged — that's
  // when the progress charts are actually meaningful.
  const hasData = sections.some((s) => s.id !== 'outlook' && s.cards.length > 0);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});   // section id -> y in the scroll content
  const [headerH, setHeaderH] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const lastY = useRef(0);
  const dirRef = useRef(1);                              // +1 = scrolling down, -1 = up

  // Reset to the top when the range changes so stale offsets don't mislead. The
  // offsets map is cleared too — the previous range's section heights are wrong
  // for the new one, and each section re-seeds its offset on the next onLayout.
  useEffect(() => {
    activeRef.current = null;
    setActiveId(null);
    offsets.current = {};
    lastY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [mode]);

  // The pinned section title = the last section whose header has scrolled up to
  // (or past) the bottom of the top bar. This is the manual equivalent of the
  // sticky-header handoff: as one title slides behind the blur, the pinned bar
  // adopts it; the next section then takes over when its title reaches the line.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (Math.abs(dy) > 0.5) dirRef.current = dy > 0 ? 1 : -1;
    let active: string | null = null;
    for (const s of sections) {
      const off = offsets.current[s.id];
      if (off == null) continue;
      if (off - y <= headerH + 1) active = s.id;
      else break;
    }
    if (active !== activeRef.current) { activeRef.current = active; setActiveId(active); }
  };

  const goTo = (id: string) => {
    const off = offsets.current[id];
    if (off != null) scrollRef.current?.scrollTo({ y: Math.max(0, off - headerH), animated: true });
  };

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const activeSection = activeId ? sections.find((s) => s.id === activeId) : null;
  const active = activeSection ? { id: activeSection.id, title: activeSection.title } : null;

  return (
    <Screen
      scrollRef={scrollRef}
      onScroll={onScroll}
      onHeaderHeight={setHeaderH}
      header={
        <View style={{ paddingHorizontal: 16 }}>
          <Segmented options={[{ val: 'day', label: 'Day' }, { val: 'week', label: 'Week' }, { val: 'month', label: 'Month' }, { val: 'year', label: 'Year' }]} value={mode} onChange={setMode} />
        </View>
      }
      footer={
        <StickyBar
          headerH={headerH}
          active={active}
          dir={dirRef.current}
          onUp={scrollToTop}
          hrvFilt={hrvFilt}
          setHrvFilt={setHrvFilt}
        />
      }
    >
      {!hasData ? (
        <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 15, lineHeight: 22 }}>
          Nothing to show yet. Record readings, sleep, activities and more in your Journal and your progress will start populating here.
        </Text>
      ) : (
        <>
          {/* Jump menu: tap a card to scroll to that category's section below. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {sections.map((s) => (
              <Pressable key={s.id} onPress={() => goTo(s.id)} style={{ width: '31.5%', backgroundColor: p.surface, borderColor: activeId === s.id ? p.accent : p.border, borderWidth: 1, borderRadius: radius.card, padding: 12 }}>
                <Icon name={s.icon as IconName} size={24} color={p.accent} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.text, marginTop: 7 }}>{s.title}</Text>
                <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2 }}>{s.desc}</Text>
              </Pressable>
            ))}
          </View>

          {/* Every category inline as one long document with a titled section. */}
          {sections.map((s) => (
            <View key={s.id} onLayout={(e) => { offsets.current[s.id] = e.nativeEvent.layout.y; }} style={{ marginTop: 22 }}>
              {s.id === 'hrv' ? (
                // HRV keeps its All/Morning/Night pills inline with the title (small);
                // the same toggle also rides in the pinned bar once this section pins.
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 34 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: p.text }}>{s.title}</Text>
                  <Segmented compact options={HRV_FILTERS} value={hrvFilt} onChange={setHrvFilt} />
                </View>
              ) : (
                <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 8 }}>{s.title}</Text>
              )}
              {s.id === 'hrv' ? (
                <HrvProgress days={state.days} mode={mode} ctx={{ sex, height }} filt={hrvFilt} />
              ) : s.cards.length === 0 ? (
                <Text style={{ color: p.textDim }}>No data logged yet for this category.</Text>
              ) : (
                s.cards.map((card, i) => <CardView key={i} card={card} buckets={s.buckets} />)
              )}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

type Active = { id: string; title: string } | null;

/**
 * The pinned section bar under the top header. Always mounted (it fades in/out
 * rather than mounting/unmounting a BlurView — the old toggle thrash was the
 * likely source of the occasional crash on range change while scrolled).
 *
 * When the pinned section changes, its title (and, for HRV, the filter pills)
 * cross-fades: the outgoing content slides out opposite the scroll direction and
 * fades away while the incoming content slides in from the direction of travel
 * with a fade-up push — so pinning a later section pushes content up, pinning an
 * earlier one pushes it down.
 */
function StickyBar({ headerH, active, dir, onUp, hrvFilt, setHrvFilt }: {
  headerH: number; active: Active; dir: number; onUp: () => void; hrvFilt: Filt; setHrvFilt: (f: Filt) => void;
}) {
  const p = usePalette();
  const BAR_H = 52, SLIDE = 16;
  const shown = active != null;

  // Container fade — presence of any pinned section.
  const containerOp = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(containerOp, { toValue: shown ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [shown, containerOp]);

  // Content swap — two stacked layers driven by one 0→1 phase per transition.
  const [layers, setLayers] = useState<{ out: Active; in: Active }>({ out: null, in: active });
  const phase = useRef(new Animated.Value(1)).current;
  const slideDir = useRef(1);
  const prevId = useRef<string | null>(active?.id ?? null);
  useEffect(() => {
    const id = active?.id ?? null;
    if (id === prevId.current) return;   // same section (dir/title-object churn) — ignore
    prevId.current = id;
    slideDir.current = dir >= 0 ? 1 : -1;
    setLayers((l) => ({ out: l.in, in: active }));
    phase.setValue(0);
    Animated.timing(phase, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [active, dir, phase]);

  const d = slideDir.current;
  const outStyle = {
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -d * SLIDE] }) }],
  };
  const inStyle = {
    opacity: phase,
    transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [d * SLIDE, 0] }) }],
  };

  const layer = (a: Active, style: object, live: boolean) => (
    <Animated.View
      pointerEvents={live ? 'box-none' : 'none'}
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}
    >
      {a ? (
        <>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 20, fontWeight: '700', color: p.text }}>{a.title}</Text>
          {a.id === 'hrv' ? <Segmented compact options={HRV_FILTERS} value={hrvFilt} onChange={setHrvFilt} /> : null}
        </>
      ) : null}
    </Animated.View>
  );

  return (
    <Animated.View pointerEvents={shown ? 'box-none' : 'none'} style={{ position: 'absolute', top: headerH, left: 0, right: 0, opacity: containerOp }}>
      <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', alignItems: 'center', height: BAR_H, paddingHorizontal: 16, backgroundColor: 'rgba(4,4,7,0.97)', borderBottomWidth: 0.5, borderBottomColor: p.border }}>
        <Pressable onPress={onUp} hitSlop={10} style={{ marginLeft: -4, marginRight: 8 }}>
          <Icon name="arrowUp" size={22} color={p.text} />
        </Pressable>
        <View style={{ flex: 1, height: '100%' }}>
          {layer(layers.out, outStyle, false)}
          {layer(layers.in, inStyle, true)}
        </View>
      </BlurView>
    </Animated.View>
  );
}

const CardView = React.memo(function CardView({ card, buckets }: { card: AnalysisCard; buckets: { label: string }[] }) {
  const p = usePalette();
  return (
    <Card style={{ padding: 14 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>{card.title}</Text>
      {card.sub ? <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2, marginBottom: 8 }}>{card.sub}</Text> : null}
      {(card.charts || []).map((ch, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{ch.label}</Text>
          {ch.dumbbell
            ? <BpDumbbell buckets={buckets} sys={ch.dumbbell.sys} dia={ch.dumbbell.dia} />
            : <LineChart buckets={buckets} series={ch.series} zones={ch.zones} integer={ch.integer} target={ch.target} />}
          {ch.legend ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {ch.legend.map(([name, color]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                  <Text style={{ fontSize: 11, color: p.textDim }}>{name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {(card.bars || []).map((bg, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          {bg.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{bg.label}</Text> : null}
          <Bars rows={bg.rows} fmt={bg.fmt} />
        </View>
      ))}
      {card.stats && card.stats.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          {card.stats.map((s, i) => (
            <View key={i} style={{ flexGrow: 1, minWidth: '45%', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12 }}>
              <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{s.label}</Text>
              <Text style={{ fontSize: 25, fontWeight: '700', marginTop: 4, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>{s.value == null ? '-' : String(s.value)}{s.sub ? <Text style={{ fontSize: 12, color: p.textDim }}>{` ${s.sub}`}</Text> : null}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {(card.insights || []).map((ins, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginTop: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: ins.strength === 'strong' ? '#16a34a' : ins.strength === 'mod' ? '#eab308' : p.accent }} />
          <Text style={{ flex: 1, fontSize: 14, color: p.text, lineHeight: 18 }}>{ins.text}</Text>
        </View>
      ))}
    </Card>
  );
});
