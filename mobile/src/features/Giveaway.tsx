/**
 * The Dysautonomia Awareness Month giveaway card — Claude Design "Giveaway
 * Journal Card" (51a). Sits directly under the Autonomic Outlook on today's
 * Journal, open by default, and collapses to a Milestones-style row that remembers itself.
 *
 * Teal is borrowed from the awareness ribbon and used ONLY inside this card and
 * its entry sheet, so it reads as an event rather than as a new brand colour.
 *
 * "Enter giveaway" opens a small fitContent card asking for an email address.
 * Submitting POSTs the sign-up (../store/giveaway → `/ping/gvw`), and the card
 * says "You're signed up" only once the server has confirmed it. The window
 * and the entry count are pure (../lib/giveaway); the collapsed state is this
 * file's own flags-MMKV memory.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MMKV } from 'react-native-mmkv';
import { Icon } from '../components/Icon';
import { useSheets, type SheetControls } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { hexA } from '../lib/color';
import { useStore } from '../store/store';
import { todayKey } from '../lib/dates';
import { isGiveawaySignedUp, submitGiveaway } from '../store/giveaway';
import {
  GIVEAWAY_INFO_URL, GIVEAWAY_MAX_ENTRIES, giveawayEntries, giveawayOpen, isPlausibleEmail,
} from '../lib/giveaway';

const TEAL = '#2dd4bf';
const TEAL_INK = '#042f2e';
/** The collapsed row's icon tile: the ribbon's teal taken down to a deep, solid shade. */
const TEAL_TILE = '#0d3b37';
const PRIZE_TITLE = Platform.OS === 'android' ? 'Win a Polar H10 strap' : 'Win an Apple Watch Series 12';
/** Wide enough for "Win an Apple Watch", too narrow for "Series 12" beside it. */
const TITLE_MAX_W = 205;

/* ------------------------------------------------------------------ memory */

