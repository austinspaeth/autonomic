/**
 * Bottom-sheet stack — the native replacement for the PWA's hand-rolled stacked
 * sheets. Sheets open ~90% height and are closed with the fixed ✕ (top-right) or
 * a tap on the backdrop — never a swipe gesture. They also carry an optional
 * header action and a fixed blurred footer for the primary action.
 * Sheets stack (edit-over-summary): the one beneath scales back iOS-style.
 *
 * openSheet(builder, opts) pushes a sheet; the builder receives { close, closeAll }.
 * Implemented as a SINGLE RN Modal at the provider that holds the whole stack as
 * absolutely-positioned Views. (iOS can only present one RN Modal at a time, so
 * one-Modal-per-sheet silently fails to stack — the 2nd never appears.)
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  BackHandler, Keyboard, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, TextInput,
  View, ViewStyle,
} from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, usePalette } from '../theme';
import { notifyChartsBlur } from './charts';
import { Icon } from './Icon';

export interface SheetControls {
  close: () => void;
  closeAll: () => void;
}
export interface SheetOptions {
  action?: { icon: 'edit'; onPress: () => void };
  fullscreen?: boolean;
  /** Size the sheet to its content (up to ~90% cap). */
  fitContent?: boolean;
  /** Hide the ✕ and make the backdrop non-dismissing — the sheet closes itself. */
  hideClose?: boolean;
  /** Stretch the scroll content to fill the sheet so content can bottom-pin
   *  (e.g. via marginTop: 'auto') just above the footer divider. */
  grow?: boolean;
}
type Builder = (c: SheetControls) => React.ReactNode;

interface SheetEntry { id: number; builder: Builder; opts: SheetOptions; closing?: boolean }

interface SheetCtx {
  openSheet: (builder: Builder, opts?: SheetOptions) => void;
  closeSheet: () => void;
  closeAll: () => void;
  /** Open (non-closing) sheets — lets overlays outside the stack wait for it to clear. */
  depth: number;
}
const Ctx = createContext<SheetCtx | null>(null);
export const useSheets = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSheets outside provider');
  return c;
};

let nextId = 1;

export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<SheetEntry[]>([]);

  // Double-tap guard: on a janky frame (slow Androids especially) both taps of
  // an accidental double-press get queued and each opens the same sheet. Two
  // deliberate opens are never this close together, so drop the echo.
  const lastOpenAt = useRef(0);
  const openSheet = (builder: Builder, opts: SheetOptions = {}) => {
    const now = Date.now();
    if (now - lastOpenAt.current < 350) return;
    lastOpenAt.current = now;
    setStack((s) => [...s, { id: nextId++, builder, opts }]);
  };
  // Closing is a two-step dance so the animation stays fluid: flag the sheet
  // `closing` (it plays its exit AND the card beneath immediately un-recedes,
  // because `behind` ignores closing sheets), then `remove` once the exit lands.
  const remove = (id: number) => setStack((s) => s.filter((e) => e.id !== id));
  const requestClose = (id: number) => setStack((s) => s.map((e) => (e.id === id ? { ...e, closing: true } : e)));
  const closeTop = () => setStack((s) => {
    for (let i = s.length - 1; i >= 0; i -= 1) {
      if (!s[i].closing) { const c = s.slice(); c[i] = { ...c[i], closing: true }; return c; }
    }
    return s;
  });
  const closeAll = () => setStack((s) => s.map((e) => ({ ...e, closing: true })));

  return (
    <Ctx.Provider value={{ openSheet, closeSheet: closeTop, closeAll, depth: stack.filter((e) => !e.closing).length }}>
      {children}
      {stack.length > 0 && (
        <SheetHost onRequestClose={closeTop}>
          {/* Capture-phase touch hook (never claims the responder): any touch in
              the sheet stack blurs chart selections; a touched chart re-selects
              in the same event, so only taps *outside* a chart deselect. */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponderCapture={() => { notifyChartsBlur(); return false; }}
          >
            {stack.map((entry, i) => (
              <SheetView
                key={entry.id}
                entry={entry}
                isTop={i === stack.length - 1}
                behind={stack.slice(i + 1).some((e) => !e.closing)}
                closing={!!entry.closing}
                requestClose={() => requestClose(entry.id)}
                onExited={() => remove(entry.id)}
                closeAll={closeAll}
              />
            ))}
          </View>
        </SheetHost>
      )}
    </Ctx.Provider>
  );
}

