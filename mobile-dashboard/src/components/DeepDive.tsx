/* A full-width button that opens a full-height card: an icon, what is behind
 * it, one line saying how much, and a chevron. A view keeps its headline
 * numbers on the screen and puts each long read behind one of these. The
 * card's contents are only built while it is open. */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, num } from '../theme';
import { useBoardWidth } from '../lib/wide';
import { Sheet } from './Sheet';
import { KEYBOARD_SCROLL } from './ui';

/** Holds a run of DeepDive buttons: one per row on a phone, two across when wide. */
export function DeepDiveGrid({ children }: { children: ReactNode }) {
  /* By the grid's own width, not the window's: on the wide board a section is
     one column of several, and can be narrower than a phone in landscape. */
  const [w, setW] = useState(0);
  const boardW = useBoardWidth();
  /* On the board the buttons are not a block: each is an item of the flow in
     its own right, so the ones that still fit under a section's cards stay
     there and only the rest wrap, instead of all four leaving together. */
  if (boardW) return <>{children}</>;
  return (
    <View style={st.grid} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <TwoAcross.Provider value={w >= TWO_ACROSS_FROM}>{children}</TwoAcross.Provider>
    </View>
  );
}

const TWO_ACROSS_FROM = 640;
const TwoAcross = createContext(false);

export function DeepDive({ icon, title, sub, children }: { icon: SFSymbol; title: string; sub: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const wide = useContext(TwoAcross);
  const boardW = useBoardWidth();
  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
        style={({ pressed }) => [st.btn, wide && st.btnWide, boardW ? { width: boardW } : null, pressed && { opacity: 0.7 }]}
      >
        <View style={st.icon}>
          <SymbolView name={icon} size={17} weight="semibold" tintColor={C.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.title}>{title}</Text>
          <Text style={[st.sub, num]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={C.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title} full bleed>
        {() => (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 + insets.bottom }}
            {...KEYBOARD_SCROLL}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  btnWide: { width: '48.5%', flexGrow: 1, paddingVertical: 16, paddingHorizontal: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingVertical: 12, paddingHorizontal: 12, width: '100%' },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.dim, fontSize: 12, marginTop: 1 },
});
