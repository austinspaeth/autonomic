import React, { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Dimensions, Easing, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing as REasing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BrandMark, Icon, IconName } from '../../src/components/Icon';
import { HeaderRule, headerHeight } from '../../src/components/Header';
import { useSheets } from '../../src/components/Sheet';
import { MenuSheet } from '../../src/features/Settings';
import { usePalette } from '../../src/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Journal', icon: 'clipboard' },
  { name: 'analysis', label: 'Progress', icon: 'chart' },
  { name: 'insights', label: 'Insight', icon: 'ai' },
];

const PAD = 5; // bar inner padding; the highlight pill is inset by this top/bottom
// Minimum breathing room between the floating bar and the screen edges.
const BAR_GUTTER = 12;
// Slight elastic bounce (damping ratio ~0.7) — a soft overshoot, not springy.
const SPRING = { damping: 19, stiffness: 210, mass: 1 };

// Directional cross-slide between tabs: the outgoing view fades and pushes off
// toward the tab you left; the incoming view fades in from the opposite side.
// react-navigation feeds each scene a signed `progress` (0 = focused; +1 / -1
// for tabs after / before the active one), so the sign already encodes direction.
const SHIFT = Math.round(Dimensions.get('window').width * 0.32);
const TAB_TRANSITION = {
  animation: 'shift' as const,
  transitionSpec: {
    animation: 'timing' as const,
    config: { duration: 190, easing: Easing.out(Easing.cubic) },
  },
  sceneStyleInterpolator: ({ current }: { current: { progress: RNAnimated.Value } }) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [{
        translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-SHIFT, 0, SHIFT] }),
      }],
    },
  }),
};

// ---- Android staged tab transition ----
// iOS runs TAB_TRANSITION above natively: both scenes cross-slide at once. On
// Android (often budget hardware) animating two full chart trees concurrently
// is what made tab switches take seconds, so the navigator keeps
// `animation: 'none'` (the scene swap is one instant commit) and the same
// motion is staged around it in strict sequence: the outgoing scene fades and
// slides off toward the tab you left, the scenes swap while nothing is
// visible, then the incoming scene (already rendered — lazy: false) slides in
// from the opposite side. Only one tree animates at a time, and the swap
// commit can never stutter a visible frame.
const SCENE_TIMING = { duration: 160, easing: REasing.out(REasing.cubic) };
// Every mounted scene's fx listener; the tab bar broadcasts a signed direction
// (+1 = moving to a tab on the right), or 0 to cancel back into place.
const sceneFx = new Set<(dir: number) => void>();
// True between the out-animation and the incoming scene gaining focus.
let scenePendingIn = false;
let sceneNavTimer: ReturnType<typeof setTimeout> | null = null;

/** Per-scene wrapper, installed Android-only via the navigator's
 *  `screenLayout`. Focused scene: animates out on a broadcast (or back in on a
 *  cancel). Hidden scenes: snap to the incoming-side pose so the swap can't
 *  flash, then slide in on gaining focus. */
function AndroidSceneFx({ children }: { children: React.ReactNode }) {
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const tx = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    const onFx = (dir: number) => {
      if (focusedRef.current) {
        tx.value = withTiming(dir === 0 ? 0 : -dir * SHIFT, SCENE_TIMING);
        fade.value = withTiming(dir === 0 ? 1 : 0, SCENE_TIMING);
      } else if (dir !== 0) {
        tx.value = dir * SHIFT;
        fade.value = 0;
      }
    };
    sceneFx.add(onFx);
    return () => { sceneFx.delete(onFx); };
  }, [tx, fade]);
  // Gaining focus: slide in if the tab bar staged this switch; snap into place
  // otherwise (hardware back navigates tabs without going through the bar).
  useEffect(() => {
    if (!focused) return;
    if (scenePendingIn) {
      scenePendingIn = false;
      tx.value = withTiming(0, SCENE_TIMING);
      fade.value = withTiming(1, SCENE_TIMING);
    } else {
      tx.value = 0;
      fade.value = 1;
    }
  }, [focused, tx, fade]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateX: tx.value }] }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

