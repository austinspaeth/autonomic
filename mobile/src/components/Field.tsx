/**
 * Form controls for the typed field schema (number/select/time/check/text/
 * textarea/divider). buildFieldInputs mirrors the PWA: consecutive number
 * fields are grouped 2-up; everything else is full width. A tiny controlled
 * form-state hook collects values keyed by field key.
 */
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleProp, Text, TextInput, View, ViewStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Reanimated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { radius, usePalette } from '../theme';
import { Button, Toggle } from './ui';
import { keepsFocus } from './tapAway';
import { SheetControls, useSheets } from './Sheet';
import type { Entry, FieldDef } from '../lib/types';
import { fieldLabel, isDivider, isNumberField } from '../lib/registry';
import { fieldShown, fieldUnit, fmtHeight as fmtHeightIn } from '../lib/units';
import { dateFromKey, fmtDateFull, fmtTime12, keyOf, nowTime } from '../lib/dates';


export type FormState = Record<string, string | boolean>;

/** Keep only a positive decimal: digits plus a single leading dot. */
export const onlyNumeric = (t: string) => {
  const cleaned = t.replace(/[^\d.]/g, '');
  const i = cleaned.indexOf('.');
  return i === -1 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, '');
};

export function useFormState(fields: FieldDef[], initial: Entry): [FormState, (k: string, v: string | boolean) => void] {
  const [state, setState] = useState<FormState>(() => {
    const s: FormState = {};
    fields.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') s[f.key] = !!initial[f.key];
      else if (f.type === 'select') s[f.key] = (initial[f.key] as string) ?? (f.options ? f.options[0] : '');
      // An optional time (a symptom's end) stays empty until the user sets one;
      // every other time field defaults to now.
      else if (f.type === 'time') s[f.key] = (initial[f.key] as string) || (f.optional ? '' : nowTime());
      // A field stored in another unit (distance, in miles) opens in the
      // user's own; EntryForm converts it back on save.
      else s[f.key] = initial[f.key] != null ? fieldShown(f.unit, initial[f.key]) : '';
    });
    return s;
  });
  const set = (k: string, v: string | boolean) => setState((prev) => ({ ...prev, [k]: v }));
  return [state, set];
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ fontSize: 14, fontWeight: '600', color: p.textDim, marginBottom: 6 }}>{children}</Text>;
}

/* ---------- the field shell ----------
 * Every input in the app is one box: the label rests in the middle of an empty
 * field like a placeholder, and travels to the top-left corner when the field
 * is focused or holds a value, leaving the line below it for the value. A unit
 * sits right-aligned on the value's line. */
export const FIELD_H = 64;
const LABEL_REST = { top: 21, size: 18 };
const LABEL_UP = { top: 10, size: 12.5 };
/** How far the value line sits below the box's centre. */
const VALUE_DROP = 9;
const VALUE_SIZE = 18;
const FOCUS_LABEL = '#e8807c';
const FOCUS_GLOW = 'rgba(224,49,39,0.12)';

/** 0 = label resting in the middle, 1 = label up in the corner. */
function useFloat(up: boolean) {
  const t = useSharedValue(up ? 1 : 0);
  React.useEffect(() => { t.value = withTiming(up ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) }); }, [up, t]);
  return t;
}

function FloatLabel({ label, t, focused }: { label: string; t: SharedValue<number>; focused?: boolean }) {
  const p = usePalette();
  const style = useAnimatedStyle(() => ({
    top: interpolate(t.value, [0, 1], [LABEL_REST.top, LABEL_UP.top]),
    fontSize: interpolate(t.value, [0, 1], [LABEL_REST.size, LABEL_UP.size]),
  }));
  return (
    <Reanimated.Text
      numberOfLines={1}
      pointerEvents="none"
      style={[{ position: 'absolute', left: 16, right: 16, fontWeight: '600', color: focused ? FOCUS_LABEL : p.textFaint }, style]}
    >
      {label}
    </Reanimated.Text>
  );
}

/** The unit, or whatever else trails the value. It never moves: always
 *  vertically centred in the box, whatever the label is doing. */
