/* The AI prompt export, from the plus button: choose what goes in and how far
 * back, and get the whole dashboard for that period as one block of text to
 * paste into a chat. The words are lib/prompt.ts; this is the two cards.
 *
 * The result is a second card STACKED on the first (it is rendered inside the
 * first one's content, so its modal presents over it), which is why closing it
 * lands back on the choices with everything as it was left. */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Sheet } from '../components/Sheet';
import { useData } from '../lib/data';
import { easternDay, shortDate } from '../lib/dates';
import { buildPrompt, PROMPT_PERIODS, PROMPT_SECTIONS, promptWindow, type PromptPeriod, type PromptSection } from '../lib/prompt';
import { C, num } from '../theme';

const ICONS: Record<PromptSection, { icon: SFSymbol; color: string }> = {
  usage: { icon: 'person.2.fill', color: C.series },
  retention: { icon: 'arrow.triangle.2.circlepath', color: '#199e70' },
  features: { icon: 'square.grid.2x2.fill', color: '#d55181' },
  store: { icon: 'chart.bar.fill', color: '#3987e5' },
  sales: { icon: 'dollarsign', color: '#FFC93C' },
  errors: { icon: 'exclamationmark.triangle.fill', color: '#e66767' },
  events: { icon: 'flag.fill', color: '#d95926' },
};

const ALL = PROMPT_SECTIONS.map((s) => s.key);

export function PromptSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { snap } = useData();
  const [on, setOn] = useState<PromptSection[]>(ALL);
  const [period, setPeriod] = useState<PromptPeriod>('30');
  const [prompt, setPrompt] = useState<string | null>(null);
  const today = easternDay();
  const w = useMemo(() => promptWindow(snap, period, today), [snap, period, today]);
  const toggle = (k: PromptSection) => {
    Haptics.selectionAsync();
    // Kept in the list's own order, so the prompt reads the same whatever was tapped first.
    setOn((cur) => ALL.filter((x) => (x === k ? !cur.includes(k) : cur.includes(x))));
  };
  const every = on.length === ALL.length;

  return (
    <Sheet visible={visible} onClose={onClose} title="AI prompt">
      {() => (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 8 }}>
            <View style={st.headRow}>
              <Text style={st.section}>Include</Text>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  Haptics.selectionAsync();
                  setOn(every ? [] : ALL);
                }}
              >
                <Text style={st.link}>{every ? 'Clear all' : 'Select all'}</Text>
              </Pressable>
            </View>
            <View style={st.list}>
              {PROMPT_SECTIONS.map((s, i) => {
                const checked = on.includes(s.key);
                const { icon, color } = ICONS[s.key];
                return (
                  <Pressable key={s.key} onPress={() => toggle(s.key)} style={({ pressed }) => [st.row, i > 0 && st.rowLine, pressed && { opacity: 0.6 }]}>
                    <View style={[st.icon, { backgroundColor: `${color}26` }, !checked && { opacity: 0.4 }]}>
                      <SymbolView name={icon} size={15} weight="bold" tintColor={color} />
                    </View>
                    <View style={[{ flex: 1 }, !checked && { opacity: 0.45 }]}>
                      <Text style={st.rowTitle}>{s.label}</Text>
                      <Text style={st.rowSub} numberOfLines={1}>
                        {s.sub}
                      </Text>
                    </View>
                    <SymbolView name={checked ? 'checkmark.circle.fill' : 'circle'} size={23} tintColor={checked ? C.series : C.muted} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <View style={st.headRow}>
              <Text style={st.section}>Time period</Text>
              <Text style={[st.range, num]}>
                {shortDate(w.from)} – {shortDate(w.to)} · {w.weekly ? 'weekly' : 'daily'} rows
              </Text>
            </View>
            <View style={st.periods}>
              {PROMPT_PERIODS.map((p) => {
                const sel = p.key === period;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => {
                      if (!sel) Haptics.selectionAsync();
                      setPeriod(p.key);
                    }}
                    style={[st.period, sel && st.periodOn]}
                  >
                    <Text style={[st.periodText, sel && { color: C.text }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            disabled={!on.length}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPrompt(buildPrompt(snap, on, period, today));
            }}
            style={({ pressed }) => [st.primary, (pressed || !on.length) && { opacity: 0.5 }]}
          >
            <SymbolView name="sparkles" size={17} weight="semibold" tintColor="#fff" />
            <Text style={st.primaryText}>{on.length ? 'Generate prompt' : 'Choose something to include'}</Text>
          </Pressable>

          <PromptResult prompt={prompt} onClose={() => setPrompt(null)} />
        </View>
      )}
    </Sheet>
  );
}

/** The finished prompt, whole, over a button that copies it. */
function PromptResult({ prompt, onClose }: { prompt: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  /* Kept while the card animates out, so it does not empty under the reader. */
  const [shown, setShown] = useState('');
  if (prompt !== null && prompt !== shown) setShown(prompt);
  const words = shown.length;
  return (
    <Sheet
      visible={prompt !== null}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title="Your prompt"
      full
      bleed
    >
      {() => (
        <View style={{ flex: 1, gap: 12, paddingBottom: 16 + insets.bottom }}>
          <View style={st.box}>
            <ScrollView contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator>
              <Text selectable style={st.prompt}>
                {shown}
              </Text>
            </ScrollView>
          </View>
          <Text style={[st.meta, num]}>
            {words.toLocaleString('en-US')} characters · about {Math.round(words / 4).toLocaleString('en-US')} tokens
          </Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(shown);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setCopied(true);
              setTimeout(() => setCopied(false), 2200);
            }}
            style={({ pressed }) => [st.primary, copied && st.done, pressed && { opacity: 0.6 }]}
          >
            <SymbolView name={copied ? 'checkmark' : 'doc.on.doc'} size={16} weight="semibold" tintColor="#fff" />
            <Text style={st.primaryText}>{copied ? 'Copied to clipboard' : 'Copy prompt'}</Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  section: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  link: { color: C.dim, fontSize: 13, fontWeight: '600' },
  range: { color: C.muted, fontSize: 12, flexShrink: 1 },
  list: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hairline },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  period: {
    width: '31%',
    flexGrow: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  periodOn: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.18)' },
  periodText: { color: C.dim, fontSize: 14, fontWeight: '600' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, backgroundColor: C.accent },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  done: { backgroundColor: '#199e70' },
  box: { flex: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  prompt: { color: C.text, fontSize: 13, lineHeight: 19, fontFamily: 'Menlo' },
  meta: { color: C.muted, fontSize: 12, textAlign: 'center' },
});
