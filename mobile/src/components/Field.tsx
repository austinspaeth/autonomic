/**
 * Form controls for the typed field schema (number/select/time/check/text/
 * textarea/divider). buildFieldInputs mirrors the PWA: consecutive number
 * fields are grouped 2-up; everything else is full width. A tiny controlled
 * form-state hook collects values keyed by field key.
 */
import React, { useRef, useState } from 'react';
import { Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { radius, usePalette } from '../theme';
import { Button } from './ui';
import { SheetControls, useSheets } from './Sheet';
import type { Entry, FieldDef } from '../lib/types';
import { fieldLabel, isDivider, isNumberField } from '../lib/registry';
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
      else if (f.type === 'time') s[f.key] = (initial[f.key] as string) || nowTime();
      else s[f.key] = initial[f.key] != null ? String(initial[f.key]) : '';
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

export function TextField({ label, value, onChange, keyboardType, placeholder, multiline, signed, onToggleSign, inputRef }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'; placeholder?: string; multiline?: boolean;
  signed?: boolean; onToggleSign?: () => void; inputRef?: React.Ref<TextInput>;
}) {
  const p = usePalette();
  const input = (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType || 'default'}
      keyboardAppearance="dark"
      placeholder={placeholder || '-'}
      placeholderTextColor={p.textDim}
      multiline={multiline}
      style={[
        { flex: 1, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 17, color: p.text },
        multiline && { minHeight: 80, textAlignVertical: 'top' },
      ]}
    />
  );
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      {signed ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {input}
          <Pressable onPress={onToggleSign} style={{ width: 42, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>±</Text>
          </Pressable>
        </View>
      ) : input}
    </View>
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
export function TimePickerSheet({ label, note, value, onChange, controls }: { label: string; note?: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
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
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Button title="Save" variant="primary" onPress={commit} />
      </View>
    </View>
  );
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <TimePickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable onPress={open} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 13, minHeight: 47 }}>
        <Text style={{ color: value ? p.text : p.textDim, fontSize: 17 }}>{value ? fmtTime12(value) : 'Set time'}</Text>
      </Pressable>
    </View>
  );
}

/** "68" (inches) -> `5' 8"` for display; '' when unparseable. */
export function fmtHeight(value?: string): string {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return '';
  const ft = Math.floor(n / 12);
  const inch = Math.round(n % 12);
  return `${ft}′ ${inch}″`;
}

const FEET = [3, 4, 5, 6, 7];
const INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Contents of the height-picker sheet: feet + inches pill selectors + Save. */
export function HeightPickerSheet({ label, value, onChange, controls }: { label: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const start = Number(value);
  const startOk = Number.isFinite(start) && start > 0;
  const [ft, setFt] = useState(startOk ? Math.floor(start / 12) : 5);
  const [inch, setInch] = useState(startOk ? Math.round(start % 12) % 12 : 8);
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

export function HeightField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <HeightPickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  const shown = fmtHeight(value);
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable onPress={open} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 13, minHeight: 47 }}>
        <Text style={{ color: shown ? p.text : p.textDim, fontSize: 17 }}>{shown || (placeholder || 'Set height')}</Text>
      </Pressable>
    </View>
  );
}

/** Contents of the date-picker sheet: spinner (iOS) / system dialog (Android)
 *  + full-width red Save. */
export function DatePickerSheet({ label, value, onChange, controls }: { label: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const base = value ? dateFromKey(value) : new Date(1990, 0, 1);
  // Draft the spinner value locally so nothing commits until "Save".
  const [draft, setDraft] = useState(isNaN(base.getTime()) ? new Date(1990, 0, 1) : base);
  const [dialogOpen, setDialogOpen] = useState(Platform.OS === 'android');
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

export function DateField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <DatePickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  return (
    <View style={{ marginBottom: 14 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable onPress={open} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 13, minHeight: 47 }}>
        <Text style={{ color: value ? p.text : p.textDim, fontSize: 17 }}>{value ? fmtDateFull(value) : (placeholder || 'Set date')}</Text>
      </Pressable>
    </View>
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: p.text, fontSize: 16 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.accent }} />
    </View>
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
      if (pair.length === 1) {
        const f = pair[0];
        out.push(<NumField key={f.key} f={f} form={form} set={set} numInputs={numInputs} advanceFrom={advanceFrom} />);
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
    else if (f.type === 'time') out.push(<TimeField key={f.key} label={f.label || 'Time'} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} />);
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
      label={fieldLabel(f)}
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