function FieldTail({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return <View pointerEvents="none" style={{ marginRight: tight ? 10 : 16 }}>{children}</View>;
}

function FieldBox({ focused, tall, children }: { focused?: boolean; tall?: boolean; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <View>
      {focused ? <View pointerEvents="none" style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: radius.field + 4, backgroundColor: FOCUS_GLOW }} /> : null}
      <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: p.sunk, borderColor: p.hairline, borderWidth: 1, borderRadius: radius.field }, tall ? { minHeight: 112, alignItems: 'flex-start' } : { height: FIELD_H }]}>
        {children}
        {/* Drawn over the hairline rather than replacing it, so focusing a
            field never moves what is inside it by half a point. */}
        {focused ? <View pointerEvents="none" style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: radius.field, borderWidth: 1.5, borderColor: p.accent }} /> : null}
      </View>
    </View>
  );
}

/** A button that acts on a field, drawn INSIDE it: smaller than the box and a
 *  step lighter, so it reads as part of the input. A tap on one is not a tap
 *  away, so the field keeps its focus and the keyboard stays up. */
export function FieldButton({ glyph, label, onPress, last = true }: {
  glyph: string; label: string; onPress?: () => void; last?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      {...keepsFocus}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: 42, height: 42, marginRight: last ? 10 : 6, borderRadius: 12, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.hairline, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
    >
      <Text style={{ color: p.text, fontSize: 20, fontWeight: '700', lineHeight: 24 }}>{glyph}</Text>
    </Pressable>
  );
}

const FIELD_GAP = 10;

export function TextField({ label, value, onChange, onBlur, keyboardType, placeholder, multiline, signed, onToggleSign, inputRef, unit, trailing, style }: {
  /** Omit for a self-explanatory field: the value then sits vertically centred. */
  label?: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'; placeholder?: string; multiline?: boolean;
  signed?: boolean; onToggleSign?: () => void; inputRef?: React.Ref<TextInput>;
  /** Shown right-aligned on the value's line ("lb", "bpm"). Never part of the label. */
  unit?: string; style?: StyleProp<ViewStyle>;
  /** `FieldButton`s that act on this field, inside it, right of the unit. */
  trailing?: React.ReactNode;
}) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const t = useFloat(focused || !!value);
  const box = (
    <FieldBox focused={focused} tall={multiline}>
      {label ? <FloatLabel label={label} t={t} focused={focused} /> : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        keyboardType={keyboardType || 'default'}
        keyboardAppearance="dark"
        // Only once the label has moved out of the way: at rest the label IS
        // the placeholder, and two greys on one line read as a filled field.
        placeholder={focused || !label ? placeholder : undefined}
        placeholderTextColor={p.textFaint}
        multiline={multiline}
        style={[
          { flex: 1, alignSelf: 'stretch', paddingLeft: 16, paddingRight: unit || signed || trailing ? 8 : 16, paddingTop: 28, paddingBottom: 10, fontSize: VALUE_SIZE, color: p.text },
          multiline && { paddingTop: 31, paddingBottom: 12, textAlignVertical: 'top' },
          !label && { paddingTop: multiline ? 14 : 0, paddingBottom: multiline ? 12 : 0 },
        ]}
      />
      {unit ? <FieldTail tight={signed || !!trailing}><Text style={{ fontSize: 15, color: p.textFaint }}>{unit}</Text></FieldTail> : null}
      {/* The sign flip lives INSIDE the field it acts on. */}
      {signed ? <FieldButton glyph="±" label="Change sign" onPress={onToggleSign} last={!trailing} /> : null}
      {trailing}
    </FieldBox>
  );
  return <View style={[{ marginBottom: FIELD_GAP, flex: 1 }, style]}>{box}</View>;
}

/** A field that opens a picker instead of the keyboard, in the text field's
 *  own skin: `shown` is the formatted value, empty while nothing is set. */