/**
 * Where the sheet stack lives. iOS: one RN Modal (escapes every stacking
 * context; iOS keyboards overlay it and the manual footer-lift handles them).
 * Android: a plain full-screen overlay View in the ACTIVITY window instead —
 * an RN Modal is its own Android window, and that window pans itself when the
 * keyboard covers a focused input (windowSoftInputMode doesn't reach Modals),
 * shoving the whole sheet up on top of the footer-lift. In the activity window
 * (edge-to-edge) the keyboard simply overlays, matching the iOS model the
 * sheet's keyboard handling was built for. Back button mirrors onRequestClose.
 */
function SheetHost({ children, onRequestClose }: { children: React.ReactNode; onRequestClose: () => void }) {
  const onRequestCloseRef = useRef(onRequestClose); onRequestCloseRef.current = onRequestClose;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onRequestCloseRef.current(); return true; });
    return () => sub.remove();
  }, []);
  if (Platform.OS === 'android') {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 999, elevation: 999 }]}>
        {children}
      </View>
    );
  }
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SheetView({ entry, isTop, behind, closing, requestClose, onExited, closeAll }: {
  entry: SheetEntry; isTop: boolean; behind: boolean; closing: boolean;
  requestClose: () => void; onExited: () => void; closeAll: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  // Size against the ACTUAL container frame, not a module-level Dimensions
  // snapshot. On Android the sheet host is a full-screen absoluteFill View in
  // the (edge-to-edge) activity window, but `Dimensions.get('window').height`
  // is device-inconsistent there — some devices subtract the status/nav bars,
  // some don't — so a snapshot made the card open to a device-dependent height.
  // useSafeAreaFrame() reports the frame the provider actually occupies (the
  // same area the host fills) and is reactive to rotation.
  const SCREEN_H = useSafeAreaFrame().height;
  const translateY = useSharedValue(SCREEN_H);
  const exiting = useRef(false);
  // 0 = front-most, 1 = pushed back behind a sheet stacked on top. Driven by the
  // `behind` prop so the recede (scale-down + lift) tweens instead of snapping.
  const recede = useSharedValue(behind ? 1 : 0);
  // Height of the on-screen keyboard, tweened in from the OS event so the sticky
  // footer rides just above it and the scroll content gains room to clear it.
  const kb = useSharedValue(0);
  // Same height but applied to the tail spacer INSTANTLY on show — the auto-scroll
  // below needs the extra scroll room to exist before scrollTo, or iOS clamps it.
  const kbSpace = useSharedValue(0);
  const [kbOpen, setKbOpen] = useState(false);
  const isTopRef = useRef(isTop); isTopRef.current = isTop;
  const [footer, setFooter] = useState<React.ReactNode>(null);
  // Measured footer height so scroll content clears it exactly — footers can be
  // taller than one row (e.g. the results card's stacked button cluster).
  const [footerH, setFooterH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  // Live mirrors for the keyboard listener (registered once, deps [kb]).
  const footerHRef = useRef(0);
  const hasFooterRef = useRef(false); hasFooterRef.current = !!footer;
  const mounted = useRef(false);
  const full = entry.opts.fullscreen;
  const fit = entry.opts.fitContent && !full;
  const hideClose = entry.opts.hideClose;
  // No swipe-to-dismiss and no grabber on any sheet — closing is always the ✕ (or a
  // backdrop tap). Reclaim the space the grabber used to occupy so content clears the ✕.
  const topPad = full ? insets.top + 12 : 24;
  const sheetH = full ? SCREEN_H : Math.min(SCREEN_H * 0.92, SCREEN_H - insets.top - 8);

  React.useEffect(() => {
    // Push up from the bottom with just a hint of elasticity — barely-there overshoot.
    translateY.value = withSpring(0, { damping: 23, stiffness: 200, mass: 0.9 });
    mounted.current = true;
  }, [translateY]);

  // Tween the card back (and forward again) as sheets stack on top / pop off. Same
  // ~duration as the incoming card's rise so the two move together, but damped so
  // the receding card doesn't bounce.
  React.useEffect(() => {
    recede.value = withSpring(behind ? 1 : 0, { damping: 21, stiffness: 210, mass: 0.9 });
  }, [behind, recede]);

  // Track the keyboard so the footer stays pinned above it. iOS gives us the
  // will-* events (with a duration) for a frame-perfect match; Android only the
  // did-* ones. Only the top-most sheet reacts — the ones receded behind it keep
  // their footer put.
  React.useEffect(() => {
    const ios = Platform.OS === 'ios';
    const onShow = (e: { endCoordinates: { height: number; screenY?: number }; duration?: number }) => {
      if (!isTopRef.current) return;
      kb.value = withTiming(e.endCoordinates.height, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
      kbSpace.value = e.endCoordinates.height; // instant — see declaration
      setKbOpen(true);
      // Auto-scroll the focused field clear of the keyboard AND the raised footer
      // (fields near the sheet bottom are otherwise typed into blind). iOS refires
      // will-show on every focus change, so hopping between fields re-runs this.
      const input = TextInput.State.currentlyFocusedInput();
      const kbTop = e.endCoordinates.screenY ?? SCREEN_H - e.endCoordinates.height;
      if (input && scrollRef.current) {
        // Small delay so the spacer's new height has landed in the content size.
        setTimeout(() => {
          input.measureInWindow((_x, y, _w, h) => {
            const clearBottom = kbTop - (hasFooterRef.current ? footerHRef.current : 0) - 12;
            const overlap = y + h - clearBottom;
            if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
          });
        }, 60);
      }
    };
    const onHide = (e?: { duration?: number }) => {
      kb.value = withTiming(0, { duration: (e && e.duration) || 250, easing: Easing.out(Easing.cubic) });
      kbSpace.value = withTiming(0, { duration: (e && e.duration) || 250, easing: Easing.out(Easing.cubic) });
      setKbOpen(false);
    };
    const s = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const h = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => { s.remove(); h.remove(); };
  }, [kb, kbSpace, SCREEN_H]);

  // Play the exit the moment we're flagged closing. The card beneath is already
  // returning (its `behind` flipped false), so the two animate simultaneously.
  React.useEffect(() => {
    if (closing && !exiting.current) {
      exiting.current = true;
      translateY.value = withTiming(SCREEN_H, { duration: 280, easing: Easing.in(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(onExited)();
      });
    }
  }, [closing, onExited, translateY, SCREEN_H]);

  const dismiss = requestClose;

  // Keep the latest close handlers in refs so `controls` (below) can be built once
  // and stay referentially stable — the provider re-creates these prop functions
  // on every render, but the sheet body must not see a new `controls` each time.
  const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose;
  const closeAllRef = useRef(closeAll); closeAllRef.current = closeAll;

  // Backdrop fades in/out with the card's position — 1 when fully up, 0 offscreen.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, translateY.value / SCREEN_H)),
  }));

  const sheetStyle = useAnimatedStyle(() => {
    const scale = 1 - 0.08 * recede.value; // shrink to 0.92 when fully receded
    // Scaling is centered, so it drops the top edge by (1-scale)*sheetH/2. Lift by
    // that much PLUS a peek so the card's top rounds out above the incoming sheet
    // — the iOS "stacked cards" look.
    const peek = 22 * recede.value;
    const lift = recede.value * 0.04 * sheetH + peek;
    return {
      transform: [
        { translateY: translateY.value - lift },
        { scale },
      ],
    };
  });

  // Lift the footer by the keyboard height and shed the home-indicator inset as it
  // rises (the keyboard already covers that safe area).
  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kb.value }],
    paddingBottom: 14 + insets.bottom * (1 - Math.min(1, kb.value / 24)),
  }));
  // Spacer at the tail of the scroll content so a focused field can scroll clear
  // of both the keyboard and the raised footer.
  const spacerStyle = useAnimatedStyle(() => ({ height: kbSpace.value }));

  const controls = React.useMemo<SheetControls>(() => ({
    close: () => requestCloseRef.current(),
    closeAll: () => closeAllRef.current(),
  }), []);
  // Build the sheet body once per entry. Memoizing is load-bearing: a sheet's
  // content can register a fixed footer via SheetFooter -> setFooter, which
  // re-renders this component. Without the memo we'd rebuild `content`, re-render
  // SheetFooter, and its (dep-less) effect would setFooter again — an infinite
  // update loop ("Maximum update depth exceeded"). The content's own components
  // still re-render from their own state; only the parent cascade is cut.
  const content = React.useMemo(() => entry.builder(controls), [entry, controls]);
  // Stable context value so a footer update doesn't force SheetFooter (a consumer)
  // to re-render through the context and re-trigger the loop above.
  const ctxValue = React.useMemo(() => ({ setFooter }), [setFooter]);

  return (
    <>
      {isTop && (
        full
          ? <Animated.View pointerEvents="none" style={[styles.backdrop, { backgroundColor: p.bg }, backdropStyle]} />
          : hideClose
            ? <Animated.View pointerEvents="none" style={[styles.backdrop, { backgroundColor: p.overlay }, backdropStyle]} />
            : <AnimatedPressable style={[styles.backdrop, { backgroundColor: p.overlay }, backdropStyle]} onPress={dismiss} />
      )}
      <Animated.View
        pointerEvents={isTop ? 'auto' : 'none'}
        style={[
          styles.sheet,
          fit ? { maxHeight: sheetH } : { height: sheetH },
          { backgroundColor: p.surface, borderColor: p.border, borderTopLeftRadius: full ? 0 : 18, borderTopRightRadius: full ? 0 : 18 },
          sheetStyle,
        ]}
      >
        <SheetContentContext.Provider value={ctxValue}>
          {fit ? (
            <View style={{ padding: 18, paddingTop: topPad, paddingBottom: footer ? Math.max(120, footerH + 20) : 24 + insets.bottom }}>
              {content}
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 18, paddingTop: topPad, paddingBottom: footer ? Math.max(120, footerH + 20) : 24 + insets.bottom, ...(entry.opts.grow ? { flexGrow: 1 } : null) }}
              keyboardShouldPersistTaps="handled"
              // "interactive" (iOS) keeps the keyboard up while scrolling the form —
              // it only dismisses when dragged down over the keyboard itself.
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            >
              {content}
              <Animated.View style={spacerStyle} />
            </ScrollView>
          )}
        </SheetContentContext.Provider>

        {/* Close (and optional edit) live together in one tinted-glass pill. */}
        {((!full && !hideClose) || entry.opts.action) && (
          <SheetPill lone={!(entry.opts.action && !full && !hideClose)} style={styles.headerPill}>
            {entry.opts.action && (
              <SheetPillButton icon={entry.opts.action.icon} size={16} onPress={entry.opts.action.onPress} label="Edit" />
            )}
            {!full && !hideClose && <SheetPillButton icon="x" size={18} onPress={dismiss} label="Close" />}
          </SheetPill>
        )}
        {footer && (
          <Animated.View onLayout={(e) => { setFooterH(e.nativeEvent.layout.height); footerHRef.current = e.nativeEvent.layout.height; }} style={[styles.footer, { backgroundColor: p.surface, borderTopColor: p.border }, footerStyle]}>
            {kbOpen && (
              <Pressable onPress={() => Keyboard.dismiss()} style={[styles.kbDismiss, { backgroundColor: p.surface2, borderColor: p.border }]} hitSlop={6}>
                <Icon name="chevron" size={20} color={p.textDim} />
              </Pressable>
            )}
            {footer}
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
}

/**
 * The floating tinted-glass pill the sheet's ✕ rides in: blurred background,
 * near-black tint, dark grey border. Exported so sheet *content* can put its own
 * control (the camera wizard's back arrow) in matching chrome — position it and
 * the two read as one row. `lone` gives a single button equal padding all round
 * so the pill is a circle, not an egg.
 */
export function SheetPill({ children, lone, style }: {
  children: React.ReactNode; lone?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, lone && { paddingHorizontal: 6 }, style]}>
      {/* Android gets no real blur (expo-blur renders plain translucency
          there) — use a solid fill instead of glass. */}
      {Platform.OS === 'ios' ? <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(6,6,8,0.78)' : '#0a0a0d' }]} />
      {children}
    </View>
  );
}

/** One grey circular icon button inside a `SheetPill`. */
export function SheetPillButton({ icon, size = 18, onPress, label, disabled }: {
  icon: React.ComponentProps<typeof Icon>['name']; size?: number; onPress: () => void; label: string; disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.pillBtn, { backgroundColor: p.surface2 }]}
    >
      <Icon name={icon} size={size} color={p.textDim} />
    </Pressable>
  );
}

/** Lets a sheet's content register a fixed footer (primary action row). */
const SheetContentContext = createContext<{ setFooter: (n: React.ReactNode) => void } | null>(null);
export function SheetFooter({ children }: { children: React.ReactNode }) {
  const ctx = useContext(SheetContentContext);
  React.useEffect(() => {
    ctx?.setFooter(children);
    return () => ctx?.setFooter(null);
  });
  return null;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  // Pill chrome (shared with SheetPill) and its fixed top-right placement, kept
  // apart so content can reuse the chrome without the positioning.
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: '#46464e', overflow: 'hidden' },
  headerPill: { position: 'absolute', top: 10, right: 14 },
  pillBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
  kbDismiss: { width: 46, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

export { radius };
