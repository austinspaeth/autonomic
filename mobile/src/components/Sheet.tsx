/**
 * Bottom-sheet stack — the native replacement for the PWA's hand-rolled stacked
 * sheets. Sheets open ~90% height, drag to dismiss, have a fixed ✕ (and optional
 * header action) top-right and a fixed blurred footer for the primary action.
 * Sheets stack (edit-over-summary): the one beneath scales back iOS-style.
 *
 * openSheet(builder, opts) pushes a sheet; the builder receives { close, closeAll }.
 * Implemented as a SINGLE RN Modal at the provider that holds the whole stack as
 * absolutely-positioned Views. (iOS can only present one RN Modal at a time, so
 * one-Modal-per-sheet silently fails to stack — the 2nd never appears.)
 */
import React, { createContext, useContext, useRef, useState } from 'react';
import {
  Dimensions, Modal, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, usePalette } from '../theme';
import { Icon } from './Icon';

export interface SheetControls {
  close: () => void;
  closeAll: () => void;
}
export interface SheetOptions {
  action?: { icon: 'edit'; onPress: () => void };
  fullscreen?: boolean;
  /** Size the sheet to its content (up to ~90% cap) and hide the ✕. */
  fitContent?: boolean;
}
type Builder = (c: SheetControls) => React.ReactNode;

interface SheetEntry { id: number; builder: Builder; opts: SheetOptions }

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
  const closeSheet = () => setStack((s) => s.slice(0, -1));
  const closeAll = () => setStack([]);

  return (
    <Ctx.Provider value={{ openSheet, closeSheet, closeAll }}>
      {children}
      {stack.length > 0 && (
        <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
          <View style={StyleSheet.absoluteFill}>
            {stack.map((entry, i) => (
              <SheetView
                key={entry.id}
                entry={entry}
                isTop={i === stack.length - 1}
                behind={i < stack.length - 1}
                onClose={() => setStack((s) => s.filter((x) => x.id !== entry.id))}
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

function SheetView({ entry, isTop, behind, onClose, closeAll }: {
  entry: SheetEntry; isTop: boolean; behind: boolean; onClose: () => void; closeAll: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_H);
  const [footer, setFooter] = useState<React.ReactNode>(null);
  const mounted = useRef(false);
  const full = entry.opts.fullscreen;
  const fit = entry.opts.fitContent && !full;
  const sheetH = full ? SCREEN_H : Math.min(SCREEN_H * 0.92, SCREEN_H - insets.top - 8);

  React.useEffect(() => {
    translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
    mounted.current = true;
  }, [translateY]);

  const dismiss = () => {
    translateY.value = withTiming(SCREEN_H, { duration: 240 }, (fin) => { if (fin) runOnJS(onClose)(); });
  };

  const gesture = useAnimatedGestureHandler<PanGestureHandlerGestureEvent, { start: number }>({
    onStart: (_, ctx) => { ctx.start = translateY.value; },
    onActive: (e, ctx) => { translateY.value = Math.max(0, ctx.start + e.translationY); },
    onEnd: (e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        translateY.value = withTiming(SCREEN_H, { duration: 220 }, (fin) => { if (fin) runOnJS(onClose)(); });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: behind ? 0.94 : 1 },
    ],
  }));

  const controls: SheetControls = { close: dismiss, closeAll: () => { closeAll(); } };
  const content = entry.builder(controls);

  return (
    <>
      {isTop && (
        <Pressable style={[styles.backdrop, { backgroundColor: full ? p.bg : p.overlay }]} onPress={full ? undefined : dismiss} />
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
        {!full && (
          <PanGestureHandler onGestureEvent={gesture}>
            <Animated.View style={styles.grabArea}>
              <View style={[styles.grabber, { backgroundColor: p.border }]} />
            </Animated.View>
          </PanGestureHandler>
        )}
        <SheetContentContext.Provider value={{ setFooter }}>
          {fit ? (
            <View style={{ padding: 18, paddingTop: 8, paddingBottom: footer ? 120 : 24 + insets.bottom }}>
              {content}
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 18, paddingTop: full ? insets.top + 12 : 8, paddingBottom: footer ? 120 : 24 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {content}
            </ScrollView>
          )}
        </SheetContentContext.Provider>

        {!full && !fit && (
          <Pressable onPress={dismiss} style={[styles.closeBtn, { backgroundColor: p.surface2 }]} hitSlop={8}>
            <Icon name="x" size={18} color={p.textDim} />
          </Pressable>
        )}
        {entry.opts.action && (
          <Pressable onPress={entry.opts.action.onPress} style={[styles.actionBtn, { backgroundColor: p.surface2 }]} hitSlop={8}>
            <Icon name={entry.opts.action.icon} size={16} color={p.textDim} />
          </Pressable>
        )}
        {footer && (
          <View style={[styles.footer, { backgroundColor: p.surface, borderTopColor: p.border, paddingBottom: 14 + insets.bottom }]}>
            {footer}
          </View>
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
  grabArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 38, height: 5, borderRadius: 3 },
  closeBtn: { position: 'absolute', top: 12, right: 14, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { position: 'absolute', top: 12, right: 54, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
});

export { radius };