function PickField({ label, shown, onPress, trailing, style }: {
  label: string; shown: string; onPress: () => void; trailing?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const t = useFloat(!!shown);
  return (
    <Pressable onPress={onPress} style={[{ marginBottom: FIELD_GAP }, style]}>
      <FieldBox>
        <FloatLabel label={label} t={t} />
        <Text numberOfLines={1} style={{ flex: 1, marginTop: VALUE_DROP * 2, paddingLeft: 16, paddingRight: 8, fontSize: VALUE_SIZE, color: p.text }}>{shown}</Text>
        {trailing ? <FieldTail>{trailing}</FieldTail> : null}
      </FieldBox>
    </Pressable>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 14 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const active = o === value;
          return (
            <Pressable key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
              <Text style={{ color: active ? p.accent : p.text, fontWeight: active ? '700' : '500' }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const hhmmOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Android's DateTimePicker is always a system dialog (it renders nothing
 *  inline — mounting it opens the dialog, and it must unmount after the first
 *  change event or a re-render reopens it). The picker sheets therefore show
 *  the drafted value as a tappable row on Android, with the dialog on top. */
function AndroidPickerRow({ shown, onPress }: { shown: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 14, alignItems: 'center', marginBottom: 4 }}>
      <Text style={{ color: p.text, fontSize: 21, fontWeight: '700' }}>{shown}</Text>
      <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 3 }}>Tap to change</Text>
    </Pressable>
  );
}

/** Contents of the time-picker sheet: spinner (iOS) / system dialog (Android)
 *  + full-width red Save. `note` adds a line of context under the title (used
 *  by the morning reminder, where the choice needs explaining). */
export function TimePickerSheet({ label, note, value, onChange, onClear, controls }: { label: string; note?: string; value: string; onChange: (v: string) => void; onClear?: () => void; controls: SheetControls }) {
  const p = usePalette();
  const [h, m] = (value || '00:00').split(':').map(Number);
  const base = new Date();
  base.setHours(h || 0, m || 0, 0, 0);
  // Draft the spinner value locally so nothing commits until "Save".
  const [draft, setDraft] = useState(base);
  const [dialogOpen, setDialogOpen] = useState(Platform.OS === 'android');
  // iOS delivers a wheel's change event only after its settle animation, so a
  // quick AM/PM tap → Save can land the event after commit ran. Once saved,
  // write any late event straight through instead of dropping it.
  const saved = useRef(false);
  const commitDate = (d: Date) => onChange(hhmmOf(d));
  const commit = () => {
    saved.current = true;
    commitDate(draft);
    controls.close();
  };
  return (
    <View>
      {/* Title vertically aligned with the sheet's ✕ (top:12, h:32 → centered on 28px). */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, marginTop: -12, marginBottom: note ? 8 : 12, paddingRight: 44 }}>{label}</Text>
      {note ? <Text style={{ fontSize: 14, lineHeight: 21, color: p.textDim, marginBottom: 4 }}>{note}</Text> : null}
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={draft}
          mode="time"
          display="spinner"
          textColor="#ffffff"
          themeVariant="dark"
          style={{ height: 180 }}
          onChange={(_, date) => { if (date) { setDraft(date); if (saved.current) commitDate(date); } }}
        />
      ) : (
        <>
          <AndroidPickerRow shown={fmtTime12(hhmmOf(draft))} onPress={() => setDialogOpen(true)} />
          {dialogOpen ? (
            <DateTimePicker
              value={draft}
              mode="time"
              display="spinner"
              onChange={(e, date) => { setDialogOpen(false); if (e.type === 'set' && date) setDraft(date); }}
            />
          ) : null}
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {onClear ? <Button title="Clear" onPress={() => { onClear(); controls.close(); }} /> : null}
        <Button title="Save" variant="primary" onPress={commit} />
      </View>
    </View>
  );
}

/** `optional` marks a time that may be left unset (a symptom's end time): the
 *  field reads "Not set" while empty and the picker offers Clear once one is. */
export function TimeField({ label, value, onChange, optional }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <TimePickerSheet label={label} value={value} onChange={onChange} onClear={optional && value ? () => onChange('') : undefined} controls={c} />,
    { fitContent: true },
  );
  return <PickField label={label} shown={value ? fmtTime12(value) : ''} onPress={open} style={{ flex: 1 }} />;
}

/** "68" (inches) -> `5' 8"` for display; '' when unparseable. */
export const fmtHeight = (value?: string): string => fmtHeightIn(value, 'imperial');