const FLAGS_ID = 'autonomic.flags';
const COLLAPSED_KEY = 'giveawayCollapsed';
let kv: MMKV | null | undefined;
function flags(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
const readCollapsed = (): boolean => { try { return flags()?.getBoolean(COLLAPSED_KEY) ?? false; } catch { return false; } };
const writeCollapsed = (v: boolean) => { try { flags()?.set(COLLAPSED_KEY, v); } catch { /* in-memory only */ } };

/* -------------------------------------------------------------------- card */

/**
 * Open and collapsed are two layouts in one card, and only the chevron carries
 * between them, turning in place. Everything else fades: the outgoing layout
 * fades out where it stands, the card's height settles, and the incoming
 * layout fades in already in its own place. One timeline drives it all, so collapsing and expanding are the same motion
 * played in either direction. Both layouts stay mounted and absolutely
 * positioned so each measures at its natural height whatever the card is doing.
 *
 * Collapsed, it is the same object as the cards below it (Milestones): a 42pt
 * tinted icon tile, a title over a one-line count, a thin progress track, and a
 * chevron — the ribbon in the tile where their icons sit.
 */
/** The clean-day accordion's pace (useAccordion: 220-260ms), and overlapped
 *  like it, so the three phases read as one quick motion rather than a sequence. */
const MORPH_MS = 260;
const EASE = Easing.inOut(Easing.cubic);
const OUT_END = 0.4;     // outgoing layout gone by here
const H_START = 0.1;     // height moves between these two
const H_END = 0.9;
const IN_START = 0.55;   // incoming layout starts appearing here
const RIB_ROW = { w: 20, h: 28 };
const ICON_TILE = 42;
const CHEV_BOX = 44;
const CHEV_SIZE = 18;
const PAD = 16;
const RIB_GAP = 14;
/** The ribbon's own viewBox is 100 x 140. */
const RIB_ASPECT = 100 / 140;
const GLOW = 190;

export function GiveawayCard({ dk }: { dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const entries = useStore((s) => giveawayEntries(s.state.days, todayKey()));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [entered, setEntered] = useState(isGiveawaySignedUp);
  // The open layout's title block, which the ribbon beside it matches.
  const [headH, setHeadH] = useState(0);
  const ribW = headH * RIB_ASPECT;

  // 0 = open, 1 = collapsed. Measured sizes live in shared values so the
  // animated styles never wait on a React render.
  const t = useSharedValue(collapsed ? 1 : 0);
  const openH = useSharedValue(0);
  const rowH = useSharedValue(0);
  useEffect(() => { t.value = withTiming(collapsed ? 1 : 0, { duration: MORPH_MS, easing: Easing.linear }); }, [collapsed, t]);

  const shell = useAnimatedStyle(() => {
    if (!(openH.value > 0 && rowH.value > 0)) return { height: undefined };
    const k = EASE(interpolate(t.value, [H_START, H_END], [0, 1], Extrapolation.CLAMP));
    return { height: openH.value + (rowH.value - openH.value) * k };
  });
  // Symmetric about the middle: whichever layout is leaving goes first, the
  // arriving one comes last, in both directions.
  const openLayer = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, OUT_END], [1, 0], Extrapolation.CLAMP),
  }));
  const rowLayer = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [IN_START, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const chevron = useAnimatedStyle(() => ({
    top: rowH.value > 0 ? (rowH.value - CHEV_BOX) / 2 : 12,
    transform: [{ rotate: `${-90 * EASE(t.value)}deg` }],
  }));

  if (dk !== todayKey() || !giveawayOpen(dk)) return null;

  const toggle = (v: boolean) => { writeCollapsed(v); setCollapsed(v); };
  const enter = () => openSheet((c) => (
    <GiveawayEntrySheet controls={c} onEntered={() => setEntered(true)} />
  ), { fitContent: true });

  return (
    <Animated.View
      style={[{
        overflow: 'hidden', marginBottom: 12, backgroundColor: p.surface,
        borderWidth: 1, borderColor: p.border, borderRadius: radius.card,
      }, shell]}
    >
      {/* Open. A tap anywhere but a button collapses it: the buttons are nested
          Pressables and claim their own touches. */}
      <Animated.View
        pointerEvents={collapsed ? 'none' : 'auto'}
        onLayout={(e) => { openH.value = e.nativeEvent.layout.height; }}
        style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, openLayer]}
      >
        {/* The soft teal light behind the ribbon, centred on it. */}
        {headH > 0 ? (
          <View pointerEvents="none" style={{
            position: 'absolute', width: GLOW, height: GLOW,
            left: PAD + ribW / 2 - GLOW / 2, top: PAD + headH / 2 - GLOW / 2,
          }}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="gw-glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={TEAL} stopOpacity={0.12} />
                  <Stop offset="0.65" stopColor={TEAL} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#gw-glow)" />
            </Svg>
          </View>
        ) : null}

        <Pressable onPress={() => toggle(true)} accessibilityLabel="Collapse giveaway card" style={{ paddingHorizontal: PAD, paddingTop: PAD, paddingBottom: 14 }}>
          {/* The ribbon stands beside the two titles, exactly as tall as they
              are: measured, since the prize wraps to one line or two. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: RIB_GAP, marginBottom: 12 }}>
            <View pointerEvents="none" style={{ width: ribW, height: headH, opacity: headH > 0 ? 1 : 0 }}>
              <Ribbon bloom />
            </View>
            <View style={{ flex: 1, paddingRight: 28 }} onLayout={(e) => setHeadH(Math.round(e.nativeEvent.layout.height))}>
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: TEAL, marginBottom: 6 }}>
                DYSAUTONOMIA AWARENESS
              </Text>
              {/* Narrower than the column so the prize breaks after its brand
                  ("Win an Apple Watch / Series 12") rather than wherever it runs out. */}
              <Text style={{ maxWidth: TITLE_MAX_W, fontSize: 21, fontWeight: '700', letterSpacing: -0.4, lineHeight: 25, color: p.text }}>
                {PRIZE_TITLE}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: p.textDim, marginBottom: 15 }}>
            Take an HRV reading, earn an entry. One per day, up to {GIVEAWAY_MAX_ENTRIES}. Other prizes available.
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 15 }}>
            <View style={{ flex: 1 }}><Dots filled={entries} height={6} glow /></View>
            <Count n={entries} />
          </View>

          <View style={{ flexDirection: 'row', gap: 9, marginBottom: 11 }}>
            {/* Once the server has the sign-up this is a statement, not a
                button: same slot and height, so nothing below it moves. */}
            {entered ? (
              <View style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: TEAL }}>You&apos;re signed up</Text>
              </View>
            ) : (
              <Pressable
                onPress={enter}
                style={({ pressed }) => [{
                  flex: 1, height: 46, borderRadius: radius.control,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: TEAL,
                }, pressed && { opacity: 0.8 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: TEAL_INK }}>Enter giveaway</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => { Linking.openURL(GIVEAWAY_INFO_URL).catch(() => {}); }}
              style={({ pressed }) => [{
                height: 46, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1,
                borderColor: hexA(p.text, 0.1), alignItems: 'center', justifyContent: 'center',
              }, pressed && { opacity: 0.7 }]}
            >
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: p.text }}>Learn more</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 11.5, color: p.textDim, textAlign: 'center' }}>
            No purchase necessary · No health data collected
          </Text>
        </Pressable>
      </Animated.View>

      {/* Collapsed: Milestones' own row, measure for measure. */}
      <Animated.View
        pointerEvents={collapsed ? 'auto' : 'none'}
        onLayout={(e) => { rowH.value = e.nativeEvent.layout.height; }}
        style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, rowLayer]}
      >
        <Pressable
          onPress={() => toggle(false)}
          accessibilityLabel="Expand giveaway card"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 }, pressed && { opacity: 0.8 }]}
        >
          <View style={{
            width: ICON_TILE, height: ICON_TILE, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
            backgroundColor: TEAL_TILE, borderWidth: 1, borderColor: hexA(TEAL, 0.14),
          }}>
            <View style={{ width: RIB_ROW.w, height: RIB_ROW.h }}><Ribbon /></View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, color: p.text, fontWeight: '700' }}>Giveaway entries</Text>
            <Text style={{ fontSize: 13, color: p.textDim, marginTop: 2 }}>
              {`${entries} of ${GIVEAWAY_MAX_ENTRIES} earned`}
            </Text>
            <View style={{ marginTop: 10 }}><Dots filled={entries} height={4} /></View>
          </View>
          {/* The shared chevron below sits over this slot. */}
          <View style={{ width: CHEV_SIZE }} />
        </Pressable>
      </Animated.View>

      {/* One chevron for both states, pinned where the row's sits and turning
          on the same timeline: down while open, right while collapsed. It is
          the one thing that does not fade. Taps go to the card beneath it. */}
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', right: 15 - (CHEV_BOX - CHEV_SIZE) / 2, width: CHEV_BOX, height: CHEV_BOX,
        alignItems: 'center', justifyContent: 'center',
      }, chevron]}>
        <Icon name="chevron" size={CHEV_SIZE} color={p.textDim} />
      </Animated.View>
    </Animated.View>
  );
}

