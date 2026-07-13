import React, { useEffect, useState } from 'react';
import { Animated as RNAnimated, Dimensions, Easing, Platform, Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
  const activeIndex = Math.max(0, tabRoutes.findIndex((r) => state.routes.indexOf(r) === state.index));

  // Measured per-tab geometry drives the sliding highlight pill.
  const [layouts, setLayouts] = useState<{ x: number; w: number }[]>([]);
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  useEffect(() => {
    const l = layouts[activeIndex];
    if (!l) return;
    if (pillW.value === 0) { pillX.value = l.x; pillW.value = l.w; } // first measure: snap
    else { pillX.value = withSpring(l.x, SPRING); pillW.value = withSpring(l.w, SPRING); }
  }, [activeIndex, layouts]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }], width: pillW.value }));

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 12, left: 0, right: 0, alignItems: 'center' }}>
      <BarShell>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: PAD, backgroundColor: Platform.OS === 'ios' ? 'rgba(6,6,9,0.82)' : '#0a0a0e' }}>
        <View style={{ paddingLeft: 8, paddingRight: 6, marginRight: 8, justifyContent: 'center' }}>
          <BrandMark size={20} />
        </View>
        {/* Sliding highlight pill sits behind the tabs. */}
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: 999, backgroundColor: p.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)' }, pillStyle]}
        />
        {tabRoutes.map((route, i) => {
          const focused = i === activeIndex;
          const tab = TABS.find((t) => t.name === route.name)!;
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
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
function BarShell({ children }: { children: React.ReactNode }) {
  const shell = {
    borderRadius: 999, overflow: 'hidden' as const, borderWidth: 1, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  };
  if (Platform.OS === 'android') return <View style={[shell, { backgroundColor: '#0a0a0e' }]}>{children}</View>;
  return <BlurView intensity={40} tint="dark" style={shell}>{children}</BlurView>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      {/* lazy: false pre-mounts every scene at startup, mirroring the journal's
          day-change rule (render first, then animate): switching tabs slides in
          an already-rendered tree instead of mounting heavy charts mid-transition. */}
      <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, lazy: false, ...TAB_TRANSITION }}>
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