const FEET = [3, 4, 5, 6, 7];
const INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Contents of the height-picker sheet: feet + inches pill selectors + Save. */
export function HeightPickerSheet({ label, value, onChange, controls }: { label: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const start = Number(value);
  const startOk = Number.isFinite(start) && start > 0;
  // Rounded before the split: a height set in centimetres is stored as decimal
  // inches, and 71.6 has to open on 6′ 0″ rather than 5′ 0″.
  const whole = Math.round(start);
  const [ft, setFt] = useState(startOk ? Math.floor(whole / 12) : 5);
  const [inch, setInch] = useState(startOk ? whole % 12 : 8);
  const pill = (active: boolean) => ({
    minWidth: 44, alignItems: 'center' as const, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radius.control, borderWidth: 1,
    borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2,
  });
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, marginTop: -12, marginBottom: 16 }}>{label}</Text>
      <FieldLabel>Feet</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {FEET.map((f) => (
          <Pressable key={f} onPress={() => setFt(f)} style={pill(f === ft)}>
            <Text style={{ color: f === ft ? p.accent : p.text, fontWeight: f === ft ? '700' : '500', fontSize: 16 }}>{f}′</Text>
          </Pressable>
        ))}
      </View>
      <FieldLabel>Inches</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {INCHES.map((i) => (
          <Pressable key={i} onPress={() => setInch(i)} style={pill(i === inch)}>
            <Text style={{ color: i === inch ? p.accent : p.text, fontWeight: i === inch ? '700' : '500', fontSize: 16 }}>{i}″</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Save" variant="primary" onPress={() => { onChange(String(ft * 12 + inch)); controls.close(); }} />
    </View>
  );
}

export function HeightField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <HeightPickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  return <PickField label={label} shown={fmtHeight(value)} onPress={open} style={{ flex: 1 }} />;
}

/** Contents of the date-picker sheet: spinner (iOS) / system dialog (Android)
 *  + full-width red Save. */
export function DatePickerSheet({ label, value, onChange, controls }: { label: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const base = value ? dateFromKey(value) : new Date(1990, 0, 1);
  // Draft the spinner value locally so nothing commits until "Save".
  const [draft, setDraft] = useState(isNaN(base.getTime()) ? new Date(1990, 0, 1) : base);
  const [dialogOpen, setDialogOpen] = useState(Platform.OS === 'android');
  // An explicit floor is REQUIRED on Android: given a maximumDate and no
  // minimumDate, the library clamps to a minimum of epoch 0, so the dialog
  // snapped every birthday before 1970 back to 31 Dec 1969. A hundred years
  // back covers anyone up to 99.
  const minimumDate = new Date(new Date().getFullYear() - 100, 0, 1);
  // Same late-event write-through as TimePickerSheet: a wheel change event that
  // lands after "Save" (settle animation) must not be dropped.
  const saved = useRef(false);
  const commitDate = (d: Date) => onChange(keyOf(d));
  const commit = () => {
    saved.current = true;
    commitDate(draft);
    controls.close();
  };
  return (
    <View>
      {/* Title vertically aligned with the sheet's ✕ (top:12, h:32 → centered on 28px). */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, marginTop: -12, marginBottom: 12 }}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="spinner"
          minimumDate={minimumDate}
          maximumDate={new Date()}
          textColor="#ffffff"
          themeVariant="dark"
          style={{ height: 180 }}
          onChange={(_, date) => { if (date) { setDraft(date); if (saved.current) commitDate(date); } }}
        />
      ) : (
        <>
          <AndroidPickerRow shown={fmtDateFull(keyOf(draft))} onPress={() => setDialogOpen(true)} />
          {dialogOpen ? (
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              minimumDate={minimumDate}
              maximumDate={new Date()}
              onChange={(e, date) => { setDialogOpen(false); if (e.type === 'set' && date) setDraft(date); }}
            />
          ) : null}
        </>
      )}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Button title="Save" variant="primary" onPress={commit} />
      </View>
    </View>
  );
}

/** `trailing` rides the value's line on the right (the profile's age pill). */
export function DateField({ label, value, onChange, trailing }: { label: string; value: string; onChange: (v: string) => void; trailing?: React.ReactNode }) {
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <DatePickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  return <PickField label={label} shown={value ? fmtDateFull(value) : ''} onPress={open} trailing={trailing} />;
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <Text style={{ flex: 1, color: p.text, fontSize: 16 }}>{label}</Text>
      <Toggle on={value} />
    </Pressable>
  );
}