// Solid (filled) cog — hollow center via even-odd fill. Opens the menu sheet.
function SolidCog({ size = 22, color = '#000' }: { size?: number; color?: string }) {
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

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();
  const tabRoutes = state.routes.filter((r) => TABS.some((t) => t.name === r.name));
  const { width: winW, fontScale } = useWindowDimensions();

  // The bar sizes to its content, so a narrow phone — or an OS text size large
  // enough to widen the tab labels — can push it past the screen. `maxWidth`
  // below pins it to the available width, at which point the row's children
  // (none of them shrinkable) overflow and the shell clips the cog off the
  // edge. The brand mark is the only thing in the bar that does nothing, so
  // it's what gives way, keeping every control reachable.
  //
  // Overflow is read directly rather than compared against the screen: the cog
  // is the last child, so content wider than the row means its right edge lands
  // past the row's own width. Latched — hiding the mark can only shrink the
  // content, so the decision can't oscillate — and reset when the inputs that
  // drive it change (rotation, or the user changing text size in Settings).
  const avail = winW - BAR_GUTTER * 2;
  const [markFits, setMarkFits] = useState(true);
  const [rowW, setRowW] = useState(0);
  const [cogEnd, setCogEnd] = useState(0);
  useEffect(() => { setMarkFits(true); }, [winW, fontScale]);
  useEffect(() => {
    if (rowW > 0 && cogEnd > 0 && cogEnd + PAD > rowW + 0.5) setMarkFits(false);
  }, [rowW, cogEnd]);
  const activeIndex = Math.max(0, tabRoutes.findIndex((r) => state.routes.indexOf(r) === state.index));

  // Android staging: the pill (and icon tint) moves the moment a tab is
  // pressed, while navigation state only advances after the out-animation —
  // so the highlight follows an optimistic index until the two agree.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const shownIndex = Platform.OS === 'android' && optimistic != null ? optimistic : activeIndex;
  useEffect(() => {
    if (optimistic != null && optimistic === activeIndex) setOptimistic(null);
  }, [optimistic, activeIndex]);

  const pressTab = (name: string, i: number) => {
    if (Platform.OS !== 'android') { navigation.navigate(name); return; }
    if (i === shownIndex) return;            // already there (or already heading there)
    const dir = i > shownIndex ? 1 : -1;
    setOptimistic(i);
    if (sceneNavTimer) { clearTimeout(sceneNavTimer); sceneNavTimer = null; }
    if (i === activeIndex) {
      // Mid-flight return to the scene still on screen: cancel the pending
      // switch and slide it back into place.
      scenePendingIn = false;
      sceneFx.forEach((l) => l(0));
      return;
    }
    scenePendingIn = true;
    sceneFx.forEach((l) => l(dir));
    // Navigate once the outgoing scene is fully off; the incoming scene's
    // focus effect (AndroidSceneFx) runs the slide-in.
    sceneNavTimer = setTimeout(() => { sceneNavTimer = null; navigation.navigate(name); }, SCENE_TIMING.duration + 20);
  };

  // Measured per-tab geometry drives the sliding highlight pill.
  const [layouts, setLayouts] = useState<{ x: number; w: number }[]>([]);
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  useEffect(() => {
    const l = layouts[shownIndex];
    if (!l) return;
    if (pillW.value === 0) { pillX.value = l.x; pillW.value = l.w; } // first measure: snap
    else { pillX.value = withSpring(l.x, SPRING); pillW.value = withSpring(l.w, SPRING); }
  }, [shownIndex, layouts]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }], width: pillW.value }));

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 12, left: 0, right: 0, alignItems: 'center' }}>
      <BarShell maxWidth={avail}>
      <View
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: PAD, backgroundColor: Platform.OS === 'ios' ? 'rgba(6,6,9,0.82)' : '#0a0a0e' }}
      >
        {markFits ? (
          <View style={{ paddingLeft: 8, paddingRight: 6, marginRight: 8, justifyContent: 'center' }}>
            <BrandMark size={20} />
          </View>
        ) : null}
        {/* Sliding highlight pill sits behind the tabs. */}
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: 999, backgroundColor: p.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)' }, pillStyle]}
        />
        {tabRoutes.map((route, i) => {
          const focused = i === shownIndex;
          const tab = TABS.find((t) => t.name === route.name)!;
          return (
            <Pressable
              key={route.key}
              onPress={() => pressTab(route.name, i)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setLayouts((prev) => {
                  if (prev[i] && prev[i].x === x && prev[i].w === width) return prev;
                  const next = prev.slice();
                  next[i] = { x, w: width };
                  return next;
                });
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, alignItems: 'center' }}
            >
              <Icon name={tab.icon} size={22} color={focused ? p.text : p.textDim} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: focused ? p.text : p.textDim, marginTop: 3 }}>{tab.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => openSheet((c) => <MenuSheet controls={c} />)}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setCogEnd(x + width);
          }}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}
        >
          <SolidCog size={22} color={p.textDim} />
        </Pressable>
      </View>
      </BarShell>
    </View>
  );
}

/** The floating bar's rounded shell — dark glass (BlurView) on iOS, a solid
 *  pill on Android where expo-blur renders plain translucency instead of blur. */
function BarShell({ children, maxWidth }: { children: React.ReactNode; maxWidth: number }) {
  const shell = {
    maxWidth,
    borderRadius: 999, overflow: 'hidden' as const, borderWidth: 1, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  };
  if (Platform.OS === 'android') return <View style={[shell, { backgroundColor: '#0a0a0e' }]}>{children}</View>;
  return <BlurView intensity={40} tint="dark" style={shell}>{children}</BlurView>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  return (
    <View style={{ flex: 1 }}>
      {/* lazy: false pre-mounts every scene at startup, mirroring the journal's
          day-change rule (render first, then animate): switching tabs slides in
          an already-rendered tree instead of mounting heavy charts mid-transition. */}
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        // Android: the navigator itself never animates (the concurrent
        // cross-slide is what made tab switches take seconds on budget
        // hardware) — AndroidSceneFx stages the same motion around the
        // instant swap instead. iOS keeps the native directional slide.
        // sceneStyle: the scene container behind the fading views defaults to
        // react-navigation's light-theme white — the staged Android switch
        // holds nothing but that background on screen between out and in, so
        // it must be the app background or the gap flashes white.
        screenOptions={{ headerShown: false, lazy: false, sceneStyle: { backgroundColor: p.bg }, ...(Platform.OS === 'ios' ? TAB_TRANSITION : { animation: 'none' as const }) }}
        {...(Platform.OS === 'android'
          ? { screenLayout: ({ children }: { children: React.ReactElement }) => <AndroidSceneFx>{children}</AndroidSceneFx> }
          : null)}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="analysis" />
        <Tabs.Screen name="insights" />
      </Tabs>
      {/* Fixed header rule: sits at the header's bottom edge, on top of the
          sliding scenes, so the divider stays put during tab transitions. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: headerHeight(insets.top), left: 0, right: 0, height: 1 }}>
        <HeaderRule />
      </View>
    </View>
  );
}
