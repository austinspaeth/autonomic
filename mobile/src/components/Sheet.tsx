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
import React, { createContext, useContext, useRef, useState } from 'react';
import {
  Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
}
type Builder = (c: SheetControls) => React.ReactNode;

interface SheetEntry { id: number; builder: Builder; opts: SheetOptions; closing?: boolean }

interface SheetCtx {
  openSheet: (builder: Builder, opts?: SheetOptions) => void;
  closeSheet: () => void;
  closeAll: () => void;
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

  const openSheet = (builder: Builder, opts: SheetOptions = {}) => {
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
    <Ctx.Provider value={{ openSheet, closeSheet: closeTop, closeAll }}>
      {children}
      {stack.length > 0 && (
        <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={closeTop}>
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
        </Modal>
      )}
    </Ctx.Provider>
  );
}

const SCREEN_H = Dimensions.get('window').height;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SheetView({ entry, isTop, behind, closing, requestClose, onExited, closeAll }: {
  entry: SheetEntry; isTop: boolean; behind: boolean; closing: boolean;
  requestClose: () => void; onExited: () => void; closeAll: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_H);
  const exiting = useRef(false);
  // 0 = front-most, 1 = pushed back behind a sheet stacked on top. Driven by the
  // `behind` prop so the recede (scale-down + lift) tweens instead of snapping.
  const recede = useSharedValue(behind ? 1 : 0);
  // Height of the on-screen keyboard, tweened in from the OS event so the sticky
  // footer rides just above it and the scroll content gains room to clear it.
  const kb = useSharedValue(0);
  const [kbOpen, setKbOpen] = useState(false);
  const isTopRef = useRef(isTop); isTopRef.current = isTop;
  const [footer, setFooter] = useState<React.ReactNode>(null);
  // Measured footer height so scroll content clears it exactly — footers can be
  // taller than one row (e.g. the results card's stacked button cluster).
  const [footerH, setFooterH] = useState(0);
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
    const onShow = (e: { endCoordinates: { height: number }; duration?: number }) => {
      if (!isTopRef.current) return;
      kb.value = withTiming(e.endCoordinates.height, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
      setKbOpen(true);
    };
    const onHide = (e?: { duration?: number }) => {
      kb.value = withTiming(0, { duration: (e && e.duration) || 250, easing: Easing.out(Easing.cubic) });
      setKbOpen(false);
    };
    const s = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const h = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => { s.remove(); h.remove(); };
  }, [kb]);

  // Play the exit the moment we're flagged closing. The card beneath is already
  // returning (its `behind` flipped false), so the two animate simultaneously.
  React.useEffect(() => {
    if (closing && !exiting.current) {
      exiting.current = true;
      translateY.value = withTiming(SCREEN_H, { duration: 280, easing: Easing.in(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(onExited)();
      });
    }
  }, [closing, onExited, translateY]);

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
  const spacerStyle = useAnimatedStyle(() => ({ height: kb.value }));

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
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 18, paddingTop: topPad, paddingBottom: footer ? Math.max(120, footerH + 20) : 24 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {content}
              <Animated.View style={spacerStyle} />
            </ScrollView>
          )}
        </SheetContentContext.Provider>

        {/* Close (and optional edit) live together in one tinted-glass pill:
            blurred background, near-black tint, dark grey border. */}
        {((!full && !hideClose) || entry.opts.action) && (
          <View style={[styles.headerPill, { borderColor: '#46464e' }]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,6,8,0.78)' }]} />
            {entry.opts.action && (
              <Pressable onPress={entry.opts.action.onPress} style={[styles.pillBtn, { backgroundColor: p.surface2 }]} hitSlop={8}>
                <Icon name={entry.opts.action.icon} size={16} color={p.textDim} />
              </Pressable>
            )}
            {!full && !hideClose && (
              <Pressable onPress={dismiss} style={[styles.pillBtn, { backgroundColor: p.surface2 }]} hitSlop={8}>
                <Icon name="x" size={18} color={p.textDim} />
              </Pressable>
            )}
          </View>
        )}
        {footer && (
          <Animated.View onLayout={(e) => setFooterH(e.nativeEvent.layout.height)} style={[styles.footer, { backgroundColor: p.surface, borderTopColor: p.border }, footerStyle]}>
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
  headerPill: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  pillBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
  kbDismiss: { width: 46, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

export { radius };