function Count({ n }: { n: number }) {
  const p = usePalette();
  return (
    <Text style={{ fontSize: 15, fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'] }}>
      {n}
      <Text style={{ fontSize: 11.5, fontWeight: '500', color: p.textDim }}>
        {` / ${GIVEAWAY_MAX_ENTRIES} entries`}
      </Text>
    </Text>
  );
}

function Dots({ filled, height, glow }: { filled: number; height: number; glow?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: GIVEAWAY_MAX_ENTRIES }, (_, i) => {
        const on = i < filled;
        return (
          <View key={i} style={[
            { flex: 1, height, borderRadius: 999, backgroundColor: on ? TEAL : hexA(p.text, 0.16) },
            on && glow && { shadowColor: TEAL, shadowOpacity: 0.33, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
          ]} />
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ ribbon */

const RIBBON = 'M80 134 L43 63 C29 37 32 9 50 9 C68 9 71 37 57 63 L20 134';

/**
 * The awareness ribbon. The design's bloom is a Gaussian blur breathing on a
 * seven-second cycle; here it is two wide, faint strokes under the ribbon doing
 * the same breath, which reads the same at this size without an SVG filter.
 */
function Ribbon({ bloom }: { bloom?: boolean }) {
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!bloom) return;
    breath.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [bloom, breath]);
  const bloomStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * breath.value }));
  const id = bloom ? 'gw-rib-b' : 'gw-rib';
  const grad = (
    <Defs>
      <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="140">
        <Stop offset="0" stopColor="#5eead4" />
        <Stop offset="0.55" stopColor="#14b8a6" />
        <Stop offset="1" stopColor="#0f766e" />
      </LinearGradient>
    </Defs>
  );
  return (
    <View style={{ width: '100%', height: '100%' }}>
      {bloom ? (
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, bloomStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 140" style={{ overflow: 'visible' }}>
            <Path d={RIBBON} fill="none" stroke={TEAL} strokeOpacity={0.08} strokeWidth={34} strokeLinejoin="round" strokeLinecap="round" />
            <Path d={RIBBON} fill="none" stroke={TEAL} strokeOpacity={0.14} strokeWidth={25} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        </Animated.View>
      ) : null}
      <Svg width="100%" height="100%" viewBox="0 0 100 140" style={{ overflow: 'visible' }}>
        {grad}
        <Path d={RIBBON} fill="none" stroke={`url(#${id})`} strokeWidth={17} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------- entry sheet */

function GiveawayEntrySheet({ controls, onEntered }: { controls: SheetControls; onEntered: () => void }) {
  const p = usePalette();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid = isPlausibleEmail(email);

  // A failure is said INSIDE the card: a toast cannot be seen from a sheet.
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await submitGiveaway(email.trim());
    setBusy(false);
    if (!ok) { setFailed(true); return; }
    onEntered();
    controls.close();
  };

  const point = (text: string) => (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
      <View style={{ marginTop: 2 }}><Icon name="check" size={15} color={TEAL} strokeWidth={2.6} /></View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: p.textDim }}>{text}</Text>
    </View>
  );

  return (
    <View>
      <Text style={{ color: TEAL, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 }}>DYSAUTONOMIA AWARENESS</Text>
      <Text style={{ color: p.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 }}>Enter the giveaway</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>
        Each day you take an HRV reading earns an entry, up to {GIVEAWAY_MAX_ENTRIES}. We need an email to reach you if you win.
      </Text>

      {point('No health data is collected. We only receive the days you took a reading and which sensor you used, never the results.')}
      {point('Your email is used for the giveaway only. We will never sell or share it.')}
      {point('No purchase necessary to enter or win.')}

      <TextInput
        value={email}
        onChangeText={(v) => { setEmail(v); setFailed(false); }}
        onSubmitEditing={() => { void submit(); }}
        editable={!busy}
        placeholder="you@example.com"
        placeholderTextColor={p.textDim}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardAppearance="dark"
        returnKeyType="done"
        style={{
          marginTop: 10, marginBottom: 14, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1,
          borderRadius: radius.control, padding: 12, fontSize: 17, color: p.text,
        }}
      />

      {failed ? (
        <Text style={{ color: '#d63b3b', fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 10 }}>
          Couldn&apos;t sign you up. Check your connection and try again.
        </Text>
      ) : null}

      <Pressable
        onPress={() => { void submit(); }}
        disabled={!valid || busy}
        style={({ pressed }) => [{
          height: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
          backgroundColor: valid ? TEAL : hexA(p.text, 0.08),
        }, (pressed || busy) && valid && { opacity: 0.8 }]}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: valid ? TEAL_INK : p.textDim }}>
          {busy ? 'Signing up…' : 'Enter giveaway'}
        </Text>
      </Pressable>

      {/* App Review 5.3.2: the rules must be reachable from inside the app and
          say Apple is neither a sponsor nor involved. Said here, where the
          entry is actually made, rather than only on the linked page. */}
      <Text style={{ fontSize: 12, lineHeight: 17, color: p.textDim, textAlign: 'center', marginTop: 14 }}>
        By entering you agree to the{' '}
        <Text
          onPress={() => { Linking.openURL(GIVEAWAY_INFO_URL).catch(() => {}); }}
          style={{ color: TEAL, fontWeight: '600' }}
        >
          official rules
        </Text>
        .{Platform.OS === 'ios' ? ' Apple is not a sponsor of, and is not involved in, this giveaway in any way.' : ''}
      </Text>
    </View>
  );
}