/** Render the ordered field schema, grouping runs of number fields 2-up. */
export function FieldInputs({ fields, form, set }: { fields: FieldDef[]; form: FormState; set: (k: string, v: string | boolean) => void }) {
  const p = usePalette();
  // Auto-advance plumbing: number-field inputs register here by key so a field
  // whose `autoNext` fires can focus the next number field in the form.
  const numInputs = useRef<Record<string, TextInput | null>>({});
  const numKeys = fields.filter(isNumberField).map((f) => f.key!);
  const advanceFrom = (key: string) => {
    const next = numKeys[numKeys.indexOf(key) + 1];
    if (next) numInputs.current[next]?.focus();
  };
  const out: React.ReactNode[] = [];
  let run: FieldDef[] = [];
  const flush = () => {
    if (!run.length) return;
    // Chunk consecutive number fields into rows of at most 2.
    for (let i = 0; i < run.length; i += 2) {
      const pair = run.slice(i, i + 2);
      if (pair.length === 1 && run.length === 1) {
        const f = pair[0];
        out.push(<NumField key={f.key} f={f} form={form} set={set} numInputs={numInputs} advanceFrom={advanceFrom} />);
      } else if (pair.length === 1) {
        // The odd one out of a longer run keeps its column: half width, so it
        // reads as one more of the fields above it rather than as a headline.
        const f = pair[0];
        out.push(
          <View key={`grid-${f.key}`} style={{ flexDirection: 'row', gap: 10 }}>
            <NumField f={f} form={form} set={set} numInputs={numInputs} advanceFrom={advanceFrom} />
            <View style={{ flex: 1 }} />
          </View>,
        );
      } else {
        out.push(
          <View key={`grid-${pair[0].key}`} style={{ flexDirection: 'row', gap: 10 }}>
            {pair.map((f) => <NumField key={f.key} f={f} form={form} set={set} numInputs={numInputs} advanceFrom={advanceFrom} />)}
          </View>,
        );
      }
    }
    run = [];
  };
  fields.forEach((f) => {
    if (isNumberField(f)) { run.push(f); return; }
    flush();
    if (isDivider(f)) out.push(<View key={`div-${out.length}`} style={{ height: 1, backgroundColor: p.border, marginVertical: 6, marginBottom: 18 }} />);
    else if (f.type === 'select') out.push(<SelectField key={f.key} label={fieldLabel(f)} value={form[f.key!] as string} options={f.options || []} onChange={(v) => set(f.key!, v)} />);
    else if (f.type === 'time') out.push(<TimeField key={f.key} label={f.label || 'Time'} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} optional={f.optional} />);
    else if (f.type === 'check') out.push(<CheckField key={f.key} label={f.label || ''} value={!!form[f.key!]} onChange={(v) => set(f.key!, v)} />);
    else if (f.type === 'textarea') out.push(<TextField key={f.key} label={f.label || ''} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} placeholder={f.placeholder} multiline />);
    else if (f.type === 'text') out.push(<TextField key={f.key} label={f.label || ''} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} placeholder={f.placeholder} />);
  });
  flush();
  return <>{out}</>;
}

function NumField({ f, form, set, numInputs, advanceFrom }: {
  f: FieldDef; form: FormState; set: (k: string, v: string | boolean) => void;
  numInputs: React.MutableRefObject<Record<string, TextInput | null>>; advanceFrom: (key: string) => void;
}) {
  const v = form[f.key!] as string;
  // A med/supplement dose is a number PLUS its unit ("400mg", "1 scoop"), so it
  // gets the normal keyboard — decimal-pad has no letters to type the unit with.
  // Keyed off `amount` (the only dose field, built-in or custom) rather than the
  // field type, which still drives the row headline and the save validation.
  const dose = f.key === 'amount';
  return (
    <TextField
      label={f.label || ''}
      unit={fieldUnit(f.unit)}
      value={v}
      inputRef={(el) => { numInputs.current[f.key!] = el; }}
      onChange={(nv) => {
        set(f.key!, nv);
        if (f.autoNext && nv.length > (v || '').length && f.autoNext(nv)) advanceFrom(f.key!);
      }}
      keyboardType={dose ? 'default' : 'decimal-pad'}
      signed={f.signed}
      onToggleSign={() => {
        const cur = (v || '').trim();
        if (cur === '' || cur === '-') return;
        set(f.key!, cur[0] === '-' ? cur.slice(1) : '-' + cur);
      }}
    />
  );
}
