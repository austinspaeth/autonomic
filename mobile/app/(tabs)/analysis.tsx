import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Screen } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { HelpDot, Segmented } from '../../src/components/ui';
import { Bars, BpDumbbell, LineChart } from '../../src/components/charts';
import { fonts, radius, usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { buildCategories, type AnalysisCard } from '../../src/lib/analysis/categories';
import { resolveProtocol } from '../../src/lib/scoring/day';
import type { Mode } from '../../src/lib/analysis/buckets';
import { HrvFilterLinks, HrvProgress, type Filt } from '../../src/features/HrvProgress';

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
    const cats = buildCategories(state.days, mode, { sex, height, protocol: resolveProtocol(state.settings.protocol) });
    return cats.map((c) => ({ id: c.id, icon: c.icon, title: c.title, desc: c.desc, buckets: c.buckets, cards: c.build() }));
  }, [state.days, mode, sex, height, state.settings.protocol]);

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
  // HANDOFF_LEAD makes the swap fire as the inline title *touches* the bar
  // (roughly one title-height early) instead of after it has fully slid under.
  const HANDOFF_LEAD = 28;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (Math.abs(dy) > 0.5) dirRef.current = dy > 0 ? 1 : -1;
    let active: string | null = null;
    for (const s of sections) {
      const off = offsets.current[s.id];
      if (off == null) continue;
      if (off - y <= headerH + HANDOFF_LEAD) active = s.id;
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
                // HRV keeps its All/Morning/Night pills inline with the title —
                // small and right-aligned so they never overrun the container;
                // the same toggle also rides in the pinned bar once this section pins.
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 34 }}>
                  <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text }}>{s.title}</Text>
                  <View style={{ flexShrink: 1, marginLeft: 12, alignItems: 'flex-end' }}>
                    <HrvFilterLinks value={hrvFilt} onChange={setHrvFilt} />
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text, marginBottom: 8 }}>{s.title}</Text>
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

// One size for section titles everywhere — the inline headers in the document
// and the pinned bar's title must read as the *same* element trading places.
const SECTION_TITLE_SIZE = 20;

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
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: SECTION_TITLE_SIZE, fontWeight: '700', color: p.text }}>{a.title}</Text>
          {a.id === 'hrv' ? (
            <View style={{ flexShrink: 1, marginLeft: 12, alignItems: 'flex-end' }}>
              <HrvFilterLinks value={hrvFilt} onChange={setHrvFilt} />
            </View>
          ) : null}
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

/**
 * Card container holding the flat section design: an uppercase title + "?" help
 * dot, big flat stat values, a one-line description, then the charts — all on a
 * surface card.
 */
const CardView = React.memo(function CardView({ card, buckets }: { card: AnalysisCard; buckets: { label: string }[] }) {
  const p = usePalette();
  // A `selectStat` chart drives the card's first stat: dragging the chart swaps
  // the range average for that bucket's value with its date in parentheses.
  const [sel, setSel] = useState<number>(-1);
  const selChart = (card.charts || []).find((c) => c.selectStat);
  const selSeries = selChart?.series.find((s) => !s.dashed) ?? selChart?.series[0];
  const stats = useMemo(() => {
    const st = card.stats ? card.stats.slice() : [];
    if (selChart && selSeries && sel >= 0 && st.length) {
      const v = selSeries.values[sel];
      if (v != null && !isNaN(v)) {
        st[0] = {
          ...st[0],
          label: st[0].label.replace(/^avg\s+/i, ''),
          value: selChart.integer ? Math.round(v) : Math.round(v * 10) / 10,
          sub: `(${buckets[sel]?.label ?? ''})`,
        };
      }
    }
    return st;
  }, [card.stats, selChart, selSeries, sel, buckets]);
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{card.title}</Text>
        {card.help ? <HelpDot title={card.title} text={card.help} /> : null}
      </View>
      {card.tiles && (card.desc || card.sub) ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{card.desc || card.sub}</Text>
      ) : null}
      {stats.length ? (
        card.tiles ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 6 }}>
            {stats.map((s, i) => (
              <View key={i} style={{ flex: 1, minWidth: 96, backgroundColor: p.bg, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>
                  {s.value == null ? '–' : String(s.value)}
                  {s.sub ? <Text style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{` ${s.sub}`}</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 12, marginTop: 8 }}>
            {stats.map((s, i) => (
              <View key={i}>
                <Text style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>
                  {s.value == null ? '–' : String(s.value)}
                  {s.sub ? <Text style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{` ${s.sub}`}</Text> : null}
                </Text>
                <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        )
      ) : null}
      {!card.tiles && (card.desc || card.sub) ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{card.desc || card.sub}</Text>
      ) : null}
      {(card.charts || []).map((ch, i) => (
        <View key={i} style={{ marginTop: 14 }}>
          {ch.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{ch.label}</Text> : null}
          {ch.dumbbell
            ? <BpDumbbell buckets={buckets} sys={ch.dumbbell.sys} dia={ch.dumbbell.dia} />
            : <LineChart buckets={buckets} series={ch.series} zones={ch.zones} integer={ch.integer} target={ch.target} hideHeader={ch.selectStat} onSelect={ch.selectStat ? setSel : undefined} />}
          {ch.legend ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
              {ch.legend.map(([name, color]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                  <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {(card.bars || []).map((bg, i) => (
        <View key={i} style={{ marginTop: 14 }}>
          {bg.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{bg.label}</Text> : null}
          <Bars rows={bg.rows} fmt={bg.fmt} />
        </View>
      ))}
      {(card.insights || []).map((ins, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginTop: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: ins.strength === 'strong' ? '#16a34a' : ins.strength === 'mod' ? '#eab308' : p.accent }} />
          <Text style={{ flex: 1, fontSize: 14, color: p.text, lineHeight: 18 }}>{ins.text}</Text>
        </View>
      ))}
    </View>
  );
});
