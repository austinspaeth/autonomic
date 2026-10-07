/* Form pieces for the sheets that WRITE (adding store data, a sale, churn, a
 * campaign link). Plain and big: these are filled in one-handed on a phone. */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { addDays, easternDay, longDate } from '../lib/dates';
import { C } from '../theme';
import { Calendar } from './Calendar';
import { Segmented } from './ui';

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard = 'default',
  hint,
  multiline,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: KeyboardTypeOptions;
  hint?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboard}
        keyboardAppearance="dark"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        style={[st.input, multiline && { minHeight: 72, textAlignVertical: 'top' }]}
      />
      {hint ? <Text style={st.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A number field that keeps its text as typed and reports a number (or null when blank). */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  hint,
  decimal = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  hint?: string;
  decimal?: boolean;
}) {
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <View style={st.numRow}>
        {prefix ? <Text style={st.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, ''))}
          placeholder="0"
          placeholderTextColor={C.muted}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          keyboardAppearance="dark"
          style={[st.input, { flex: 1 }]}
        />
      </View>
      {hint ? <Text style={st.hint}>{hint}</Text> : null}
    </View>
  );
}

export const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));

export function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <Segmented options={options} value={value} onChange={onChange} />
    </View>
  );
}

/** A date row with ‹ › steppers; tapping the date opens a month calendar in place. */
export function DateField({ label, value, onChange, max }: { label: string; value: string; onChange: (d: string) => void; max?: string }) {
  const [open, setOpen] = useState(false);
  const today = max ?? easternDay();
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <View style={st.dateRow}>
        <Pressable hitSlop={8} onPress={() => onChange(addDays(value, -1))} style={st.dateArrow}>
          <SymbolView name="chevron.left" size={15} weight="semibold" tintColor={C.text} />
        </Pressable>
        <Pressable onPress={() => setOpen((o) => !o)} style={st.dateBtn}>
          <Text style={st.dateText}>{value === easternDay() ? 'Today' : longDate(value)}</Text>
        </Pressable>
        <Pressable hitSlop={8} disabled={value >= today} onPress={() => onChange(addDays(value, 1))} style={[st.dateArrow, value >= today && { opacity: 0.3 }]}>
          <SymbolView name="chevron.right" size={15} weight="semibold" tintColor={C.text} />
        </Pressable>
      </View>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} style={{ marginTop: 8 }}>
          <Calendar
            current={value}
            today={today}
            onPick={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SaveButton({ label, onPress, disabled, tone = C.accent }: { label: string; onPress: () => Promise<void>; disabled?: boolean; tone?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      <Pressable
        disabled={disabled || busy}
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            await onPress();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e: any) {
            setError(e?.message || 'Could not save. Try again.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } finally {
            setBusy(false);
          }
        }}
        style={({ pressed }) => [st.save, { backgroundColor: tone }, (pressed || disabled || busy) && { opacity: 0.6 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.saveText}>{label}</Text>}
      </Pressable>
      {error ? <Text style={st.error}>{error}</Text> : null}
    </View>
  );
}

export function DangerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.danger, pressed && { opacity: 0.6 }]}>
      <Text style={st.dangerText}>{label}</Text>
    </Pressable>
  );
}

export function FormBack({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={st.back}>
      <Pressable hitSlop={10} onPress={onBack} style={st.backBtn}>
        <SymbolView name="chevron.left" size={15} weight="semibold" tintColor={C.dim} />
        <Text style={st.backText}>Back</Text>
      </Pressable>
      <Text style={st.backTitle}>{title}</Text>
      <View style={{ minWidth: 50, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const st = StyleSheet.create({
  field: { gap: 6 },
  label: { color: C.dim, fontSize: 13, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    color: C.text,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefix: { color: C.dim, fontSize: 17, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateArrow: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  dateBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  dateText: { color: C.text, fontSize: 16, fontWeight: '600' },
  save: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: C.down, fontSize: 13 },
  danger: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255,69,58,0.12)' },
  dangerText: { color: C.down, fontSize: 15, fontWeight: '700' },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 50 },
  backText: { color: C.dim, fontSize: 15 },
  backTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
});
